from datetime import datetime
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


class ImportStarted(BaseModel):
    integration_id: UUID
    status: str
