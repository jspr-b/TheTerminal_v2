"""Reads synced records from Nango. Tokens stay in Nango; we hold connection ids only."""
from collections.abc import AsyncIterator
from typing import Protocol

import httpx

# Our import model -> the model name in nango-integrations/shopify-cc/syncs.
NANGO_MODELS = {"locations": "Location", "products": "Product", "inventory_levels": "InventoryLevel", "customers": "Customer", "orders": "Order"}


class RecordSource(Protocol):
    def records(self, integration_id: str, connection_id: str, model: str) -> AsyncIterator[list[dict]]: ...


def clean(records: list[dict]) -> list[dict]:
    """Drop deleted records and Nango's bookkeeping, which changes on every sync."""
    kept = [r for r in records if (r.get("_nango_metadata") or {}).get("last_action") != "DELETED"]
    return [{k: v for k, v in r.items() if k != "_nango_metadata"} for r in kept]


class NangoClient:
    def __init__(self, secret_key: str, host: str):
        self.secret_key, self.host = secret_key, host.rstrip("/")

    async def records(self, integration_id: str, connection_id: str, model: str) -> AsyncIterator[list[dict]]:
        headers = {"Authorization": f"Bearer {self.secret_key}", "Connection-Id": connection_id, "Provider-Config-Key": integration_id}
        cursor = None
        async with httpx.AsyncClient(timeout=60) as client:
            while True:
                params = {"model": NANGO_MODELS[model], "limit": 100, **({"cursor": cursor} if cursor else {})}
                resp = await client.get(f"{self.host}/records", headers=headers, params=params)
                resp.raise_for_status()
                body = resp.json()
                page = clean(body.get("records") or [])
                if page:
                    yield page
                cursor = body.get("next_cursor")
                if not cursor:
                    return
