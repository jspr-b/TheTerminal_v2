---
fest_type: task
fest_id: 01_unified_tool.md
fest_name: unified_tool
fest_parent: 04_backtest_tool
fest_order: 1
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.705696+01:00
fest_tracking: true
---

# Task: unified tool

## Objective

One command runs any prediction against its baseline over set folds.

## Requirements

- [ ] Pass rule file must exist before scoring runs
- [ ] Baseline chosen per prediction
- [ ] Outputs WAPE or AUC, bias and range coverage

## Implementation

Bring over experiments/kumo_test/scoring.py logic.

## Done When

- [ ] All requirements met
- [ ] #1 rerun reproduces RESULT.md
