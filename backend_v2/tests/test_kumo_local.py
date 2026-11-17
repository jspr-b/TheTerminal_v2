"""Local Kumo: the hosted request, turned into tables for the open weights. Only the model call is a stand-in."""
import asyncio
import json
from datetime import date, timedelta

import pytest

pytest.importorskip("sdm", reason="pip install -r requirements-kumo-local.txt")

from app import kumo_local  # noqa: E402
from app.config import Settings  # noqa: E402
from app.kumo import build_forecast_request, parse_forecast_response  # noqa: E402
from app.kumo_local import LocalKumo, split_tables  # noqa: E402
from app.main import get_kumo  # noqa: E402

TODAY = date(2025, 3, 1)


def sales(products=("p1", "p2"), days=120):
    rows = []
    for n, product in enumerate(products):
        for back in range(1, days):
            rows.append({"product_id": product, "order_id": f"{product}-{back}", "ordered_at": f"{(TODAY - timedelta(days=back)).isoformat()}T10:00:00Z",
                         "quantity": 1 + n, "price": 10, "email": "buyer@example.test", "name": "Ada", "title": "a shirt"})
    return rows


class FakeModel:
    """Stands in for the weights. Answers each query row with q100=2, q500=5, q900=11."""

    def __init__(self):
        self.calls = []

    def __call__(self, **kwargs):
        import pandas as pd

        self.calls.append(kwargs)
        rows = len(kwargs["x_query"].to_pandas())
        frame = pd.DataFrame({"q100": [2.0] * rows, "q500": [5.0] * rows, "q900": [11.0] * rows})
        return type("Out", (), {"to_pandas": lambda self: frame})()


def run(payload, model):
    return asyncio.run(LocalKumo(model).predict(payload))


def test_local_kumo_answers_every_product_with_a_range():
    ids, payload = build_forecast_request(sales(), ["p1", "p2"], TODAY, {"p1": "shirts"})
    model = FakeModel()
    ranges = parse_forecast_response(run(payload, model), ids)
    assert ranges == {p: {"lower": 2.0, "value": 5.0, "upper": 11.0} for p in ("p1", "p2")}
    call = model.calls[0]
    assert len(call["y_context"].to_pandas()) == len(call["x_context"].to_pandas()) > 0
    assert call["num_hops"] == 1


def test_tables_hold_only_allowlisted_columns():
    _, payload = build_forecast_request(sales(), ["p1", "p2"], TODAY, {"p1": "shirts"})
    for part in ("context", "predict"):
        tables = split_tables(payload[part])
        assert set(tables["products"]) == {"instance_id", "family", "units_7d", "units_14d", "units_28d", "units_56d", "orders_28d",
                                           "avg_price_28d", "days_since_first_sale", "units_same_14d_last_year"}
        assert set(tables["sales"]) == {"instance_id", "days_ago", "units", "orders", "revenue"}
        text = json.dumps(tables)
        for value in ("buyer@example.test", "Ada", "a shirt", "p1", "p2"):
            assert value not in text, value
        assert all(d >= 1 for d in tables["sales"]["days_ago"])  # nothing from the anchor day or later
    assert "labels" not in split_tables(payload["predict"])


def test_a_sale_on_the_anchor_day_is_refused():
    _, payload = build_forecast_request(sales(), ["p1"], TODAY)
    table = payload["predict"]["related_tables"]["sales_daily"]
    table["rows"].append([table["rows"][0][0], "p1", f"{TODAY.isoformat()}T00:00:00Z", 5.0, 1.0, 50.0])
    with pytest.raises(ValueError, match="anchor"):
        run(payload, FakeModel())


def test_no_history_is_an_error_not_a_guess():
    _, payload = build_forecast_request(sales(days=3), ["p1"], TODAY)
    payload["context"]["instance_table"]["rows"] = []
    with pytest.raises(ValueError, match="no labelled history"):
        run(payload, FakeModel())


def test_a_short_answer_is_an_error():
    _, payload = build_forecast_request(sales(), ["p1", "p2"], TODAY)

    class Short(FakeModel):
        def __call__(self, **kwargs):
            out = super().__call__(**kwargs)
            frame = out.to_pandas().iloc[:1]
            return type("Out", (), {"to_pandas": lambda self: frame})()

    with pytest.raises(ValueError, match="different number"):
        run(payload, Short())


def test_wrong_weights_are_refused(tmp_path, monkeypatch):
    import huggingface_hub

    fake = tmp_path / "regressor.pt"
    fake.write_bytes(b"not the pinned weights")
    monkeypatch.setattr(huggingface_hub, "hf_hub_download", lambda *a, **k: str(fake))
    with pytest.raises(RuntimeError, match="pinned hash"):
        kumo_local.verify_weights()


def test_setting_picks_local_kumo_without_a_key():
    settings = Settings(database_url="postgresql://x", supabase_jwt_secret="x" * 32, kumo_runtime="local", nvidia_api_key=None, _env_file=None)
    assert isinstance(get_kumo(settings), LocalKumo)
