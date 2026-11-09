"""Shopify records into our tables. Customer rows get city level only: no names, emails or street addresses."""
import logging
from uuid import UUID

from .nango import RecordSource
from .ontology import OntologyService

log = logging.getLogger(__name__)
SOURCE = "shopify"
MODELS = ("locations", "products", "inventory_levels", "customers", "orders")  # parents before children


def _ext(value) -> str | None:
    return None if value is None else str(value)


def _base(rec: dict) -> dict:
    return {"source": SOURCE, "external_id": str(rec["id"])}


def _stamps(rec: dict) -> dict:
    return {"created_at_platform": rec.get("created_at"), "updated_at_platform": rec.get("updated_at")}


def location_row(r: dict) -> dict:
    return {**_base(r), **_stamps(r), "name": r["name"], "city": r.get("city"), "province": r.get("province"), "country": r.get("country"), "is_active": r.get("active", True)}


def product_row(r: dict) -> dict:
    tags = [t.strip() for t in (r.get("tags") or "").split(",") if t.strip()]
    return {**_base(r), **_stamps(r), "title": r["title"], "status": r.get("status"), "product_type": r.get("product_type"), "vendor": r.get("vendor"), "tags": tags}


def variant_row(v: dict, product_id: UUID) -> dict:
    return {**_base(v), **_stamps(v), "product_id": product_id, "title": v.get("title"), "sku": v.get("sku"), "barcode": v.get("barcode"), "price": v.get("price"), "compare_at_price": v.get("compare_at_price"), "inventory_item_external_id": _ext(v.get("inventory_item_id"))}


def inventory_row(r: dict, variant_id: UUID, location_id: UUID) -> dict:
    return {"source": SOURCE, "external_id": f"{r['inventory_item_id']}:{r['location_id']}", "variant_id": variant_id, "location_id": location_id, "available": r.get("available"), "updated_at_platform": r.get("updated_at")}


def customer_row(r: dict) -> dict:
    addr = r.get("default_address") or {}
    return {**_base(r), **_stamps(r), "city": addr.get("city"), "province": addr.get("province"), "country": addr.get("country"), "orders_count": r.get("orders_count"), "total_spent": r.get("total_spent")}


def order_row(r: dict, customer_id: UUID | None) -> dict:
    ship = r.get("shipping_address") or {}
    return {**_base(r), **_stamps(r), "customer_id": customer_id, "ordered_at": r.get("processed_at") or r["created_at"], "financial_status": r.get("financial_status"), "fulfillment_status": r.get("fulfillment_status"), "total": r.get("total_price"), "discounts": r.get("total_discounts"), "currency": r.get("currency"), "source_name": r.get("source_name"), "landing_site": r.get("landing_site"), "referring_site": r.get("referring_site"), "ship_city": ship.get("city"), "ship_province": ship.get("province"), "ship_country": ship.get("country"), "cancelled_at": r.get("cancelled_at")}


def line_row(li: dict, order_id: UUID, ordered_at: str, products: dict, variants: dict) -> dict:
    return {**_base(li), "order_id": order_id, "product_id": products.get(_ext(li.get("product_id"))), "variant_id": variants.get(_ext(li.get("variant_id"))), "quantity": li["quantity"], "price": li.get("price"), "discount": li.get("total_discount"), "ordered_at": ordered_at}


async def _save_page(svc: OntologyService, merchant_id: UUID, model: str, page: list[dict]) -> int:
    if model == "locations":
        await svc.upsert_many(merchant_id, "locations", [location_row(r) for r in page])
    elif model == "products":
        ids = await svc.upsert_many(merchant_id, "products", [product_row(r) for r in page])
        await svc.upsert_many(merchant_id, "product_variants", [variant_row(v, ids[str(r["id"])]) for r in page for v in r.get("variants", [])])
    elif model == "inventory_levels":
        variants = await svc.variants_by_inventory_item(merchant_id, SOURCE)
        locations = await svc.id_map(merchant_id, "locations", SOURCE)
        rows = [inventory_row(r, variants[str(r["inventory_item_id"])], locations[str(r["location_id"])]) for r in page if str(r["inventory_item_id"]) in variants and str(r["location_id"]) in locations]
        if len(rows) != len(page):
            log.warning("skipped %d inventory records with unknown variant or location", len(page) - len(rows))
        await svc.upsert_many(merchant_id, "inventory_levels", rows)
    elif model == "customers":
        await svc.upsert_many(merchant_id, "customers", [customer_row(r) for r in page])
    elif model == "orders":
        customers = await svc.id_map(merchant_id, "customers", SOURCE)
        products = await svc.id_map(merchant_id, "products", SOURCE)
        variants = await svc.id_map(merchant_id, "product_variants", SOURCE)
        ids = await svc.upsert_many(merchant_id, "orders", [order_row(r, customers.get(_ext((r.get("customer") or {}).get("id")))) for r in page])
        lines = [line_row(li, ids[str(r["id"])], r.get("processed_at") or r["created_at"], products, variants) for r in page for li in r.get("line_items", [])]
        await svc.upsert_many(merchant_id, "order_lines", lines)
    return len(page)


async def run_import(svc: OntologyService, source: RecordSource, merchant_id: UUID, integration: dict) -> None:
    """Import every model in order. A failed model is recorded and stops the run, since later models depend on it."""
    await svc.set_integration_status(merchant_id, integration["id"], "importing")
    for model in MODELS:
        job = await svc.start_import_job(merchant_id, integration["id"], model)
        done = 0
        try:
            async for page in source.records(integration["nango_integration_id"], integration["nango_connection_id"], model):
                await svc.save_raw(merchant_id, SOURCE, model, page)
                done += await _save_page(svc, merchant_id, model, page)
        except Exception as exc:
            log.exception("import failed: merchant=%s model=%s", merchant_id, model)
            message = type(exc).__name__  # no payload contents in stored errors
            await svc.finish_import_job(merchant_id, job, done, message)
            await svc.set_integration_status(merchant_id, integration["id"], "error", f"{model}: {message}")
            return
        await svc.finish_import_job(merchant_id, job, done)
    await svc.set_integration_status(merchant_id, integration["id"], "synced")
