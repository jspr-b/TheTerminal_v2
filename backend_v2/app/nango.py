"""Reads synced records from Nango. Tokens stay in Nango; we hold connection ids only."""
from collections.abc import AsyncIterator
from typing import Protocol

import httpx


class RecordSource(Protocol):
    def records(self, integration_id: str, connection_id: str, model: str) -> AsyncIterator[list[dict]]: ...


class NangoClient:
    def __init__(self, secret_key: str, host: str):
        self.secret_key, self.host = secret_key, host.rstrip("/")

    async def records(self, integration_id: str, connection_id: str, model: str) -> AsyncIterator[list[dict]]:
        headers = {"Authorization": f"Bearer {self.secret_key}", "Connection-Id": connection_id, "Provider-Config-Key": integration_id}
        cursor = None
        async with httpx.AsyncClient(timeout=60) as client:
            while True:
                params = {"model": model, "limit": 100, **({"cursor": cursor} if cursor else {})}
                resp = await client.get(f"{self.host}/records", headers=headers, params=params)
                resp.raise_for_status()
                body = resp.json()
                if body.get("records"):
                    yield body["records"]
                cursor = body.get("next_cursor")
                if not cursor:
                    return
