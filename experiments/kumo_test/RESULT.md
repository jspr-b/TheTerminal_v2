# Kumo test result (2026-11-08)

Passes the rule in `PASS_RULE.md`, narrowly. Kumo was already chosen (D019), so this describes it and does not gate it.

14-day units per product, one UK wholesaler, about 3,100 products per window. Lower error is better.

| Test window starts | Top sellers: Kumo | Simple baseline | Old model | Long tail: Kumo | Simple baseline | Old model |
|---|---|---|---|---|---|---|
| 2011-09-30 | 51.7% | 57.6% | 83.5% | 64.9% | 68.9% | 152.1% |
| 2011-10-28 | 47.0% | 53.3% | 85.2% | 62.7% | 67.3% | 134.5% |
| 2011-11-25 | 46.1% | 47.2% | 85.5% | 70.1% | 73.5% | 126.8% |

- Top sellers: 10.2%, 11.8% and 2.4% lower error than the simple baseline. Two of three windows clear 10%, the first only just.
- Long tail, all windows pooled: 66.1% against 70.0%.
- Weak spot: it forecasts too low. Top-seller bias was -16.4%, -22.4% and +2.4%; long tail -24% to -31%. The simple baseline is less biased on top sellers. Too-low forecasts mean under-ordering, so stock decisions should use the upper range, not the middle.
- Ranges are usable: actuals fell inside the 10th to 90th percentile 80.5% of the time on top sellers and 86.5% on the long tail (target 80%).
- The old model has a flaw: at forecast time it fills rolling and lag inputs with zeros. Its scores show that flaw, so beating it says little.
- Limits: one shop, 2011, wholesale buyers, no stock data, three windows. One configuration, run once; nothing was tuned on these scores.

## Follow-up: unreliable or unpredictable? (no new Kumo calls)

Absolute error, Kumo against the simple baseline, for windows starting 2011-09-30, 10-28 and 11-25:

| Level | Kumo | Simple baseline |
|---|---|---|
| Whole store total | 21.1%, 22.9%, 5.9% | 8.9%, 13.5%, 4.5% |
| Product family (first 3 code digits) | 26.9%, 23.9%, 18.3% | 24.7%, 21.0%, 18.4% |
| Top 50 products | 42.5%, 47.2%, 37.4% | 45.5%, 54.3%, 34.6% |

Kumo wins per product but is worse on store totals, because its low bias adds up across products.

Error by number of separate orders a product received in the window (diagnostic only, it uses test-window information): 0-2 orders 181%, 3-9 79%, 10-29 54%, 30+ 42%. One large invoice made up at least half of a top seller's window for 10-18% of top sellers, and those products account for 15-24% of top-seller error.
