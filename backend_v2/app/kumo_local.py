"""Kumo Relational from open weights on our own server. Same predict contract as KumoClient.

Nothing leaves the machine. The request is the hosted JSON payload built in kumo.py, so the column
allowlist is the same: ids, dates, quantities, prices and the product type.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime
from typing import Any, Callable, Mapping

log = logging.getLogger(__name__)

# Pinned weights. structured-data-models 0.2.1 loads this revision; the hash is of regressor.pt.
WEIGHTS_REPO = "nvidia/Kumo-Relational"
WEIGHTS_REVISION = "v1.0.1"
WEIGHTS_FILE = "regressor.pt"
WEIGHTS_SHA256 = "f863b3632f738e1444fb83a8cea5746f298889b5c96953a000c4720d202ae4cf"

QUANTILE_COLUMNS = {"0.1": "q100", "0.5": "q500", "0.9": "q900"}
_PRODUCT_FEATURES = ("family", "units_7d", "units_14d", "units_28d", "units_56d", "orders_28d",
                     "avg_price_28d", "days_since_first_sale", "units_same_14d_last_year")
_PRODUCT_STYPES = {"instance_id": "id", "family": "categorical", **{c: "numerical" for c in _PRODUCT_FEATURES[1:]}}
_SALES_STYPES = {"instance_id": "id", "days_ago": "numerical", "units": "numerical", "orders": "numerical", "revenue": "numerical"}


def _records(table: Mapping[str, Any]) -> list[dict[str, Any]]:
    columns = table["columns"]
    return [dict(zip(columns, row)) for row in table["rows"]]


def _moment(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _number(value: Any) -> float:
    return float("nan") if value is None else float(value)


def split_tables(part: Mapping[str, Any]) -> dict[str, dict[str, list]]:
    """One half of the request (context or predict) as plain columns.

    Only allowlisted columns are copied. product_id is left out: rows join on instance_id, and an id
    is not a feature. Sale dates become days before that instance's own anchor.
    """
    instances = _records(part["instance_table"])
    anchors = {r["instance_id"]: _moment(r["anchor_time"]) for r in instances}
    products = _records(part["related_tables"]["products"])
    sales = _records(part["related_tables"]["sales_daily"])
    for row in sales:
        if _moment(row["sale_date"]) >= anchors[row["instance_id"]]:
            raise ValueError("sales row on or after its anchor date")
    out: dict[str, dict[str, list]] = {
        "tasks": {"instance_id": [r["instance_id"] for r in instances]},
        "products": {"instance_id": [r["instance_id"] for r in products],
                     "family": [str(r["family"] or "unknown") for r in products],
                     **{c: [_number(r[c]) for r in products] for c in _PRODUCT_FEATURES[1:]}},
        "sales": {"instance_id": [r["instance_id"] for r in sales],
                  "days_ago": [float((anchors[r["instance_id"]] - _moment(r["sale_date"])).days) for r in sales],
                  **{c: [_number(r[c]) for r in sales] for c in ("units", "orders", "revenue")}},
    }
    if instances and "label" in instances[0]:
        out["labels"] = {"label": [_number(r["label"]) for r in instances]}
    return out


def _tensors(tables: Mapping[str, Mapping[str, list]]):
    import sdm

    related = sdm.RelatedTables(
        tables={"products": sdm.TableTensor.from_columns(dict(tables["products"]), stypes=_PRODUCT_STYPES),
                "sales": sdm.TableTensor.from_columns(dict(tables["sales"]), stypes=_SALES_STYPES)},
        relationships=[{"left_table": "sales", "left_columns": "instance_id", "right_table": "products", "right_columns": "instance_id"}],
        task_links=[{"task_columns": "instance_id", "table": "products", "table_columns": "instance_id"}])
    x = sdm.TableTensor.from_columns(dict(tables["tasks"]), stypes={"instance_id": "id"})
    y = sdm.TableTensor.from_columns(dict(tables["labels"]), stypes={"label": "numerical"}) if "labels" in tables else None
    return x, y, related


def verify_weights() -> None:
    """Refuse to run on weights other than the pinned file."""
    from huggingface_hub import hf_hub_download

    path = hf_hub_download(WEIGHTS_REPO, WEIGHTS_FILE, revision=WEIGHTS_REVISION)
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    if digest.hexdigest() != WEIGHTS_SHA256:
        raise RuntimeError("Kumo weights do not match the pinned hash")


def _load_model() -> Callable[..., Any]:
    import sdm

    verify_weights()
    return sdm.models.KumoRelational(task="regression", device="cpu")


class LocalKumo:
    """Runs the 14-day demand request on local weights. model is injectable so tests can stand in for it."""

    def __init__(self, model: Callable[..., Any] | None = None):
        self._model = model

    def _run(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        if payload["task"]["kind"] != "regression":
            raise ValueError("local Kumo serves regression only")
        context, query = split_tables(payload["context"]), split_tables(payload["predict"])
        if not context["tasks"]["instance_id"]:
            raise ValueError("no labelled history to learn from")
        if self._model is None:
            self._model = _load_model()
        import torch

        x_context, y_context, related_context = _tensors(context)
        x_query, _, related_query = _tensors(query)
        out = self._model(x_context=x_context, y_context=y_context, x_query=x_query,
                          related_context_tables=related_context, related_query_tables=related_query,
                          num_hops=1, generator=torch.Generator().manual_seed(0)).to_pandas()
        ids = query["tasks"]["instance_id"]
        if len(out) != len(ids):
            raise ValueError("local Kumo returned a different number of rows than asked for")
        return {"predictions": [{"id": str(instance), "quantiles": {q: float(out[col].iloc[i]) for q, col in QUANTILE_COLUMNS.items()}}
                                for i, instance in enumerate(ids)]}

    async def predict(self, payload: Mapping[str, Any]) -> Mapping[str, Any]:
        return await asyncio.to_thread(self._run, payload)
