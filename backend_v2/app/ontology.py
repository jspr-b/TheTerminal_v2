"""All data access. Every method that touches merchant data takes merchant_id and filters on it."""
import hashlib
import json
from datetime import date, datetime, timedelta
from uuid import UUID

from psycopg import sql
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from .sellout import sellout

UPSERT_TABLES = frozenset({"locations", "products", "product_variants", "inventory_levels", "customers", "orders", "order_lines"})
ID_MAP_TABLES = frozenset({"locations", "products", "product_variants", "customers", "orders"})
_KEY = ("merchant_id", "source", "external_id")
DEMAND_QUERY = "demand_14d"
MIN_SHARED_ORDERS = 2  # "bought in the same order" needs at least this many shared orders
PAIR_DAYS = 90  # bought together: the product page and the basket galaxy use the same window


def _code(customer_id: UUID) -> str:
    """A short, stable label for a customer instead of a name."""
    return str(customer_id).replace("-", "")[:6].upper()


class OntologyService:
    def __init__(self, pool: AsyncConnectionPool):
        self.pool = pool

    async def _all(self, query: str, params: tuple) -> list[dict]:
        async with self.pool.connection() as conn:
            cur = await conn.execute(query, params)
            return await cur.fetchall()

    async def _one(self, query: str, params: tuple) -> dict | None:
        async with self.pool.connection() as conn:
            cur = await conn.execute(query, params)
            return await cur.fetchone()

    async def is_member(self, merchant_id: UUID, user_id: UUID) -> bool:
        row = await self._one("select 1 as ok from merchant_users where merchant_id = %s and user_id = %s", (merchant_id, user_id))
        return row is not None

    async def list_products(self, merchant_id: UUID, limit: int = 500) -> list[dict]:
        return await self._all("select id, external_id, title, status, product_type, vendor from products where merchant_id = %s order by title limit %s", (merchant_id, limit))

    async def list_locations(self, merchant_id: UUID) -> list[dict]:
        return await self._all("select id, external_id, name, city, province, country, is_active from locations where merchant_id = %s order by name", (merchant_id,))

    async def command_view(self, merchant_id: UUID) -> dict:
        """Everything the Command map needs. Stock is exact Shopify data; forecasts are Kumo ranges."""
        locations = await self._all(
            """select l.id, l.name, l.city, l.province, l.country, l.lat, l.lng, l.kind,
                      coalesce(sum(i.available), 0)::int as units, count(distinct v.product_id)::int as products
               from locations l
               left join inventory_levels i on i.merchant_id = l.merchant_id and i.location_id = l.id
               left join product_variants v on v.merchant_id = i.merchant_id and v.id = i.variant_id
               where l.merchant_id = %s and l.is_active group by l.id order by l.name""", (merchant_id,))
        rows = await self._all(
            """select p.id, p.title, i.location_id, coalesce(sum(i.available), 0)::int as units
               from products p
               left join product_variants v on v.merchant_id = p.merchant_id and v.product_id = p.id
               left join inventory_levels i on i.merchant_id = v.merchant_id and i.variant_id = v.id
               where p.merchant_id = %s group by p.id, p.title, i.location_id order by p.title""", (merchant_id,))
        forecasts, stale = await self.latest_demand_forecasts(merchant_id)
        products: dict[UUID, dict] = {}
        for r in rows:
            item = products.setdefault(r["id"], {"id": r["id"], "title": r["title"], "units": 0, "by_location": [], "forecast_state": "too_few_sales", "forecast": None})
            if r["location_id"] is not None:
                item["units"] += r["units"]
                item["by_location"].append({"location_id": r["location_id"], "units": r["units"]})
        for pid, item in products.items():
            if pid in forecasts:
                item["forecast"] = forecasts[pid]
                item["forecast_state"] = "stale" if stale else "forecast"
        return {"locations": locations, "products": list(products.values())}

    async def latest_demand_forecasts(self, merchant_id: UUID) -> tuple[dict[UUID, dict], bool]:
        """Ranges from the latest finished demand run. Stale when a later run failed."""
        current = await self._one(
            """select id, created_at from kumo_runs where merchant_id = %s and query_name = %s and status in ('done', 'skipped')
               order by created_at desc limit 1""", (merchant_id, DEMAND_QUERY))
        if current is None:
            return {}, False
        failed_after = await self._one(
            "select 1 as x from kumo_runs where merchant_id = %s and query_name = %s and status = 'failed' and created_at > %s limit 1",
            (merchant_id, DEMAND_QUERY, current["created_at"]))
        rows = await self._all(
            "select entity_id, lower, value, upper, generated_at from predictions where merchant_id = %s and run_id = %s and target = %s",
            (merchant_id, current["id"], DEMAND_QUERY))
        ranges = {r["entity_id"]: {"lower": float(r["lower"]), "value": float(r["value"]), "upper": float(r["upper"]), "generated_at": r["generated_at"]} for r in rows}
        return ranges, failed_after is not None

    async def sales_history(self, merchant_id: UUID, start: datetime, end: datetime) -> list[dict]:
        """Order lines for forecasting. Only these columns leave the database: no customer or address fields."""
        return await self._all(
            """select l.product_id, l.order_id, l.ordered_at, l.quantity, l.price
               from order_lines l join orders o on o.merchant_id = l.merchant_id and o.id = l.order_id
               where l.merchant_id = %s and l.product_id is not null and o.cancelled_at is null
                 and l.ordered_at >= %s and l.ordered_at < %s""", (merchant_id, start, end))

    async def product_families(self, merchant_id: UUID) -> dict[UUID, str | None]:
        rows = await self._all("select id, product_type from products where merchant_id = %s", (merchant_id,))
        return {r["id"]: r["product_type"] for r in rows}

    async def start_kumo_run(self, merchant_id: UUID, query_name: str, trigger: str, model: str = "relational", endpoint: str = "hosted") -> UUID:
        row = await self._one(
            "insert into kumo_runs (merchant_id, model, query_name, status, trigger, started_at, endpoint) values (%s, %s, %s, 'running', %s, now(), %s) returning id",
            (merchant_id, model, query_name, trigger, endpoint))
        return row["id"]

    async def first_order_day(self, merchant_id: UUID) -> date | None:
        row = await self._one("select min(ordered_at at time zone 'utc')::date as d from orders where merchant_id = %s and cancelled_at is null", (merchant_id,))
        return row["d"] if row else None

    async def daily_store_totals(self, merchant_id: UUID, start: date, end: date) -> list[dict]:
        """Store totals per day (UTC): revenue, orders, units, refunded amount. Numbers only, nothing per customer."""
        return await self._all(
            """with o as (select (ordered_at at time zone 'utc')::date as day, sum(coalesce(total, 0)) as revenue, count(*) as orders
                          from orders where merchant_id = %(m)s and cancelled_at is null
                            and (ordered_at at time zone 'utc')::date between %(s)s and %(e)s group by 1),
                    u as (select (l.ordered_at at time zone 'utc')::date as day, sum(l.quantity) as units
                          from order_lines l join orders x on x.merchant_id = l.merchant_id and x.id = l.order_id
                          where l.merchant_id = %(m)s and x.cancelled_at is null
                            and (l.ordered_at at time zone 'utc')::date between %(s)s and %(e)s group by 1),
                    r as (select (refunded_at at time zone 'utc')::date as day, sum(coalesce(amount, 0)) as refunds
                          from refunds where merchant_id = %(m)s and (refunded_at at time zone 'utc')::date between %(s)s and %(e)s group by 1)
               select d.day, coalesce(o.revenue, 0) as revenue, coalesce(o.orders, 0) as orders, coalesce(u.units, 0) as units, coalesce(r.refunds, 0) as refunds
               from (select o.day from o union select u.day from u union select r.day from r) d
               left join o on o.day = d.day left join u on u.day = d.day left join r on r.day = d.day order by d.day""",
            {"m": merchant_id, "s": start, "e": end})

    async def save_store_prediction(self, merchant_id: UUID, run_id: UUID, model: str, target: str, horizon_days: int, payload: dict) -> None:
        """A store-level result (one series for the whole store). The entity is the merchant itself."""
        async with self.pool.connection() as conn:
            await conn.execute(
                """insert into predictions (merchant_id, run_id, model, model_version, entity_type, entity_id, target, horizon_days, payload, generated_at)
                   values (%s, %s, %s, %s, 'store', %s, %s, %s, %s, now())""",
                (merchant_id, run_id, model, f"kumo-{model}", merchant_id, target, horizon_days, Jsonb(payload)))

    async def finish_kumo_run(self, merchant_id: UUID, run_id: UUID, status: str, rows: int = 0, latency_ms: int | None = None, error: str | None = None) -> None:
        async with self.pool.connection() as conn:
            await conn.execute(
                "update kumo_runs set status = %s, rows = %s, latency_ms = %s, error = %s, finished_at = now() where merchant_id = %s and id = %s",
                (status, rows, latency_ms, error, merchant_id, run_id))

    async def save_predictions(self, merchant_id: UUID, run_id: UUID, target: str, horizon_days: int, ranges: dict[UUID, dict]) -> None:
        async with self.pool.connection() as conn:
            for entity_id, r in ranges.items():
                await conn.execute(
                    """insert into predictions (merchant_id, run_id, model, model_version, entity_type, entity_id, target, horizon_days, value, lower, upper, generated_at)
                       values (%s, %s, 'relational', 'kumo-relational', 'product', %s, %s, %s, %s, %s, %s, now())""",
                    (merchant_id, run_id, entity_id, target, horizon_days, r["value"], r["lower"], r["upper"]))

    async def product_detail(self, merchant_id: UUID, product_id: UUID, days: int = 28) -> dict | None:
        """One product: exact stock per location, the latest Kumo range, exact daily sales. None if not this merchant's."""
        product = await self._one("select id, title, product_type from products where merchant_id = %s and id = %s", (merchant_id, product_id))
        if product is None:
            return None
        stock = await self._all(
            """select l.id as location_id, l.name, coalesce(sum(i.available), 0)::int as units
               from inventory_levels i
               join product_variants v on v.merchant_id = i.merchant_id and v.id = i.variant_id
               join locations l on l.merchant_id = i.merchant_id and l.id = i.location_id
               where i.merchant_id = %s and v.product_id = %s group by l.id, l.name order by l.name""", (merchant_id, product_id))
        sales = await self._all(
            """select d::date::text as date, coalesce(sum(x.quantity), 0)::int as units
               from generate_series((now() at time zone 'utc')::date - (%s - 1), (now() at time zone 'utc')::date, interval '1 day') d
               left join (select l.quantity, (l.ordered_at at time zone 'utc')::date as day
                          from order_lines l join orders o on o.merchant_id = l.merchant_id and o.id = l.order_id
                          where l.merchant_id = %s and l.product_id = %s and o.cancelled_at is null) x on x.day = d::date
               group by d order by d""", (days, merchant_id, product_id))
        forecasts, stale = await self.latest_demand_forecasts(merchant_id)
        forecast = forecasts.get(product_id)
        units = sum(s["units"] for s in stock)
        variants = await self._all(
            """select v.id, v.title, v.sku, coalesce(sum(i.available), 0)::int as units
               from product_variants v left join inventory_levels i on i.merchant_id = v.merchant_id and i.variant_id = v.id
               where v.merchant_id = %s and v.product_id = %s group by v.id, v.title, v.sku order by v.title nulls last, v.sku""", (merchant_id, product_id))
        together = await self._all(
            """select p.id as product_id, p.title, count(distinct l2.order_id)::int as orders
               from order_lines l1
               join orders o on o.merchant_id = l1.merchant_id and o.id = l1.order_id and o.cancelled_at is null
               join order_lines l2 on l2.merchant_id = l1.merchant_id and l2.order_id = l1.order_id and l2.product_id <> l1.product_id
               join products p on p.merchant_id = l2.merchant_id and p.id = l2.product_id
               where l1.merchant_id = %s and l1.product_id = %s and l1.ordered_at >= now() - make_interval(days => %s)
               group by p.id, p.title having count(distinct l2.order_id) >= %s order by orders desc, p.title limit 5""",
            (merchant_id, product_id, PAIR_DAYS, MIN_SHARED_ORDERS))
        record = await self._all(
            """select pr.generated_at, pr.lower::float, pr.value::float, pr.upper::float,
                      (select coalesce(sum(l.quantity), 0) from order_lines l join orders o on o.merchant_id = l.merchant_id and o.id = l.order_id
                       where l.merchant_id = pr.merchant_id and l.product_id = pr.entity_id and o.cancelled_at is null
                         and l.ordered_at >= pr.generated_at and l.ordered_at < pr.generated_at + make_interval(days => pr.horizon_days))::int as actual
               from predictions pr join kumo_runs r on r.merchant_id = pr.merchant_id and r.id = pr.run_id and r.status = 'done'
               where pr.merchant_id = %s and pr.entity_id = %s and pr.target = %s
                 and pr.generated_at + make_interval(days => pr.horizon_days) <= now()
               order by pr.generated_at desc limit 6""", (merchant_id, product_id, DEMAND_QUERY))
        return {**product, "units": units, "by_location": stock, "sales": sales, "forecast": forecast,
                "forecast_state": ("stale" if stale else "forecast") if forecast else "too_few_sales",
                "sold_14d": sum(s["units"] for s in sales[-14:]), "sellout": sellout(units, forecast) if forecast else None,
                "by_variant": variants, "bought_together": together, "track_record": record}

    async def customer_dots(self, merchant_id: UUID, days: int) -> list[dict]:
        """One map dot per customer per shipping address in the last `days`. For the merchant's own map, never for NVIDIA."""
        rows = await self._all(
            """select customer_id, ship_city as city, ship_country as country, min(ship_address1) as street, min(ship_zip) as zip,
                      avg(ship_lat)::float as lat, avg(ship_lng)::float as lng, count(*)::int as orders, max(ordered_at) as last_order
               from orders where merchant_id = %(m)s and cancelled_at is null and customer_id is not null and ship_city is not null
                 and ordered_at >= now() - make_interval(days => %(d)s)
               group by customer_id, ship_city, ship_country, lower(btrim(coalesce(ship_address1, ''))), lower(replace(coalesce(ship_zip, ''), ' ', ''))
               order by city, last_order desc, customer_id""",
            {"m": merchant_id, "d": days})
        return [{"id": r["customer_id"], "code": _code(r["customer_id"]), "city": r["city"], "country": r["country"], "street": r["street"],
                 "zip": r["zip"], "lat": r["lat"], "lng": r["lng"], "orders": r["orders"], "last_order": r["last_order"]} for r in rows]

    async def _customer_cards(self, merchant_id: UUID, ids: list[UUID]) -> list[dict]:
        """A card per customer from all their orders in this shop: facts, shipping addresses, other accounts at those addresses."""
        q = {"m": merchant_id, "ids": ids}
        # all of each customer's orders (any city, any time), this merchant only
        stats = await self._all(
            """select o.customer_id, count(*)::int as orders, sum(o.total)::float as spent, count(distinct o.currency)::int as currencies, min(o.currency) as currency,
                      min(o.ordered_at) as first_order, max(o.ordered_at) as last_order,
                      count(*) filter (where coalesce(o.discounts, 0) > 0)::int as discount_orders,
                      array_remove(array_agg(distinct o.ship_city), null) as ship_cities
               from orders o where o.merchant_id = %(m)s and o.cancelled_at is null and o.customer_id = any(%(ids)s)
               group by o.customer_id""", q)
        prods = await self._all(
            """select o.customer_id, pr.id as product_id, pr.title, sum(l.quantity)::int as units
               from orders o join order_lines l on l.merchant_id = o.merchant_id and l.order_id = o.id
               join products pr on pr.merchant_id = l.merchant_id and pr.id = l.product_id
               where o.merchant_id = %(m)s and o.cancelled_at is null and o.customer_id = any(%(ids)s)
               group by o.customer_id, pr.id, pr.title""", q)
        refunds = await self._all(
            """select o.customer_id, count(r.id)::int as refunds, coalesce(sum(r.amount), 0)::float as refunded
               from refunds r join orders o on o.merchant_id = r.merchant_id and o.id = r.order_id
               where r.merchant_id = %(m)s and o.customer_id = any(%(ids)s) group by o.customer_id""", q)
        weeks = await self._all(
            """select o.customer_id, floor(extract(epoch from now() - o.ordered_at) / 604800)::int as ago, count(*)::int as n
               from orders o where o.merchant_id = %(m)s and o.cancelled_at is null and o.customer_id = any(%(ids)s)
                 and o.ordered_at >= now() - interval '84 days'
               group by 1, 2""", q)
        # an address is its street and postcode, compared without case, outer spaces or spaces in the postcode
        key = "lower(btrim(coalesce({t}.ship_address1, ''))) || '|' || lower(replace(coalesce({t}.ship_zip, ''), ' ', ''))"
        addrs = await self._all(
            f"""select o.customer_id, min(o.ship_address1) as street, min(o.ship_address2) as street2, min(o.ship_zip) as zip,
                       min(o.ship_city) as city, min(o.ship_country) as country, count(*)::int as orders, max(o.ordered_at) as last_order
                from orders o where o.merchant_id = %(m)s and o.cancelled_at is null and o.customer_id = any(%(ids)s)
                  and nullif(btrim(coalesce(o.ship_address1, '')), '') is not null
                group by o.customer_id, {key.format(t='o')} order by orders desc, last_order desc""", q)
        twins = await self._all(
            f"""with mine as (select distinct o.customer_id, {key.format(t='o')} as k from orders o
                              where o.merchant_id = %(m)s and o.cancelled_at is null and o.customer_id = any(%(ids)s)
                                and nullif(btrim(coalesce(o.ship_address1, '')), '') is not null),
                     other as (select x.customer_id, {key.format(t='x')} as k, x.total, x.currency, x.ordered_at from orders x
                               where x.merchant_id = %(m)s and x.cancelled_at is null and x.customer_id is not null)
                select m.customer_id as me, other.customer_id as twin, count(*)::int as orders, sum(other.total)::float as spent,
                       count(distinct other.currency)::int as currencies, max(other.ordered_at) as last_order
                from mine m join other on other.k = m.k and other.customer_id <> m.customer_id
                group by 1, 2 order by orders desc""", q)
        by_prod: dict[UUID, list[dict]] = {}
        for r in prods:
            by_prod.setdefault(r["customer_id"], []).append({"product_id": r["product_id"], "title": r["title"], "units": r["units"]})
        by_addr: dict[UUID, list[dict]] = {}
        for r in addrs:
            by_addr.setdefault(r["customer_id"], []).append({k: r[k] for k in ("street", "street2", "zip", "city", "country", "orders", "last_order")})
        by_twin: dict[UUID, list[dict]] = {}
        for r in twins:
            by_twin.setdefault(r["me"], []).append({"id": r["twin"], "code": _code(r["twin"]), "orders": r["orders"],
                                                     "spent": None if r["currencies"] > 1 else round(r["spent"] or 0, 2), "last_order": r["last_order"]})
        ref = {r["customer_id"]: r for r in refunds}
        weekly: dict[UUID, list[int]] = {}
        for r in weeks:
            bars = weekly.setdefault(r["customer_id"], [0] * 12)
            if 0 <= r["ago"] < 12:
                bars[11 - r["ago"]] += r["n"]
        cards = []
        for r in sorted(stats, key=lambda x: x["last_order"], reverse=True):
            cid = r["customer_id"]
            mixed = r["currencies"] > 1
            cards.append({
                "id": cid, "code": _code(cid), "orders": r["orders"], "currency": None if mixed else r["currency"],
                "spent": None if mixed else round(r["spent"] or 0, 2),
                "average_order": None if mixed else round((r["spent"] or 0) / max(1, r["orders"]), 2),
                "first_order": r["first_order"], "last_order": r["last_order"], "discount_orders": r["discount_orders"],
                "ship_cities": sorted(r["ship_cities"]),
                "top_products": sorted(by_prod.get(cid, []), key=lambda x: (-x["units"], x["title"]))[:2],
                "refunds": ref[cid]["refunds"] if cid in ref else 0, "refunded": ref[cid]["refunded"] if cid in ref else 0.0,
                "weekly": weekly.get(cid, [0] * 12), "addresses": by_addr.get(cid, []), "same_address": by_twin.get(cid, []),
            })
        return cards

    async def customer_card(self, merchant_id: UUID, customer_id: UUID) -> dict | None:
        cards = await self._customer_cards(merchant_id, [customer_id])
        return cards[0] if cards else None

    async def customers_in_city(self, merchant_id: UUID, city: str, country: str | None, days: int) -> dict:
        """The city's last `days`, and a card per customer who ordered there: order facts, their shipping addresses, and
        other accounts of this shop that shipped to one of those addresses. No names, emails or phones."""
        p = {"m": merchant_id, "c": city, "k": country, "d": days}
        where = """o.merchant_id = %(m)s and o.cancelled_at is null and o.ship_city = %(c)s
                   and (%(k)s::text is null or o.ship_country = %(k)s) and o.ordered_at >= now() - make_interval(days => %(d)s)"""
        head = await self._one(
            f"""select count(*)::int as orders, count(distinct o.customer_id)::int as customers,
                       count(*) filter (where o.customer_id is null)::int as guest_orders,
                       avg(o.total)::float as average_order, count(distinct o.currency)::int as currencies, min(o.currency) as currency
                from orders o where {where}""", p)
        ids = [r["customer_id"] for r in await self._all(f"select distinct o.customer_id from orders o where {where} and o.customer_id is not null", p)]
        q = {**p, "ids": ids}
        returning = await self._one(
            """select count(distinct o.customer_id)::int as n from orders o
               where o.merchant_id = %(m)s and o.cancelled_at is null and o.customer_id = any(%(ids)s)
                 and o.ordered_at < now() - make_interval(days => %(d)s)""", q)
        top = await self._all(
            f"""select pr.id as product_id, pr.title, sum(l.quantity)::int as units
                from orders o join order_lines l on l.merchant_id = o.merchant_id and l.order_id = o.id
                join products pr on pr.merchant_id = l.merchant_id and pr.id = l.product_id
                where {where} group by pr.id, pr.title order by units desc, pr.title limit 3""", p)
        cards = await self._customer_cards(merchant_id, ids)
        mixed = head is None or head["currencies"] > 1 or any(c["currency"] is None for c in cards)
        n = head or {"orders": 0, "customers": 0, "guest_orders": 0, "average_order": None, "currency": None}
        return {"city": city, "country": country, "days": days, "orders": n["orders"], "customers": n["customers"], "guest_orders": n["guest_orders"],
                "returning": returning["n"] if returning else 0,
                "average_order": None if mixed or not n["orders"] else round(n["average_order"] or 0, 2), "currency": None if mixed else n["currency"],
                "top_products": top, "cards": cards}

    async def store_summary(self, merchant_id: UUID, days: int) -> dict:
        """Command 'Your store': exact Shopify numbers for the last `days` and the `days` before, plus units per day."""
        periods = await self._all(
            """select (o.ordered_at >= now() - make_interval(days => %(d)s)) as current,
                      count(*)::int as orders, sum(o.total)::float as revenue, count(distinct o.customer_id)::int as customers,
                      count(distinct o.ship_country)::int as countries, count(distinct o.currency)::int as currencies, min(o.currency) as currency
               from orders o
               where o.merchant_id = %(m)s and o.cancelled_at is null and o.ordered_at >= now() - make_interval(days => 2 * %(d)s)
               group by 1""", {"m": merchant_id, "d": days})
        units = await self._all(
            """select (l.ordered_at >= now() - make_interval(days => %(d)s)) as current, coalesce(sum(l.quantity), 0)::int as units
               from order_lines l join orders o on o.merchant_id = l.merchant_id and o.id = l.order_id and o.cancelled_at is null
               where l.merchant_id = %(m)s and l.ordered_at >= now() - make_interval(days => 2 * %(d)s)
               group by 1""", {"m": merchant_id, "d": days})
        daily = await self._all(
            """select d::date as day, coalesce(sum(l.quantity), 0)::int as units
               from generate_series((now() at time zone 'utc')::date - (2 * %(d)s - 1), (now() at time zone 'utc')::date, interval '1 day') d
               left join order_lines l on l.merchant_id = %(m)s and (l.ordered_at at time zone 'utc')::date = d::date
                    and exists (select 1 from orders o where o.merchant_id = l.merchant_id and o.id = l.order_id and o.cancelled_at is null)
               group by d order by d""", {"m": merchant_id, "d": days})
        by = {r["current"]: r for r in periods}
        u = {r["current"]: r["units"] for r in units}
        mixed = any(r["currencies"] > 1 for r in periods) or len({r["currency"] for r in periods if r["currency"]}) > 1
        currency = None if mixed else next((r["currency"] for r in periods if r["currency"]), None)

        def period(current: bool) -> dict:
            r = by.get(current)
            revenue = None if mixed else round(r["revenue"] or 0, 2) if r else 0.0
            return {"orders": r["orders"] if r else 0, "revenue": revenue, "units": u.get(current, 0),
                    "customers": r["customers"] if r else 0, "countries": r["countries"] if r else 0}

        return {"days": days, "currency": currency, "current": period(True), "previous": period(False), "daily_units": [r["units"] for r in daily]}

    async def product_pairs(self, merchant_id: UUID, days: int, min_orders: int) -> dict:
        """Products bought in the same order over the last `days` days. Exact counts, each pair once."""
        window = """select distinct l.order_id, l.product_id, l.quantity from order_lines l
                    join orders o on o.merchant_id = l.merchant_id and o.id = l.order_id
                    where l.merchant_id = %(m)s and l.product_id is not null and o.cancelled_at is null
                      and l.ordered_at >= now() - make_interval(days => %(d)s)"""
        links = await self._all(
            f"""with w as ({window}) select a.product_id as source, b.product_id as target, count(distinct a.order_id)::int as orders
                from w a join w b on b.order_id = a.order_id and a.product_id < b.product_id
                group by 1, 2 having count(distinct a.order_id) >= %(n)s order by orders desc""", {"m": merchant_id, "d": days, "n": min_orders})
        nodes = await self._all(
            f"""with w as ({window}) select p.id, p.title, p.product_type, sum(w.quantity)::int as sold
                from w join products p on p.merchant_id = %(m)s and p.id = w.product_id group by p.id, p.title, p.product_type order by sold desc""",
            {"m": merchant_id, "d": days})
        # What Kumo gets to see per product, counts only: orders, customers, customers who bought it again, units returned.
        buyers = {r["product_id"]: r for r in await self._all(
            f"""with w as ({window}), per as (
                  select w.product_id, o.customer_id, count(distinct w.order_id) as n from w
                  join orders o on o.merchant_id = %(m)s and o.id = w.order_id group by 1, 2)
                select product_id, sum(n)::int as orders, count(customer_id)::int as customers,
                       count(customer_id) filter (where n > 1)::int as repeat_customers
                from per group by product_id""", {"m": merchant_id, "d": days})}
        returned = {r["product_id"]: r["units"] for r in await self._all(
            """select rl.product_id, sum(rl.quantity)::int as units from refund_lines rl
               join refunds r on r.merchant_id = rl.merchant_id and r.id = rl.refund_id
               where rl.merchant_id = %(m)s and rl.product_id is not null and r.refunded_at >= now() - make_interval(days => %(d)s)
               group by 1""", {"m": merchant_id, "d": days})}
        for n in nodes:
            b = buyers.get(n["id"], {})
            n.update(orders=b.get("orders", 0), customers=b.get("customers", 0),
                     repeat_customers=b.get("repeat_customers", 0), returned=returned.get(n["id"], 0))
        return {"days": days, "min_orders": min_orders, "nodes": nodes, "links": links}

    async def shop_track_record(self, merchant_id: UUID) -> dict:
        """The latest demand run whose 14 days are over: each product's range next to what really sold."""
        run = await self._one(
            """select r.id, min(pr.generated_at) as start, min(pr.generated_at + make_interval(days => coalesce(pr.horizon_days, 14))) as "end"
               from kumo_runs r join predictions pr on pr.merchant_id = r.merchant_id and pr.run_id = r.id and pr.target = %s
               where r.merchant_id = %s and r.status = 'done'
               group by r.id having max(pr.generated_at + make_interval(days => coalesce(pr.horizon_days, 14))) <= now()
               order by start desc limit 1""", (DEMAND_QUERY, merchant_id))
        empty = {"window_start": None, "window_end": None, "checked": 0, "inside": 0, "above": 0, "below": 0, "products": []}
        if run is None:
            return empty
        rows = await self._all(
            """select pr.entity_id as product_id, p.title, pr.lower::float, pr.value::float, pr.upper::float,
                      (select coalesce(sum(l.quantity), 0) from order_lines l join orders o on o.merchant_id = l.merchant_id and o.id = l.order_id
                       where l.merchant_id = pr.merchant_id and l.product_id = pr.entity_id and o.cancelled_at is null
                         and l.ordered_at >= pr.generated_at and l.ordered_at < pr.generated_at + make_interval(days => coalesce(pr.horizon_days, 14)))::int as actual
               from predictions pr join products p on p.merchant_id = pr.merchant_id and p.id = pr.entity_id
               where pr.merchant_id = %s and pr.run_id = %s and pr.target = %s""", (merchant_id, run["id"], DEMAND_QUERY))
        for r in rows:
            r["result"] = "above" if r["actual"] > r["upper"] else "below" if r["actual"] < r["lower"] else "inside"
            r["_off"] = r["actual"] - r["upper"] if r["result"] == "above" else r["lower"] - r["actual"] if r["result"] == "below" else 0
        order = {"above": 0, "below": 1, "inside": 2}
        rows.sort(key=lambda r: (order[r["result"]], -r["_off"], r["title"]))
        counts = {k: sum(r["result"] == k for r in rows) for k in order}
        return {"window_start": run["start"], "window_end": run["end"], "checked": len(rows), **counts,
                "products": [{k: v for k, v in r.items() if k != "_off"} for r in rows]}

    async def products_overview(self, merchant_id: UUID, days: int = 28) -> list[dict]:
        """Every product: exact stock and daily sales for 28 days, the latest Kumo range, and sell-out (our math)."""
        products = await self._all("select id, title, product_type from products where merchant_id = %s order by title", (merchant_id,))
        stock = {r["product_id"]: r["units"] for r in await self._all(
            """select v.product_id, coalesce(sum(i.available), 0)::int as units from product_variants v
               left join inventory_levels i on i.merchant_id = v.merchant_id and i.variant_id = v.id
               where v.merchant_id = %s group by v.product_id""", (merchant_id,))}
        today = (await self._one("select (now() at time zone 'utc')::date as d", ()))["d"]
        start = today - timedelta(days=days - 1)
        sales: dict[UUID, list[int]] = {}
        for r in await self._all(
                """select l.product_id, (l.ordered_at at time zone 'utc')::date as day, sum(l.quantity)::int as units
                   from order_lines l join orders o on o.merchant_id = l.merchant_id and o.id = l.order_id
                   where l.merchant_id = %s and l.product_id is not null and o.cancelled_at is null
                     and (l.ordered_at at time zone 'utc')::date between %s and %s group by 1, 2""", (merchant_id, start, today)):
            sales.setdefault(r["product_id"], [0] * days)[(r["day"] - start).days] = r["units"]
        forecasts, stale = await self.latest_demand_forecasts(merchant_id)
        out = []
        for p in products:
            units, daily, forecast = stock.get(p["id"], 0), sales.get(p["id"], [0] * days), forecasts.get(p["id"])
            out.append({**p, "units": units, "sold_14d": sum(daily[-14:]), "sales_28d": daily, "forecast": forecast,
                        "forecast_state": ("stale" if stale else "forecast") if forecast else "too_few_sales",
                        "sellout": sellout(units, forecast) if forecast else None})
        return out

    async def orders_per_city(self, merchant_id: UUID, days: int, min_count: int) -> list[dict]:
        """Exact orders per ship city over the last `days` days. Cities under min_count are left out (small-number rule)."""
        return await self._all(
            """select ship_city as city, max(ship_province) as province, ship_country as country, count(*)::int as value
               from orders where merchant_id = %s and cancelled_at is null and ship_city is not null
                 and ordered_at >= now() - make_interval(days => %s)
               group by ship_city, ship_country having count(*) >= %s order by value desc, city""",
            (merchant_id, days, min_count))

    async def customers_per_city(self, merchant_id: UUID, days: int = 365) -> list[dict]:
        """Customers with an order in the last `days` days, per the ship city of their latest order. Counts only."""
        return await self._all(
            """select city, country, count(*)::int as customers from (
                 select distinct on (customer_id) customer_id, ship_city as city, ship_country as country
                 from orders where merchant_id = %s and customer_id is not null and cancelled_at is null
                   and ship_city is not null and ordered_at >= now() - make_interval(days => %s)
                 order by customer_id, ordered_at desc) latest
               group by city, country order by customers desc, city""", (merchant_id, days))

    async def latest_kumo_runs(self, merchant_id: UUID) -> list[dict]:
        """The newest run per model and question."""
        return await self._all(
            """select distinct on (model, query_name) model, query_name, status, finished_at
               from kumo_runs where merchant_id = %s order by model, query_name, created_at desc""", (merchant_id,))

    async def list_integrations(self, merchant_id: UUID) -> list[dict]:
        return await self._all(
            "select id, provider, status, last_sync_at, account_label from merchant_integrations where merchant_id = %s order by provider, connected_at",
            (merchant_id,))

    async def list_import_jobs(self, merchant_id: UUID, limit: int = 50) -> list[dict]:
        return await self._all("select id, model, kind, status, records_done, started_at, finished_at, error from import_jobs where merchant_id = %s order by created_at desc limit %s", (merchant_id, limit))

    async def get_integration(self, merchant_id: UUID, integration_id: UUID) -> dict | None:
        return await self._one("select id, provider, nango_connection_id, nango_integration_id from merchant_integrations where merchant_id = %s and id = %s", (merchant_id, integration_id))

    async def set_integration_status(self, merchant_id: UUID, integration_id: UUID, status: str, error: str | None = None) -> None:
        async with self.pool.connection() as conn:
            await conn.execute(
                "update merchant_integrations set status = %s, last_error = %s, last_sync_at = case when %s = 'synced' then now() else last_sync_at end where merchant_id = %s and id = %s",
                (status, error, status, merchant_id, integration_id))

    async def start_import_job(self, merchant_id: UUID, integration_id: UUID, model: str) -> UUID:
        row = await self._one("insert into import_jobs (merchant_id, integration_id, model, kind, status, started_at) values (%s, %s, %s, 'initial', 'running', now()) returning id", (merchant_id, integration_id, model))
        return row["id"]

    async def finish_import_job(self, merchant_id: UUID, job_id: UUID, records_done: int, error: str | None = None) -> None:
        async with self.pool.connection() as conn:
            await conn.execute("update import_jobs set status = %s, records_done = %s, error = %s, finished_at = now() where merchant_id = %s and id = %s", ("failed" if error else "done", records_done, error, merchant_id, job_id))

    async def save_raw(self, merchant_id: UUID, provider: str, model: str, records: list[dict]) -> None:
        async with self.pool.connection() as conn:
            for rec in records:
                digest = hashlib.sha256(json.dumps(rec, sort_keys=True).encode()).hexdigest()
                await conn.execute(
                    "insert into raw_records (merchant_id, provider, model, external_id, payload, payload_hash) values (%s, %s, %s, %s, %s, %s) on conflict do nothing",
                    (merchant_id, provider, model, str(rec["id"]), Jsonb(rec), digest))

    async def upsert_many(self, merchant_id: UUID, table: str, rows: list[dict]) -> dict[str, UUID]:
        """Upsert on (merchant_id, source, external_id). Returns external_id -> id."""
        if table not in UPSERT_TABLES:
            raise ValueError(f"unknown table: {table}")
        out: dict[str, UUID] = {}
        async with self.pool.connection() as conn:
            for row in rows:
                data = {**row, "merchant_id": merchant_id}
                cols = list(data)
                query = sql.SQL("insert into {t} ({c}) values ({v}) on conflict (merchant_id, source, external_id) do update set {u} returning external_id, id").format(
                    t=sql.Identifier(table),
                    c=sql.SQL(", ").join(map(sql.Identifier, cols)),
                    v=sql.SQL(", ").join(sql.Placeholder() * len(cols)),
                    u=sql.SQL(", ").join(sql.SQL("{0} = excluded.{0}").format(sql.Identifier(c)) for c in cols if c not in _KEY))
                cur = await conn.execute(query, list(data.values()))
                got = await cur.fetchone()
                out[got["external_id"]] = got["id"]
        return out

    async def id_map(self, merchant_id: UUID, table: str, source: str) -> dict[str, UUID]:
        if table not in ID_MAP_TABLES:
            raise ValueError(f"unknown table: {table}")
        query = sql.SQL("select external_id, id from {t} where merchant_id = %s and source = %s").format(t=sql.Identifier(table))
        async with self.pool.connection() as conn:
            cur = await conn.execute(query, (merchant_id, source))
            return {r["external_id"]: r["id"] for r in await cur.fetchall()}

    async def variants_by_inventory_item(self, merchant_id: UUID, source: str) -> dict[str, UUID]:
        rows = await self._all("select inventory_item_external_id as item, id from product_variants where merchant_id = %s and source = %s and inventory_item_external_id is not null", (merchant_id, source))
        return {r["item"]: r["id"] for r in rows}
