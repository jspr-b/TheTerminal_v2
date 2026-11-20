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


class CityProduct(BaseModel):
    product_id: UUID
    title: str
    units: int


class CustomerAddress(BaseModel):
    street: str | None
    street2: str | None
    zip: str | None
    city: str | None
    country: str | None
    orders: int
    last_order: datetime


class SameAddressAccount(BaseModel):
    """Another customer account of this shop that shipped to one of the same addresses."""
    id: UUID
    code: str
    orders: int
    spent: float | None
    last_order: datetime


class CustomerCard(BaseModel):
    """One customer, from their orders. No name, email or phone: `code` is a short id. Addresses are for the merchant only."""
    id: UUID
    code: str
    orders: int
    currency: str | None         # None when their orders use more than one currency
    spent: float | None          # None when their orders use more than one currency
    average_order: float | None
    first_order: datetime
    last_order: datetime
    discount_orders: int
    ship_cities: list[str]
    top_products: list[CityProduct]
    refunds: int
    refunded: float
    weekly: list[int]            # orders per week, last 12 weeks, oldest first
    addresses: list[CustomerAddress]
    same_address: list[SameAddressAccount]


class CustomerDot(BaseModel):
    """One customer at one shipping address on the map. lat/lng are Shopify's; None means show it at the city."""
    id: UUID
    code: str
    city: str
    country: str | None
    street: str | None
    zip: str | None
    lat: float | None
    lng: float | None
    orders: int                  # their orders to this address in the last `days`
    last_order: datetime


class CustomerDots(BaseModel):
    days: int
    dots: list[CustomerDot]


class CityCustomers(BaseModel):
    """A city on Command: its last `days` and a card per customer who ordered there."""
    city: str
    country: str | None
    days: int
    orders: int
    customers: int
    guest_orders: int
    returning: int               # customers who had also ordered before these days
    average_order: float | None
    currency: str | None
    top_products: list[CityProduct]
    cards: list[CustomerCard]


class StorePeriod(BaseModel):
    orders: int
    revenue: float | None  # None when orders use more than one currency: never added up across currencies
    units: int
    customers: int
    countries: int


class StoreSummary(BaseModel):
    """Exact Shopify numbers for 'Your store' on Command."""
    days: int
    currency: str | None
    current: StorePeriod
    previous: StorePeriod
    daily_units: list[int]  # oldest first, 2 x days long; the last value is today


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


class PairNode(BaseModel):
    id: UUID
    title: str
    product_type: str | None
    sold: int
    orders: int             # orders with this product in the window
    customers: int          # distinct customers among those orders (orders without a customer are not counted)
    repeat_customers: int   # customers with more than one of those orders
    returned: int           # units refunded in the window


class PairLink(BaseModel):
    source: UUID
    target: UUID
    orders: int


class ProductPairs(BaseModel):
    days: int
    min_orders: int
    nodes: list[PairNode]
    links: list[PairLink]


class TrackRecordProduct(BaseModel):
    product_id: UUID
    title: str
    lower: float
    value: float
    upper: float
    actual: int
    result: Literal["inside", "above", "below"]


class TrackRecord(BaseModel):
    window_start: datetime | None
    window_end: datetime | None
    checked: int
    inside: int
    above: int
    below: int
    products: list[TrackRecordProduct]


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
