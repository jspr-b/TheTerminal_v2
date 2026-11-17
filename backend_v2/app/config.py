from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    supabase_jwt_secret: str
    nango_secret_key: str | None = None
    nango_host: str = "https://api.nango.dev"
    # Hosted Kumo. Unset means forecasts are off; setting it is the owner's switch (D016).
    nvidia_api_key: str | None = None
    # Where Kumo runs. "local" uses open weights on this server and sends nothing out (kumo_local.py).
    kumo_runtime: Literal["hosted", "local"] = "hosted"
    # The GPU worker (gpu_worker/) for Kumo Forecast and Kumo Anomaly. Unset: those sections say "needs GPU".
    kumo_gpu_url: str | None = None
    kumo_gpu_anomaly_url: str | None = None  # the Anomaly container; defaults to kumo_gpu_url
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
