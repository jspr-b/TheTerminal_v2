"""Products page data: sell-out math, the overview route, and the extra product page fields."""
import uuid
from datetime import datetime, timedelta, timezone


from test_api import FakeSource, auth, client, db, do_import, shops  # noqa: F401  (fixtures)
from test_forecasts import add_recent_orders
from app.sellout import sellout


# Sell-out: our math on the Kumo range

def test_band_uses_the_middle_then_the_top_of_the_range():
    assert sellout(4, {"lower": 2, "value": 5, "upper": 11})["band"] == "high"
    assert sellout(7, {"lower": 2, "value": 5, "upper": 11})["band"] == "medium"
    assert sellout(12, {"lower": 2, "value": 5, "upper": 11})["band"] == "low"


def test_run_out_days_spread_the_range_evenly_over_14_days():
    s = sellout(7, {"lower": 2, "value": 5, "upper": 11})
    assert (s["earliest_day"], s["likely_day"], s["latest_day"]) == (9, None, None)  # 7 / (11/14) = 8.9 -> day 9
    s = sellout(14, {"lower": 14, "value": 28, "upper": 56})
    assert (s["earliest_day"], s["likely_day"], s["latest_day"]) == (4, 7, 14)


def test_no_sales_means_it_never_runs_out_and_empty_stock_is_out_now():
    assert sellout(5, {"lower": 0, "value": 0, "upper": 0})["earliest_day"] is None
    s = sellout(0, {"lower": 1, "value": 2, "upper": 3})
    assert (s["band"], s["earliest_day"]) == ("high", 0)


def test_sellout_is_marked_untested():
    """CLAUDE.md: sell-out risk needs a backtest before merchants see it."""
    assert sellout(7, {"lower": 2, "value": 5, "upper": 11})["tested"] is False


# Helpers

def product_of(db, shop):  # noqa: F811
    return db.execute("select id from products where merchant_id = %s order by title limit 1", (shop.merchant,)).fetchone()[0]


def add_forecast(db, shop, product, lower, value, upper, days_ago=1):  # noqa: F811
    run, when = uuid.uuid4(), datetime.now(timezone.utc) - timedelta(days=days_ago)
    db.execute("insert into kumo_runs (id, merchant_id, model, query_name, status, trigger, created_at) values (%s, %s, 'relational', 'demand_14d', 'done', 'schedule', %s)",
               (run, shop.merchant, when))
    db.execute("""insert into predictions (merchant_id, run_id, model, entity_type, entity_id, target, horizon_days, lower, value, upper, generated_at)
                  values (%s, %s, 'relational', 'product', %s, 'demand_14d', 14, %s, %s, %s, %s)""", (shop.merchant, run, product, lower, value, upper, when))


def add_order(db, shop, products, days_ago, qty=1):  # noqa: F811
    order, when = uuid.uuid4(), datetime.now(timezone.utc) - timedelta(days=days_ago)
    db.execute("insert into orders (id, merchant_id, source, external_id, ordered_at) values (%s, %s, 'shopify', %s, %s)", (order, shop.merchant, f"o-{order}", when))
    for p in products:
        db.execute("insert into order_lines (merchant_id, source, external_id, order_id, product_id, quantity, ordered_at) values (%s, 'shopify', %s, %s, %s, %s, %s)",
                   (shop.merchant, f"l-{uuid.uuid4()}", order, p, qty, when))


def add_product(db, shop, title):  # noqa: F811
    pid = uuid.uuid4()
    db.execute("insert into products (id, merchant_id, source, external_id, title) values (%s, %s, 'shopify', %s, %s)", (pid, shop.merchant, f"p-{pid}", title))
    return pid


def overview(client, shop):  # noqa: F811
    return client.get(f"/merchants/{shop.merchant}/products/overview", headers=auth(shop.user))


def detail(client, shop, pid):  # noqa: F811
    return client.get(f"/merchants/{shop.merchant}/products/{pid}", headers=auth(shop.user)).json()


# Overview

def test_overview_has_stock_recent_sales_and_no_forecast_yet(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    add_recent_orders(db, a, 3)  # 3 orders of 2 units, 2 to 4 days ago
    (p,) = overview(client, a).json()["products"]
    assert (p["title"], p["units"], p["sold_14d"]) == ("a shirt", 7, 6)
    assert len(p["sales_28d"]) == 28 and sum(p["sales_28d"]) == 6
    assert p["forecast_state"] == "too_few_sales" and p["forecast"] is None and p["sellout"] is None


def test_overview_adds_sellout_to_a_forecast(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    add_forecast(db, a, product_of(db, a), 2, 5, 11)
    (p,) = overview(client, a).json()["products"]
    assert p["forecast_state"] == "forecast" and p["forecast"]["upper"] == 11
    assert p["sellout"] == {"band": "medium", "earliest_day": 9, "likely_day": None, "latest_day": None, "tested": False}


def test_overview_shows_only_own_products_and_sales(client, shops, db):  # noqa: F811
    a, b = shops
    do_import(client, a, "a")
    do_import(client, b, "b")
    add_order(db, b, [product_of(db, b)], days_ago=2, qty=9)
    (p,) = overview(client, a).json()["products"]
    assert p["title"] == "a shirt" and p["sold_14d"] == 0


def test_overview_is_403_for_another_merchant(client, shops):  # noqa: F811
    a, b = shops
    assert client.get(f"/merchants/{b.merchant}/products/overview", headers=auth(a.user)).status_code == 403


# Product page extras

def test_product_page_has_variants_and_recent_sales(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    pid = add_recent_orders(db, a, 2)
    body = detail(client, a, pid)
    assert body["sold_14d"] == 4
    assert [(v["title"], v["sku"], v["units"]) for v in body["by_variant"]] == [("M", "S1", 7)]


def test_bought_together_needs_two_shared_orders(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    pid = product_of(db, a)
    often, once = add_product(db, a, "Often"), add_product(db, a, "Once")
    add_order(db, a, [pid, often], 3)
    add_order(db, a, [pid, often], 4)
    add_order(db, a, [pid, once], 5)
    assert [(x["title"], x["orders"]) for x in detail(client, a, pid)["bought_together"]] == [("Often", 2)]


def test_bought_together_counts_only_own_orders(client, shops, db):  # noqa: F811
    a, b = shops
    do_import(client, a, "a")
    pid = product_of(db, a)
    often = add_product(db, a, "Often")
    add_order(db, a, [pid, often], 3)
    for _ in range(3):  # b's orders cannot point at a's products (foreign keys), so b shares only its own
        add_order(db, b, [add_product(db, b, "B thing")], 3)
    assert detail(client, a, pid)["bought_together"] == []


def test_track_record_compares_past_ranges_with_what_sold(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    pid = product_of(db, a)
    add_forecast(db, a, pid, 3, 6, 10, days_ago=20)  # window: 20 to 6 days ago
    add_forecast(db, a, pid, 1, 2, 4, days_ago=5)  # window not over yet: left out
    add_order(db, a, [pid], days_ago=15, qty=4)
    add_order(db, a, [pid], days_ago=8, qty=3)
    add_order(db, a, [pid], days_ago=2, qty=50)  # after the window
    (t,) = detail(client, a, pid)["track_record"]
    assert (t["lower"], t["value"], t["upper"], t["actual"]) == (3, 6, 10, 7)


def test_product_page_sellout_follows_the_latest_range(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    pid = product_of(db, a)
    add_forecast(db, a, pid, 2, 5, 11)
    assert detail(client, a, pid)["sellout"]["band"] == "medium"
