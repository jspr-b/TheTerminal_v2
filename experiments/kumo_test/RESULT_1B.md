# #1 low-bias correction result (2026-11-09)

**Fails the rule in `PASS_RULE_1B.md`. Do not apply a multiplier to Kumo's forecasts.**
Keep the raw forecast, and keep using the top of the range for stock decisions.

Online Retail II, three 14-day test windows. Lower error is better.

| Window | Top-seller bias raw | Fixed | Top-seller WAPE raw | Fixed | Baseline | Store total error raw | Fixed | Baseline |
|---|---|---|---|---|---|---|---|---|
| 2011-09-30 | -16.4% | +10.6% | 51.8% | 57.9% | 57.6% | 21.1% | 21.6% | 8.9% |
| 2011-10-28 | -22.4% | +1.9% | 47.0% | 48.0% | 53.3% | 22.9% | 12.5% | 13.5% |
| 2011-11-25 | +2.4% | +27.5% | 46.1% | 56.8% | 47.2% | 5.9% | 20.3% | 4.5% |

| Rule | Result |
|---|---|
| 1. Smaller top-seller bias in at least 2 of 3 windows | Met, 2 of 3 |
| 2. Pooled WAPE not worse, top sellers and long tail | Not met: top 48.1% to 53.9%, long tail 66.1% to 88.7% |
| 3. Smaller store total error in at least 2 of 3 windows | Not met, 1 of 3 |

Range coverage (actuals inside 10th to 90th percentile, target 80%): top sellers 80.5% raw, 77.7% fixed; long tail 86.5% raw, 84.8% fixed.

## What this means
- The low bias is not steady. The learned multipliers were about 1.25 to 1.32 on top sellers and 1.4 to 2.1 on the long tail, but the last window had almost no bias, so the correction overshot.
- With the correction, Kumo no longer beats the baseline by 10% in any window.
- The whole-store total stays a weak spot. Do not add product forecasts into store totals.

## Limits
One shop, 2011, wholesale buyers, three windows. One configuration, not tuned.
