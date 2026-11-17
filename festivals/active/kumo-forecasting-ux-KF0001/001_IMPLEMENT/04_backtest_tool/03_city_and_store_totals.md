---
fest_type: task
fest_id: 03_city_and_store_totals.md
fest_name: city and store totals
fest_parent: 04_backtest_tool
fest_order: 3
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-17T00:44:30.984924+01:00
fest_tracking: true
---

# Task: city and store totals

## Objective

Find out if any Kumo total is good enough to show: demand per city (for the demand heatmap) and
store totals (later money and support pages).

## Requirements

- [ ] Compare on the same windows: summed Relational per-product ranges, Kumo Forecast on the daily
      total, and the seasonal baseline
- [ ] Also measure how often actuals land inside each range
- [ ] Pass rule written before the run (experiments/kumo_test/PASS_RULE.md style)
- [ ] If nothing passes, the demand heatmap shows one product at a time and no totals are shown

## Implementation

Uses the 01_unified_tool. Kumo Forecast only after 01_prediction_map/04 licence sign-off.

## Done When

- [ ] Result written to experiments/ with the pass or fail
- [ ] claims register updated
