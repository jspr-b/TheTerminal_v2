---
fest_type: task
fest_id: 03_scheduled_runs.md
fest_name: scheduled_runs
fest_parent: 03_local_kumo
fest_order: 3
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.661713+01:00
fest_tracking: true
---

# Task: scheduled runs

## Objective

Forecasts refresh on their own and go stale by age.

## Requirements

- [ ] Run after each successful import and once a day
- [ ] Stale when the last good run is older than an agreed age, and say so
- [ ] Runs survive a server restart (no in-process background task)

## Implementation

kumo_runs.trigger already allows schedule and sync_done.

## Done When

- [ ] All requirements met
- [ ] Tests cover the age rule and the trigger
