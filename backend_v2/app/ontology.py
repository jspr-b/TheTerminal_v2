"""All data access. Every method that touches merchant data takes merchant_id and filters on it."""
import hashlib
import json
from uuid import UUID

from psycopg import sql
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

UPSERT_TABLES = frozenset({"locations", "products", "product_variants", "inventory_levels", "customers", "orders", "order_lines"})
ID_MAP_TABLES = frozenset({"locations", "products", "product_variants", "customers", "orders"})
_KEY = ("merchant_id", "source", "external_id")


class OntologyService:
    def __init__(self, pool: AsyncConnectionPool):
        self.pool = pool

    async def _all(self, query: str, params: tuple) -> list[dict]:
        async with self.pool.connection() as conn:
            cur = await conn.execute(query, params)
            return await cur.fetchall()

    async def _one(self, query: str, params: tuple) -> dict | None:
        async with self.pool.connection() as conn:
            cur = await conn.execute(query, params)
            return await cur.fetchone()

    async def is_member(self, merchant_id: UUID, user_id: UUID) -> bool:
        row = await self._one("select 1 as ok from merchant_users where merchant_id = %s and user_id = %s", (merchant_id, user_id))
        return row is not None

    async def list_products(self, merchant_id: UUID, limit: int = 500) -> list[dict]:
        return await self._all("select id, external_id, title, status, product_type, vendor from products where merchant_id = %s order by title limit %s", (merchant_id, limit))

    async def list_locations(self, merchant_id: UUID) -> list[dict]:
        return await self._all("select id, external_id, name, city, province, country, is_active from locations where merchant_id = %s order by name", (merchant_id,))

    async def list_import_jobs(self, merchant_id: UUID, limit: int = 50) -> list[dict]:
        return await self._all("select id, model, kind, status, records_done, started_at, finished_at, error from import_jobs where merchant_id = %s order by created_at desc limit %s", (merchant_id, limit))

    async def get_integration(self, merchant_id: UUID, integration_id: UUID) -> dict | None:
        return await self._one("select id, provider, nango_connection_id, nango_integration_id from merchant_integrations where merchant_id = %s and id = %s", (merchant_id, integration_id))

    async def set_integration_status(self, merchant_id: UUID, integration_id: UUID, status: str, error: str | None = None) -> None:
        async with self.pool.connection() as conn:
            await conn.execute(
                "update merchant_integrations set status = %s, last_error = %s, last_sync_at = case when %s = 'synced' then now() else last_sync_at end where merchant_id = %s and id = %s",
                (status, error, status, merchant_id, integration_id))

    async def start_import_job(self, merchant_id: UUID, integration_id: UUID, model: str) -> UUID:
        row = await self._one("insert into import_jobs (merchant_id, integration_id, model, kind, status, started_at) values (%s, %s, %s, 'initial', 'running', now()) returning id", (merchant_id, integration_id, model))
        return row["id"]

    async def finish_import_job(self, merchant_id: UUID, job_id: UUID, records_done: int, error: str | None = None) -> None:
        async with self.pool.connection() as conn:
            await conn.execute("update import_jobs set status = %s, records_done = %s, error = %s, finished_at = now() where merchant_id = %s and id = %s", ("failed" if error else "done", records_done, error, merchant_id, job_id))

    async def save_raw(self, merchant_id: UUID, provider: str, model: str, records: list[dict]) -> None:
        async with self.pool.connection() as conn:
            for rec in records:
                digest = hashlib.sha256(json.dumps(rec, sort_keys=True).encode()).hexdigest()
                await conn.execute(
                    "insert into raw_records (merchant_id, provider, model, external_id, payload, payload_hash) values (%s, %s, %s, %s, %s, %s) on conflict do nothing",
                    (merchant_id, provider, model, str(rec["id"]), Jsonb(rec), digest))

    async def upsert_many(self, merchant_id: UUID, table: str, rows: list[dict]) -> dict[str, UUID]:
        """Upsert on (merchant_id, source, external_id). Returns external_id -> id."""
        if table not in UPSERT_TABLES:
            raise ValueError(f"unknown table: {table}")
        out: dict[str, UUID] = {}
        async with self.pool.connection() as conn:
            for row in rows:
                data = {**row, "merchant_id": merchant_id}
                cols = list(data)
                query = sql.SQL("insert into {t} ({c}) values ({v}) on conflict (merchant_id, source, external_id) do update set {u} returning external_id, id").format(
                    t=sql.Identifier(table),
                    c=sql.SQL(", ").join(map(sql.Identifier, cols)),
                    v=sql.SQL(", ").join(sql.Placeholder() * len(cols)),
                    u=sql.SQL(", ").join(sql.SQL("{0} = excluded.{0}").format(sql.Identifier(c)) for c in cols if c not in _KEY))
                cur = await conn.execute(query, list(data.values()))
                got = await cur.fetchone()
                out[got["external_id"]] = got["id"]
        return out

    async def id_map(self, merchant_id: UUID, table: str, source: str) -> dict[str, UUID]:
        if table not in ID_MAP_TABLES:
            raise ValueError(f"unknown table: {table}")
        query = sql.SQL("select external_id, id from {t} where merchant_id = %s and source = %s").format(t=sql.Identifier(table))
        async with self.pool.connection() as conn:
            cur = await conn.execute(query, (merchant_id, source))
            return {r["external_id"]: r["id"] for r in await cur.fetchall()}

    async def variants_by_inventory_item(self, merchant_id: UUID, source: str) -> dict[str, UUID]:
        rows = await self._all("select inventory_item_external_id as item, id from product_variants where merchant_id = %s and source = %s and inventory_item_external_id is not null", (merchant_id, source))
        return {r["item"]: r["id"] for r in rows}
