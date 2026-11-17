from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class Health(BaseModel):
    status: str


class ProductOut(BaseModel):
    id: UUID
    external_id: str
    title: str
    status: str | None
    product_type: str | None
    vendor: str | None


class LocationOut(BaseModel):
    id: UUID
    external_id: str
    name: str
    city: str | None
    province: str | None
    country: str | None
    is_active: bool


class ImportJobOut(BaseModel):
    id: UUID
    model: str
    kind: str
    status: str
    records_done: int
    started_at: datetime | None
    finished_at: datetime | None
    error: str | None


class LocationStock(BaseModel):
    location_id: UUID
    units: int


class CommandLocation(BaseModel):
    id: UUID
    name: str
    city: str | None
    province: str | None
    country: str | None
    lat: float | None
    lng: float | None
    kind: str
    units: int
    products: int


class ForecastRange(BaseModel):
    """Kumo's 14-day units: 0.1, 0.5 and 0.9 quantiles. Kumo runs low, so stock decisions use upper."""
    lower: float
    value: float
    upper: float
    generated_at: datetime  # when Kumo made this range; shown when it is stale


class CommandProduct(BaseModel):
    id: UUID
    title: str
    units: int
    by_location: list[LocationStock]
    # forecast: fresh Kumo range. stale: the last range, Kumo's latest run failed.
    # too_few_sales: no number at all.
    forecast_state: Literal["forecast", "stale", "too_few_sales"]
    forecast: ForecastRange | None


class CommandOut(BaseModel):
    locations: list[CommandLocation]
    products: list[CommandProduct]


SectionStateName = Literal["ready", "not_connected", "needs_gpu", "blocked", "not_built"]


class Section(BaseModel):
    """One block on a page. The app draws it by state; message is in the merchant's words."""
    key: str
    idea: int | None
    title: str
    shows: Literal["exact", "range", "band", "count", "list", "statement"]
    source: Literal["shopify", "kumo", "our_math"]
    model: Literal["relational", "tabular", "forecast", "anomaly"] | None
    needs: list[str]
    state: SectionStateName
    message: str


class PageState(BaseModel):
    page: str
    connected: list[str]
    sections: list[Section]


class HeatmapPoint(BaseModel):
    city: str
    province: str | None
    country: str | None
    value: float


class Heatmap(BaseModel):
    layer: str
    section: Section
    min_count: int
    points: list[HeatmapPoint]


class ProductLocationStock(BaseModel):
    location_id: UUID
    name: str
    units: int


class DaySales(BaseModel):
    date: str
    units: int


class Sellout(BaseModel):
    """Our math on the Kumo range (app/sellout.py). Not backtested yet: tested is False."""
    band: Literal["low", "medium", "high"]
    earliest_day: int | None
    likely_day: int | None
    latest_day: int | None
    tested: bool


class VariantStock(BaseModel):
    id: UUID
    title: str | None
    sku: str | None
    units: int


class BoughtTogether(BaseModel):
    product_id: UUID
    title: str
    orders: int


class PastRange(BaseModel):
    generated_at: datetime
    lower: float
    value: float
    upper: float
    actual: int  # units really sold in the range's 14 days


class OverviewProduct(BaseModel):
    id: UUID
    title: str
    product_type: str | None
    units: int
    sold_14d: int
    sales_28d: list[int]
    forecast_state: Literal["forecast", "stale", "too_few_sales"]
    forecast: ForecastRange | None
    sellout: Sellout | None


class ProductsOverview(BaseModel):
    products: list[OverviewProduct]


class ProductDetail(BaseModel):
    id: UUID
    title: str
    product_type: str | None
    units: int
    by_location: list[ProductLocationStock]
    forecast_state: Literal["forecast", "stale", "too_few_sales"]
    forecast: ForecastRange | None
    sales: list[DaySales]  # exact Shopify units per day, oldest first, zeros included
    sold_14d: int
    sellout: Sellout | None
    by_variant: list[VariantStock]
    bought_together: list[BoughtTogether]
    track_record: list[PastRange]


class CustomerRegion(BaseModel):
    city: str
    country: str | None
    customers: int


class CustomerRegions(BaseModel):
    min_count: int
    hidden: int  # customers in cities under min_count: counted, never listed
    regions: list[CustomerRegion]


class IntegrationOut(BaseModel):
    provider: str
    status: str
    last_sync_at: datetime | None


class AppConnection(BaseModel):
    app: Literal["shopify", "ads", "payments", "support"]
    name: str
    connected: bool
    integrations: list[IntegrationOut]


class KumoRunOut(BaseModel):
    model: str
    query_name: str
    status: str
    finished_at: datetime | None


class KumoSetup(BaseModel):
    hosted: bool  # NVIDIA_API_KEY set
    local: bool  # KUMO_RUNTIME=local
    gpu: bool  # KUMO_GPU_URL set
    last_runs: list[KumoRunOut]


class Connections(BaseModel):
    apps: list[AppConnection]
    kumo: KumoSetup


class ImportStarted(BaseModel):
    integration_id: UUID
    status: str


class ForecastStarted(BaseModel):
    status: str
