"""Score Kumo with the shared module and apply PASS_RULE.md. Makes no API calls."""
import pathlib, sys
sys.path.append(str(pathlib.Path(__file__).resolve().parent))
import pandas as pd
import scoring as s

RES = s.ROOT / "data/results"
d = s.daily(); cutoffs, h = s.folds()
raw = pd.read_csv(RES / "kumo_predictions_raw.csv", dtype={"product_id": str})
frames = []
for c in cutoffs:
    f = s.frame(d, c, h); f["fold"] = c.strftime("%Y-%m-%d")
    frames.append(f.merge(raw[raw.fold == f.fold.iloc[0]][["product_id","forecast","p10","p90"]], on="product_id", how="left"))
kumo = pd.concat(frames, ignore_index=True)
assert kumo.forecast.notna().all(), "missing Kumo predictions"
kumo.to_csv(RES / "kumo_predictions.csv", index=False)
sc = s.score(kumo); sc.to_csv(RES / "kumo_scores.csv", index=False)

models = {"kumo": kumo, "seasonal_naive": pd.read_csv(RES / "seasonal_naive_predictions.csv", dtype={"product_id": str})}
p = RES / "old_model_predictions.csv"
if p.exists(): models["old_model"] = pd.read_csv(p, dtype={"product_id": str})
bases = [m for m in models if m != "kumo"]
print("baselines:", bases)
tab = pd.concat([s.score(v).assign(model=k) for k, v in models.items()], ignore_index=True)
print(tab.pivot_table(index=["fold","segment"], columns="model", values="wape").round(3).to_string())
print("\nBias"); print(tab.pivot_table(index=["fold","segment"], columns="model", values="bias").round(3).to_string())

wins = 0
for fold in sorted(kumo.fold.unique()):
    w = tab[(tab.fold == fold) & (tab.segment == "top")].set_index("model").wape
    best = w[bases].min(); cut = 1 - w["kumo"] / best; ok = cut >= 0.10; wins += int(ok)
    print(f"{fold} top sellers: kumo {w['kumo']:.3f} vs best baseline {best:.3f} ({w[bases].idxmin()}), {cut:+.1%} lower, pass={ok}")
pool = lambda df: (df[df.segment == "tail"].forecast - df[df.segment == "tail"].actual).abs().sum() / df[df.segment == "tail"].actual.sum()
tail = {k: pool(v) for k, v in models.items()}; best_tail = min(tail[b] for b in bases)
print("pooled tail WAPE:", {k: round(v, 3) for k, v in tail.items()})
r1, r2 = wins >= 2, tail["kumo"] <= best_tail
print(f"Rule 1 (2 of 3 folds): {wins}/3 -> {r1}; Rule 2 (tail not worse): {r2}; PASS = {r1 and r2}")
cov = ((kumo.actual >= kumo.p10) & (kumo.actual <= kumo.p90)).groupby(kumo.segment).mean().round(3).to_dict()
print("share of actuals inside p10-p90 (target 0.80):", cov)
