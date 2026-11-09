"""Local development only: one merchant, a real import from the Nango dev connection, and a login token."""
import asyncio, os, pathlib, sys, time, uuid

import jwt, psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app.importer import run_import  # noqa: E402
from app.nango import NangoClient  # noqa: E402
from app.ontology import OntologyService  # noqa: E402

URL, SECRET = os.environ["DATABASE_URL"], os.environ["SUPABASE_JWT_SECRET"]
if not URL.split("@")[-1].startswith("127.0.0.1"):
    raise SystemExit("dev_seed only runs against a local database.")
ROOT = pathlib.Path(__file__).resolve().parents[1]
MERCHANT, USER, INTEGRATION = (uuid.UUID(f"00000000-0000-4000-8000-00000000000{i}") for i in (1, 2, 3))
key = next(l.split("=", 1)[1].strip() for l in (ROOT / ".env").read_text().splitlines() if l.startswith("NANGO_SECRET_KEY="))

with psycopg.connect(URL, autocommit=True) as c:
    c.execute("insert into auth.users (id, email) values (%s, 'dev@example.test')", (USER,))
    c.execute("insert into merchants (id, name) values (%s, 'Dev store')", (MERCHANT,))
    c.execute("insert into merchant_users (merchant_id, user_id) values (%s, %s)", (MERCHANT, USER))
    c.execute("insert into merchant_integrations (id, merchant_id, provider, nango_connection_id, nango_integration_id) values (%s, %s, 'shopify', %s, 'shopify-cc')", (INTEGRATION, MERCHANT, os.environ["NANGO_CONNECTION"]))


async def main() -> None:
    pool = AsyncConnectionPool(URL, open=False, kwargs={"row_factory": dict_row})
    await pool.open(wait=True)
    svc = OntologyService(pool)
    await run_import(svc, NangoClient(key, "https://api.nango.dev"), MERCHANT, await svc.get_integration(MERCHANT, INTEGRATION))
    view = await svc.command_view(MERCHANT)
    await pool.close()
    print({"locations": [(l["name"], l["city"], l["country"], l["units"]) for l in view["locations"]], "products": len(view["products"])})

asyncio.run(main())
token = jwt.encode({"sub": str(USER), "aud": "authenticated", "exp": int(time.time()) + 30 * 86400}, SECRET, algorithm="HS256")
env = ROOT.parent / "frontend/.env.local"
keep = [l for l in (env.read_text().splitlines() if env.exists() else []) if not l.startswith(("NEXT_PUBLIC_DEV_", "NEXT_PUBLIC_API_URL="))]
env.write_text("\n".join(keep + ["NEXT_PUBLIC_API_URL=http://127.0.0.1:8000", f"NEXT_PUBLIC_DEV_MERCHANT={MERCHANT}", f"NEXT_PUBLIC_DEV_TOKEN={token}"]) + "\n")
