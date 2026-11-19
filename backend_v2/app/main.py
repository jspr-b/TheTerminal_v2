import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .catalog import APP_NAMES, FEATURES, LIVE_STATUSES, PAGES, PROVIDER_APP, connected_apps, page_sections, section_state
from .config import Settings, get_settings
from .forecast import Forecaster, run_demand_forecast
from .gpu import GpuWorker, GpuWorkerClient, run_anomalies, run_store_totals
from .importer import run_import
from .kumo import KumoClient
from .kumo_local import LocalKumo
from .nango import NangoClient, RecordSource
from .ontology import MIN_SHARED_ORDERS, PAIR_DAYS, OntologyService
from .schemas import CommandOut, Connections, CustomerRegions, ForecastStarted, Health, ImportJobOut, ImportStarted, LocationOut, Heatmap, PageState, ProductDetail, ProductOut, ProductPairs, ProductsOverview, TrackRecord

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
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins, allow_methods=["*"], allow_headers=["*"])


def get_service(request: Request) -> OntologyService:
    return request.app.state.service


def get_record_source(settings: Annotated[Settings, Depends(get_settings)]) -> RecordSource:
    if not settings.nango_secret_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Nango is not configured")
    return NangoClient(settings.nango_secret_key, settings.nango_host)


_local_kumo = LocalKumo()  # one per process: the weights load once, on first use


def get_kumo(settings: Annotated[Settings, Depends(get_settings)]) -> Forecaster:
    if settings.kumo_runtime == "local":
        return _local_kumo
    if not settings.nvidia_api_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Kumo is not configured")
    return KumoClient(settings.nvidia_api_key)


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


@app.get("/merchants/{merchant_id}/command", response_model=CommandOut)
async def command(merchant: Merchant, svc: Service) -> dict:
    return await svc.command_view(merchant)


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


@app.post("/merchants/{merchant_id}/forecasts", response_model=ForecastStarted, status_code=status.HTTP_202_ACCEPTED)
async def start_forecast(merchant: Merchant, svc: Service, kumo: Annotated[Forecaster, Depends(get_kumo)], tasks: BackgroundTasks) -> ForecastStarted:
    tasks.add_task(run_demand_forecast, svc, kumo, merchant)
    return ForecastStarted(status="forecasting")


SettingsDep = Annotated[Settings, Depends(get_settings)]


async def merchant_apps(merchant: UUID, svc: OntologyService) -> list[str]:
    return sorted(connected_apps(await svc.list_integrations(merchant)), key=list(APP_NAMES).index)


@app.get("/merchants/{merchant_id}/pages/{page}", response_model=PageState)
async def page_state(page: str, merchant: Merchant, svc: Service, settings: SettingsDep) -> dict:
    """What each section of a page can show right now: ready, or why not."""
    if page not in PAGES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown page")
    apps = await merchant_apps(merchant, svc)
    return {"page": page, "connected": apps, "sections": page_sections(page, set(apps), gpu_ready=bool(settings.kumo_gpu_url))}


MIN_COUNT = 5  # small-number rule: a city with fewer orders or customers than this is never shown
HEATMAP_DAYS = 14
HEATMAP_LAYERS = {"orders", "demand", "returns", "delays", "first_time"}


@app.get("/merchants/{merchant_id}/heatmap/{layer}", response_model=Heatmap)
async def heatmap(layer: str, merchant: Merchant, svc: Service, settings: SettingsDep) -> dict:
    """City-level points for one heatmap layer. A layer that is not ready draws nothing."""
    if layer not in HEATMAP_LAYERS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown layer")
    feature = next(f for f in FEATURES if f.key == f"heatmap_{layer}")
    section = section_state(feature, set(await merchant_apps(merchant, svc)), gpu_ready=bool(settings.kumo_gpu_url))
    points = await svc.orders_per_city(merchant, HEATMAP_DAYS, MIN_COUNT) if section["state"] == "ready" and layer == "orders" else []
    return {"layer": layer, "section": section, "min_count": MIN_COUNT, "points": points}


@app.get("/merchants/{merchant_id}/products/overview", response_model=ProductsOverview)
async def products_overview(merchant: Merchant, svc: Service) -> dict:
    """The Products page. Registered before /products/{product_id} so "overview" is never read as an id."""
    return {"products": await svc.products_overview(merchant)}


MIN_SHARED = MIN_SHARED_ORDERS  # one window and threshold for the galaxy and the product page


@app.get("/merchants/{merchant_id}/products/pairs", response_model=ProductPairs)
async def product_pairs(merchant: Merchant, svc: Service) -> dict:
    """The basket galaxy: products bought in the same order (exact Shopify data)."""
    return await svc.product_pairs(merchant, PAIR_DAYS, MIN_SHARED)


@app.get("/merchants/{merchant_id}/products/track-record", response_model=TrackRecord)
async def track_record(merchant: Merchant, svc: Service) -> dict:
    return await svc.shop_track_record(merchant)


@app.get("/merchants/{merchant_id}/products/{product_id}", response_model=ProductDetail)
async def product_detail(product_id: UUID, merchant: Merchant, svc: Service) -> dict:
    found = await svc.product_detail(merchant, product_id)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return found


@app.get("/merchants/{merchant_id}/customers/regions", response_model=CustomerRegions)
async def customer_regions(merchant: Merchant, svc: Service) -> dict:
    """Customers as groups per city. Small cities are counted in `hidden`, never listed."""
    rows = await svc.customers_per_city(merchant)
    shown = [r for r in rows if r["customers"] >= MIN_COUNT]
    return {"min_count": MIN_COUNT, "hidden": sum(r["customers"] for r in rows if r["customers"] < MIN_COUNT), "regions": shown}


@app.get("/merchants/{merchant_id}/connections", response_model=Connections)
async def connections(merchant: Merchant, svc: Service, settings: SettingsDep) -> dict:
    integrations = await svc.list_integrations(merchant)
    apps = [{"app": app_key, "name": name,
             "connected": any(i["status"] in LIVE_STATUSES for i in integrations if PROVIDER_APP.get(i["provider"]) == app_key),
             "integrations": [i for i in integrations if PROVIDER_APP.get(i["provider"]) == app_key]}
            for app_key, name in APP_NAMES.items()]
    kumo = {"hosted": bool(settings.nvidia_api_key), "local": settings.kumo_runtime == "local", "gpu": bool(settings.kumo_gpu_url),
            "last_runs": await svc.latest_kumo_runs(merchant)}
    return {"apps": apps, "kumo": kumo}


def get_gpu(settings: SettingsDep) -> GpuWorker:
    if not settings.kumo_gpu_url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Kumo Forecast and Anomaly need the GPU worker (KUMO_GPU_URL is not set)")
    return GpuWorkerClient(settings.kumo_gpu_url, anomaly_url=settings.kumo_gpu_anomaly_url)


Gpu = Annotated[GpuWorker, Depends(get_gpu)]


@app.post("/merchants/{merchant_id}/forecasts/store-totals", response_model=ForecastStarted, status_code=status.HTTP_202_ACCEPTED)
async def start_store_totals(merchant: Merchant, svc: Service, gpu: Gpu, tasks: BackgroundTasks) -> ForecastStarted:
    tasks.add_task(run_store_totals, svc, gpu, merchant)
    return ForecastStarted(status="forecasting")


@app.post("/merchants/{merchant_id}/anomalies", response_model=ForecastStarted, status_code=status.HTTP_202_ACCEPTED)
async def start_anomalies(merchant: Merchant, svc: Service, gpu: Gpu, tasks: BackgroundTasks) -> ForecastStarted:
    tasks.add_task(run_anomalies, svc, gpu, merchant)
    return ForecastStarted(status="checking")
