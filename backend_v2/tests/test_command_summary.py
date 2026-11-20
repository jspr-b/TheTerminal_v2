"""Command: 'Your store' numbers. Exact Shopify data for the last 14 days and the 14 before."""
import uuid
from datetime import datetime, timedelta, timezone

from test_api import FakeSource, auth, client, db, do_import, shops  # noqa: F401  (fixtures)
from test_products_page import add_product


def order(db, shop, days_ago, total="10", qty=1, product=None, customer=None, country="Netherlands", currency="EUR", cancelled=False):  # noqa: F811
    oid, when = uuid.uuid4(), datetime.now(timezone.utc) - timedelta(days=days_ago, hours=1)
    db.execute(
        """insert into orders (id, merchant_id, source, external_id, ordered_at, total, currency, customer_id, ship_country, cancelled_at)
           values (%s, %s, 'shopify', %s, %s, %s, %s, %s, %s, %s)""",
        (oid, shop.merchant, f"o-{oid}", when, total, currency, customer, country, when if cancelled else None))
    if product is not None:
        db.execute("insert into order_lines (merchant_id, source, external_id, order_id, product_id, quantity, ordered_at) values (%s, 'shopify', %s, %s, %s, %s, %s)",
                   (shop.merchant, f"l-{uuid.uuid4()}", oid, product, qty, when))
    return oid


def customer(db, shop):  # noqa: F811
    cid = uuid.uuid4()
    db.execute("insert into customers (id, merchant_id, source, external_id) values (%s, %s, 'shopify', %s)", (cid, shop.merchant, f"c-{cid}"))
    return cid


def summary(client, shop):  # noqa: F811
    r = client.get(f"/merchants/{shop.merchant}/command/summary", headers=auth(shop.user))
    assert r.status_code == 200, r.text
    return r.json()


def test_summary_counts_the_last_14_days_and_the_14_before(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    db.execute("delete from order_lines where merchant_id = %s", (a.merchant,))
    db.execute("delete from orders where merchant_id = %s", (a.merchant,))
    p = add_product(db, a, "Tote")
    c1, c2 = customer(db, a), customer(db, a)
    order(db, a, 1, "20", qty=2, product=p, customer=c1, country="Netherlands")
    order(db, a, 3, "30", qty=1, product=p, customer=c1, country="Germany")
    order(db, a, 13, "5", qty=4, product=p, customer=c2, country="Germany")
    order(db, a, 20, "7", qty=3, product=p, customer=c2)
    order(db, a, 40, "100", qty=9, product=p)  # older than 28 days: nowhere
    body = summary(client, a)
    assert body["days"] == 14 and body["currency"] == "EUR"
    assert body["current"] == {"orders": 3, "revenue": 55.0, "units": 7, "customers": 2, "countries": 2}
    assert body["previous"] == {"orders": 1, "revenue": 7.0, "units": 3, "customers": 1, "countries": 1}
    # the order placed 1 day and 1 hour ago sits in the bucket of its UTC date (two days back just after midnight)
    now = datetime.now(timezone.utc)
    back = (now.date() - (now - timedelta(days=1, hours=1)).date()).days
    assert len(body["daily_units"]) == 28 and sum(body["daily_units"]) == 10 and body["daily_units"][27 - back] == 2


def test_summary_skips_cancelled_orders(client, shops, db):  # noqa: F811
    a, _ = shops
    do_import(client, a, "a")
    db.execute("delete from order_lines where merchant_id = %s", (a.merchant,))
    db.execute("delete from orders where merchant_id = %s", (a.merchant,))
    p = add_product(db, a, "Tote")
    order(db, a, 2, "50", qty=5, product=p, cancelled=True)
    body = summary(client, a)
    assert body["current"]["orders"] == 0 and body["current"]["revenue"] == 0 and body["current"]["units"] == 0
    assert sum(body["daily_units"]) == 0


def test_summary_has_no_revenue_when_currencies_mix(client, shops, db):  # noqa: F811
    """Adding euros and dollars would be wrong: no revenue rather than a made-up total."""
    a, _ = shops
    do_import(client, a, "a")
    db.execute("delete from order_lines where merchant_id = %s", (a.merchant,))
    db.execute("delete from orders where merchant_id = %s", (a.merchant,))
    order(db, a, 1, "20", currency="EUR")
    order(db, a, 2, "20", currency="USD")
    body = summary(client, a)
    assert body["currency"] is None and body["current"]["revenue"] is None and body["current"]["orders"] == 2


def test_summary_uses_only_own_orders(client, shops, db):  # noqa: F811
    a, b = shops
    do_import(client, a, "a")
    do_import(client, b, "b")
    db.execute("delete from order_lines where merchant_id in (%s, %s)", (a.merchant, b.merchant))
    db.execute("delete from orders where merchant_id in (%s, %s)", (a.merchant, b.merchant))
    order(db, b, 1, "999", qty=9, product=add_product(db, b, "B"))
    body = summary(client, a)
    assert body["current"]["orders"] == 0 and sum(body["daily_units"]) == 0


def test_summary_needs_access(client, shops):  # noqa: F811
    a, b = shops
    r = client.get(f"/merchants/{a.merchant}/command/summary", headers=auth(b.user))
    assert r.status_code in (403, 404)
