"""14-day demand per product from hosted Kumo. Kumo only, no fallback model: on failure forecasts go stale."""
import logging
import time
from collections import defaultdict
from datetime import datetime, time as dtime, timedelta, timezone
from typing import Any, Mapping, Protocol
from uuid import UUID

from .kumo import FORECAST_DAYS, build_forecast_request, parse_forecast_response
from .ontology import DEMAND_QUERY, OntologyService

log = logging.getLogger(__name__)

# Provisional, set from the backtest (RESULT.md): products with 0-2 orders in a window had 181% error.
# A product needs this many separate orders in the last ACTIVE_DAYS to get a number. Still open in PLAN.md.
MIN_ORDERS = 3
ACTIVE_DAYS = 56
# Oldest history the request can use: the 364-day context anchor plus its 56 days of rows.
HISTORY_DAYS = 430
# Products per Kumo call. Six context rows each stays under Kumo's 1,000 context-row default.
BATCH = 160


class Forecaster(Protocol):
    async def predict(self, payload: Mapping[str, Any]) -> Mapping[str, Any]: ...


def eligible_products(sales: list[dict], since: datetime) -> list[UUID]:
    orders: dict[UUID, set] = defaultdict(set)
    for s in sales:
        if s["ordered_at"] >= since:
            orders[s["product_id"]].add(s["order_id"])
    return sorted((p for p, o in orders.items() if len(o) >= MIN_ORDERS), key=str)


async def run_demand_forecast(svc: OntologyService, kumo: Forecaster, merchant_id: UUID, trigger: str = "manual_admin") -> None:
    """Forecast every product with enough recent sales, using only orders before today (UTC)."""
    run = await svc.start_kumo_run(merchant_id, DEMAND_QUERY, trigger)
    started = time.monotonic()
    try:
        today = datetime.combine(datetime.now(timezone.utc).date(), dtime.min, tzinfo=timezone.utc)
        sales = await svc.sales_history(merchant_id, today - timedelta(days=HISTORY_DAYS), today)
        products = eligible_products(sales, today - timedelta(days=ACTIVE_DAYS))
        if not products:
            await svc.finish_kumo_run(merchant_id, run, "skipped")
            return
        families = {str(k): v for k, v in (await svc.product_families(merchant_id)).items() if v}
        rows = [{**s, "product_id": str(s["product_id"]), "order_id": str(s["order_id"])} for s in sales]
        ranges: dict[UUID, dict] = {}
        for i in range(0, len(products), BATCH):
            ids, payload = build_forecast_request(rows, [str(p) for p in products[i:i + BATCH]], today, families)
            parsed = parse_forecast_response(await kumo.predict(payload), ids)
            ranges.update({UUID(pid): r for pid, r in parsed.items()})
    except Exception as exc:
        log.exception("kumo demand run failed: merchant=%s", merchant_id)
        await svc.finish_kumo_run(merchant_id, run, "failed", latency_ms=int((time.monotonic() - started) * 1000), error=type(exc).__name__)
        return
    await svc.save_predictions(merchant_id, run, DEMAND_QUERY, FORECAST_DAYS, ranges)
    await svc.finish_kumo_run(merchant_id, run, "done", rows=len(ranges), latency_ms=int((time.monotonic() - started) * 1000))
