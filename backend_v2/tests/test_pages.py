"""Page routes: section states per page, heatmap, product page, customer regions, connections, GPU runs."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from test_api import FakeSource, auth, client, db, do_import, shops  # noqa: F401  (fixtures)
from test_forecasts import add_recent_orders
from app.config import get_settings
from app.main import app


def states(body):
    return {s["key"]: s["state"] for s in body["sections"]}


def page(client, shop, name):  # noqa: F811
    return client.get(f"/merchants/{shop.merchant}/pages/{name}", headers=auth(shop.user))


@pytest.fixture
def gpu(client):  # noqa: F811
    """Pretend a GPU worker is configured."""
    app.dependency_overrides[get_settings] = lambda: get_settings().model_copy(update={"kumo_gpu_url": "http://gpu.test"})
    yield
    app.dependency_overrides.pop(get_settings, None)


def connect(db, shop, provider, status="synced"):  # noqa: F811
    db.execute("insert into merchant_integrations (merchant_id, provider, nango_connection_id, status) values (%s, %s, %s, %s)",
               (shop.merchant, provider, f"{provider}-{uuid.uuid4()}", status))


# Page state

def test_before_the_first_import_everything_asks_for_shopify(client, shops):  # noqa: F811
    a, _ = shops
    body = page(client, a, "products").json()
    assert body["connected"] == []
    assert set(states(body).values()) == {"not_connected"}


def test_after_import_shopify_features_unlock(client, shops):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    body = page(client, a, "products").json()
    assert body["connected"] == ["shopify"]
    assert states(body)["demand_14d"] == "ready"
    assert states(body)["sellout_risk"] == "blocked"  # built, waits on its backtest
    assert set(states(page(client, a, "ads").json()).values()) == {"not_connected"}


def test_unknown_page_is_404(client, shops):  # noqa: F811
    a, _ = shops
    assert page(client, a, "admin").status_code == 404


def test_gpu_sections_wait_for_the_gpu_worker(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    connect(db, a, "stripe")
    assert states(page(client, a, "money").json())["money_in"] == "needs_gpu"


def test_gpu_sections_move_on_once_a_worker_is_set(client, shops, db, gpu):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    connect(db, a, "stripe")
    assert states(page(client, a, "money").json())["money_in"] == "blocked"  # next gate: the totals test


def test_page_state_uses_only_own_connections(client, shops, db):  # noqa: F811
    a, b = shops
    connect(db, b, "google-ads")
    do_import(client, a, "a")
    assert page(client, a, "ads").json()["connected"] == ["shopify"]
    assert page(client, b, "ads").status_code == 200
    assert page(client, b, "ads").json()["connected"] == ["ads"]


# Heatmap

def add_orders(db, shop, city, n, days_ago=1, cancelled=False, country="Netherlands"):  # noqa: F811
    when = datetime.now(timezone.utc) - timedelta(days=days_ago)
    for _ in range(n):
        db.execute("""insert into orders (merchant_id, source, external_id, ordered_at, ship_city, ship_country, cancelled_at)
                      values (%s, 'shopify', %s, %s, %s, %s, %s)""",
                   (shop.merchant, f"o-{uuid.uuid4()}", when, city, country, when if cancelled else None))


def heatmap(client, shop, layer):  # noqa: F811
    return client.get(f"/merchants/{shop.merchant}/heatmap/{layer}", headers=auth(shop.user))


def test_orders_heatmap_counts_recent_orders_per_city(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    add_orders(db, a, "Amsterdam", 7)
    add_orders(db, a, "Rotterdam", 5)
    body = heatmap(client, a, "orders").json()
    assert body["section"]["state"] == "ready" and body["min_count"] == 5
    assert {(p["city"], p["value"]) for p in body["points"]} == {("Amsterdam", 7), ("Rotterdam", 5)}


def test_orders_heatmap_leaves_out_small_cities(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    add_orders(db, a, "Amsterdam", 6)
    add_orders(db, a, "Tiny Town", 4)
    assert [p["city"] for p in heatmap(client, a, "orders").json()["points"]] == ["Amsterdam"]


def test_orders_heatmap_skips_old_and_cancelled_orders(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    add_orders(db, a, "Amsterdam", 5)
    add_orders(db, a, "Amsterdam", 3, days_ago=20)
    add_orders(db, a, "Amsterdam", 3, cancelled=True)
    assert [p["value"] for p in heatmap(client, a, "orders").json()["points"]] == [5]


def test_orders_heatmap_counts_only_own_orders(client, shops, db):  # noqa: F811
    a, b = shops
    do_import(client, a, "a")
    add_orders(db, a, "Amsterdam", 5)
    add_orders(db, b, "Amsterdam", 9)
    add_orders(db, b, "Berlin", 9)
    assert [(p["city"], p["value"]) for p in heatmap(client, a, "orders").json()["points"]] == [("Amsterdam", 5)]


def test_unbuilt_heatmap_layer_draws_nothing(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    add_orders(db, a, "Amsterdam", 9)
    body = heatmap(client, a, "returns").json()
    assert body["section"]["state"] == "not_built" and body["points"] == []


def test_unknown_heatmap_layer_is_404(client, shops):  # noqa: F811
    a, _ = shops
    assert heatmap(client, a, "salaries").status_code == 404


# Product page

def product_id(db, shop):  # noqa: F811
    return db.execute("select id from products where merchant_id = %s", (shop.merchant,)).fetchone()[0]


def test_product_page_has_stock_per_location_and_daily_sales(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    pid = add_recent_orders(db, a, 3)  # 3 orders of 2 units, 2 to 4 days ago
    body = client.get(f"/merchants/{a.merchant}/products/{pid}", headers=auth(a.user)).json()
    assert body["title"] == "a shirt" and body["units"] == 7
    assert [(loc["name"], loc["units"]) for loc in body["by_location"]] == [("a warehouse", 7)]
    assert body["forecast_state"] == "too_few_sales" and body["forecast"] is None
    assert len(body["sales"]) == 28 and sum(d["units"] for d in body["sales"]) == 6
    assert body["sales"] == sorted(body["sales"], key=lambda d: d["date"])


def test_product_of_another_merchant_is_404(client, shops, db):  # noqa: F811
    a, b = shops
    do_import(client, a, "a")
    do_import(client, b, "b")
    other = product_id(db, b)
    assert client.get(f"/merchants/{a.merchant}/products/{other}", headers=auth(a.user)).status_code == 404
    assert client.get(f"/merchants/{a.merchant}/products/{uuid.uuid4()}", headers=auth(a.user)).status_code == 404


# Customers (groups per city, never people)

def add_customers(db, shop, city, n, days_ago=10):  # noqa: F811
    when = datetime.now(timezone.utc) - timedelta(days=days_ago)
    for _ in range(n):
        cust = uuid.uuid4()
        db.execute("insert into customers (id, merchant_id, source, external_id) values (%s, %s, 'shopify', %s)", (cust, shop.merchant, f"c-{cust}"))
        for _ in range(2):  # two orders each: still one customer
            db.execute("insert into orders (merchant_id, source, external_id, customer_id, ordered_at, ship_city, ship_country) values (%s, 'shopify', %s, %s, %s, %s, 'Netherlands')",
                       (shop.merchant, f"o-{uuid.uuid4()}", cust, when, city))


def regions(client, shop):  # noqa: F811
    return client.get(f"/merchants/{shop.merchant}/customers/regions", headers=auth(shop.user)).json()


def test_customer_regions_count_people_not_orders(client, shops, db):  # noqa: F811
    a, _ = shops
    add_customers(db, a, "Utrecht", 6)
    body = regions(client, a)
    assert body["min_count"] == 5
    assert [(r["city"], r["customers"]) for r in body["regions"]] == [("Utrecht", 6)]


def test_small_customer_regions_are_hidden_but_counted(client, shops, db):  # noqa: F811
    a, _ = shops
    add_customers(db, a, "Utrecht", 5)
    add_customers(db, a, "Tiny Town", 2)
    body = regions(client, a)
    assert [r["city"] for r in body["regions"]] == ["Utrecht"] and body["hidden"] == 2


def test_customer_regions_skip_customers_gone_over_a_year(client, shops, db):  # noqa: F811
    a, _ = shops
    add_customers(db, a, "Utrecht", 5)
    add_customers(db, a, "Utrecht", 4, days_ago=400)
    assert regions(client, a)["regions"][0]["customers"] == 5


def test_customer_regions_count_only_own_customers(client, shops, db):  # noqa: F811
    a, b = shops
    add_customers(db, a, "Utrecht", 5)
    add_customers(db, b, "Utrecht", 5)
    add_customers(db, b, "Delft", 5)
    body = regions(client, a)
    assert [(r["city"], r["customers"]) for r in body["regions"]] == [("Utrecht", 5)] and body["hidden"] == 0


# Connections

def connections(client, shop):  # noqa: F811
    return client.get(f"/merchants/{shop.merchant}/connections", headers=auth(shop.user)).json()


def test_connections_list_every_app_and_which_are_live(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    connect(db, a, "stripe", status="error")
    apps = {x["app"]: x for x in connections(client, a)["apps"]}
    assert list(apps) == ["shopify", "ads", "payments", "support"]
    assert apps["shopify"]["connected"] is True and apps["shopify"]["integrations"][0]["status"] == "synced"
    assert apps["payments"]["connected"] is False and apps["payments"]["integrations"][0]["provider"] == "stripe"
    assert apps["ads"]["integrations"] == []


def test_connections_show_kumo_setup_and_latest_runs(client, shops, db, gpu):  # noqa: F811
    a, b = shops
    for shop, status in ((a, "failed"), (a, "done"), (b, "failed")):
        db.execute("insert into kumo_runs (merchant_id, model, query_name, status, trigger, finished_at) values (%s, 'relational', 'demand_14d', %s, 'schedule', now())",
                   (shop.merchant, status))
    kumo = connections(client, a)["kumo"]
    assert kumo["gpu"] is True and kumo["local"] is False
    assert [(r["query_name"], r["status"]) for r in kumo["last_runs"]] == [("demand_14d", "done")]
