"""Real import from the dev store through Nango, into a local database. Off unless RUN_REAL_NANGO=1."""
import asyncio
import os
import pathlib

import pytest
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from conftest import DB_URL
from test_api import PII, counts, shops, db  # noqa: F401

pytestmark = pytest.mark.skipif(os.environ.get("RUN_REAL_NANGO") != "1", reason="set RUN_REAL_NANGO=1")
CONNECTION = os.environ.get("NANGO_TEST_CONNECTION", "")

from app.importer import run_import  # noqa: E402
from app.nango import NangoClient  # noqa: E402
from app.ontology import OntologyService  # noqa: E402


def key():
    env = pathlib.Path(__file__).resolve().parents[1] / ".env"
    return next(l.split("=", 1)[1].strip() for l in env.read_text().splitlines() if l.startswith("NANGO_SECRET_KEY="))


def run(shop):
    async def go():
        pool = AsyncConnectionPool(DB_URL, open=False, kwargs={"row_factory": dict_row})
        await pool.open(wait=True)
        svc = OntologyService(pool)
        await run_import(svc, NangoClient(key(), "https://api.nango.dev"), shop.merchant, await svc.get_integration(shop.merchant, shop.integration))
        await pool.close()
    asyncio.run(go())


def test_real_import(shops, db):  # noqa: F811
    a, _ = shops
    db.execute("update merchant_integrations set nango_integration_id = 'shopify-cc', nango_connection_id = %s where id = %s", (CONNECTION, a.integration))
    run(a)
    jobs = db.execute("select model, status, records_done, error from import_jobs where merchant_id = %s order by created_at", (a.merchant,)).fetchall()
    print("jobs", jobs)
    first = counts(db, a.merchant)
    print("rows", first)
    assert all(j[1] == "done" for j in jobs), jobs
    assert first["locations"] > 0 and first["products"] > 0 and first["product_variants"] > 0 and first["inventory_levels"] > 0
    run(a)
    assert counts(db, a.merchant) == first
    raw = db.execute("select count(*) from raw_records where merchant_id = %s", (a.merchant,)).fetchone()[0]
    run(a)
    assert db.execute("select count(*) from raw_records where merchant_id = %s", (a.merchant,)).fetchone()[0] == raw
    for t in ["customers", "orders", "raw_records"]:
        text = db.execute(f"select coalesce(string_agg(x::text, ' '), '') from {t} x where merchant_id = %s", (a.merchant,)).fetchone()[0]
        assert "@" not in text, t
