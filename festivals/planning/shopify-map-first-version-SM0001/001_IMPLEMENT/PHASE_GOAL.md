---
fest_type: phase
fest_id: 001_IMPLEMENT
fest_name: IMPLEMENT
fest_parent: shopify-map-first-version-SM0001
fest_order: 1
fest_status: pending
fest_created: 2026-11-09T20:10:20.062698+01:00
fest_phase_type: implementation
fest_tracking: true
---

# Phase Goal: 001_IMPLEMENT

## Goal

Build the backend and import, retest demand, and produce the map mockup.

## Sequences

1. 01_backend_foundation: service, login, OntologyService.
2. 02_shopify_import: Nango client, upserts, import route.
3. 03_demand_retest: #1 with a new pass rule.
4. 04_map_mockup: clickable mockup, then stop for approval.

## Done when

All tests pass and the owner has the mockup.
