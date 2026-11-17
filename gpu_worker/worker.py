"""GPU worker: Kumo Forecast or Kumo Anomaly (NVIDIA Kumo-TS) behind a small HTTP API.

One container per model, because both Kumo-TS packages are a top-level `sdk` module:
  KUMO_TS_MODEL=forecast  -> POST /v1/forecast
  KUMO_TS_MODEL=anomaly   -> POST /v1/anomaly
The backend (backend_v2/app/gpu.py) sends daily store series: dates and numbers only.
"""
import os
from typing import Protocol

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

MAX_HORIZON = 14  # The Terminal never predicts past 14 days


class Series(BaseModel):
    timestamp: list[str] = Field(min_length=1)
    columns: dict[str, list[float]] = Field(min_length=1)

    @model_validator(mode="after")
    def same_length(self) -> "Series":
        for name, values in self.columns.items():
            if len(values) != len(self.timestamp):
                raise ValueError(f"column {name} has {len(values)} values for {len(self.timestamp)} dates")
        return self


class ForecastIn(BaseModel):
    series: Series
    target: str
    horizon: int = Field(ge=1, le=MAX_HORIZON)


class AnomalyIn(BaseModel):
    series: Series


class Model(Protocol):
    name: str

    def forecast(self, series: Series, target: str, horizon: int) -> list[dict]: ...
    def anomalies(self, series: Series) -> list[dict]: ...
    def device(self) -> str: ...


def create_app(model: Model) -> FastAPI:
    app = FastAPI(title=f"Kumo {model.name} worker")

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "model": model.name, "device": model.device()}

    @app.post("/v1/forecast")
    def forecast(body: ForecastIn) -> dict:
        if model.name != "forecast":
            raise HTTPException(404, "This worker runs Kumo Anomaly; forecasts go to the forecast worker")
        if body.target not in body.series.columns:
            raise HTTPException(422, f"target {body.target} is not a column")
        return {"forecast": model.forecast(body.series, body.target, body.horizon)}

    @app.post("/v1/anomaly")
    def anomaly(body: AnomalyIn) -> dict:
        if model.name != "anomaly":
            raise HTTPException(404, "This worker runs Kumo Forecast; anomaly checks go to the anomaly worker")
        return {"days": model.anomalies(body.series)}

    return app


def _from_env() -> FastAPI:
    from models import load  # imported here so tests never need torch

    return create_app(load(os.environ.get("KUMO_TS_MODEL", "forecast")))


app = _from_env() if os.environ.get("KUMO_TS_MODEL") else None
