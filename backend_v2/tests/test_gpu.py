"""The GPU path: Kumo Forecast and Kumo Anomaly on daily store series, through the GPU worker (gpu_worker/)."""
import json
import uuid
from datetime import date, datetime, timedelta, timezone

import httpx
import pytest

from test_api import auth, client, db, shops  # noqa: F401  (fixtures)
from app.gpu import GpuWorkerClient, SEQ_LEN
from app.main import app, get_gpu


class FakeGpu:
    """Stands in for the GPU worker. Forecasts a flat line; flags the last day as unusual."""

    def __init__(self, fail=False):
        self.fail = fail
        self.calls: list[tuple[str, dict]] = []

    async def forecast(self, series, target, horizon):
        self.calls.append(("forecast", {"series": series, "target": target, "horizon": horizon}))
        if self.fail:
            raise RuntimeError("worker down")
        last = date.fromisoformat(series["timestamp"][-1])
        return [{"timestamp": (last + timedelta(days=i + 1)).isoformat(), "value": 10.0} for i in range(horizon)]

    async def anomalies(self, series):
        self.calls.append(("anomaly", {"series": series}))
        if self.fail:
            raise RuntimeError("worker down")
        return [{"timestamp": t, "score": 0.9 if i == len(series["timestamp"]) - 1 else 0.1, "anomaly": i == len(series["timestamp"]) - 1}
                for i, t in enumerate(series["timestamp"])]


@pytest.fixture
def gpu(client):  # noqa: F811
    holder = {"now": FakeGpu()}
    app.dependency_overrides[get_gpu] = lambda: holder["now"]
    yield holder
    app.dependency_overrides.pop(get_gpu, None)


def add_history(db, shop, days, per_day=1, total=20):  # noqa: F811
    """One order per day for `days` days, ending yesterday."""
    for i in range(1, days + 1):
        when = datetime.now(timezone.utc) - timedelta(days=i)
        for _ in range(per_day):
            db.execute("insert into orders (merchant_id, source, external_id, ordered_at, total) values (%s, 'shopify', %s, %s, %s)",
                       (shop.merchant, f"h-{uuid.uuid4()}", when, total))


def runs(db, shop):  # noqa: F811
    return db.execute("select model, query_name, status, endpoint from kumo_runs where merchant_id = %s order by created_at", (shop.merchant,)).fetchall()


def preds(db, shop):  # noqa: F811
    return db.execute("select model, entity_type, entity_id, target, payload from predictions where merchant_id = %s order by target", (shop.merchant,)).fetchall()


# The client

def test_client_posts_the_series_and_reads_the_forecast():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"], seen["body"] = request.url.path, json.loads(request.content)
        return httpx.Response(200, json={"forecast": [{"timestamp": "2026-01-02", "value": 3.5}]})

    out = __import__("asyncio").run(GpuWorkerClient("http://gpu.test", transport=httpx.MockTransport(handler)).forecast(
        {"timestamp": ["2026-01-01"], "columns": {"revenue": [1.0]}}, "revenue", 1))
    assert seen["path"] == "/v1/forecast" and seen["body"]["target"] == "revenue" and seen["body"]["horizon"] == 1
    assert out == [{"timestamp": "2026-01-02", "value": 3.5}]


def test_anomalies_go_to_their_own_worker_when_set():
    hosts = []

    def handler(request: httpx.Request) -> httpx.Response:
        hosts.append((request.url.host, request.url.path))
        return httpx.Response(200, json={"days": [], "forecast": []})

    gpu = GpuWorkerClient("http://forecast.test", anomaly_url="http://anomaly.test", transport=httpx.MockTransport(handler))
    run = __import__("asyncio").run
    run(gpu.forecast({"timestamp": [], "columns": {}}, "revenue", 1))
    run(gpu.anomalies({"timestamp": [], "columns": {}}))
    assert hosts == [("forecast.test", "/v1/forecast"), ("anomaly.test", "/v1/anomaly")]


def test_client_raises_on_worker_errors():
    transport = httpx.MockTransport(lambda r: httpx.Response(500, text="boom"))
    with pytest.raises(httpx.HTTPStatusError):
        __import__("asyncio").run(GpuWorkerClient("http://gpu.test", transport=transport).anomalies({"timestamp": [], "columns": {}}))


# The routes

def test_without_a_gpu_worker_the_routes_say_so(client, shops):  # noqa: F811
    a, _ = shops
    for path in ("forecasts/store-totals", "anomalies"):
        r = client.post(f"/merchants/{a.merchant}/{path}", headers=auth(a.user))
        assert r.status_code == 503 and "GPU" in r.json()["detail"]


def test_store_totals_forecast_saves_14_days_per_series(client, shops, db, gpu):  # noqa: F811
    a, _ = shops
    add_history(db, a, 300)
    assert client.post(f"/merchants/{a.merchant}/forecasts/store-totals", headers=auth(a.user)).status_code == 202
    assert runs(db, a) == [("forecast", "store_totals_daily", "done", "gpu")]
    got = preds(db, a)
    assert [(p[0], p[1], p[2], p[3]) for p in got] == [("forecast", "store", a.merchant, "store_orders_daily"), ("forecast", "store", a.merchant, "store_revenue_daily")]
    assert all(len(p[4]["per_day"]) == 14 for p in got)


def test_store_series_are_numbers_only_and_own_merchant_only(client, shops, db, gpu):  # noqa: F811
    a, b = shops
    add_history(db, a, 300, total=20)
    add_history(db, b, 300, per_day=3, total=999)
    client.post(f"/merchants/{a.merchant}/forecasts/store-totals", headers=auth(a.user))
    series = gpu["now"].calls[0][1]["series"]
    assert set(series) == {"timestamp", "columns"} and set(series["columns"]) == {"revenue", "orders", "units", "refunds"}
    assert len(series["timestamp"]) == SEQ_LEN
    assert max(series["columns"]["orders"]) == 1 and max(series["columns"]["revenue"]) == 20
    assert all(isinstance(v, (int, float)) for col in series["columns"].values() for v in col)


def test_too_little_history_skips_the_run(client, shops, db, gpu):  # noqa: F811
    a, _ = shops
    add_history(db, a, 30)
    client.post(f"/merchants/{a.merchant}/forecasts/store-totals", headers=auth(a.user))
    assert runs(db, a) == [("forecast", "store_totals_daily", "skipped", "gpu")]
    assert gpu["now"].calls == [] and preds(db, a) == []


def test_failed_worker_marks_the_run_failed_and_saves_nothing(client, shops, db, gpu):  # noqa: F811
    a, _ = shops
    add_history(db, a, 300)
    gpu["now"] = FakeGpu(fail=True)
    client.post(f"/merchants/{a.merchant}/forecasts/store-totals", headers=auth(a.user))
    assert runs(db, a)[0][2] == "failed" and preds(db, a) == []


def test_anomaly_run_saves_the_unusual_days(client, shops, db, gpu):  # noqa: F811
    a, _ = shops
    add_history(db, a, 300)
    assert client.post(f"/merchants/{a.merchant}/anomalies", headers=auth(a.user)).status_code == 202
    assert runs(db, a) == [("anomaly", "store_anomalies_daily", "done", "gpu")]
    (model, kind, _, target, payload), = preds(db, a)
    assert (model, kind, target) == ("anomaly", "store", "store_anomalies_daily")
    assert [d["timestamp"] for d in payload["unusual_days"]] == [gpu["now"].calls[0][1]["series"]["timestamp"][-1]]


def test_merchant_a_cannot_start_gpu_runs_for_b(client, shops, db, gpu):  # noqa: F811
    a, b = shops
    add_history(db, b, 300)
    for path in ("forecasts/store-totals", "anomalies"):
        assert client.post(f"/merchants/{b.merchant}/{path}", headers=auth(a.user)).status_code == 403
    assert runs(db, b) == [] and gpu["now"].calls == []
