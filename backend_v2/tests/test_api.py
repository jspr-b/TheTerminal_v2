"""The API on a real local database: login, merchant separation, and the Shopify import."""
import os
import time
import uuid

import jwt
import psycopg
import pytest

from conftest import DB_URL

SECRET = "test-secret-at-least-32-bytes-long-for-hs256"
os.environ["DATABASE_URL"] = DB_URL
os.environ["SUPABASE_JWT_SECRET"] = SECRET

from fastapi.routing import APIRoute  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app, get_record_source, merchant_access  # noqa: E402

PII = ["Jane", "Doe", "jane@example.test", "1 Secret Street", "+31600000000"]


class FakeSource:
    """Stands in for Nango. Each page carries the personal fields Shopify really sends."""

    def __init__(self, tag: str):
        self.tag = tag

    async def records(self, integration_id, connection_id, model):
        t = self.tag
        address = {"first_name": "Jane", "last_name": "Doe", "address1": "1 Secret Street", "phone": "+31600000000", "city": "Utrecht", "province": "UT", "country": "Netherlands"}
        yield {
            "locations": [{"id": f"{t}-loc", "name": f"{t} warehouse", "city": "Utrecht", "country": "Netherlands", "active": True, "created_at": "2024-01-01T00:00:00Z"}],
            "products": [{"id": f"{t}-p", "title": f"{t} shirt", "status": "active", "tags": "a, b", "created_at": "2024-01-02T00:00:00Z", "updated_at": "2024-01-03T00:00:00Z",
                          "variants": [{"id": f"{t}-v", "title": "M", "sku": "S1", "price": "10.00", "inventory_item_id": f"{t}-item"}]}],
            "inventory_levels": [{"id": f"{t}-il", "inventory_item_id": f"{t}-item", "location_id": f"{t}-loc", "available": 7}],
            "customers": [{"id": f"{t}-c", "first_name": "Jane", "last_name": "Doe", "email": "jane@example.test", "phone": "+31600000000", "default_address": address, "orders_count": 1, "total_spent": "10.00"}],
            "orders": [{"id": f"{t}-o", "created_at": "2024-02-01T00:00:00Z", "customer": {"id": f"{t}-c", "email": "jane@example.test"}, "email": "jane@example.test", "total_price": "10.00", "currency": "EUR", "shipping_address": address,
                        "line_items": [{"id": f"{t}-li", "product_id": f"{t}-p", "variant_id": f"{t}-v", "quantity": 1, "price": "10.00", "name": "Jane's order"}]}],
        }[model]


def token(user, exp_delta=3600, secret=SECRET, aud="authenticated"):
    return jwt.encode({"sub": str(user), "aud": aud, "exp": int(time.time()) + exp_delta}, secret, algorithm="HS256")


def auth(user):
    return {"Authorization": f"Bearer {token(user)}"}


class Shop:
    def __init__(self, conn, tag):
        self.merchant, self.user, self.integration = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        conn.execute("insert into auth.users (id, email) values (%s, %s)", (self.user, f"{self.user}@example.test"))
        conn.execute("insert into merchants (id, name) values (%s, %s)", (self.merchant, tag))
        conn.execute("insert into merchant_users (merchant_id, user_id) values (%s, %s)", (self.merchant, self.user))
        conn.execute("insert into merchant_integrations (id, merchant_id, provider, nango_connection_id, nango_integration_id) values (%s, %s, 'shopify', %s, 'shopify')", (self.integration, self.merchant, tag))


@pytest.fixture
def db():
    with psycopg.connect(DB_URL, autocommit=True) as c:
        yield c


@pytest.fixture
def shops(db):
    a, b = Shop(db, "a"), Shop(db, "b")
    yield a, b
    for s in (a, b):
        db.execute("delete from merchants where id = %s", (s.merchant,))
        db.execute("delete from auth.users where id = %s", (s.user,))


@pytest.fixture
def client():
    source = {}
    app.dependency_overrides[get_record_source] = lambda: source["now"]
    with TestClient(app) as c:
        c.source = source
        yield c
    app.dependency_overrides.clear()


def read_paths(shop):
    return [f"/merchants/{shop.merchant}/command", f"/merchants/{shop.merchant}/products", f"/merchants/{shop.merchant}/locations", f"/merchants/{shop.merchant}/imports"]


def do_import(client, shop, tag):
    client.source["now"] = FakeSource(tag)
    return client.post(f"/merchants/{shop.merchant}/integrations/{shop.integration}/import", headers=auth(shop.user))


def counts(db, merchant):
    tables = ["locations", "products", "product_variants", "inventory_levels", "customers", "orders", "order_lines"]
    return {t: db.execute(f"select count(*) from {t} where merchant_id = %s", (merchant,)).fetchone()[0] for t in tables}


def test_every_merchant_route_checks_access():
    routes = [r for r in app.routes if isinstance(r, APIRoute) and "{merchant_id}" in r.path]
    assert routes
    for r in routes:
        assert any(d.call is merchant_access for d in r.dependant.dependencies), r.path


def test_health_is_open(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_login_required(client, shops):
    a, _ = shops
    for p in read_paths(a):
        assert client.get(p).status_code == 401
    assert client.post(f"/merchants/{a.merchant}/integrations/{a.integration}/import").status_code == 401


@pytest.mark.parametrize("bad", [
    lambda u: token(u, exp_delta=-10),
    lambda u: token(u, secret="wrong-secret-at-least-32-bytes-long-xx"),
    lambda u: token(u, aud="anon"),
    lambda u: token("not-a-uuid"),
    lambda u: "garbage",
])
def test_bad_tokens_rejected(client, shops, bad):
    a, _ = shops
    assert client.get(read_paths(a)[0], headers={"Authorization": f"Bearer {bad(a.user)}"}).status_code == 401


def test_merchant_a_cannot_read_merchant_b(client, shops):
    a, b = shops
    for p in read_paths(b):
        assert client.get(p, headers=auth(a.user)).status_code == 403


def test_merchant_a_cannot_import_for_merchant_b(client, shops, db):
    a, b = shops
    client.source["now"] = FakeSource("evil")
    r = client.post(f"/merchants/{b.merchant}/integrations/{b.integration}/import", headers=auth(a.user))
    assert r.status_code == 403
    assert counts(db, b.merchant)["products"] == 0


def test_merchant_a_cannot_use_merchant_b_integration(client, shops, db):
    a, b = shops
    client.source["now"] = FakeSource("evil")
    r = client.post(f"/merchants/{a.merchant}/integrations/{b.integration}/import", headers=auth(a.user))
    assert r.status_code == 404
    assert counts(db, a.merchant)["products"] == 0


def test_import_shows_only_own_data(client, shops):
    a, b = shops
    assert do_import(client, a, "a").status_code == 202
    assert do_import(client, b, "b").status_code == 202
    titles = [p["title"] for p in client.get(f"/merchants/{a.merchant}/products", headers=auth(a.user)).json()]
    assert titles == ["a shirt"]
    names = [l["name"] for l in client.get(f"/merchants/{b.merchant}/locations", headers=auth(b.user)).json()]
    assert names == ["b warehouse"]


def test_command_shows_only_own_stock(client, shops):
    a, b = shops
    do_import(client, a, "a")
    do_import(client, b, "b")
    body = client.get(f"/merchants/{a.merchant}/command", headers=auth(a.user)).json()
    assert [l["name"] for l in body["locations"]] == ["a warehouse"]
    assert [p["title"] for p in body["products"]] == ["a shirt"]
    assert body["locations"][0]["units"] == 7 and body["products"][0]["units"] == 7
    assert body["products"][0]["forecast_state"] == "too_few_sales"


def test_second_import_adds_nothing(client, shops, db):
    a, _ = shops
    do_import(client, a, "a")
    first = counts(db, a.merchant)
    assert all(v == 1 for v in first.values()), first
    do_import(client, a, "a")
    assert counts(db, a.merchant) == first
    assert db.execute("select count(*) from raw_records where merchant_id = %s", (a.merchant,)).fetchone()[0] == 5


def test_links_and_platform_times_kept(client, shops, db):
    a, _ = shops
    do_import(client, a, "a")
    created = db.execute("select created_at_platform::date::text from products where merchant_id = %s", (a.merchant,)).fetchone()[0]
    assert created == "2024-01-02"
    line = db.execute("select product_id is not null, variant_id is not null from order_lines where merchant_id = %s", (a.merchant,)).fetchone()
    assert line == (True, True)
    assert db.execute("select available from inventory_levels where merchant_id = %s", (a.merchant,)).fetchone()[0] == 7


def test_no_personal_data_outside_raw_records(client, shops, db):
    a, _ = shops
    do_import(client, a, "a")
    for t in ["customers", "orders", "order_lines", "locations"]:
        text = db.execute(f"select coalesce(string_agg(x::text, ' '), '') from {t} x where merchant_id = %s", (a.merchant,)).fetchone()[0]
        for value in PII:
            assert value not in text, (t, value)
    assert db.execute("select city from customers where merchant_id = %s", (a.merchant,)).fetchone()[0] == "Utrecht"


def test_failed_import_is_recorded(client, shops, db):
    a, _ = shops

    class Broken(FakeSource):
        async def records(self, integration_id, connection_id, model):
            raise RuntimeError("secret detail from a payload")
            yield

    client.source["now"] = Broken("a")
    client.post(f"/merchants/{a.merchant}/integrations/{a.integration}/import", headers=auth(a.user))
    status, error = db.execute("select status, error from import_jobs where merchant_id = %s", (a.merchant,)).fetchone()
    assert (status, error) == ("failed", "RuntimeError")
    assert db.execute("select status from merchant_integrations where id = %s", (a.integration,)).fetchone()[0] == "error"
