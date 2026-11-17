"""The worker's HTTP contract, with a stand-in model. Runs anywhere: no GPU, torch or Kumo-TS needed."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from worker import create_app  # noqa: E402

SERIES = {"timestamp": ["2026-01-01", "2026-01-02", "2026-01-03"], "columns": {"revenue": [10, 12, 90], "orders": [1, 1, 9]}}


class Stub:
    def __init__(self, name):
        self.name = name

    def device(self):
        return "cpu"

    def forecast(self, series, target, horizon):
        return [{"timestamp": f"2026-01-{4 + i:02d}", "value": series.columns[target][-1]} for i in range(horizon)]

    def anomalies(self, series):
        return [{"timestamp": t, "score": float(v), "anomaly": v > 50} for t, v in zip(series.timestamp, series.columns["revenue"])]


@pytest.fixture
def forecast():
    return TestClient(create_app(Stub("forecast")))


@pytest.fixture
def anomaly():
    return TestClient(create_app(Stub("anomaly")))


def test_health_names_the_model_and_device(forecast):
    assert forecast.get("/health").json() == {"status": "ok", "model": "forecast", "device": "cpu"}


def test_forecast_returns_one_value_per_day(forecast):
    r = forecast.post("/v1/forecast", json={"series": SERIES, "target": "revenue", "horizon": 14})
    assert r.status_code == 200 and len(r.json()["forecast"]) == 14


@pytest.mark.parametrize("horizon", [0, 15, 90])
def test_forecast_refuses_horizons_outside_1_to_14(forecast, horizon):
    assert forecast.post("/v1/forecast", json={"series": SERIES, "target": "revenue", "horizon": horizon}).status_code == 422


def test_forecast_target_must_be_a_column(forecast):
    assert forecast.post("/v1/forecast", json={"series": SERIES, "target": "profit", "horizon": 3}).status_code == 422


def test_columns_must_match_the_dates(forecast):
    bad = {"timestamp": ["2026-01-01"], "columns": {"revenue": [1, 2]}}
    assert forecast.post("/v1/forecast", json={"series": bad, "target": "revenue", "horizon": 3}).status_code == 422


def test_anomaly_flags_days(anomaly):
    days = anomaly.post("/v1/anomaly", json={"series": SERIES}).json()["days"]
    assert [d["anomaly"] for d in days] == [False, False, True]


def test_each_worker_serves_only_its_own_model(forecast, anomaly):
    assert forecast.post("/v1/anomaly", json={"series": SERIES}).status_code == 404
    assert anomaly.post("/v1/forecast", json={"series": SERIES, "target": "revenue", "horizon": 3}).status_code == 404


def test_backend_client_matches_this_contract(forecast, anomaly):
    """The backend's GpuWorkerClient against this app: same paths, same shapes."""
    import asyncio

    import httpx

    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend_v2"))
    from app.gpu import GpuWorkerClient  # noqa: E402  (backend_v2/app, not this app.py)

    def route(client):
        return httpx.MockTransport(lambda req: _relay(client, req))

    def _relay(client, req):
        r = client.post(req.url.path, content=req.content, headers={"content-type": "application/json"})
        return httpx.Response(r.status_code, content=r.content, headers={"content-type": "application/json"})

    out = asyncio.run(GpuWorkerClient("http://f", transport=route(forecast)).forecast(SERIES, "revenue", 2))
    assert [d["value"] for d in out] == [90, 90]
    days = asyncio.run(GpuWorkerClient("http://a", transport=route(anomaly)).anomalies(SERIES))
    assert days[-1]["anomaly"] is True
