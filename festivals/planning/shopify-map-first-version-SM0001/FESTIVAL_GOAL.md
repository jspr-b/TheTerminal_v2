---
fest_type: festival
fest_id: SM0001
fest_name: shopify-map-first-version
fest_status: planning
fest_created: 2026-11-09T20:10:20.059262+01:00
fest_tracking: true
---

# Festival Goal: Shopify and map, first version

## Goal

Get Shopify data into the new backend and put the Command map on real data.

## End state

A logged-in merchant's Shopify data is imported into backend_v2 through Nango and served only to that merchant. The demand forecast has been retested. A clickable map mockup is ready for the owner.

## Success criteria

- Every merchant route requires login, and tests prove merchant A cannot reach merchant B.
- A second import adds no duplicates.
- Customer rows hold no names, emails or street addresses.
- The #1 retest has a pass rule written before scoring.

## Phases

- 001_IMPLEMENT: backend, import, retest, mockup, Nango, Kumo forecasts, Command API, Command frontend.

## Decided on 2026-11-09

- Kumo is decided. Backtests inform what we claim and do not block building.
- The first map shows only what Shopify knows.
- Command states what is happening: no recommendations about reordering or money, no approve buttons.

## Out of scope for now

- Building the real map before the owner approves the mockup.
- Ads, payments, Gorgias.
- #2 until the M5 data is available. #7 failed, see experiments/kumo_test/RESULT_7.md.
