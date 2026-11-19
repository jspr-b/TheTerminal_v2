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
    return order


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


def test_bought_together_uses_the_same_window_as_the_galaxy(client, shops, db):  # noqa: F811
    """The product page and the basket galaxy must agree: only orders from the last 90 days count."""
    a, _ = shops
    do_import(client, a, "a")
    pid, old, new = product_of(db, a), add_product(db, a, "Old"), add_product(db, a, "New")
    add_order(db, a, [pid, old], 100)
    add_order(db, a, [pid, old], 120)
    add_order(db, a, [pid, new], 3)
    add_order(db, a, [pid, new], 4)
    assert [(x["title"], x["orders"]) for x in detail(client, a, pid)["bought_together"]] == [("New", 2)]
    link = {frozenset((l["source"], l["target"])): l["orders"] for l in pairs(client, a)["links"]}
    assert link == {frozenset((str(pid), str(new))): 2}


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


# Basket galaxy: product pairs

def pairs(client, shop):  # noqa: F811
    return client.get(f"/merchants/{shop.merchant}/products/pairs", headers=auth(shop.user)).json()


def test_pairs_join_products_bought_in_the_same_order(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    shirt = product_of(db, a)
    tote, hat = add_product(db, a, "Tote"), add_product(db, a, "Hat")
    for days in (3, 4, 5):
        add_order(db, a, [shirt, tote], days, qty=2)
    add_order(db, a, [shirt, hat], 6)  # only once: no link
    body = pairs(client, a)
    assert (body["days"], body["min_orders"]) == (90, 2)
    assert [(x["orders"], {x["source"], x["target"]}) for x in body["links"]] == [(3, {str(shirt), str(tote)})]
    sold = {n["title"]: n["sold"] for n in body["nodes"]}
    assert sold == {"a shirt": 7, "Tote": 6, "Hat": 1}


def test_pairs_skip_old_and_cancelled_orders(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    shirt, tote = product_of(db, a), add_product(db, a, "Tote")
    add_order(db, a, [shirt, tote], 100)
    add_order(db, a, [shirt, tote], 120)
    add_order(db, a, [shirt, tote], 3)
    db.execute("update orders set cancelled_at = ordered_at where merchant_id = %s and ordered_at > now() - interval '10 days'", (a.merchant,))
    add_order(db, a, [shirt, tote], 4)
    assert pairs(client, a)["links"] == []


def add_customer(db, shop):  # noqa: F811
    cid = uuid.uuid4()
    db.execute("insert into customers (id, merchant_id, source, external_id) values (%s, %s, 'shopify', %s)", (cid, shop.merchant, f"c-{cid}"))
    return cid


def test_pair_nodes_count_orders_customers_repeat_buyers_and_returns(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    shirt = product_of(db, a)
    ann, bob = add_customer(db, a), add_customer(db, a)
    before = {n["title"]: n for n in pairs(client, a)["nodes"]}.get("a shirt", {"orders": 0, "customers": 0, "repeat_customers": 0, "returned": 0})
    orders = []
    for days, who in ((3, ann), (4, ann), (5, bob), (6, None)):
        oid = add_order(db, a, [shirt], days)
        db.execute("update orders set customer_id = %s where id = %s", (who, oid))
        orders.append(oid)
    refund = uuid.uuid4()
    db.execute("insert into refunds (id, merchant_id, source, external_id, order_id, refunded_at) values (%s, %s, 'shopify', %s, %s, now())", (refund, a.merchant, f"r-{refund}", orders[0]))
    db.execute("insert into refund_lines (merchant_id, source, external_id, refund_id, product_id, quantity) values (%s, 'shopify', %s, %s, %s, 2)", (a.merchant, f"rl-{refund}", refund, shirt))
    node = {n["title"]: n for n in pairs(client, a)["nodes"]}["a shirt"]
    assert node["orders"] - before["orders"] == 4
    assert node["customers"] - before["customers"] == 2        # orders without a customer are not counted
    assert node["repeat_customers"] - before["repeat_customers"] == 1  # ann bought it twice
    assert node["returned"] - before["returned"] == 2


def test_pairs_use_only_own_orders(client, shops, db):  # noqa: F811
    a, b = shops
    do_import(client, a, "a")
    do_import(client, b, "b")
    x, y = add_product(db, b, "B one"), add_product(db, b, "B two")
    add_order(db, b, [x, y], 3)
    add_order(db, b, [x, y], 4)
    body = pairs(client, a)
    assert body["links"] == [] and "B one" not in {n["title"] for n in body["nodes"]}


# Track record across the shop

def add_run(db, shop, days_ago, ranges):  # noqa: F811
    run, when = uuid.uuid4(), datetime.now(timezone.utc) - timedelta(days=days_ago)
    db.execute("insert into kumo_runs (id, merchant_id, model, query_name, status, trigger, created_at) values (%s, %s, 'relational', 'demand_14d', 'done', 'schedule', %s)",
               (run, shop.merchant, when))
    for pid, (lo, md, hi) in ranges.items():
        db.execute("""insert into predictions (merchant_id, run_id, model, entity_type, entity_id, target, horizon_days, lower, value, upper, generated_at)
                      values (%s, %s, 'relational', 'product', %s, 'demand_14d', 14, %s, %s, %s, %s)""", (shop.merchant, run, pid, lo, md, hi, when))


def record(client, shop):  # noqa: F811
    return client.get(f"/merchants/{shop.merchant}/products/track-record", headers=auth(shop.user)).json()


def test_track_record_is_empty_before_a_window_ends(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    add_run(db, a, 5, {product_of(db, a): (1, 2, 3)})
    body = record(client, a)
    assert body["window_start"] is None and body["checked"] == 0 and body["products"] == []


def test_track_record_counts_inside_above_below(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    inside, above, below = product_of(db, a), add_product(db, a, "Above"), add_product(db, a, "Below")
    add_run(db, a, 20, {inside: (3, 6, 10), above: (1, 2, 4), below: (10, 15, 20)})
    add_order(db, a, [inside], 15, qty=7)
    add_order(db, a, [above], 12, qty=9)
    add_order(db, a, [below], 10, qty=2)
    body = record(client, a)
    assert (body["checked"], body["inside"], body["above"], body["below"]) == (3, 1, 1, 1)
    assert [(p["title"], p["result"], p["actual"]) for p in body["products"]] == [("Above", "above", 9), ("Below", "below", 2), ("a shirt", "inside", 7)]


def test_track_record_uses_the_latest_finished_window(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    pid = product_of(db, a)
    add_run(db, a, 34, {pid: (100, 200, 300)})
    add_run(db, a, 19, {pid: (1, 2, 3)})
    add_run(db, a, 3, {pid: (50, 60, 70)})  # not finished
    (p,) = record(client, a)["products"]
    assert (p["lower"], p["upper"]) == (1, 3)


def test_track_record_uses_only_own_runs(client, shops, db):  # noqa: F811
    a, b = shops
    do_import(client, a, "a")
    do_import(client, b, "b")
    add_run(db, b, 20, {product_of(db, b): (1, 2, 3)})
    body = record(client, a)
    assert body["checked"] == 0 and body["window_start"] is None  # b's run must not even be picked
