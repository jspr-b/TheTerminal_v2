---
fest_type: task
fest_id: 02_product_page.md
fest_name: product_page
fest_parent: 02_ux_mockups
fest_order: 2
fest_status: completed
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.615807+01:00
fest_updated: 2026-11-17T00:52:17.475092+01:00
fest_tracking: true
---


# Task: product page

## Objective

One page per product: stock, 14-day range, per-day curve, sell-out risk, returns.

## Requirements

- [x] Every number has its source chip: Shopify, Kumo or our math
- [x] Stale and too-few-sales states shown
- [x] No reorder or money advice, no approve buttons

## Implementation

Sidebar left, breadcrumb on top, content right. No tabs.

## Done When

- [x] All requirements met
- [ ] Owner has clicked through it

## Findings (2026-11-17)

Built docs/mockups/products.html: the Products table and the product page in one file. Opened in a
browser at 1440x900.

- Table: stock (Shopify), will sell in 14 days (Kumo), sell-out risk (our math), likely to come back
  (Kumo, units as a range). Filters for location, risk band and product type are dropdowns, not tabs.
- Product page: five facts with chips, a per-day chart (Kumo range bars, stock band from our math), a
  day picker, "Show as table" with the same numbers, per location rows, "what customers usually buy next".
- States checked: Leather Belt is stale (notice with the date, tags on every Kumo and our-math value),
  Limited Print has too few sales (stock only, no numbers, no chart).
- Bars and day labels line up within 0.06px. Arrow keys, Home and End move the day and keep focus.
- No script errors. No advice wording, no buttons that act.
- Not checked: screen sizes other than 1440x900, a real screen reader.
- Per-location ranges are the product range split by made-up shares; the real ones are their own Kumo
  run (07_location_demand).
- "Owner has clicked through it" is left open here and collected in 07_owner_approval.