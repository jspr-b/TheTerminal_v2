"""Command: one green dot per customer at their Shopify shipping address, and the customer cards behind it.

The merchant may see shipping addresses (owner decision, 20 Nov 2026). Names, emails and phones are never imported,
and nothing here goes to NVIDIA (Kumo gets only product sales: see test_kumo.py).
"""
import uuid
from datetime import datetime, timedelta, timezone

from test_api import FakeSource, auth, client, db, do_import, shops  # noqa: F401  (fixtures)
from test_products_page import add_product


def customer(db, shop):  # noqa: F811
    cid = uuid.uuid4()
    db.execute("insert into customers (id, merchant_id, source, external_id) values (%s, %s, 'shopify', %s)", (cid, shop.merchant, f"c-{cid}"))
    return cid


def order(db, shop, days_ago, cust=None, city="Paris", country="France", total="10", products=(), qty=1, discounts="0", currency="EUR",
          cancelled=False, street="1 Rue Demo", zip_="75011", lat: float | None = 48.858, lng: float | None = 2.380):  # noqa: F811
    oid, when = uuid.uuid4(), datetime.now(timezone.utc) - timedelta(days=days_ago, hours=1)
    db.execute(
        """insert into orders (id, merchant_id, source, external_id, ordered_at, total, discounts, currency, customer_id, ship_city, ship_country,
                               cancelled_at, ship_address1, ship_zip, ship_lat, ship_lng)
           values (%s, %s, 'shopify', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (oid, shop.merchant, f"o-{oid}", when, total, discounts, currency, cust, city, country, when if cancelled else None, street, zip_, lat, lng))
    for p in products:
        db.execute("insert into order_lines (merchant_id, source, external_id, order_id, product_id, quantity, ordered_at) values (%s, 'shopify', %s, %s, %s, %s, %s)",
                   (shop.merchant, f"l-{uuid.uuid4()}", oid, p, qty, when))
    return oid


def clean(db, *shops_):  # noqa: F811
    for s in shops_:
        for t in ("refund_lines", "refunds", "order_lines", "orders"):
            db.execute(f"delete from {t} where merchant_id = %s", (s.merchant,))


def city(client, shop, name="Paris", country="France"):  # noqa: F811
    r = client.get(f"/merchants/{shop.merchant}/customers/city", params={"city": name, "country": country}, headers=auth(shop.user))
    assert r.status_code == 200, r.text
    return r.json()


def dots(client, shop):  # noqa: F811
    r = client.get(f"/merchants/{shop.merchant}/customers/dots", headers=auth(shop.user))
    assert r.status_code == 200, r.text
    return r.json()


def card_of(body, cid):
    return next(x for x in body["cards"] if x["id"] == str(cid))


# The city panel and the customer cards

def test_city_card_and_customer_cards(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    clean(db, a)
    tote, tee = add_product(db, a, "Tote"), add_product(db, a, "Tee")
    regular, new = customer(db, a), customer(db, a)
    order(db, a, 40, regular, total="30", products=[tote])               # an older order, still part of the customer card
    order(db, a, 2, regular, total="20", products=[tote, tee], qty=2, discounts="5")
    order(db, a, 3, regular, city="Lyon", total="10", products=[tee], street="9 Quai Demo", zip_="69002")   # another city
    for d in (1, 4, 5):
        order(db, a, d, new, total="10", products=[tee], street="5 Rue Autre")
    order(db, a, 6, None, total="10")                                    # a guest order
    body = city(client, a)
    assert (body["city"], body["days"], body["orders"], body["customers"], body["guest_orders"], body["returning"]) == ("Paris", 14, 5, 2, 1, 1)
    assert body["average_order"] == 12.0 and body["currency"] == "EUR"
    assert [t["title"] for t in body["top_products"]] == ["Tee", "Tote"]
    r = card_of(body, regular)
    assert (r["orders"], r["spent"], r["discount_orders"], sorted(r["ship_cities"])) == (3, 60.0, 1, ["Lyon", "Paris"])
    assert [p["title"] for p in r["top_products"]] == ["Tee", "Tote"] and r["code"] == str(regular).replace("-", "")[:6].upper()
    assert len(r["weekly"]) == 12 and sum(r["weekly"]) == 3
    assert card_of(body, new)["orders"] == 3
    assert not {"name", "email", "phone", "first_name", "last_name"} & set(r)


def test_card_lists_each_shipping_address(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    clean(db, a)
    c = customer(db, a)
    order(db, a, 1, c)
    order(db, a, 9, c)
    order(db, a, 30, c, street="22 Avenue Demo", zip_="75015")
    addrs = card_of(city(client, a), c)["addresses"]
    assert [(x["street"], x["zip"], x["city"], x["orders"]) for x in addrs] == [("1 Rue Demo", "75011", "Paris", 2), ("22 Avenue Demo", "75015", "Paris", 1)]


def test_other_accounts_at_the_same_address(client, shops, db):  # noqa: F811
    """'Ordered here before with a different account': another customer id that shipped to the same street and postcode."""
    a, b = shops
    do_import(client, a, "a")
    do_import(client, b, "b")
    clean(db, a, b)
    me, twin, stranger = customer(db, a), customer(db, a), customer(db, a)
    order(db, a, 1, me)
    order(db, a, 50, twin, street=" 1 rue demo ", total="30")   # same address, written differently
    order(db, a, 60, twin)
    order(db, a, 2, stranger, street="2 Rue Demo")
    order(db, b, 1, customer(db, b))                            # another shop's customer at the same address
    same = card_of(city(client, a), me)["same_address"]
    assert [(x["code"], x["orders"], x["spent"]) for x in same] == [(str(twin).replace("-", "")[:6].upper(), 2, 40.0)]
    assert card_of(city(client, a), stranger)["same_address"] == []


def test_small_cities_show_their_customers_too(client, shops, db):  # noqa: F811
    """The merchant sees addresses anyway, so the small-number rule stays on the heatmap only."""
    a, _ = shops
    do_import(client, a, "a")
    clean(db, a)
    c = customer(db, a)
    order(db, a, 1, c, city="Vienna", country="Austria")
    body = city(client, a, "Vienna", "Austria")
    assert body["orders"] == 1 and [x["id"] for x in body["cards"]] == [str(c)]


def test_weekly_covers_12_weeks(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    clean(db, a)
    c = customer(db, a)
    for d in (1, 2, 3, 4, 5, 30):
        order(db, a, d, c)
    order(db, a, 100, c)   # older than 12 weeks: counted in orders, not in the weekly bars
    card = card_of(city(client, a), c)
    assert card["orders"] == 7 and sum(card["weekly"]) == 6 and card["weekly"][-1] >= 1


def test_cancelled_orders_do_not_count(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    clean(db, a)
    c = customer(db, a)
    for d in range(1, 6):
        order(db, a, d, c)
    order(db, a, 1, c, total="999", cancelled=True)
    body = city(client, a)
    assert body["orders"] == 5 and card_of(body, c)["spent"] == 50.0


def test_spent_is_empty_when_currencies_mix(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    clean(db, a)
    c = customer(db, a)
    order(db, a, 1, c)
    order(db, a, 5, c, currency="USD")
    body = city(client, a)
    assert body["currency"] is None and body["average_order"] is None and card_of(body, c)["spent"] is None


def test_refunds_are_counted(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    clean(db, a)
    c = customer(db, a)
    first = order(db, a, 1, c, total="40")
    db.execute("insert into refunds (merchant_id, source, external_id, order_id, refunded_at, amount, currency) values (%s, 'shopify', 'r1', %s, now(), 15, 'EUR')", (a.merchant, first))
    card = card_of(city(client, a), c)
    assert (card["refunds"], card["refunded"]) == (1, 15.0)


def test_uses_only_own_orders(client, shops, db):  # noqa: F811
    a, b = shops
    do_import(client, a, "a")
    do_import(client, b, "b")
    clean(db, a, b)
    mine = customer(db, a)
    order(db, a, 1, mine)
    other = customer(db, b)
    for d in range(1, 8):
        order(db, b, d, other)
    body = city(client, a)
    assert body["orders"] == 1 and [x["id"] for x in body["cards"]] == [str(mine)] and card_of(body, mine)["orders"] == 1


def test_needs_access(client, shops):  # noqa: F811
    a, b = shops
    r = client.get(f"/merchants/{a.merchant}/customers/city", params={"city": "Paris"}, headers=auth(b.user))
    assert r.status_code in (403, 404)
    r = client.get(f"/merchants/{a.merchant}/customers/dots", headers=auth(b.user))
    assert r.status_code in (403, 404)


# The dots

def test_one_dot_per_customer_and_address(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    clean(db, a)
    c, d2 = customer(db, a), customer(db, a)
    order(db, a, 1, c)
    order(db, a, 2, c)                                                    # same address: still one dot
    order(db, a, 3, c, city="Lyon", street="9 Quai Demo", zip_="69002", lat=45.76, lng=4.83)   # a second address: a second dot
    order(db, a, 40, c, street="Old Street 1")                            # older than 14 days: no dot
    order(db, a, 1, d2, lat=None, lng=None)                               # Shopify gave no map position
    order(db, a, 1, None)                                                 # guest: no dot
    body = dots(client, a)
    assert body["days"] == 14
    mine = sorted((x for x in body["dots"] if x["id"] == str(c)), key=lambda x: x["city"])
    assert [(x["city"], x["street"], x["zip"], x["lat"], x["lng"], x["orders"]) for x in mine] == [
        ("Lyon", "9 Quai Demo", "69002", 45.76, 4.83, 1), ("Paris", "1 Rue Demo", "75011", 48.858, 2.38, 2)]
    assert mine[0]["code"] == str(c).replace("-", "")[:6].upper()
    other = next(x for x in body["dots"] if x["id"] == str(d2))
    assert other["lat"] is None and other["city"] == "Paris"              # the frontend places it at the city
    assert len(body["dots"]) == 3
    assert not {"name", "email", "phone", "first_name", "last_name"} & set(mine[0])


def test_dots_skip_cancelled_orders(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    clean(db, a)
    order(db, a, 1, customer(db, a), cancelled=True)
    assert dots(client, a)["dots"] == []


def test_dots_use_only_own_orders(client, shops, db):  # noqa: F811
    a, b = shops
    do_import(client, a, "a")
    do_import(client, b, "b")
    clean(db, a, b)
    order(db, a, 1, customer(db, a))
    for _ in range(3):
        order(db, b, 1, customer(db, b))
    assert len(dots(client, a)["dots"]) == 1 and len(dots(client, b)["dots"]) == 3


# Import

def test_import_keeps_the_shipping_address_but_no_names_emails_or_phones(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    row = db.execute("select ship_address1, ship_zip, ship_lat, ship_lng, ship_city from orders where merchant_id = %s", (a.merchant,)).fetchone()
    assert row == ("1 Secret Street", "3511 AB", 52.09, 5.12, "Utrecht")


# One customer (what a dot opens)

def one(client, shop, cid, as_shop=None):  # noqa: F811
    return client.get(f"/merchants/{shop.merchant}/customers/{cid}", headers=auth((as_shop or shop).user))


def test_one_customer_card(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    clean(db, a)
    tee = add_product(db, a, "Tee")
    c, twin = customer(db, a), customer(db, a)
    order(db, a, 1, c, total="20", products=[tee])
    order(db, a, 30, c, street="22 Avenue Demo", zip_="75015")
    order(db, a, 50, twin)
    r = one(client, a, c)
    assert r.status_code == 200, r.text
    card = r.json()
    assert (card["id"], card["orders"], card["spent"], card["currency"]) == (str(c), 2, 30.0, "EUR")
    assert [x["street"] for x in card["addresses"]] == ["1 Rue Demo", "22 Avenue Demo"]
    assert [x["id"] for x in card["same_address"]] == [str(twin)]
    assert [p["title"] for p in card["top_products"]] == ["Tee"]


def test_one_customer_mixed_currency_has_no_total(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    clean(db, a)
    c = customer(db, a)
    order(db, a, 1, c)
    order(db, a, 2, c, currency="USD")
    card = one(client, a, c).json()
    assert card["currency"] is None and card["spent"] is None


def test_one_customer_of_another_shop_is_not_found(client, shops, db):  # noqa: F811
    a, b = shops
    do_import(client, a, "a")
    do_import(client, b, "b")
    clean(db, a, b)
    theirs = customer(db, b)
    order(db, b, 1, theirs)
    assert one(client, a, theirs).status_code == 404
    assert one(client, a, theirs, as_shop=b).status_code in (403, 404)
    assert one(client, b, theirs).status_code == 200
