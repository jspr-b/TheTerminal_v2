---
fest_type: festival
fest_id: KF0001
fest_name: kumo-forecasting-ux
fest_status: active
fest_created: 2026-11-16T23:45:43.543148+01:00
fest_updated: 2026-11-17T00:47:36.893036+01:00
fest_tracking: true
---



# Festival Goal: Kumo forecasting and the Command UX

## Goal

Serve every Shopify prediction Kumo can do (#1-#12 in CLAUDE.md) and show them in a clear,
honest Command UX: the 3D globe, a day 0-14 timeline, a product page and a customers page.

## End state

A logged-in merchant sees, for the next 14 days and only from their own Shopify data: demand per
product and per location, how stock drops day by day, sell-out risk, returns, delivery delay and
customer bands. Every number says where it comes from (Shopify, Kumo or our math), every forecast
is a range or a low/medium/high band, and every state (fresh, stale, too few sales) is shown plainly.

## Success criteria

- Every prediction has a pass rule written before scoring and a backtest result in experiments/.
- Claims shown to merchants come only from the claims register, never from the dev store.
- Every new route and table has a test proving merchant A cannot reach merchant B.
- Every screen was a mockup the owner approved before it was built.
- The shipped bundle passes the REA audit gate.

## Phases

- 001_IMPLEMENT: prediction map, mockups, local Kumo, backtest tool, the Shopify predictions, UX build.

## Out of scope

- Ads, payments and Gorgias predictions (#13-#42): later festivals, one app at a time.
- Recommendations about reordering or money, approve buttons, anything carried out automatically.
- Horizons over 14 days.