"""#7 with Kumo Tabular. Rule: PASS_RULE_7T.md. Same data, cut-offs, context picks and baselines as churn.py run 2.
Usage: tabular_churn.py --dry-run   builds every request, checks sizes, no network, no key
       tabular_churn.py [max_batches]   calls hosted Kumo Tabular (a limited run prints no scores)
Key: NVIDIA_API_KEY from the environment, else backend_v2/.env. Responses are cached."""
import hashlib, json, os, pathlib, sys, time
import numpy as np, pandas as pd, requests
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = pathlib.Path(__file__).resolve().parent
URL = "https://ai.api.nvidia.com/v1/structured-data/nvidia/kumo-tabular/predictions"
CACHE = ROOT / "cache_tabular"; CACHE.mkdir(exist_ok=True)
RESULTS = ROOT / "data/results"; RESULTS.mkdir(parents=True, exist_ok=True)
CUTOFFS = [pd.Timestamp(c) for c in ["2011-03-13", "2011-06-11", "2011-09-09"]]
OFFSETS = {14: [14, 28, 42, 56, 70, 84], 90: [90, 120, 150, 180, 210, 240]}
BATCH, ACTIVE_DAYS, MAX_CONTEXT, MAX_BYTES = 160, 90, 1000, 30 * 2**20
FEATS = ["days_since_last", "orders_90d", "orders_365d", "spend_90d", "spend_365d", "days_since_first", "mean_gap"]
COLS = ["row_id", "country", *FEATS]
day = lambda n: pd.Timedelta(days=n)
nan_none = lambda x: None if x != x else x
col = lambda d, st, n=None: {"dtype": d, "stype": st, **({"nullable": n} if n is not None else {})}
SCHEMA = {"instance_table": {"columns": {"row_id": col("string", "ID", False), "country": col("string", "categorical"),
          **{f: col("float64", "numerical", True) for f in FEATS}, "stopped": col("string", "categorical")},
          "primary_key": "row_id"}, "related_tables": {}, "relationships": []}

def key():
    k = os.environ.get("NVIDIA_API_KEY")
    if k: return k
    env = ROOT.parents[1] / "backend_v2/.env"
    for l in env.read_text().splitlines() if env.exists() else []:
        if l.startswith("NVIDIA_API_KEY="): return l.split("=", 1)[1].strip()
    raise SystemExit("No NVIDIA_API_KEY in the environment or backend_v2/.env")

def load_orders():
    s = pd.read_csv(ROOT / "data/clean/sales.csv", dtype={"invoice": str, "customer_id": str, "product_id": str}, parse_dates=["date"])
    s = s[s.customer_id.notna() & (s.customer_id != "")].copy()
    s["revenue"] = s.qty * s.price
    return s.groupby("invoice", as_index=False).agg(customer_id=("customer_id", "first"), country=("country", "first"), date=("date", "min"),
        units=("qty", "sum"), lines=("product_id", "size"), revenue=("revenue", "sum")).sort_values(["customer_id", "date", "invoice"])

def features(g, a):
    """Same as churn.py: numbers from orders before a only. None if not active."""
    p = g[g.date < a]
    if p.empty or p.date.max() < a - day(ACTIVE_DAYS): return None
    in_days = lambda n: p[p.date >= a - day(n)]
    first, last, n = p.date.min(), p.date.max(), len(p)
    gap = (last - first).days / (n - 1) if n > 1 and last > first else float("nan")
    return {"days_since_last": float((a - last).days), "orders_90d": float(len(in_days(90))), "orders_365d": float(len(in_days(365))),
            "spend_90d": float(in_days(90).revenue.sum()), "spend_365d": float(in_days(365).revenue.sum()),
            "days_since_first": float((a - first).days), "mean_gap": gap}

def row(rid, g, f): return [rid, g.country.iloc[0], *[nan_none(f[x]) for x in FEATS]]

def payload_for(c, h, cids, pool, by):
    """Context picks identical to churn.py run 2: any customer active at the past date, same hash order."""
    picks = []
    for cid in pool:
        for off in OFFSETS[h]:
            a = c - day(off); f = features(by[cid], a)
            if f is not None: picks.append((hashlib.sha256(f"{cid}|{off}".encode()).hexdigest(), cid, a, f))
    ctx, train = [], []
    for n, (_, cid, a, f) in enumerate(sorted(picks, key=lambda x: x[0])[:MAX_CONTEXT]):
        g = by[cid]; stopped = bool(((g.date >= a) & (g.date < a + day(h))).sum() == 0)
        ctx.append(row(f"ctx-{n}", g, f) + ["yes" if stopped else "no"]); train.append({**f, "label": stopped})
    pred, ids = [], {}
    for n, cid in enumerate(cids):
        f = features(by[cid], c); rid = f"p-{n}"
        pred.append(row(rid, by[cid], f)); ids[rid] = (cid, f)
    t = lambda cols, rows: {"format": "arrays", "columns": cols, "rows": rows}
    return ids, train, {"model": "kumo-tabular",
        "task": {"kind": "classification", "target": {"column_name": "stopped", "dtype": "string", "classes": ["no", "yes"], "positive_class": "yes"}},
        "schema": SCHEMA, "context": {"instance_table": t(COLS + ["stopped"], ctx), "related_tables": {}},
        "predict": {"instance_table": t(COLS, pred), "related_tables": {}}, "output": {"fields": ["prediction", "probabilities"]}}

def call(payload, dry):
    body = json.dumps(payload, separators=(",", ":")).encode()
    if len(body) > MAX_BYTES: raise SystemExit(f"request {len(body)} bytes is over 30 MiB")
    if dry: return None, len(body), False
    f = CACHE / (hashlib.sha256(body).hexdigest()[:24] + ".json")
    if f.exists(): return json.loads(f.read_text()), len(body), True
    for attempt in range(7):
        try:
            r = requests.post(URL, headers={"Accept": "application/json", "Content-Type": "application/json", "Authorization": f"Bearer {key()}"}, data=body, timeout=300)
        except requests.RequestException as e:
            print("network error", type(e).__name__, flush=True); time.sleep(10 * 2**attempt); continue
        if r.status_code == 200: f.write_text(r.text); return r.json(), len(body), False
        if r.status_code in (429, 500, 502, 503, 504):
            wait = float(r.headers.get("retry-after") or 10 * 2**attempt); print("retry", r.status_code, wait, r.text[:200], flush=True); time.sleep(wait); continue
        raise SystemExit(f"HTTP {r.status_code}: {r.text[:1500]}")
    raise SystemExit("gave up after retries")

def prob_yes(p):
    pr = p["probabilities"]
    return float(pr["yes"] if isinstance(pr, dict) else pr[1])

def design(df):
    X = df[FEATS].astype(float).copy(); X["overdue"] = X.days_since_last / X.mean_gap
    return np.log1p(X)

def run_fold(o, c, h, limit, done, dry):
    hist = o[o.date < c]  # nothing from the test window reaches the payload or the baselines
    by = {k: g for k, g in hist.groupby("customer_id")}
    cids = sorted((k for k, g in by.items() if features(g, c) is not None), key=lambda k: hashlib.sha256(k.encode()).hexdigest())
    pool = sorted(by, key=lambda k: hashlib.sha256(k.encode()).hexdigest())
    n_batches, rows, train = (len(cids) + BATCH - 1) // BATCH, [], []
    for i in range(0, len(cids), BATCH):
        if limit is not None and done >= limit: return None, done
        b = i // BATCH
        ids, tr, payload = payload_for(c, h, cids[i:i + BATCH], pool[b * len(pool) // n_batches:(b + 1) * len(pool) // n_batches], by)
        train += tr; resp, size, cached = call(payload, dry); done += 1
        print({"cutoff": c.strftime("%Y-%m-%d"), "h": h, "batch": b, "customers": len(ids), "context": len(tr), "mb": round(size / 1e6, 2), "cached": cached}, flush=True)
        if dry: continue
        preds = {str(x["id"]): x for x in resp["predictions"]}
        if set(preds) != set(ids): raise SystemExit(f"missing predictions: {len(set(ids) - set(preds))}; first ids back: {list(preds)[:3]}")
        rows += [{"cutoff": c.strftime("%Y-%m-%d"), "h": h, "customer_id": cid, **f, "kumo": prob_yes(preds[rid])} for rid, (cid, f) in ids.items()]
    if dry: return pd.DataFrame(), done
    df, tr = pd.DataFrame(rows), pd.DataFrame(train)
    model = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(max_iter=2000)).fit(design(tr), tr.label.astype(bool))
    df["logistic"] = model.predict_proba(design(df))[:, list(model.classes_).index(True)]
    df["recency"] = df.days_since_last; df["low_frequency"] = -df.orders_365d
    df["overdue"] = (df.days_since_last / df.mean_gap).fillna((df.days_since_last / df.mean_gap).median())
    bought = set(o[(o.date >= c) & (o.date < c + day(h))].customer_id)  # test labels read only here
    df["stopped"] = ~df.customer_id.isin(bought)
    return df, done

def score(all_df):
    base, out = ["recency", "low_frequency", "overdue", "logistic"], []
    for h, d in all_df.groupby("h"):
        wins, per = 0, []
        for c, f in d.groupby("cutoff"):
            aucs = {b: roc_auc_score(f.stopped, f[b]) for b in base}; best = max(aucs, key=aucs.get)
            k = roc_auc_score(f.stopped, f.kumo); wins += k - aucs[best] >= 0.02
            per.append({"cutoff": c, "customers": len(f), "stop_rate": round(f.stopped.mean(), 3), "tabular_auc": round(k, 4),
                        **{b: round(v, 4) for b, v in aucs.items()}, "best": best, "gain": round(k - aucs[best], 4)})
        bk, bl = brier_score_loss(d.stopped, d.kumo), brier_score_loss(d.stopped, d.logistic)
        out.append({"h": int(h), "folds": per, "cutoffs_clearing_0.02": int(wins), "brier_tabular": round(bk, 4), "brier_logistic": round(bl, 4),
                    "passes": bool(wins >= 2 and bk <= bl)})
    return out

def main():
    dry = "--dry-run" in sys.argv
    nums = [a for a in sys.argv[1:] if a.isdigit()]; limit = int(nums[0]) if nums else None
    o, done, frames = load_orders(), 0, []
    print("orders", len(o), "customers", o.customer_id.nunique(), "dry run" if dry else "", flush=True)
    for h in (90, 14):
        for c in CUTOFFS:
            df, done = run_fold(o, c, h, limit, done, dry)
            if df is None: print("limited run stopped, no scores printed"); return
            frames.append(df)
    if dry: print("dry run ok:", done, "requests built"); return
    all_df = pd.concat(frames, ignore_index=True); all_df.to_csv(RESULTS / "churn_tabular_predictions.csv", index=False)
    result = score(all_df); (RESULTS / "churn_tabular_scores.json").write_text(json.dumps(result, indent=1)); print(json.dumps(result, indent=1))

if __name__ == "__main__":
    main()
