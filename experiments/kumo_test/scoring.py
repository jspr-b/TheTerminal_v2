"""One scoring module for every model."""
import json, pathlib
import numpy as np, pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent
CLEAN = ROOT / "data/clean"

def folds():
    f = json.loads((CLEAN / "folds.json").read_text())
    return [pd.Timestamp(c) for c in f["cutoffs"]], f["horizon_days"]

def daily():
    d = pd.read_csv(CLEAN / "daily.csv", dtype={"product_id": str}, parse_dates=["date"])
    return d

def frame(d, cutoff, horizon):
    """Scored products at a cut-off with their actuals and segment. Uses only pre-cut-off data to choose them."""
    past = d[(d.date < cutoff) & (d.date >= cutoff - pd.Timedelta(days=90))].groupby("product_id").units.sum().rename("prior_units").reset_index()
    past = past.sort_values(["prior_units", "product_id"], ascending=[False, True]).reset_index(drop=True)
    past["segment"] = np.where(past.index < int(np.ceil(len(past) * 0.2)), "top", "tail")
    act = d[(d.date >= cutoff) & (d.date < cutoff + pd.Timedelta(days=horizon))].groupby("product_id").units.sum().rename("actual")
    past = past.join(act, on="product_id")
    past["actual"] = past.actual.fillna(0.0)
    return past

def metrics(g):
    e = g.forecast - g.actual
    nz = g[g.actual > 0]
    return pd.Series({"products": len(g), "actual_units": g.actual.sum(), "wape": e.abs().sum() / g.actual.sum(), "mape": ((nz.forecast - nz.actual).abs() / nz.actual).mean(), "bias": e.sum() / g.actual.sum()})

def score(df):
    """df columns: fold, segment, actual, forecast. Returns per-fold metrics by segment, plus all products."""
    a = df.groupby(["fold", "segment"]).apply(metrics, include_groups=False).reset_index()
    b = df.groupby("fold").apply(metrics, include_groups=False).reset_index().assign(segment="all")
    return pd.concat([a, b], ignore_index=True).sort_values(["fold", "segment"]).reset_index(drop=True)
