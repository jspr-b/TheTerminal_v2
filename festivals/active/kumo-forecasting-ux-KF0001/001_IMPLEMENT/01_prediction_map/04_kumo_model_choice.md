---
fest_type: task
fest_id: 04_kumo_model_choice.md
fest_name: kumo model choice
fest_parent: 01_prediction_map
fest_order: 4
fest_status: pending
fest_autonomy: medium
fest_created: 2026-11-17T00:44:30.925087+01:00
fest_tracking: true
---

# Task: kumo model choice

## Objective

Pick one Kumo model per prediction. NVIDIA Kumo is four models; the map above used only Relational.

## Requirements

- [x] Each of #1-#12 names one model: Relational (linked tables), Tabular (one flat row per item),
      Forecast (a time series), or Anomaly (unusual events in a time series)
- [x] One model per prediction, no second model as backup (CLAUDE.md: Kumo only, no fallback)
- [ ] #7 retested with Tabular against the logistic-regression baseline that beat Relational (RESULT_7.md)
- [ ] Owner has read the licence cards: Relational and Tabular OpenMDW-1.1, Forecast Apache-2.0,
      Anomaly Apache-2.0 but README says research and development only. D008 updated to match
- [x] Kumo Forecast gives one value per day, no range: write down how a range would be made and tested
      before any Forecast output is shown

## Implementation

Source table: docs/kumo-integrations-map.md, "The four Kumo models". Write the choice per idea into
this file. Anomaly alerts (sales drop, refund spike, orders stopping) are listed as a later idea, not
built here.

## Model choice (proposal, 2026-11-17)

Rule used: the data shape decides. Linked tables -> Relational. Store-level series -> Forecast.
Tabular only where it has to beat a flat-feature baseline that Relational lost to.

| # | Prediction | Model | Why | Where |
|---|---|---|---|---|
| 1 | 14-day demand per product | Relational | Orders, lines and products linked; the only idea with a pass (RESULT.md) | Built (SM0001) |
| 1 per day | Per-day demand, stock curve | Relational | Per product, not a store total; Forecast would need one series per product and gives no range | 05 |
| 2 | Demand per product and location | Relational | Product x location entity, plus fulfillments | 07 |
| 3 | Sell-out risk | None (our math on #1) | Stock against the top of the #1 range | 06 |
| 4 | Delivery delay by lane | Relational | Shipments linked to locations, carriers, events | 09 |
| 5 | Return risk per order | Relational | Order linked to customer and product return history; a flat row loses that | 08 |
| 6 | Return rate per product | Relational | Product linked to refunds and lines | 08 |
| 7 | Customers likely to stop buying | Tabular (retest) | Relational lost to logistic regression on flat features in 6 of 6 (RESULT_7.md run 2); Tabular is the like-for-like test | Hidden until a pass |
| 9 | Next purchase, top 5 | Relational | Ranking needs customer-product links; hosted or NIM only | 10 |
| 10 | First-time buyers returning | Relational | Customer linked to first order and its products | 10 |
| 11 | Abandoned checkouts returning | Relational | Checkout linked to customer and past orders | 10, needs checkout sync |
| 12 | Discount-only customers | Relational | Customer linked to orders and discounts | 10 |
| Heatmap | Demand per city | Open | Summed Relational vs Forecast on the city series, decided by 04_backtest_tool/03 | Waiting |

Not in this festival: Forecast for store totals (Money, Support pages) and Anomaly alerts. Both wait
on the licence sign-off.

Range for Forecast output (requirement 5), proposal: Forecast returns one value per day. Take the
same model's past errors on the same store, per day ahead, and use their 10th and 90th percentiles as
the range. Show it only after 04_backtest_tool confirms about 80% of actuals land inside. Not tested.

#7 retest plan: same data, cut-offs and pass rule as RESULT_7.md run 2 (PASS_RULE_7.md); one flat row
per customer with the logistic baseline's features; Kumo Tabular in place of Relational. Run at 90
days as well as 14, since at 14 days about 82% of customers "stop" (quiet fortnights, not churn).
Not run: needs hosted Tabular (no NVIDIA key on this Mac) or a local Tabular install.
Ready (2026-11-17): pass rule experiments/kumo_test/PASS_RULE_7T.md written before any score;
experiments/kumo_test/tabular_churn.py. Dry run with no key: 70 requests built, 1,000 context rows
each, largest 0.1 MB. Hosted endpoint .../nvidia/kumo-tabular/predictions answers 401 without a key.

## Done When

- [ ] All requirements met
- [ ] Owner has signed off the licence row
