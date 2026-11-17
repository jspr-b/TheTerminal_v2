"""The real Kumo-TS calls. Only imported inside the GPU container (needs torch and the Kumo-TS package).

APIs checked against NVIDIA/Kumo-TS at commit ad459475 (2026-11-17):
- Kumo-Forecast: sdk.forecasting.perform_forecasting(df, config=ForecastingConfig(...)) returns rows
  with `{target}_forecast`.
- Kumo-Anomaly: sdk.anomaly_analysis.perform_anomaly_analysis_with_diffusion(df, threshold_strategy=...)
  returns the input rows plus `Anomaly` (0/1) and `MAE` (the anomaly score). Input must be numbers only.
"""
from datetime import date, timedelta

import pandas as pd


def _device() -> str:
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    except ImportError:
        return "unknown"


class KumoForecast:
    name = "forecast"

    def device(self) -> str:
        return _device()

    def forecast(self, series, target: str, horizon: int) -> list[dict]:
        from sdk.forecasting import ForecastingConfig, perform_forecasting

        df = pd.DataFrame({"timestamp": pd.to_datetime(series.timestamp), **series.columns})
        config = ForecastingConfig(timestamp_column="timestamp", target_column=target, seq_len=min(512, len(df)), forecast_horizon=horizon)
        out = perform_forecasting(df=df, config=config)
        values = out[f"{target}_forecast"].tolist()[:horizon]
        last = date.fromisoformat(series.timestamp[-1][:10])
        return [{"timestamp": (last + timedelta(days=i + 1)).isoformat(), "value": float(v)} for i, v in enumerate(values)]

    def anomalies(self, series) -> list[dict]:
        raise NotImplementedError


class KumoAnomaly:
    name = "anomaly"

    def __init__(self, threshold_strategy: str = "scs", nsample: int = 15):
        self.threshold_strategy, self.nsample = threshold_strategy, nsample

    def device(self) -> str:
        return _device()

    def forecast(self, series, target: str, horizon: int) -> list[dict]:
        raise NotImplementedError

    def anomalies(self, series) -> list[dict]:
        from sdk.anomaly_analysis import perform_anomaly_analysis_with_diffusion

        df = pd.DataFrame(series.columns)  # numbers only: the SDK treats timestamps as features if passed
        out = perform_anomaly_analysis_with_diffusion(df=df, threshold_strategy=self.threshold_strategy, nsample=self.nsample)
        return [{"timestamp": t, "score": float(s), "anomaly": bool(a)} for t, s, a in zip(series.timestamp, out["MAE"], out["Anomaly"])]


def load(name: str):
    if name == "forecast":
        return KumoForecast()
    if name == "anomaly":
        return KumoAnomaly()
    raise SystemExit(f"KUMO_TS_MODEL must be forecast or anomaly, not {name!r}")
