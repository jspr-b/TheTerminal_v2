---
fest_type: task
fest_id: 01_multi_step_forecast.md
fest_name: multi_step_forecast
fest_parent: 05_daily_demand
fest_order: 1
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.74919+01:00
fest_tracking: true
---

# Task: multi step forecast

## Objective

Kumo forecasting with 14 steps of 1 day per product.

## Requirements

- [ ] Each step only sees data before its own anchor
- [ ] Range per day from the 0.1 and 0.9 quantiles
- [ ] Not summed into a store total

## Implementation

Kumo multi-step forecasting (step_size 1 day, 14 forecasts).

## Done When

- [ ] All requirements met
- [ ] Tests prove no future data in any step
