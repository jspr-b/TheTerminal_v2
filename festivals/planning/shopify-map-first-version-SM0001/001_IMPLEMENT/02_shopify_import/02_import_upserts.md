---
fest_type: task
fest_id: 02_import_upserts.md
fest_name: import upserts
fest_parent: 02_shopify_import
fest_order: 2
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-09T20:10:34.496649+01:00
fest_tracking: true
---

# Task: import upserts

## Objective

Map Shopify records into the schema.

## Requirements

- [ ] Upsert on (merchant_id, source, external_id)
- [ ] Keep platform timestamps
- [ ] No names, emails or street addresses in customer rows

## Implementation

backend_v2/app/importer.py in dependency order.

## Done When

- [ ] All requirements met
- [ ] A second import adds no rows
