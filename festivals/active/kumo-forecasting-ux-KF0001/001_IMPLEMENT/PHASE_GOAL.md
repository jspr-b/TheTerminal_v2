---
fest_type: phase
fest_id: 001_IMPLEMENT
fest_name: IMPLEMENT
fest_parent: kumo-forecasting-ux-KF0001
fest_order: 1
fest_status: pending
fest_created: 2026-11-16T23:45:43.553101+01:00
fest_phase_type: implementation
fest_tracking: true
---

# Phase Goal: 001_IMPLEMENT

## Goal

Decide, mock up, then build every Shopify prediction Kumo can serve, and the screens that show them.

## Sequences

1. 01_prediction_map: idea to task type, runtime decision, too-few-sales threshold.
2. 02_ux_mockups: timeline, product page, customers page, states sheet. Stop for approval.
3. 03_local_kumo: open-weights Kumo, scheduled runs, staleness by age.
4. 04_backtest_tool: one tool, pass rules first, claims register.
5. 05_daily_demand: per-day forecasts and the stock curve.
6. 06_sellout_risk: #3 as low, medium or high.
7. 07_location_demand: fulfillments import and #2.
8. 08_returns: refunds import, #5 and #6.
9. 09_delivery_delay: #4 by lane.
10. 10_customer_predictions: #9, #10, #12; #7 and #11 by decision.
11. 11_ux_build: the approved screens on real endpoints.

## Done when

All sequence gates pass, the owner approved every screen, and each prediction has a written pass or fail.
