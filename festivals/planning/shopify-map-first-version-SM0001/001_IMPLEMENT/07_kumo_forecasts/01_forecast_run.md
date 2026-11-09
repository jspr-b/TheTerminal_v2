---
fest_type: task
fest_id: 01_forecast_run.md
fest_name: forecast run
fest_parent: 07_kumo_forecasts
fest_order: 1
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-09T20:32:45.749486+01:00
fest_tracking: true
---

# Task: forecast run

## Objective

Build the Kumo request from imported orders.

## Requirements

- [ ] Only data before the prediction date
- [ ] No names, emails or street addresses
- [ ] Kumo only, no fallback

## Implementation

Reuse the payload shape in experiments/kumo_test/run_kumo.py.

## Done When

- [ ] All requirements met
- [ ] A run returns quantiles for dev store products
