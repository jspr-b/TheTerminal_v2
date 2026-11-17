"""Made-up demo data for a local run without Nango or Kumo keys. Local database only.

Prints a dev token for the demo user. The merchant is named "Demo store (made-up data)" so it can
never be mistaken for a real store.
"""
import os
import random
import time
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import psycopg

URL, SECRET = os.environ["DATABASE_URL"], os.environ["SUPABASE_JWT_SECRET"]
if "127.0.0.1" not in URL and "localhost" not in URL:
    raise SystemExit("demo_seed only writes to a local database")

M, U = uuid.UUID(int=1), uuid.UUID(int=2)
rnd = random.Random(7)
NOW = datetime.now(timezone.utc)
LOCATIONS = [("Rotterdam warehouse", "warehouse", "Rotterdam", "Netherlands", 51.92, 4.48),
             ("Berlin store", "store", "Berlin", "Germany", 52.52, 13.40),
             ("Lyon warehouse", "warehouse", "Lyon", "France", 45.76, 4.84)]
CITIES = [("Amsterdam", "Netherlands", 40), ("Rotterdam", "Netherlands", 22), ("Utrecht", "Netherlands", 16), ("Brussels", "Belgium", 18),
          ("Paris", "France", 44), ("Lyon", "France", 14), ("London", "United Kingdom", 48), ("Berlin", "Germany", 34),
          ("Hamburg", "Germany", 15), ("Munich", "Germany", 19), ("Vienna", "Austria", 10), ("Milan", "Italy", 12),
          ("Copenhagen", "Denmark", 7), ("Prague", "Czechia", 2)]  # Prague stays under the small-number rule
PRODUCTS = [("Linen Shirt", "Shirts", (96.4, 130, 163.2), ["S", "M", "L"]), ("Canvas Tote", "Bags", (110, 150, 189.6), ["One size"]),
            ("Wool Scarf", "Accessories", (30, 44, 61), ["One size"]), ("Leather Belt", "Accessories", (18, 25, 37), ["85 cm", "95 cm"]),
            ("Denim Jacket", "Outerwear", (22, 31, 45), ["S", "M", "L"]), ("Limited Print", "Art", None, ["A2"])]
PICK = [130, 150, 44, 25, 31, 2]  # order mix roughly matches the ranges, so the track record is plausible


def ins(c, table, **cols):
    c.execute(f"insert into {table} ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))})", list(cols.values()))


with psycopg.connect(URL, autocommit=True) as c:
    ins(c, "auth.users", id=U, email="demo@example.test")
    ins(c, "merchants", id=M, name="Demo store (made-up data)", status="active", currency="EUR")
    ins(c, "merchant_users", merchant_id=M, user_id=U)
    ins(c, "merchant_integrations", merchant_id=M, provider="shopify", nango_connection_id="demo", status="synced", last_sync_at=NOW - timedelta(hours=2))
    locs = []
    for i, (name, kind, city, country, lat, lng) in enumerate(LOCATIONS):
        lid = uuid.uuid4()
        locs.append(lid)
        ins(c, "locations", id=lid, merchant_id=M, source="shopify", external_id=f"l{i}", name=name, kind=kind, city=city, country=country, lat=lat, lng=lng)
    run = uuid.uuid4()
    ins(c, "kumo_runs", id=run, merchant_id=M, model="relational", query_name="demand_14d", status="done", trigger="schedule",
        created_at=NOW - timedelta(days=1), finished_at=NOW - timedelta(days=1), endpoint="hosted")
    past = []  # two older runs, so the product page has a track record
    for ago in (34, 19):
        rid = uuid.uuid4()
        past.append((rid, NOW - timedelta(days=ago)))
        ins(c, "kumo_runs", id=rid, merchant_id=M, model="relational", query_name="demand_14d", status="done", trigger="schedule",
            created_at=NOW - timedelta(days=ago), finished_at=NOW - timedelta(days=ago), endpoint="hosted")
    products = []
    for i, (title, ptype, rng, sizes) in enumerate(PRODUCTS):
        pid = uuid.uuid4()
        products.append(pid)
        ins(c, "products", id=pid, merchant_id=M, source="shopify", external_id=f"p{i}", title=title, product_type=ptype, status="active")
        for k, size in enumerate(sizes):
            vid = uuid.uuid4()
            ins(c, "product_variants", id=vid, merchant_id=M, source="shopify", external_id=f"v{i}-{k}", product_id=pid, title=size, sku=f"{title[:3].upper()}-{size[:3].upper()}", price=40)
            for j, lid in enumerate(locs):
                ins(c, "inventory_levels", merchant_id=M, source="shopify", external_id=f"i{i}-{k}-{j}", variant_id=vid, location_id=lid, available=rnd.randint(2, 40))
        if rng:
            ins(c, "predictions", merchant_id=M, run_id=run, model="relational", model_version="kumo-relational", entity_type="product", entity_id=pid,
                target="demand_14d", horizon_days=14, lower=rng[0], value=rng[1], upper=rng[2], generated_at=NOW - timedelta(days=1))
            for rid, when in past:
                f = rnd.uniform(.8, 1.15)
                ins(c, "predictions", merchant_id=M, run_id=rid, model="relational", model_version="kumo-relational", entity_type="product", entity_id=pid,
                    target="demand_14d", horizon_days=14, lower=rng[0] * f, value=rng[1] * f, upper=rng[2] * f, generated_at=when)
    n = 0
    for city, country, weight in CITIES:
        customers = [uuid.uuid4() for _ in range(max(2, weight // 2))]
        for cid in customers:
            ins(c, "customers", id=cid, merchant_id=M, source="shopify", external_id=f"c{cid}", city=city, country=country)
        for _ in range(int(weight * 3.6)):  # about 60 days of orders
            n += 1
            oid, when = uuid.uuid4(), NOW - timedelta(days=rnd.uniform(0.2, 60))
            lines = [rnd.choices(products, weights=PICK)[0]]
            if lines[0] == products[0] and rnd.random() < .3:
                lines.append(products[1])  # shirts often go with a tote
            elif rnd.random() < .08:
                lines.append(rnd.choices(products, weights=PICK)[0])
            ins(c, "orders", id=oid, merchant_id=M, source="shopify", external_id=f"o{n}", customer_id=rnd.choice(customers), ordered_at=when,
                total=40 * len(lines), currency="EUR", ship_city=city, ship_country=country)
            for k, pid in enumerate(dict.fromkeys(lines)):
                ins(c, "order_lines", merchant_id=M, source="shopify", external_id=f"ol{n}-{k}", order_id=oid, product_id=pid, quantity=rnd.randint(1, 2), price=40, ordered_at=when)
    print(jwt.encode({"sub": str(U), "aud": "authenticated", "exp": int(time.time()) + 7 * 86400}, SECRET, algorithm="HS256"))
