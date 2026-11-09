import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import Settings, get_settings
from .importer import run_import
from .nango import NangoClient, RecordSource
from .ontology import OntologyService
from .schemas import Health, ImportJobOut, ImportStarted, LocationOut, ProductOut

logging.basicConfig(level=logging.INFO)
bearer = HTTPBearer(auto_error=False)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    pool = AsyncConnectionPool(get_settings().database_url, open=False, kwargs={"row_factory": dict_row})
    await pool.open(wait=True)
    app.state.service = OntologyService(pool)
    yield
    await pool.close()


app = FastAPI(title="The Terminal", lifespan=lifespan)


def get_service(request: Request) -> OntologyService:
    return request.app.state.service


def get_record_source(settings: Annotated[Settings, Depends(get_settings)]) -> RecordSource:
    if not settings.nango_secret_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Nango is not configured")
    return NangoClient(settings.nango_secret_key, settings.nango_host)


Service = Annotated[OntologyService, Depends(get_service)]


def current_user(creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)], settings: Annotated[Settings, Depends(get_settings)]) -> UUID:
    failed = HTTPException(status.HTTP_401_UNAUTHORIZED, "Login required")
    if creds is None:
        raise failed
    try:
        claims = jwt.decode(creds.credentials, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated", options={"require": ["exp", "sub"]})
        return UUID(claims["sub"])
    except (jwt.InvalidTokenError, ValueError):
        raise failed from None


async def merchant_access(merchant_id: UUID, user: Annotated[UUID, Depends(current_user)], svc: Service) -> UUID:
    if not await svc.is_member(merchant_id, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this merchant")
    return merchant_id


Merchant = Annotated[UUID, Depends(merchant_access)]


@app.get("/health", response_model=Health)
async def health() -> Health:
    return Health(status="ok")


@app.get("/merchants/{merchant_id}/products", response_model=list[ProductOut])
async def products(merchant: Merchant, svc: Service) -> list[dict]:
    return await svc.list_products(merchant)


@app.get("/merchants/{merchant_id}/locations", response_model=list[LocationOut])
async def locations(merchant: Merchant, svc: Service) -> list[dict]:
    return await svc.list_locations(merchant)


@app.get("/merchants/{merchant_id}/imports", response_model=list[ImportJobOut])
async def imports(merchant: Merchant, svc: Service) -> list[dict]:
    return await svc.list_import_jobs(merchant)


@app.post("/merchants/{merchant_id}/integrations/{integration_id}/import", response_model=ImportStarted, status_code=status.HTTP_202_ACCEPTED)
async def start_import(integration_id: UUID, merchant: Merchant, svc: Service, source: Annotated[RecordSource, Depends(get_record_source)], tasks: BackgroundTasks) -> ImportStarted:
    integration = await svc.get_integration(merchant, integration_id)
    if integration is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Integration not found")
    tasks.add_task(run_import, svc, source, merchant, integration)
    return ImportStarted(integration_id=integration_id, status="importing")
