"""Seasonal naive: each future day = average of the same weekday over the previous 4 weeks.
Summed over 14 days this equals (units in the last 28 days) / 2."""
import pathlib, sys
sys.path.append(str(pathlib.Path(__file__).resolve().parent))
import pandas as pd
import scoring as s

d = s.daily(); cutoffs, h = s.folds(); out = []
for c in cutoffs:
    f = s.frame(d, c, h)
    last28 = d[(d.date < c) & (d.date >= c - pd.Timedelta(days=28))].groupby("product_id").units.sum()
    f["forecast"] = f.product_id.map(last28).fillna(0.0) / 2.0
    f["fold"] = c.strftime("%Y-%m-%d")
    out.append(f)
df = pd.concat(out, ignore_index=True)
res = s.ROOT / "data/results"; res.mkdir(exist_ok=True)
df.to_csv(res / "seasonal_naive_predictions.csv", index=False)
sc = s.score(df); sc.to_csv(res / "seasonal_naive_scores.csv", index=False)
print(sc.round(3).to_string())
