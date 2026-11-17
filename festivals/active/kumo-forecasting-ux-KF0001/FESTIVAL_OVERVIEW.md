# Kumo forecasting and the Command UX

## Problem

The Command map shows Shopify stock and one Kumo number: 14-day demand per product. Kumo can do far
more (yes/no, multiclass, ranking, per-day forecasts), and it can run on our own servers from open
weights. The UX shows one range in a table and has no timeline, product page or customers page.

## Target

All Shopify ideas #1-#12 that Kumo can serve, built behind the existing rules, with a UX that
makes uncertainty clear instead of hiding it.

## Scope

- Map each idea to a Kumo task type and Kumo model (Relational, Tabular, Forecast, Anomaly); decide hosted versus local Kumo (01).
- Clickable mockups first, including Command heatmaps and the page feature list; owner approval before any build (02).
- Local Kumo, scheduled runs, age-based staleness (03).
- One backtest tool, a claims register and a test of city and store totals (04).
- Per-day demand and the timeline (05), sell-out risk #3 (06), per-location demand #2 (07),
  returns #5 and #6 (08), delivery delay #4 (09), customer predictions #9, #10, #12, #7, #11 (10).
- Build the approved screens, including the heatmap filters (11).

## Not included

Other apps (#13-#42), advice or automatic actions, horizons over 14 days, the hosted database
without the owner's say-so.

## Phases

### 001_IMPLEMENT

Eleven sequences, in order. 02 blocks 11. 03 blocks the prediction sequences.

## Notes

- Builds on SM0001: Kumo request builder, forecast route, stale state, REA bundle gate.
- Local Kumo tried 2026-11-16 on made-up data: 40 products in 1.4 s on CPU. Not evidence of accuracy.
- Blocked on the owner: OpenMDW-1.1 licence read, D016 decision, a pilot store, #7 horizon.
