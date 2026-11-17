---
fest_type: task
fest_id: 05_command_heatmaps.md
fest_name: command heatmaps
fest_parent: 02_ux_mockups
fest_order: 5
fest_status: blocked
fest_autonomy: medium
fest_created: 2026-11-17T00:44:30.957407+01:00
fest_updated: 2026-11-17T00:52:22.249258+01:00
fest_tracking: true
---


# Task: command heatmaps

## Objective

Heatmap filters on the Command globe, one at a time, each with its own colour and source chip.

## Requirements

- [x] Filters: orders last 14 days (Shopify, exact), demand next 14 days (Kumo range on hover),
      returns likely, delivery delays likely, first-time buyers coming back (Kumo bands)
- [x] City level only; cities under 5 orders left off
- [x] Legend says what the colours mean; right panel lists the top cities for the chosen filter
- [x] Low bands weighted so several low cities cannot add up to look high
- [ ] Demand heatmap settled: it adds product forecasts per city, which CLAUDE.md rules out.
      Either one product at a time, or wait for 04_backtest_tool/03_city_and_store_totals

## Implementation

Built in docs/mockups/command-heatmaps.html on the real Mapbox globe (token passed as ?token=, not stored).

## Done When

- [x] Opened in a browser: all five filters switch, panel updates, no script errors
- [ ] Owner has clicked through it

## Findings (2026-11-17)

- First version: three "low" cities close together read as a "high" hotspot. Fixed with band weights
  0.08 / 0.5 / 1.
- Only the orders heatmap has real data at launch; the others wait on 08 (returns), 09 (delays) and
  10 (first-time buyers).
- Deliveries are to customers only: no transfers between locations, no supplier routes.