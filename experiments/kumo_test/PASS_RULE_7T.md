# Pass rule for #7 with Kumo Tabular (written before any score, 2026-11-17)

Same question, data, cut-offs, horizons, baselines and pass rule as `PASS_RULE_7.md`.
Only the model changes: Kumo Tabular instead of Kumo Relational.

Why: Kumo Relational lost to the logistic regression in 6 of 6 comparisons (`RESULT_7.md`, run 2).
The logistic regression sees one flat row per customer. Kumo Tabular reads the same flat row, so this
is the like-for-like test.

Setup, fixed now:
- One row per customer per anchor date: country plus the 7 numbers in `churn.py` (`FEATS`).
  No order history table, no anchor date column.
- Past examples picked exactly as in `RESULT_7.md` run 2: any customer active at the past date,
  same offsets, same hash order, at most 1,000 per call, 160 customers scored per call.
- Label "yes" = no order in the next H days.
- The logistic baseline trains on the same past examples Kumo sees, as before.

Kumo Tabular passes for an H if both hold:
1. AUC at least 0.02 higher than the best baseline in at least 2 of 3 cut-offs.
2. Brier score over all cut-offs pooled is not worse than the logistic regression.

Even a pass at 14 days does not mean #7 ships: at 14 days about 82% of customers "stop", which is
mostly quiet fortnights. The 90-day result decides whether #7 is worth a horizon discussion.
One configuration. Request-error fixes allowed; anything changed after seeing scores is a separate,
non-counting run.
