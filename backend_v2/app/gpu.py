"""Kumo Forecast and Kumo Anomaly (Kumo-TS) through the GPU worker in gpu_worker/.

The backend never loads these models itself: it builds daily store series from Postgres (numbers
only, no customer fields), sends them to the worker over HTTP, and saves what comes back.
Without KUMO_GPU_URL the routes answer 503 and the sections say "needs GPU".
"""
import logging
from datetime import date, timedelta
from typing import Any, Protocol
from uuid import UUID

import httpx

log = logging.getLogger(__name__)

SEQ_LEN = 512  # Kumo Forecast's context window: rows (days) sent per call
MIN_HISTORY_DAYS = 256  # Kumo Forecast needs 256 to 2,048 rows of context; less and we do not run
HORIZON = 14  # CLAUDE.md: nothing beyond 14 days
ALERT_DAYS = 14  # anomaly alerts only look at the last two weeks
STORE_TOTALS_QUERY = "store_totals_daily"
ANOMALY_QUERY = "store_anomalies_daily"
FORECAST_TARGETS = {"revenue": "store_revenue_daily", "orders": "store_orders_daily"}
SERIES_COLUMNS = ("revenue", "orders", "units", "refunds")

Series = dict[str, Any]  # {"timestamp": [iso dates], "columns": {name: [numbers]}}


class GpuWorker(Protocol):
    async def forecast(self, series: Series, target: str, horizon: int) -> list[dict]: ...
    async def anomalies(self, series: Series) -> list[dict]: ...


class GpuWorkerClient:
    """HTTP client for gpu_worker/app.py."""

    def __init__(self, base_url: str, anomaly_url: str | None = None, transport: httpx.AsyncBaseTransport | None = None, timeout: float = 600):
        # Forecast and Anomaly run in separate containers (both packages are a top-level `sdk` module).
        self.base_url = base_url.rstrip("/")
        self.anomaly_url = (anomaly_url or base_url).rstrip("/")
        self.transport, self.timeout = transport, timeout

    async def _post(self, path: str, body: dict, base_url: str | None = None) -> dict:
        async with httpx.AsyncClient(base_url=base_url or self.base_url, transport=self.transport, timeout=self.timeout) as http:
            r = await http.post(path, json=body)
            r.raise_for_status()
            return r.json()

    async def forecast(self, series: Series, target: str, horizon: int) -> list[dict]:
        return (await self._post("/v1/forecast", {"series": series, "target": target, "horizon": horizon}))["forecast"]

    async def anomalies(self, series: Series) -> list[dict]:
        return (await self._post("/v1/anomaly", {"series": series}, self.anomaly_url))["days"]


def build_series(rows: list[dict], end: date, days: int = SEQ_LEN) -> Series:
    """One row per day for `days` days ending on `end`, zeros where nothing happened."""
    by_day = {r["day"]: r for r in rows}
    stamps = [end - timedelta(days=days - 1 - i) for i in range(days)]
    return {"timestamp": [d.isoformat() for d in stamps],
            "columns": {c: [float(by_day[d][c]) if d in by_day else 0.0 for d in stamps] for c in SERIES_COLUMNS}}


async def _prepare(svc, merchant_id: UUID, query: str, model: str, today: date) -> tuple[UUID, Series | None]:
    run_id = await svc.start_kumo_run(merchant_id, query, "manual_admin", model=model, endpoint="gpu")
    first = await svc.first_order_day(merchant_id)
    if first is None or (today - first).days < MIN_HISTORY_DAYS:
        await svc.finish_kumo_run(merchant_id, run_id, "skipped", error="too_little_history")
        return run_id, None
    end = today - timedelta(days=1)  # today is not over yet
    rows = await svc.daily_store_totals(merchant_id, end - timedelta(days=SEQ_LEN - 1), end)
    return run_id, build_series(rows, end)


async def run_store_totals(svc, gpu: GpuWorker, merchant_id: UUID, today: date | None = None) -> None:
    """Kumo Forecast on daily revenue and orders. One value per day: no range yet, so the app keeps it hidden."""
    today = today or date.today()
    run_id, series = await _prepare(svc, merchant_id, STORE_TOTALS_QUERY, "forecast", today)
    if series is None:
        return
    try:
        results = {target: await gpu.forecast(series, column, HORIZON) for column, target in FORECAST_TARGETS.items()}
    except Exception as e:  # keep the last good result; this run is marked failed (stale rule)
        log.warning("store totals forecast failed for %s: %s", merchant_id, type(e).__name__)
        await svc.finish_kumo_run(merchant_id, run_id, "failed", error=type(e).__name__)
        return
    for target, per_day in results.items():
        await svc.save_store_prediction(merchant_id, run_id, "forecast", target, HORIZON, {"per_day": per_day[:HORIZON]})
    await svc.finish_kumo_run(merchant_id, run_id, "done", rows=len(results))


async def run_anomalies(svc, gpu: GpuWorker, merchant_id: UUID, today: date | None = None) -> None:
    """Kumo Anomaly on the daily store series. Saves the unusual days among the last two weeks."""
    today = today or date.today()
    run_id, series = await _prepare(svc, merchant_id, ANOMALY_QUERY, "anomaly", today)
    if series is None:
        return
    try:
        days = await gpu.anomalies(series)
    except Exception as e:
        log.warning("anomaly run failed for %s: %s", merchant_id, type(e).__name__)
        await svc.finish_kumo_run(merchant_id, run_id, "failed", error=type(e).__name__)
        return
    recent = set(series["timestamp"][-ALERT_DAYS:])
    unusual = [d for d in days if d.get("anomaly") and d["timestamp"] in recent]
    await svc.save_store_prediction(merchant_id, run_id, "anomaly", ANOMALY_QUERY, ALERT_DAYS, {"unusual_days": unusual})
    await svc.finish_kumo_run(merchant_id, run_id, "done", rows=1)
