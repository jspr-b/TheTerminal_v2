---
fest_type: task
fest_id: 02_runtime_decision.md
fest_name: runtime_decision
fest_parent: 01_prediction_map
fest_order: 2
fest_status: blocked
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.564685+01:00
fest_updated: 2026-11-17T00:47:41.417483+01:00
fest_tracking: true
---


# Task: runtime decision

## Objective

Choose hosted Kumo, local open weights, or both.

## Requirements

- [ ] Owner reads the OpenMDW-1.1 licence for commercial use of nvidia/Kumo-Relational
- [ ] D016 is updated: where real merchant data is sent, or that it stays on our servers
- [ ] Kumo only, no fallback model, either way

## Implementation

Local weights run on a laptop CPU in seconds (tried 2026-11-16, made-up data). Hosted needs an NVIDIA key.

## Done When

- [ ] All requirements met
- [ ] Decision written in festivals/PLAN.md and signed off by the owner