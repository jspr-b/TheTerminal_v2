---
fest_type: task
fest_id: 03_ontology_service.md
fest_name: ontology service
fest_parent: 01_backend_foundation
fest_order: 3
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-09T20:10:33.754093+01:00
fest_tracking: true
---

# Task: ontology service

## Objective

Route all data access through OntologyService.

## Requirements

- [ ] Every method takes merchant_id

## Implementation

backend_v2/app/ontology.py with reads and upserts.

## Done When

- [ ] All requirements met
- [ ] Isolation tests pass and were seen to fail with the check removed
