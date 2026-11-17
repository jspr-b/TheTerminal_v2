"""Kumo demand forecasts through the API: ranges, too few sales, stale, and merchant separation."""
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from test_api import FakeSource, auth, client, db, do_import, shops  # noqa: F401  (fixtures)
from app.main import get_kumo


class FakeKumo:
    """Stands in for NVIDIA's hosted Kumo. Answers every prediction id with a fixed range."""

    def __init__(self, fail: bool = False):
        self.fail = fail
        self.payloads: list[dict] = []

    async def predict(self, payload):
        self.payloads.append(payload)
        if self.fail:
            raise RuntimeError("kumo is down")
        rows = payload["predict"]["instance_table"]["rows"]
        return {"predictions": [{"id": str(r[0]), "quantiles": {"0.1": 2.0, "0.5": 5.0, "0.9": 11.0}} for r in rows]}


@pytest.fixture
def kumo(client):  # noqa: F811
    holder = {"now": FakeKumo()}
    client.app.dependency_overrides[get_kumo] = lambda: holder["now"]
    return holder


def add_recent_orders(db, shop, n):  # noqa: F811
    """n recent orders of the shop's imported product, all before today."""
    product = db.execute("select id from products where merchant_id = %s", (shop.merchant,)).fetchone()[0]
    for i in range(n):
        when = datetime.now(timezone.utc) - timedelta(days=2 + i)
        order = uuid.uuid4()
        db.execute("insert into orders (id, merchant_id, source, external_id, ordered_at) values (%s, %s, 'shopify', %s, %s)",
                   (order, shop.merchant, f"recent-{order}", when))
        db.execute("insert into order_lines (merchant_id, source, external_id, order_id, product_id, quantity, price, ordered_at) values (%s, %s, %s, %s, %s, 2, 10, %s)",
                   (shop.merchant, "shopify", f"recent-line-{order}", order, product, when))
    return product


def forecast(client, shop):  # noqa: F811
    return client.post(f"/merchants/{shop.merchant}/forecasts", headers=auth(shop.user))


def product_view(client, shop):  # noqa: F811
    return client.get(f"/merchants/{shop.merchant}/command", headers=auth(shop.user)).json()["products"][0]


def test_forecast_needs_login(client, shops, kumo):  # noqa: F811
    a, _ = shops
    assert client.post(f"/merchants/{a.merchant}/forecasts").status_code == 401


def test_merchant_a_cannot_forecast_for_merchant_b(client, shops, kumo, db):  # noqa: F811
    a, b = shops
    r = client.post(f"/merchants/{b.merchant}/forecasts", headers=auth(a.user))
    assert r.status_code == 403
    assert kumo["now"].payloads == []
    assert db.execute("select count(*) from kumo_runs where merchant_id = %s", (b.merchant,)).fetchone()[0] == 0


def test_forecast_shows_a_range_on_command(client, shops, kumo, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    add_recent_orders(db, a, 3)
    assert forecast(client, a).status_code == 202
    p = product_view(client, a)
    assert p["forecast_state"] == "forecast"
    assert {k: p["forecast"][k] for k in ("lower", "value", "upper")} == {"lower": 2.0, "value": 5.0, "upper": 11.0}
    made = datetime.fromisoformat(p["forecast"]["generated_at"])
    assert abs(datetime.now(timezone.utc) - made) < timedelta(minutes=5)
    run = db.execute("select status, model, query_name from kumo_runs where merchant_id = %s", (a.merchant,)).fetchone()
    assert run == ("done", "relational", "demand_14d")


def test_too_few_sales_is_not_sent_and_shows_no_number(client, shops, kumo, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    add_recent_orders(db, a, 2)
    forecast(client, a)
    p = product_view(client, a)
    assert p["forecast_state"] == "too_few_sales"
    assert p["forecast"] is None
    assert kumo["now"].payloads == []  # nothing worth asking Kumo


def test_kumo_down_makes_forecasts_stale(client, shops, kumo, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    add_recent_orders(db, a, 3)
    forecast(client, a)
    kumo["now"] = FakeKumo(fail=True)
    forecast(client, a)
    p = product_view(client, a)
    assert p["forecast_state"] == "stale"
    assert {k: p["forecast"][k] for k in ("lower", "value", "upper")} == {"lower": 2.0, "value": 5.0, "upper": 11.0}
    first_run = db.execute("select generated_at from predictions where merchant_id = %s", (a.merchant,)).fetchone()[0]
    assert datetime.fromisoformat(p["forecast"]["generated_at"]) == first_run  # the stale range says when it is from
    statuses = [r[0] for r in db.execute("select status from kumo_runs where merchant_id = %s order by created_at", (a.merchant,)).fetchall()]
    assert statuses == ["done", "failed"]
    error = db.execute("select error from kumo_runs where merchant_id = %s and status = 'failed'", (a.merchant,)).fetchone()[0]
    assert error == "RuntimeError"


def test_kumo_payload_has_no_personal_data_or_titles(client, shops, kumo, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    product = add_recent_orders(db, a, 3)
    forecast(client, a)
    text = json.dumps(kumo["now"].payloads)
    for value in ["Jane", "Doe", "jane@example.test", "1 Secret Street", "Utrecht", "a shirt"]:
        assert value not in text, value
    assert str(product) in text


def test_forecasts_show_only_for_own_merchant(client, shops, kumo, db):  # noqa: F811
    a, b = shops
    do_import(client, a, "a")
    do_import(client, b, "b")
    add_recent_orders(db, a, 3)
    forecast(client, a)
    assert product_view(client, a)["forecast_state"] == "forecast"
    assert product_view(client, b)["forecast_state"] == "too_few_sales"
    assert db.execute("select count(*) from predictions where merchant_id = %s", (b.merchant,)).fetchone()[0] == 0


def test_service_reads_only_own_forecast_runs(client, shops, kumo, db):  # noqa: F811
    """Product ids differ per merchant, so a leak would not show on Command. Check the read itself."""
    a, b = shops
    do_import(client, a, "a")
    add_recent_orders(db, a, 3)
    forecast(client, a)
    svc = client.app.state.service
    ranges, _ = client.portal.call(svc.latest_demand_forecasts, a.merchant)
    assert len(ranges) == 1
    assert client.portal.call(svc.latest_demand_forecasts, b.merchant) == ({}, False)


def test_forecast_without_kumo_key_is_refused(client, shops):  # noqa: F811
    a, _ = shops
    assert forecast(client, a).status_code == 503
