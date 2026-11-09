# Pass rule for the #1 low-bias correction (written before any corrected score, 2026-11-09)

Kumo's uncorrected forecasts and the simple baseline were already scored (RESULT.md).
The correction itself has not been scored.

Data: Online Retail II, the same three test windows as RESULT.md
(2011-09-30, 2011-10-28, 2011-11-25, 14 days each).

Correction: one multiplier per segment (top sellers, long tail) = total actual units
divided by total forecast units, learned from the two most recent earlier windows that
ended on or before the test cut-off:

| Test window | Learned from |
|---|---|
| 2011-09-30 | 2011-08-05, 2011-09-02 |
| 2011-10-28 | 2011-09-02, 2011-09-30 |
| 2011-11-25 | 2011-09-30, 2011-10-28 |

The multiplier applies to the forecast and to both ends of the range. Segments use only
data before each cut-off.

The correction passes if all three hold:
1. Absolute bias on top sellers is smaller than uncorrected in at least 2 of 3 windows.
2. WAPE over all windows pooled is not worse than uncorrected, for top sellers and for the long tail.
3. Absolute error on the whole-store total is smaller than uncorrected in at least 2 of 3 windows.

Also reported, not part of the pass: the original PASS_RULE.md comparison against the
simple baseline, range coverage, and store-total error against the baseline.

One configuration. Changes made after seeing a score are reported as a separate,
non-counting run.
