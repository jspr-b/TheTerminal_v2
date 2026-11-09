"""14-day units per product from hosted Kumo Relational. Gives Kumo only data before each cut-off.
Responses are cached, so scoring never needs new calls. Usage: run_kumo.py [max_batches]"""
import hashlib, json, pathlib, sys, time
sys.path.append(str(pathlib.Path(__file__).resolve().parent))
import numpy as np, pandas as pd, requests
import scoring as s

URL = "https://ai.api.nvidia.com/v1/structured-data/nvidia/kumo-relational/predictions"
BATCH, HISTORY_DAYS, FIRST_DAY = 160, 56, pd.Timestamp("2009-12-01")
ANCHOR_OFFSETS = [14, 28, 42, 56, 350, 364]  # days before the cut-off; every label window ends on or before it
CACHE = s.ROOT / "cache"; CACHE.mkdir(exist_ok=True)
KEY = next(l.split("=", 1)[1].strip() for l in (s.ROOT.parents[1] / "backend_v2/.env").read_text().splitlines() if l.startswith("NVIDIA_API_KEY="))

def col(d, st, n=None):
    return {"dtype": d, "stype": st, **({"nullable": n} if n is not None else {})}
SCHEMA = {
 "instance_table": {"columns": {"instance_id": col("int64","ID",False), "anchor_time": col("timestamp[us]","timestamp",False), "product_id": col("string","ID",False), "label": col("float64","numerical")}, "primary_key": "instance_id"},
 "related_tables": {
  "products": {"columns": {"instance_id": col("int64","ID",False), "product_id": col("string","ID",False), "family": col("string","categorical"),
      **{c: col("float64","numerical",True) for c in ["units_7d","units_14d","units_28d","units_56d","orders_28d","avg_price_28d","days_since_first_sale","units_same_14d_last_year"]}}, "primary_key": ["instance_id","product_id"]},
  "sales_daily": {"columns": {"instance_id": col("int64","ID",False), "product_id": col("string","ID",False), "sale_date": col("timestamp[us]","timestamp",False), "units": col("float64","numerical"), "orders": col("float64","numerical"), "revenue": col("float64","numerical")}, "primary_key": ["instance_id","product_id","sale_date"]}},
 "relationships": [
  {"source_columns": ["instance_id","product_id"], "target_table": "products", "target_columns": ["instance_id","product_id"]},
  {"source_columns": ["instance_id","product_id"], "target_table": "sales_daily", "target_columns": ["instance_id","product_id"]}]}
PCOLS = ["instance_id","product_id","family","units_7d","units_14d","units_28d","units_56d","orders_28d","avg_price_28d","days_since_first_sale","units_same_14d_last_year"]
SCOLS = ["instance_id","product_id","sale_date","units","orders","revenue"]
ts = lambda t: t.strftime("%Y-%m-%dT00:00:00Z")

def sum_in(g, lo, hi, col_):
    return float(g[col_][(g.date >= lo) & (g.date < hi)].sum())

def rows_for(iid, pid, a, g):
    """Related rows for one prediction instance, using only rows before anchor a."""
    prior = g[g.date < a]
    if prior.empty: return None
    w = lambda n: sum_in(prior, a - pd.Timedelta(days=n), a, "units")
    u28, r28 = w(28), sum_in(prior, a - pd.Timedelta(days=28), a, "revenue")
    ly_lo = a - pd.Timedelta(days=364)
    ly = sum_in(prior, ly_lo, ly_lo + pd.Timedelta(days=14), "units") if ly_lo >= FIRST_DAY else None
    p = [iid, pid, pid[:2], w(7), w(14), u28, w(56), sum_in(prior, a - pd.Timedelta(days=28), a, "orders"), (r28/u28 if u28 else None), float((a - prior.date.min()).days), ly]
    h = prior[prior.date >= a - pd.Timedelta(days=HISTORY_DAYS)]
    return p, [[iid, pid, ts(r.date), float(r.units), float(r.orders), float(r.revenue)] for r in h.itertuples()]

def batch_payload(c, products, by):
    ctx, ctx_p, ctx_s, pred, pred_p, pred_s, iid, ids = [], [], [], [], [], [], 0, {}
    for pid in products:
        g = by[pid]
        for off in ANCHOR_OFFSETS:
            a = c - pd.Timedelta(days=off)
            built = rows_for(iid, pid, a, g)
            if built is None: continue
            label = sum_in(g, a, a + pd.Timedelta(days=14), "units")
            ctx.append([iid, ts(a), pid, label]); ctx_p.append(built[0]); ctx_s += built[1]; iid += 1
    for pid in products:
        built = rows_for(iid, pid, c, by[pid])
        pred.append([iid, ts(c), pid]); pred_p.append(built[0]); pred_s += built[1]; ids[str(iid)] = pid; iid += 1
    t = lambda cols, rows: {"format": "arrays", "columns": cols, "rows": rows}
    return ids, {"model": "kumo-relational",
      "task": {"kind": "regression", "target": {"column_name": "label", "dtype": "float64"}, "entity_table_names": ["products"], "anchor_time_column": "anchor_time"},
      "schema": SCHEMA,
      "context": {"instance_table": t(["instance_id","anchor_time","product_id","label"], ctx), "related_tables": {"products": t(PCOLS, ctx_p), "sales_daily": t(SCOLS, ctx_s)}},
      "predict": {"instance_table": t(["instance_id","anchor_time","product_id"], pred), "related_tables": {"products": t(PCOLS, pred_p), "sales_daily": t(SCOLS, pred_s)}},
      "output": {"fields": ["quantiles"]}}

def call(payload):
    body = json.dumps(payload, separators=(",", ":")).encode()
    f = CACHE / (hashlib.sha256(body).hexdigest()[:24] + ".json")
    if f.exists(): return json.loads(f.read_text()), 0.0, len(body), True
    for attempt in range(7):
        t0 = time.time()
        try:
            r = requests.post(URL, headers={"Accept":"application/json","Content-Type":"application/json","Authorization":f"Bearer {KEY}"}, data=body, timeout=300)
        except requests.RequestException as e:
            print("network error", type(e).__name__, flush=True); time.sleep(10 * 2**attempt); continue
        if r.status_code == 200:
            f.write_text(r.text); return r.json(), time.time() - t0, len(body), False
        if r.status_code in (429, 500, 502, 503, 504):
            wait = float(r.headers.get("retry-after") or 10 * 2**attempt)
            print("retry", r.status_code, "wait", wait, r.text[:200], flush=True); time.sleep(wait); continue
        raise SystemExit(f"HTTP {r.status_code}: {r.text[:1500]}")
    raise SystemExit("gave up after retries")

def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    d = s.daily(); cutoffs, h = s.folds(); out, log, done = [], [], 0
    for c in cutoffs:
        hist = d[d.date < c]  # nothing from the test window can reach the payload
        by = {p: g.sort_values("date") for p, g in hist.groupby("product_id")}
        products = sorted(s.frame(d, c, h).product_id, key=lambda p: hashlib.sha256(p.encode()).hexdigest())
        for i in range(0, len(products), BATCH):
            if limit is not None and done >= limit: break
            ids, payload = batch_payload(c, products[i:i+BATCH], by)
            resp, secs, size, cached = call(payload)
            preds = {str(x["id"]): x for x in resp["predictions"]}
            missing = 0
            for iid, pid in ids.items():
                q = preds.get(iid, {}).get("quantiles")
                if q is None: missing += 1; continue
                out.append({"fold": c.strftime("%Y-%m-%d"), "product_id": pid, "forecast": max(0.0, float(q["0.5"])), "p10": float(q["0.1"]), "p90": float(q["0.9"])})
            log.append({"fold": c.strftime("%Y-%m-%d"), "batch": i // BATCH, "products": len(ids), "context": len(payload["context"]["instance_table"]["rows"]), "sales_rows": len(payload["context"]["related_tables"]["sales_daily"]["rows"]) + len(payload["predict"]["related_tables"]["sales_daily"]["rows"]), "mb": round(size / 1e6, 2), "secs": round(secs, 1), "cached": cached, "missing": missing})
            print(log[-1], flush=True); done += 1
    res = s.ROOT / "data/results"; res.mkdir(exist_ok=True)
    pd.DataFrame(out).to_csv(res / "kumo_predictions_raw.csv", index=False)
    pd.DataFrame(log).to_csv(res / "kumo_run_log.csv", index=False)
    print("predictions", len(out), "batches", len(log), "failures", sum(x["missing"] for x in log))
main()
