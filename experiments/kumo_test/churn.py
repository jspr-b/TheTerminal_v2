"""#7, customers likely to stop buying. Rule: PASS_RULE_7.md. Responses are cached.
Gives Kumo only data before each cut-off. Usage: churn.py [max_batches] (a limited run prints no scores)."""
import hashlib, json, pathlib, sys, time
import numpy as np, pandas as pd, requests
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = pathlib.Path(__file__).resolve().parent
URL = "https://ai.api.nvidia.com/v1/structured-data/nvidia/kumo-relational/predictions"
KEY = next(l.split("=", 1)[1].strip() for l in (ROOT.parents[1] / "backend_v2/.env").read_text().splitlines() if l.startswith("NVIDIA_API_KEY="))
CACHE = ROOT / "cache"; CACHE.mkdir(exist_ok=True)
RESULTS = ROOT / "data/results"; RESULTS.mkdir(parents=True, exist_ok=True)
CUTOFFS = [pd.Timestamp(c) for c in ["2011-03-13", "2011-06-11", "2011-09-09"]]
OFFSETS = {14: [14, 28, 42, 56, 70, 84], 90: [90, 120, 150, 180, 210, 240]}  # every label window ends on or before the cut-off
BATCH, ACTIVE_DAYS, MAX_ORDERS, MAX_CONTEXT = 160, 90, 20, 1000  # NVIDIA default limit is 1,000 context rows
FEATS = ["days_since_last", "orders_90d", "orders_365d", "spend_90d", "spend_365d", "days_since_first", "mean_gap"]
day = lambda n: pd.Timedelta(days=n)
ts = lambda t: t.strftime("%Y-%m-%dT00:00:00Z")
col = lambda d, st, n=None: {"dtype": d, "stype": st, **({"nullable": n} if n is not None else {})}
none_if_nan = lambda x: None if x != x else x

SCHEMA = {
 "instance_table": {"columns": {"instance_id": col("int64", "ID", False), "anchor_time": col("timestamp[us]", "timestamp", False), "customer_id": col("string", "ID", False), "label": col("bool", "categorical")}, "primary_key": "instance_id"},
 "related_tables": {
  "customers": {"columns": {"instance_id": col("int64", "ID", False), "customer_id": col("string", "ID", False), "country": col("string", "categorical"), **{f: col("float64", "numerical", True) for f in FEATS}}, "primary_key": ["instance_id", "customer_id"]},
  "orders": {"columns": {"instance_id": col("int64", "ID", False), "customer_id": col("string", "ID", False), "order_id": col("string", "ID", False), "order_date": col("timestamp[us]", "timestamp", False), "units": col("float64", "numerical"), "lines": col("float64", "numerical"), "revenue": col("float64", "numerical")}, "primary_key": ["instance_id", "order_id"]}},
 "relationships": [
  {"source_columns": ["instance_id", "customer_id"], "target_table": "customers", "target_columns": ["instance_id", "customer_id"]},
  {"source_columns": ["instance_id", "customer_id"], "target_table": "orders", "target_columns": ["instance_id", "customer_id"]}]}
CCOLS = ["instance_id", "customer_id", "country", *FEATS]
OCOLS = ["instance_id", "customer_id", "order_id", "order_date", "units", "lines", "revenue"]

def load_orders():
    s = pd.read_csv(ROOT / "data/clean/sales.csv", dtype={"invoice": str, "customer_id": str, "product_id": str}, parse_dates=["date"])
    s = s[s.customer_id.notna() & (s.customer_id != "")].copy()
    s["revenue"] = s.qty * s.price
    return s.groupby("invoice", as_index=False).agg(customer_id=("customer_id", "first"), country=("country", "first"), date=("date", "min"), units=("qty", "sum"), lines=("product_id", "size"), revenue=("revenue", "sum")).sort_values(["customer_id", "date", "invoice"])

def features(g, a):
    """Numbers for one customer at anchor a, from orders before a only. None if not active."""
    p = g[g.date < a]
    if p.empty or p.date.max() < a - day(ACTIVE_DAYS): return None
    in_days = lambda n: p[p.date >= a - day(n)]
    first, last, n = p.date.min(), p.date.max(), len(p)
    gap = (last - first).days / (n - 1) if n > 1 and last > first else float("nan")
    return {"days_since_last": float((a - last).days), "orders_90d": float(len(in_days(90))), "orders_365d": float(len(in_days(365))), "spend_90d": float(in_days(90).revenue.sum()), "spend_365d": float(in_days(365).revenue.sum()), "days_since_first": float((a - first).days), "mean_gap": gap}

def related(iid, cid, a, g, f):
    p = g[(g.date < a) & (g.date >= a - day(365))].tail(MAX_ORDERS)
    c = [iid, cid, g.country.iloc[0], *[none_if_nan(f[x]) for x in FEATS]]
    return c, [[iid, cid, r.invoice, ts(r.date), float(r.units), float(r.lines), round(float(r.revenue), 2)] for r in p.itertuples()]

def call(payload):
    body = json.dumps(payload, separators=(",", ":")).encode()
    f = CACHE / (hashlib.sha256(body).hexdigest()[:24] + ".json")
    if f.exists(): return json.loads(f.read_text()), len(body), True
    for attempt in range(7):
        try:
            r = requests.post(URL, headers={"Accept": "application/json", "Content-Type": "application/json", "Authorization": f"Bearer {KEY}"}, data=body, timeout=300)
        except requests.RequestException as e:
            print("network error", type(e).__name__, flush=True); time.sleep(10 * 2**attempt); continue
        if r.status_code == 200:
            f.write_text(r.text); return r.json(), len(body), False
        if r.status_code in (429, 500, 502, 503, 504):
            wait = float(r.headers.get("retry-after") or 10 * 2**attempt)
            print("retry", r.status_code, "wait", wait, r.text[:200], flush=True); time.sleep(wait); continue
        raise SystemExit(f"HTTP {r.status_code}: {r.text[:1500]}")
    raise SystemExit("gave up after retries")

def payload_for(c, h, cids, pool, by):
    """Context comes from any customer active at the past date, not only those still active at c:
    limiting it to customers active at c would mean recent context customers could not have stopped."""
    t = lambda cols, rows: {"format": "arrays", "columns": cols, "rows": rows}
    ctx, ctx_c, ctx_o, pred, pred_c, pred_o, train, ids, iid = [], [], [], [], [], [], [], {}, 0
    picks = []
    for cid in pool:
        for off in OFFSETS[h]:
            a = c - day(off)
            f = features(by[cid], a)
            if f is not None: picks.append((hashlib.sha256(f"{cid}|{off}".encode()).hexdigest(), cid, a, f))
    for _, cid, a, f in sorted(picks, key=lambda x: x[0])[:MAX_CONTEXT]:
        g = by[cid]
        label = bool(((g.date >= a) & (g.date < a + day(h))).sum() == 0)
        rc, ro = related(iid, cid, a, g, f)
        ctx.append([iid, ts(a), cid, label]); ctx_c.append(rc); ctx_o += ro; train.append({**f, "label": label}); iid += 1
    for cid in cids:
        f = features(by[cid], c)
        rc, ro = related(iid, cid, c, by[cid], f)
        pred.append([iid, ts(c), cid]); pred_c.append(rc); pred_o += ro; ids[str(iid)] = (cid, f); iid += 1
    return ids, train, {"model": "kumo-relational",
      "task": {"kind": "binary_classification", "target": {"column_name": "label", "dtype": "bool", "classes": ["false", "true"], "positive_class": "true"}, "entity_table_names": ["customers"], "anchor_time_column": "anchor_time"},
      "schema": SCHEMA,
      "context": {"instance_table": t(["instance_id", "anchor_time", "customer_id", "label"], ctx), "related_tables": {"customers": t(CCOLS, ctx_c), "orders": t(OCOLS, ctx_o)}},
      "predict": {"instance_table": t(["instance_id", "anchor_time", "customer_id"], pred), "related_tables": {"customers": t(CCOLS, pred_c), "orders": t(OCOLS, pred_o)}},
      "output": {"fields": ["prediction", "probabilities"]}}

def design(df):
    X = df[FEATS].astype(float).copy()
    X["overdue"] = X.days_since_last / X.mean_gap
    return np.log1p(X)

def run_fold(o, c, h, limit, done):
    hist = o[o.date < c]  # nothing from the test window can reach the payload or the baselines
    by = {k: g for k, g in hist.groupby("customer_id")}
    cids = sorted((k for k, g in by.items() if features(g, c) is not None), key=lambda k: hashlib.sha256(k.encode()).hexdigest())
    rows, train = [], []
    pool = sorted(by, key=lambda k: hashlib.sha256(k.encode()).hexdigest())
    n_batches = (len(cids) + BATCH - 1) // BATCH
    for i in range(0, len(cids), BATCH):
        if limit is not None and done >= limit: return None, done
        b = i // BATCH
        ids, tr, payload = payload_for(c, h, cids[i:i + BATCH], pool[b * len(pool) // n_batches:(b + 1) * len(pool) // n_batches], by)
        train += tr
        resp, size, cached = call(payload)
        preds = {str(x["id"]): x for x in resp["predictions"]}
        if set(preds) != set(ids): raise SystemExit(f"missing predictions: {len(set(ids) - set(preds))}")
        rows += [{"cutoff": c.strftime("%Y-%m-%d"), "h": h, "customer_id": cid, **f, "kumo": float(preds[iid]["probabilities"]["true"])} for iid, (cid, f) in ids.items()]
        done += 1
        print({"cutoff": c.strftime("%Y-%m-%d"), "h": h, "batch": i // BATCH, "customers": len(ids), "context": len(tr), "context_stop_rate": round(sum(x["label"] for x in tr) / len(tr), 3), "mb": round(size / 1e6, 2), "cached": cached}, flush=True)
    df = pd.DataFrame(rows)
    tr = pd.DataFrame(train)
    model = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(max_iter=2000)).fit(design(tr), tr.label.astype(bool))
    df["logistic"] = model.predict_proba(design(df))[:, list(model.classes_).index(True)]
    df["recency"] = df.days_since_last
    df["low_frequency"] = -df.orders_365d
    df["overdue"] = (df.days_since_last / df.mean_gap).fillna((df.days_since_last / df.mean_gap).median())
    # Test labels are read only here, after every prediction and baseline exists.
    bought = set(o[(o.date >= c) & (o.date < c + day(h))].customer_id)
    df["stopped"] = ~df.customer_id.isin(bought)
    return df, done

def score(all_df):
    base = ["recency", "low_frequency", "overdue", "logistic"]
    lines = []
    for h, d in all_df.groupby("h"):
        wins, per = 0, []
        for c, f in d.groupby("cutoff"):
            aucs = {b: roc_auc_score(f.stopped, f[b]) for b in base}
            best = max(aucs, key=aucs.get)
            k = roc_auc_score(f.stopped, f.kumo)
            wins += k - aucs[best] >= 0.02
            top = f.nlargest(max(1, len(f) // 10), "kumo").stopped.mean()
            per.append({"cutoff": c, "customers": len(f), "stop_rate": round(f.stopped.mean(), 3), "kumo_auc": round(k, 4), **{b: round(v, 4) for b, v in aucs.items()}, "best": best, "gain": round(k - aucs[best], 4), "kumo_top_10pct_stop_rate": round(top, 3)})
        bk, bl = brier_score_loss(d.stopped, d.kumo), brier_score_loss(d.stopped, d.logistic)
        rule1, rule2 = wins >= 2, bk <= bl
        lines.append({"h": h, "folds": per, "cutoffs_clearing_0.02": int(wins), "brier_kumo": round(bk, 4), "brier_logistic": round(bl, 4), "rule1": bool(rule1), "rule2": bool(rule2), "passes": bool(rule1 and rule2)})
    return lines

def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    o, done, frames = load_orders(), 0, []
    print("orders", len(o), "customers", o.customer_id.nunique(), flush=True)
    for h in (90, 14):
        for c in CUTOFFS:
            df, done = run_fold(o, c, h, limit, done)
            if df is None:
                print("limited run stopped, no scores printed"); return
            frames.append(df)
    all_df = pd.concat(frames, ignore_index=True)
    all_df.to_csv(RESULTS / "churn_predictions.csv", index=False)
    result = score(all_df)
    (RESULTS / "churn_scores.json").write_text(json.dumps(result, indent=1))
    print(json.dumps(result, indent=1))

main()
