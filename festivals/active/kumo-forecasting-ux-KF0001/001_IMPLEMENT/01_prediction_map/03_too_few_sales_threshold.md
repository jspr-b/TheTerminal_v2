---
fest_type: task
fest_id: 03_too_few_sales_threshold.md
fest_name: too_few_sales_threshold
fest_parent: 01_prediction_map
fest_order: 3
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.56498+01:00
fest_tracking: true
---

# Task: too few sales threshold

## Objective

Set the minimum sales before a product gets a number.

## Requirements

- [ ] Threshold chosen from backtest error by order count, not guessed
- [ ] Same threshold in backend and on screen

## Implementation

Provisional today: 3 orders in 56 days (backend_v2/app/forecast.py). Early sign: 0-2 orders had 181% error.

## Done When

- [ ] All requirements met
- [ ] PLAN.md 'Still open' item closed
