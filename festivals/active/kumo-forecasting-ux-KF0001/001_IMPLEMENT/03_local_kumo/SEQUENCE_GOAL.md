---
fest_working_dir: backend_v2
fest_type: sequence
fest_id: 03_local_kumo
fest_name: local_kumo
fest_parent: 001_IMPLEMENT
fest_order: 3
fest_status: pending
fest_created: 2026-11-16T23:46:42.638453+01:00
fest_tracking: true
---

# Sequence: local kumo

## Goal

Run Kumo on our own servers from open weights, behind the same interface as hosted Kumo.

## Deliverables

- LocalKumo forecaster
- Daily runs after each sync
- Age-based staleness

## Depends on

prediction_map/runtime_decision
