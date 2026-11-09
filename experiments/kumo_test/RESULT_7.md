# #7 result, customers likely to stop buying (2026-11-09)

**Fails the rule in `PASS_RULE_7.md`, at both 90 and 14 days.** Do not ship #7 on this evidence.

One UK gift wholesaler, 2011, 1,596 to 1,986 customers per cut-off. Higher AUC is better.
Kumo needed to beat the best baseline by 0.02 in 2 of 3 cut-offs.

## Run 1 (the counting run): flawed
Fails, but the setup was wrong. Past examples came only from customers still active
at the cut-off, so the most recent ones could not have stopped. Kumo and the logistic
baseline both trained on this. At 90 days Kumo predicted a 12-24% stop rate against
31-45% actual.

| H | Kumo AUC | Best baseline AUC | Cut-offs clearing 0.02 | Brier Kumo / logistic |
|---|---|---|---|---|
| 90 | 0.717, 0.738, 0.690 | 0.781, 0.778, 0.770 | 0 of 3 | 0.256 / 0.220 |
| 14 | 0.739, 0.722, 0.710 | 0.766, 0.767, 0.744 | 0 of 3 | 0.131 / 0.124 |

## Run 2 (corrected, non-counting because the fix came after seeing scores)
Past examples now come from any customer active at that past date.

| H | Kumo AUC | Best baseline AUC (logistic) | Gain | Brier Kumo / logistic |
|---|---|---|---|---|
| 90 | 0.754, 0.757, 0.742 | 0.778, 0.781, 0.774 | -0.024, -0.025, -0.032 | 0.201 / 0.194 |
| 14 | 0.780, 0.750, 0.737 | 0.785, 0.776, 0.750 | -0.005, -0.026, -0.012 | 0.123 / 0.122 |

Kumo lost to the logistic regression in all 6 comparisons. It was close, and it beat
every rule-of-thumb baseline at 14 days. At 90 days, low frequency beat it at all three
cut-offs (0.762 vs 0.754, 0.765 vs 0.757, 0.754 vs 0.742).

## Limits
- One shop, 2011, wholesale buyers. A consumer Shopify store may behave differently.
- Kumo saw at most 1,000 past examples per call (NVIDIA's default limit). The logistic
  regression trained on all past examples across batches, which favours it.
- Run 2 stop rates at 90 days: Kumo averaged 0.41, 0.48, 0.45 against actual 0.41, 0.45, 0.31.
- One configuration, not tuned.

## What 14 days means here
At 14 days about 82% of active customers "stop", mostly because they just did not order
that fortnight. That is not churn. A useful #7 needs about 90 days, which the 14-day
horizon rule does not allow. The owner has to decide this if #7 is retested.
