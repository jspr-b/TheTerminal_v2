# Festival TODO - Kumo forecasting and the Command UX

**Goal**: Every Shopify prediction Kumo can serve, in a clear Command UX.
**Status**: Planning

---

## Phase Progress

### 001_IMPLEMENT

**Status**: Not Started

- [ ] 01_prediction_map
- [ ] 02_ux_mockups (owner approval blocks 11)
- [ ] 03_local_kumo
- [ ] 04_backtest_tool
- [ ] 05_daily_demand
- [ ] 06_sellout_risk
- [ ] 07_location_demand
- [ ] 08_returns
- [ ] 09_delivery_delay
- [ ] 10_customer_predictions
- [ ] 11_ux_build

---

## Blockers

- Owner: OpenMDW-1.1 licence and D016 (hosted or local Kumo for real merchant data).
- Owner: a pilot store for #3 and for any accuracy claim.
- Owner: #7 horizon decision.
- Owner: licence check for Kumo Tabular, Forecast and Anomaly (01/04).
- Owner: demand heatmap, one product at a time or wait for the totals test (04/03).
- Owner: approve docs/pages.md and the heatmap mockup (02/05, 02/06).
- No backend_v2/.env on this machine: no live Nango import or hosted Kumo run here.

---

## Decision Log

- 2026-11-16: Shopify only; other apps get their own festivals.
- 2026-11-16: Keep the 3D globe; mockups are for panels, drawer and pages.
- 2026-11-17: Map draws deliveries to customers only; no internal transfers or supplier routes.
- 2026-11-17: Command gets heatmap filters (orders, demand, returns, delays, first-time buyers).
- 2026-11-17: Kumo is four models; each prediction picks one (01/04).
- 2026-11-17: Merchant-facing pages listed in docs/pages.md, no API detail.
