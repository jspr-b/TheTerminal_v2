---
fest_type: task
fest_id: 01_command_timeline.md
fest_name: command_timeline
fest_parent: 02_ux_mockups
fest_order: 1
fest_status: completed
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.615445+01:00
fest_updated: 2026-11-17T00:52:17.34901+01:00
fest_tracking: true
---


# Task: command timeline

## Objective

Command map with the day 0-14 timeline driven by per-day forecasts.

## Requirements

- [x] Slider covers day 0-14 and fires no request per step
- [x] Stock on day N shown as a range (our math on the Kumo range)
- [x] Keeps the 3D globe, sidebar, breadcrumb, right panel and product drawer

## Implementation

Extend docs/mockups/command-map.html. Owner prefers the real globe; the mockup shows panels and drawer.

## Done When

- [x] All requirements met
- [ ] Owner has clicked through it

## Findings (2026-11-16)

Built in docs/mockups/command-map.html and opened in a browser at 1440x900.

- Each product carries 14 per-day ranges (made up from a weekly shape, adding up to its 14-day range).
  Stock after day N = today's stock minus the days so far, low end from the top of the range.
- Picking a product draws its stock band above the slider, on the same scale as the day ticks
  (marker, thumb and tick within 0.03px). "Could run out day N" sits where the low end reaches zero.
- Panel shows "Will sell on day N" (Kumo) and "Stock after day N" (our math); day 0 is exact Shopify stock.
- A location pulses when a product there could be out by the chosen day. Colour is still the 14-day risk.
- Slider: arrows, Home, End, and a spoken value such as "Day 5, Sat 21 Nov".
- Stepping through all days and products: 0 fetch or XHR calls, 0 new resources, 0 script errors, 0 overlapping labels.
- Stale (Leather Belt) draws grey and dashed; too few sales (Limited Print) draws no band.
- The map is still the flat stand-in; the mock chip says the app keeps the 3D globe.

Not settled here, for 05_daily_demand/02_stock_curve: adding daily highs together makes the stock range
wider than the true one. The mockup shows the shape, not the final math.

### Added 2026-11-17

- The owner said of this mockup: "some of the features are not necessary, I only want output of Kumo".
  A second version without anything we calculate is at docs/mockups/command-map-kumo-only.html
  (per-day Kumo range bars above the slider, no stock band, no risk, no "could run out"). It was
  stepped through in a browser with no script errors. docs/pages.md, written after that remark, keeps
  the our-math features, so command-map.html is the default. The owner picks one at 07_owner_approval.
- Sidebar now lists Command, Products, Customers, Connections (docs/pages.md) and links the mockups.
- "Owner has clicked through it" is left open here and collected in 07_owner_approval.