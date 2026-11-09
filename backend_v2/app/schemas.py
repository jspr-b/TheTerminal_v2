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


class CommandProduct(BaseModel):
    id: UUID
    title: str
    units: int
    by_location: list[LocationStock]
    forecast_state: Literal["too_few_sales"]  # no Kumo forecast exists yet; never a made-up number


class CommandOut(BaseModel):
    locations: list[CommandLocation]
    products: list[CommandProduct]


class ImportStarted(BaseModel):
    integration_id: UUID
    status: str
