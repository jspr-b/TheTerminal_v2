# Pass rule (written before any Kumo score existed, 2026-11-08)

Kumo passes if both hold, on the 14-day units forecast per product:

1. WAPE is at least 10% lower than the best baseline on top sellers in at least 2 of 3 folds.
2. WAPE is not worse than the best baseline on the long tail (compared over all folds' pooled error).

- "Best baseline" is chosen per fold and segment, from the baselines that ran.
- Top sellers: top 20% of products by units in the 90 days before the cut-off, so no future data decides the split.
- Products scored: any product with at least one sale in the 90 days before the cut-off.
- One Kumo configuration, set before reading scores. Fixes for request errors are allowed. Changes made after seeing a score are reported as a separate, non-counting run.
