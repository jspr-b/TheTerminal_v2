"""Today's model (ml/models/demand_forecast.py), logic unchanged, on the same folds.
Its train/forecast path reads the wall clock, so the clock is set to the day before each cut-off.
Features: time, rolling and lag columns. Ads, events and prices do not exist in this dataset.
At forecast time the module itself fills rolling and lag inputs with zeros; that behaviour is kept."""
import importlib.util, logging, pathlib, sys, tempfile, time
sys.path.append(str(pathlib.Path(__file__).resolve().parent))
import datetime as dt
import pandas as pd
import scoring as s

logging.getLogger("cmdstanpy").setLevel(logging.ERROR); logging.getLogger("prophet").setLevel(logging.ERROR)
spec = importlib.util.spec_from_file_location("demand_forecast", s.ROOT.parents[1] / "ml/models/demand_forecast.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.MODEL_DIR = pathlib.Path(tempfile.mkdtemp())  # keep model files out of the repo
FEATS = ["day_of_week","month","week_of_year","is_weekend","days_since_start","rolling_7d","rolling_14d","rolling_30d","demand_lag_1d","demand_lag_7d"]

def features(hist):
    df = hist.rename(columns={"units": "quantity"})[["product_id","date","quantity"]].sort_values(["product_id","date"]).copy()
    df["day_of_week"] = df.date.dt.dayofweek; df["month"] = df.date.dt.month
    df["week_of_year"] = df.date.dt.isocalendar().week.astype(int); df["is_weekend"] = (df.day_of_week >= 5).astype(int)
    df["days_since_start"] = (df.date - df.date.min()).dt.days
    g = df.groupby("product_id")["quantity"]
    for w in [7, 14, 30]:
        df[f"rolling_{w}d"] = g.transform(lambda x: x.rolling(w, min_periods=1).mean())
    df["demand_lag_1d"] = g.shift(1).fillna(0); df["demand_lag_7d"] = g.shift(7).fillna(0)
    return df

d = s.daily(); cutoffs, h = s.folds(); out, RES = [], s.ROOT / "data/results"
for c in cutoffs:
    t0 = time.time()
    class Clock(dt.datetime):
        @classmethod
        def utcnow(cls): return dt.datetime(c.year, c.month, c.day) - dt.timedelta(days=1)
    m.datetime = Clock; m._prophet_models.clear(); m._model_loaded = True
    info = m.train(features(d[d.date < c]), FEATS, prophet_max=15)
    f = s.frame(d, c, h); fc, missing = [], 0
    for pid in f.product_id:
        p = m.forecast_product(pid, h)
        if not p: missing += 1
        fc.append(sum(x["predicted_quantity"] for x in p))
    f["forecast"] = fc; f["fold"] = c.strftime("%Y-%m-%d"); out.append(f)
    print(c.date(), info, "missing", missing, "secs", round(time.time() - t0), flush=True)
df = pd.concat(out, ignore_index=True)
df.to_csv(RES / "old_model_predictions.csv", index=False)
sc = s.score(df); sc.to_csv(RES / "old_model_scores.csv", index=False)
print("saved old model scores")
