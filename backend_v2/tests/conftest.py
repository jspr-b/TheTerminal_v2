"""Two merchants with a row in every table. Everything rolls back, and only a local database is allowed."""
import json, os, urllib.parse, uuid
from contextlib import contextmanager
from dataclasses import dataclass

import psycopg
import pytest
from psycopg.types.json import Jsonb

DB_URL = os.environ.get("CORE_TEST_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")
if urllib.parse.urlparse(DB_URL).hostname not in ("127.0.0.1", "localhost"):
    raise SystemExit("Isolation tests only run against a local database.")


@dataclass
class Tenant:
    merchant: uuid.UUID
    user: uuid.UUID
    ids: dict


def ins(conn, table, **cols):
    names = ", ".join(cols)
    marks = ", ".join(["%s"] * len(cols))
    conn.execute(f"insert into {table} ({names}) values ({marks})", list(cols.values()))


def make_tenant(conn, tag):
    m, u = uuid.uuid4(), uuid.uuid4()
    ids = {t: uuid.uuid4() for t in ("integ","loc","prod","var","cust","order","line","ful","run","pred")}
    src = lambda name: {"source": "shopify", "external_id": f"{tag}-{name}"}
    now = "2026-01-01T00:00:00Z"
    ins(conn, "auth.users", id=u, email=f"{tag}-{u}@example.test")
    ins(conn, "merchants", id=m, name=tag)
    ins(conn, "merchant_users", merchant_id=m, user_id=u)
    ins(conn, "merchant_integrations", id=ids["integ"], merchant_id=m, provider="shopify", nango_connection_id=tag)
    ins(conn, "import_jobs", merchant_id=m, integration_id=ids["integ"], model="orders", kind="initial")
    ins(conn, "raw_records", merchant_id=m, provider="shopify", model="orders", external_id="1", payload=Jsonb({"a": 1}), payload_hash="h")
    ins(conn, "locations", id=ids["loc"], merchant_id=m, name="Main", **src("loc"))
    ins(conn, "products", id=ids["prod"], merchant_id=m, title="P", **src("prod"))
    ins(conn, "product_variants", id=ids["var"], merchant_id=m, product_id=ids["prod"], **src("var"))
    ins(conn, "inventory_levels", merchant_id=m, variant_id=ids["var"], location_id=ids["loc"], available=1, **src("lvl"))
    ins(conn, "inventory_snapshots", merchant_id=m, variant_id=ids["var"], location_id=ids["loc"], snapshot_date="2026-01-01", **src("snap"))
    ins(conn, "price_history", merchant_id=m, variant_id=ids["var"], price=1, recorded_at=now, **src("price"))
    ins(conn, "cost_history", merchant_id=m, variant_id=ids["var"], unit_cost=1, valid_from=now, **src("cost"))
    ins(conn, "customers", id=ids["cust"], merchant_id=m, **src("cust"))
    ins(conn, "orders", id=ids["order"], merchant_id=m, customer_id=ids["cust"], ordered_at=now, **src("order"))
    ins(conn, "order_lines", id=ids["line"], merchant_id=m, order_id=ids["order"], product_id=ids["prod"], quantity=1, ordered_at=now, **src("line"))
    ins(conn, "fulfillments", id=ids["ful"], merchant_id=m, order_id=ids["order"], **src("ful"))
    ins(conn, "fulfillment_events", merchant_id=m, fulfillment_id=ids["ful"], happened_at=now, **src("ev"))
    ins(conn, "kumo_runs", id=ids["run"], merchant_id=m, model="relational", query_name="demand", trigger="schedule")
    ins(conn, "predictions", id=ids["pred"], merchant_id=m, run_id=ids["run"], model="relational", entity_type="product", entity_id=ids["prod"], target="demand_14d", generated_at=now)
    ins(conn, "actions", merchant_id=m, prediction_id=ids["pred"], kind="reorder", title="Reorder")
    return Tenant(m, u, ids)


@pytest.fixture
def conn():
    with psycopg.connect(DB_URL) as c:
        with c.transaction(force_rollback=True):
            yield c


@pytest.fixture
def world(conn):
    return make_tenant(conn, "a"), make_tenant(conn, "b")


@contextmanager
def as_role(conn, role, user=None):
    """Run as a real API role. Rolled back afterwards, which also resets the role."""
    with conn.transaction(force_rollback=True):
        conn.execute(f"set local role {role}")
        claims = {"role": role, **({"sub": str(user)} if user else {})}
        conn.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps(claims),))
        yield
