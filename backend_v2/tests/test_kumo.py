import asyncio
import json
from datetime import date

import httpx
import pytest

from app.kumo import KumoClient, build_forecast_request, parse_forecast_response


def test_request_uses_only_pre_anchor_sales_and_excludes_personal_fields():
    sales = [
        {"product_id": "p1", "order_id": "o1", "ordered_at": "2024-12-18T10:00:00Z", "quantity": 2, "price": 10, "email": "buyer@example.test", "name": "Ada"},
        {"product_id": "p1", "order_id": "o2", "ordered_at": "2024-12-31T23:00:00Z", "quantity": 1, "price": 10, "address": "1 Private Street"},
        {"product_id": "p1", "order_id": "o3", "ordered_at": "2025-01-01T00:00:00Z", "quantity": 99, "price": 10},
    ]

    ids, payload = build_forecast_request(sales, ["p1"], date(2025, 1, 1))

    serialized = json.dumps(payload)
    assert "buyer@example.test" not in serialized
    assert "Ada" not in serialized
    assert "Private Street" not in serialized
    assert "99.0" not in serialized

    prediction_table = payload["predict"]["related_tables"]["sales_daily"]
    assert all(row[2] < "2025-01-01T00:00:00Z" for row in prediction_table["rows"])
    assert set(ids.values()) == {"p1"}

    context_instances = payload["context"]["instance_table"]["rows"]
    context_anchors = {row[0]: row[1] for row in context_instances}
    assert all(row[1] < "2025-01-01T00:00:00Z" for row in context_instances)
    assert all(
        row[2] < context_anchors[row[0]]
        for row in payload["context"]["related_tables"]["sales_daily"]["rows"]
    )


def test_family_comes_from_the_given_mapping():
    sales = [{"product_id": "p1", "order_id": "o1", "ordered_at": "2024-12-30T10:00:00Z", "quantity": 1, "price": 5}]
    _, payload = build_forecast_request(sales, ["p1"], date(2025, 1, 1), families={"p1": "shirts"})
    families = {row[2] for row in payload["predict"]["related_tables"]["products"]["rows"]}
    assert families == {"shirts"}


def test_parse_forecast_response_returns_nonnegative_quantile_range():
    result = parse_forecast_response(
        {"predictions": [{"id": "7", "quantiles": {"0.1": -2, "0.5": 4, "0.9": 9}}]},
        {"7": "p1"},
    )

    assert result == {"p1": {"lower": 0.0, "value": 4.0, "upper": 9.0}}


def test_parse_forecast_response_rejects_missing_predictions():
    with pytest.raises(ValueError, match="missing prediction"):
        parse_forecast_response({"predictions": []}, {"7": "p1"})


def test_kumo_client_posts_json_with_server_side_bearer_key():
    seen = {}

    async def handler(request):
        seen["authorization"] = request.headers["authorization"]
        seen["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"predictions": []})

    async def run():
        client = KumoClient(
            "unit-test-key",
            endpoint="https://kumo.test/predictions",
            transport=httpx.MockTransport(handler),
        )
        return await client.predict({"model": "kumo-relational"})

    assert asyncio.run(run()) == {"predictions": []}
    assert seen == {
        "authorization": "Bearer unit-test-key",
        "payload": {"model": "kumo-relational"},
    }

