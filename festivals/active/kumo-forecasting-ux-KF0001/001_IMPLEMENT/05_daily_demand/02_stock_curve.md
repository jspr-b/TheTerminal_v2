---
fest_type: task
fest_id: 02_stock_curve.md
fest_name: stock_curve
fest_parent: 05_daily_demand
fest_order: 2
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.749503+01:00
fest_tracking: true
---

# Task: stock curve

## Objective

Stock on each day as a range, using the top of the range for running out.

## Requirements

- [ ] Exact Shopify stock is never predicted, only what is left after demand
- [ ] Labelled 'our math'

## Implementation

Kumo runs low, so the low end of stock uses the top of demand.

## Done When

- [ ] All requirements met
- [ ] Unit tests for the curve
