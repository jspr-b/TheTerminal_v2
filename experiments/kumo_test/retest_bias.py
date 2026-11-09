"""#1 low-bias correction. Rule: PASS_RULE_1B.md. Usage: retest_bias.py [max_batches] (a limited run prints no scores)."""
import hashlib, json, pathlib, sys
sys.path.append(str(pathlib.Path(__file__).resolve().parent))
import numpy as np, pandas as pd
import run_kumo as k, scoring as s

RES = s.ROOT / "data/results"
LEARN = {"2011-09-30": ["2011-08-05", "2011-09-02"], "2011-10-28": ["2011-09-02", "2011-09-30"], "2011-11-25": ["2011-09-30", "2011-10-28"]}
NEW_WINDOWS = ["2011-08-05", "2011-09-02"]
H = 14


def kumo_for(cutoff, d, limit, done):
    c = pd.Timestamp(cutoff)
    hist = d[d.date < c]
    by = {p: g.sort_values("date") for p, g in hist.groupby("product_id")}
    products = sorted(s.frame(d, c, H).product_id, key=lambda p: hashlib.sha256(p.encode()).hexdigest())
    out = []
    for i in range(0, len(products), k.BATCH):
        if limit is not None and done >= limit: return None, done
        ids, payload = k.batch_payload(c, products[i:i + k.BATCH], by)
        resp, secs, size, cached = k.call(payload)
        preds = {str(x["id"]): x for x in resp["predictions"]}
        if set(preds) != set(ids): raise SystemExit("missing predictions")
        for iid, pid in ids.items():
            q = preds[iid]["quantiles"]
            out.append({"fold": cutoff, "product_id": pid, "forecast": max(0.0, float(q["0.5"])), "p10": float(q["0.1"]), "p90": float(q["0.9"])})
        done += 1
        print({"cutoff": cutoff, "batch": i // k.BATCH, "products": len(ids), "cached": cached}, flush=True)
    return pd.DataFrame(out), done


def with_actuals(d, cutoff, preds):
    f = s.frame(d, pd.Timestamp(cutoff), H)
    f["fold"] = cutoff
    m = f.merge(preds[preds.fold == cutoff][["product_id", "forecast", "p10", "p90"]], on="product_id", how="left")
    assert m.forecast.notna().all(), "missing Kumo predictions"
    return m


def wape(g): return (g.forecast - g.actual).abs().sum() / g.actual.sum()
def bias(g): return (g.forecast - g.actual).sum() / g.actual.sum()
def total_err(g): return abs(g.forecast.sum() - g.actual.sum()) / g.actual.sum()


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    d = s.daily(); done = 0; new = []
    for cutoff in NEW_WINDOWS:
        p, done = kumo_for(cutoff, d, limit, done)
        if p is None:
            print("limited run stopped, no scores printed"); return
        new.append(p)
    raw = pd.concat([pd.read_csv(RES / "kumo_predictions_raw.csv", dtype={"product_id": str}), *new], ignore_index=True)
    raw.to_csv(RES / "bias_predictions_raw.csv", index=False)
    cuts = sorted(set(raw.fold))
    frames = {c: with_actuals(d, c, raw) for c in cuts}
    naive = pd.read_csv(RES / "seasonal_naive_predictions.csv", dtype={"product_id": str})
    rows, corrected = [], []
    for test, learn in LEARN.items():
        hist = pd.concat([frames[c] for c in learn], ignore_index=True)
        factors = (hist.groupby("segment").actual.sum() / hist.groupby("segment").forecast.sum()).to_dict()
        f = frames[test]; g = f.copy()
        for col in ["forecast", "p10", "p90"]: g[col] = f[col] * g.segment.map(factors)
        corrected.append(g)
        n = naive[naive.fold == test]
        row = {"window": test, "factor_top": round(factors["top"], 3), "factor_tail": round(factors["tail"], 3)}
        for name, df in [("raw", f), ("fixed", g)]:
            t = df[df.segment == "top"]
            row[f"bias_top_{name}"] = round(bias(t), 4); row[f"wape_top_{name}"] = round(wape(t), 4); row[f"total_err_{name}"] = round(total_err(df), 4)
        row["total_err_baseline"] = round(total_err(n), 4)
        row["wape_top_baseline"] = round(wape(n[n.segment == "top"]), 4)
        rows.append(row)
    test_raw = pd.concat([frames[c] for c in LEARN], ignore_index=True); test_fix = pd.concat(corrected, ignore_index=True)
    r1 = sum(abs(r["bias_top_fixed"]) < abs(r["bias_top_raw"]) for r in rows)
    pooled = {seg: (round(wape(test_raw[test_raw.segment == seg]), 4), round(wape(test_fix[test_fix.segment == seg]), 4)) for seg in ("top", "tail")}
    r2 = all(fix <= raw_ for raw_, fix in pooled.values())
    r3 = sum(r["total_err_fixed"] < r["total_err_raw"] for r in rows)
    cover = lambda df: {seg: round(float(((x.actual >= x.p10) & (x.actual <= x.p90)).mean()), 3) for seg, x in df.groupby("segment")}
    vs_base = sum(1 - r["wape_top_fixed"] / r["wape_top_baseline"] >= 0.10 for r in rows)
    result = {"windows": rows, "pooled_wape_raw_vs_fixed": pooled, "rule1_windows": int(r1), "rule2": bool(r2), "rule3_windows": int(r3), "passes": bool(r1 >= 2 and r2 and r3 >= 2), "coverage_raw": cover(test_raw), "coverage_fixed": cover(test_fix), "original_rule_windows_clearing_10pct_fixed": int(vs_base)}
    (RES / "bias_scores.json").write_text(json.dumps(result, indent=1))
    print(json.dumps(result, indent=1))


main()
