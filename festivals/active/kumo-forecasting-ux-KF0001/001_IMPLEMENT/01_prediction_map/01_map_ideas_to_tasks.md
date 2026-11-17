---
fest_type: task
fest_id: 01_map_ideas_to_tasks.md
fest_name: map_ideas_to_tasks
fest_parent: 01_prediction_map
fest_order: 1
fest_status: completed
fest_autonomy: medium
fest_created: 2026-11-16T23:46:42.564303+01:00
fest_updated: 2026-11-17T00:47:41.347374+01:00
fest_tracking: true
---


# Task: map ideas to tasks

## Objective

Map Shopify ideas #1-#12 in CLAUDE.md to a Kumo task type.

## Requirements

- [x] Each idea has a task type: regression with range, yes/no, multiclass, ranking or per-day forecast
- [x] Each idea names the Shopify tables it needs and whether we import them yet
- [x] Each idea says how it shows: range, or low/medium/high, never an exact percent
- [x] Nothing over 14 days. #7 and #8 are flagged where 14 days does not fit

## Implementation

Use the relational-predictions skill decision table. Write the table into this task file.

## Prediction map (2026-11-16)

Checked against backend_v2/db/migrations/002_commerce.sql, backend_v2/app/importer.py and
nango-integrations/shopify-cc/syncs. "Imported" means rows reach the database today.

| # | Idea | Kumo task type | Tables needed | Imported yet | Horizon | Shown as | Pass rule owner |
|---|---|---|---|---|---|---|---|
| 1 | 14-day demand per product | Regression with range (0.1-0.9 quantiles) | orders, order_lines, products | Yes | 14 days | Range of units, rounded outward | Exists: experiments/kumo_test/PASS_RULE.md. Retest in 04_backtest_tool |
| 1 per day | Demand per product per day (stock curve) | Per-day forecast: one regression per day, built on our side | Same as #1, plus inventory_levels for the curve | Yes | Day 1-14 | Range per day; the stock curve is our math on the top of the range | 05_daily_demand |
| 2 | Demand per product and location | Regression with range, one row per product and location | order_lines.location_id, fulfillments, locations | No. The Nango sync reads fulfillments, the importer drops them, so location_id is empty | 14 days | Range of units per location | 07_location_demand (M5) |
| 3 | Sell-out risk | Not a Kumo task. Our math: stock against the top of the #1 range | inventory_levels, #1 predictions | Yes. No stock history (nothing writes inventory_snapshots), so no backtest until the pilot store | 14 days | Low / medium / high | 06_sellout_risk |
| 4 | Delivery delay by lane | Multiclass: on time, 1-2 days late, 3+ days late. Per shipment, grouped by lane (location to region, carrier) | fulfillments, fulfillment_events, locations | No. Tables exist, nothing is saved | Shipments leaving in the next 14 days | Low / medium / high per lane | 09_delivery_delay |
| 5 | Return risk per order | Yes/no | refunds with lines, orders, order_lines, customers | No. No refunds table and no sync | Returned within 14 days of delivery | Low / medium / high | 08_returns |
| 6 | Return rate per product | Regression with range (share of units sold that come back) | refunds with lines, order_lines, products | No, same as #5 | 14 days | Range, e.g. "4-9 in 100" | 08_returns |
| 7 | Customers likely to stop buying | Yes/no | customers, orders | Yes | **14 days does not fit.** Not ordering for a fortnight is normal, and it lost to the baseline (RESULT_7.md) | Low / medium / high, if it ships | 10_customer_predictions/04, owner decides |
| 8 | 365-day customer value | Dropped | | | **Breaks the 14-day limit** | | None |
| 9 | Next purchase, top 5 products | Ranking (customer to product, with a candidate list) | customers, orders, order_lines, products | Yes | 14 days | Ordered list of 5, no scores | 10_customer_predictions/01 |
| 10 | First-time buyers likely to return | Yes/no | customers, orders, order_lines | Yes | 14 days. Weak fit, same worry as #7: few second orders land inside 14 days | Low / medium / high | 10_customer_predictions/02 |
| 11 | Abandoned checkouts likely to come back | Yes/no | abandoned checkouts, customers, orders | No. No table and no sync | 14 days | Low / medium / high | 10_customer_predictions/05 |
| 12 | Customers who only buy with a discount | Yes/no: will the next order in 14 days use a discount | orders.discounts, order_lines.discount, customers | Amounts yes, discount codes no | 14 days | Low / medium / high. The past share of discounted orders is exact Shopify data and is shown as such, not predicted | 10_customer_predictions/03 |

Notes:
- Local open weights only do yes/no, multiclass and regression. #9 (ranking) needs hosted Kumo or a
  self-hosted NIM, so it depends on 02_runtime_decision.
- #3 and the stock curve use the top of the range because Kumo runs low.
- Nothing is added up into store totals.
- Not checked: whether the dev store has enough refunds, checkouts or tracking events to exercise #4-#6 and #11.

## Done When

- [x] All requirements met
- [x] Table covers #1-#7 and #9-#12