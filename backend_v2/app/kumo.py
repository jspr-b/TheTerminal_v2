"""Kumo Relational request construction and response parsing."""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable, Mapping, Sequence

import httpx

KUMO_ENDPOINT = "https://ai.api.nvidia.com/v1/structured-data/nvidia/kumo-relational/predictions"
FORECAST_DAYS = 14
HISTORY_DAYS = 56
CONTEXT_OFFSETS = (14, 28, 42, 56, 350, 364)


def _day(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        moment = value
    elif isinstance(value, date):
        return value
    else:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if moment.tzinfo is not None:
        moment = moment.astimezone(timezone.utc)
    return moment.date()


def _timestamp(value: date) -> str:
    return f"{value.isoformat()}T00:00:00Z"


def _column(dtype: str, stype: str, nullable: bool | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {"dtype": dtype, "stype": stype}
    if nullable is not None:
        result["nullable"] = nullable
    return result


SCHEMA = {
    "instance_table": {
        "columns": {
            "instance_id": _column("int64", "ID", False),
            "anchor_time": _column("timestamp[us]", "timestamp", False),
            "product_id": _column("string", "ID", False),
            "label": _column("float64", "numerical"),
        },
        "primary_key": "instance_id",
    },
    "related_tables": {
        "products": {
            "columns": {
                "instance_id": _column("int64", "ID", False),
                "product_id": _column("string", "ID", False),
                "family": _column("string", "categorical"),
                **{
                    name: _column("float64", "numerical", True)
                    for name in (
                        "units_7d",
                        "units_14d",
                        "units_28d",
                        "units_56d",
                        "orders_28d",
                        "avg_price_28d",
                        "days_since_first_sale",
                        "units_same_14d_last_year",
                    )
                },
            },
            "primary_key": ["instance_id", "product_id"],
        },
        "sales_daily": {
            "columns": {
                "instance_id": _column("int64", "ID", False),
                "product_id": _column("string", "ID", False),
                "sale_date": _column("timestamp[us]", "timestamp", False),
                "units": _column("float64", "numerical"),
                "orders": _column("float64", "numerical"),
                "revenue": _column("float64", "numerical"),
            },
            "primary_key": ["instance_id", "product_id", "sale_date"],
        },
    },
    "relationships": [
        {
            "source_columns": ["instance_id", "product_id"],
            "target_table": "products",
            "target_columns": ["instance_id", "product_id"],
        },
        {
            "source_columns": ["instance_id", "product_id"],
            "target_table": "sales_daily",
            "target_columns": ["instance_id", "product_id"],
        },
    ],
}

_PRODUCT_COLUMNS = [
    "instance_id",
    "product_id",
    "family",
    "units_7d",
    "units_14d",
    "units_28d",
    "units_56d",
    "orders_28d",
    "avg_price_28d",
    "days_since_first_sale",
    "units_same_14d_last_year",
]
_SALES_COLUMNS = ["instance_id", "product_id", "sale_date", "units", "orders", "revenue"]


def _daily_sales(
    sales: Iterable[Mapping[str, Any]], product_ids: set[str], prediction_date: date
) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[tuple[str, date], dict[str, Any]] = {}
    for sale in sales:
        product_id = str(sale["product_id"])
        if product_id not in product_ids:
            continue
        day = _day(sale["ordered_at"])
        if day >= prediction_date:
            continue
        key = (product_id, day)
        row = grouped.setdefault(key, {"units": 0.0, "revenue": 0.0, "orders": set()})
        quantity = float(sale["quantity"])
        row["units"] += quantity
        row["revenue"] += quantity * float(sale.get("price") or 0)
        if sale.get("order_id") is not None:
            row["orders"].add(str(sale["order_id"]))
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for (product_id, day), row in grouped.items():
        result[product_id].append(
            {
                "date": day,
                "units": row["units"],
                "orders": float(len(row["orders"])),
                "revenue": row["revenue"],
            }
        )
    for rows in result.values():
        rows.sort(key=lambda row: row["date"])
    return result


def _sum(rows: Sequence[Mapping[str, Any]], start: date, end: date, column: str) -> float:
    return float(sum(row[column] for row in rows if start <= row["date"] < end))


def _product_row(
    instance_id: int, product_id: str, family: str, rows: Sequence[Mapping[str, Any]], anchor: date
) -> list[Any]:
    prior = [row for row in rows if row["date"] < anchor]
    first = prior[0]["date"] if prior else anchor
    units_28 = _sum(prior, anchor - timedelta(days=28), anchor, "units")
    revenue_28 = _sum(prior, anchor - timedelta(days=28), anchor, "revenue")
    last_year_start = anchor - timedelta(days=364)
    last_year = (
        _sum(prior, last_year_start, last_year_start + timedelta(days=14), "units")
        if prior and last_year_start >= prior[0]["date"]
        else None
    )
    return [
        instance_id,
        product_id,
        family,
        _sum(prior, anchor - timedelta(days=7), anchor, "units"),
        _sum(prior, anchor - timedelta(days=14), anchor, "units"),
        units_28,
        _sum(prior, anchor - timedelta(days=56), anchor, "units"),
        _sum(prior, anchor - timedelta(days=28), anchor, "orders"),
        (revenue_28 / units_28) if units_28 else None,
        float((anchor - first).days),
        last_year,
    ]


def _sales_rows(
    instance_id: int, product_id: str, rows: Sequence[Mapping[str, Any]], anchor: date
) -> list[list[Any]]:
    start = anchor - timedelta(days=HISTORY_DAYS)
    return [
        [instance_id, product_id, _timestamp(row["date"]), row["units"], row["orders"], row["revenue"]]
        for row in rows
        if start <= row["date"] < anchor
    ]


def _table(columns: list[str], rows: list[list[Any]]) -> dict[str, Any]:
    return {"format": "arrays", "columns": columns, "rows": rows}


def build_forecast_request(
    sales: Iterable[Mapping[str, Any]],
    product_ids: Sequence[str],
    prediction_date: date | datetime | str,
    families: Mapping[str, str] | None = None,
) -> tuple[dict[str, str], dict[str, Any]]:
    """Build a 14-day request from an allowlisted subset of order-line fields.

    Each context label ends on or before prediction_date, and every related
    sales row ends before its own anchor. Customer and address fields are never
    copied into the request. families maps product id to a non-personal
    category (for example the Shopify product type); unknown is the default.
    """
    anchor = _day(prediction_date)
    products = sorted({str(product_id) for product_id in product_ids})
    by_product = _daily_sales(sales, set(products), anchor)
    family_of = {str(k): str(v) for k, v in (families or {}).items() if v}

    context_instances: list[list[Any]] = []
    context_products: list[list[Any]] = []
    context_sales: list[list[Any]] = []
    prediction_instances: list[list[Any]] = []
    prediction_products: list[list[Any]] = []
    prediction_sales: list[list[Any]] = []
    prediction_ids: dict[str, str] = {}
    instance_id = 0

    for product_id in products:
        rows = by_product.get(product_id, [])
        if not rows:
            continue
        for offset in CONTEXT_OFFSETS:
            context_anchor = anchor - timedelta(days=offset)
            if not any(row["date"] < context_anchor for row in rows):
                continue
            label = _sum(rows, context_anchor, context_anchor + timedelta(days=FORECAST_DAYS), "units")
            context_instances.append([instance_id, _timestamp(context_anchor), product_id, label])
            context_products.append(
                _product_row(instance_id, product_id, family_of.get(product_id, "unknown"), rows, context_anchor)
            )
            context_sales.extend(_sales_rows(instance_id, product_id, rows, context_anchor))
            instance_id += 1

    for product_id in products:
        rows = by_product.get(product_id, [])
        if not rows:
            continue
        prediction_instances.append([instance_id, _timestamp(anchor), product_id])
        prediction_products.append(
            _product_row(instance_id, product_id, family_of.get(product_id, "unknown"), rows, anchor)
        )
        prediction_sales.extend(_sales_rows(instance_id, product_id, rows, anchor))
        prediction_ids[str(instance_id)] = product_id
        instance_id += 1

    request = {
        "model": "kumo-relational",
        "task": {
            "kind": "regression",
            "target": {"column_name": "label", "dtype": "float64"},
            "entity_table_names": ["products"],
            "anchor_time_column": "anchor_time",
        },
        "schema": SCHEMA,
        "context": {
            "instance_table": _table(
                ["instance_id", "anchor_time", "product_id", "label"], context_instances
            ),
            "related_tables": {
                "products": _table(_PRODUCT_COLUMNS, context_products),
                "sales_daily": _table(_SALES_COLUMNS, context_sales),
            },
        },
        "predict": {
            "instance_table": _table(["instance_id", "anchor_time", "product_id"], prediction_instances),
            "related_tables": {
                "products": _table(_PRODUCT_COLUMNS, prediction_products),
                "sales_daily": _table(_SALES_COLUMNS, prediction_sales),
            },
        },
        "output": {"fields": ["quantiles"]},
    }
    return prediction_ids, request


def parse_forecast_response(
    response: Mapping[str, Any], prediction_ids: Mapping[str, str]
) -> dict[str, dict[str, float]]:
    predictions = {
        str(item["id"]): item
        for item in response.get("predictions", [])
        if isinstance(item, Mapping) and "id" in item
    }
    result: dict[str, dict[str, float]] = {}
    for prediction_id, product_id in prediction_ids.items():
        item = predictions.get(str(prediction_id))
        if item is None:
            raise ValueError(f"Kumo response missing prediction {prediction_id}")
        quantiles = item.get("quantiles")
        if not isinstance(quantiles, Mapping):
            raise ValueError(f"Kumo response missing quantiles for prediction {prediction_id}")
        try:
            values = [float(quantiles[key]) for key in ("0.1", "0.5", "0.9")]
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Kumo response has invalid quantiles for prediction {prediction_id}") from exc
        if not all(math.isfinite(value) for value in values):
            raise ValueError(f"Kumo response has non-finite quantiles for prediction {prediction_id}")
        lower, value, upper = (max(0.0, number) for number in values)
        if lower > value or value > upper:
            raise ValueError(f"Kumo response quantiles are out of order for prediction {prediction_id}")
        result[product_id] = {"lower": lower, "value": value, "upper": upper}
    return result


class KumoClient:
    """Small async client; credentials stay server-side and are never logged."""

    def __init__(
        self,
        api_key: str,
        endpoint: str = KUMO_ENDPOINT,
        timeout: float = 60.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        if not api_key.strip():
            raise ValueError("Kumo API key is required")
        self.api_key = api_key
        self.endpoint = endpoint
        self.timeout = timeout
        self.transport = transport

    async def predict(self, payload: Mapping[str, Any]) -> Mapping[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout, transport=self.transport) as client:
            response = await client.post(
                self.endpoint,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                },
                json=payload,
            )
            response.raise_for_status()
            return response.json()
