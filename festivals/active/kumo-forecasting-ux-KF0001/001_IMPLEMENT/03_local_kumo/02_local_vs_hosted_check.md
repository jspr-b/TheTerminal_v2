---
fest_type: task
fest_id: 02_local_vs_hosted_check.md
fest_name: local_vs_hosted_check
fest_parent: 03_local_kumo
fest_order: 2
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.661462+01:00
fest_tracking: true
---

# Task: local vs hosted check

## Objective

Show local and hosted Kumo agree on the UK wholesaler backtest.

## Requirements

- [ ] Same folds and pass rule as RESULT.md
- [ ] Report WAPE, bias and range coverage for both

## Implementation

experiments/kumo_test/ scripts. Data is gitignored; fetch it again if missing.

## Done When

- [ ] All requirements met
- [ ] Result file in experiments/kumo_test/
