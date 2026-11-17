---
fest_type: task
fest_id: 01_import_fulfillments.md
fest_name: import_fulfillments
fest_parent: 07_location_demand
fest_order: 1
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.836372+01:00
fest_tracking: true
---

# Task: import fulfillments

## Objective

Import Shopify fulfillments through Nango.

## Requirements

- [ ] Nango sync function for fulfillments and their events
- [ ] Upsert on (merchant_id, source, external_id)
- [ ] City level only
- [ ] Deliveries to customers only: transfers between our own locations and supplier shipments
      are not drawn on the map

## Implementation

Also gives the map its delivery lines: our location to the customer's city or region.

## Done When

- [ ] All requirements met
- [ ] Dev store fulfillments in the local database
- [ ] Isolation test
