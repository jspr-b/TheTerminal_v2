# Plan (2026-11-09)

Goal: the predictions in CLAUDE.md, proven one at a time, with the map as the
home screen. First version is Shopify only.

## Where we are
- Only #1 (14-day demand) has been tested, on one UK wholesaler from 2011.
  It passed narrowly: experiments/kumo_test/RESULT.md
- Kumo forecasts run low, and added-up store totals were worse than the baseline.
- Kumo yes/no predictions run, but none has been scored yet.
- backend_v2 has the schema and isolation tests. No API or imports yet.
- No new frontend yet. The old one is reference only.
- No real merchant data. Only a Shopify dev store.
- Older work is on branch backup/kumo-worktree-2026-11-09 in the old repo,
  on the owner's Mac only. That includes the backtest scripts.

## Three kinds of proof
| Source | Proves | Does not prove |
|---|---|---|
| Shopify dev store | Connection, imports, isolation, screens | Accuracy |
| Public datasets | Whether Kumo can do the prediction at all | Accuracy on Shopify stores |
| Real pilot store | Accuracy we can claim to merchants | |

## Steps

### 1. Confirm NVIDIA terms (owner)
Written answers on commercial use of Kumo Relational, merchant data, cost and
rate limits. Kumo Forecast and Anomaly are marked research-only: do not use them
until licensed (D008). Blocks step 6 only.
Done when: the answers are saved in festivals/ and D016 is confirmed or changed.

D016 today, still only proposed: use NVIDIA's hosted Kumo for build and pilot,
look at self-hosting later.

### 2. Find a pilot store (owner, start now)
One real Shopify store, ideally a year or more of sales, in exchange for free use.
Done when: the owner agrees to connect and to their data going to NVIDIA.

### 3. Backend and Shopify import
FastAPI service, login, OntologyService. Connect the dev store through Nango.
Import products, variants, orders, stock and locations, upserting on
(merchant_id, source, external_id).
Done when: dev store data is in the database, a second import adds no duplicates,
and every new table and route has an isolation test.

### 4. Backtest tool
Bring the scripts over from the backup and make one tool for every prediction.
Each prediction gets a pass rule written before scoring and a simple baseline.

| # | Prediction | Test on | Note |
|---|---|---|---|
| 1 | 14-day demand per product | M5, UK wholesaler | Retest, fix the low bias if possible |
| 2 | Demand per product and location | M5 | |
| 7 | Customers likely to stop buying | UK wholesaler (done) | Failed: lost to logistic regression. See RESULT_7.md. Retest on the pilot store only |
| 3 | Sell-out risk | Pilot store | #1 plus our math. Public data has no stock levels |
| 5 | Return risk per order | Pilot store | No good public data known |

Check each dataset's licence before use.
Done when: each prediction has a written pass or fail in experiments/.

### 5. Map, mockup first
Clickable mockup of the map with forecast ranges and sell-out risk. After the
owner approves it, build it on the real endpoint with merchant approval of actions.
Done when: it runs on dev store data and has been checked in a browser.

### 6. Pilot
Connect the pilot store, import its full history, rerun the backtests on it.
Ship only what passes. Only these results may be claimed to merchants.

### 7. More apps, one at a time
Ads first (#35 is mostly #3 plus which ads are running), then payments, then
Gorgias. Each one: connect, import, backtest, ship what passes.
Ads, Gorgias and most payment predictions need a real store to test on.
Test #30, #31 and #34 directly, because totals were Kumo's weak spot.

## Decisions
- Map stays the home screen.
- First version is Shopify only.
- #8 (365-day customer value) is dropped: it breaks the 14-day limit.
  The other numbers stay as they are.

## Still open
- The sales threshold for "too few sales to predict". Set it in step 4.
  Early sign: products with 0-2 orders in a window had 181% error.
- Are the right panel and bottom drawer on the map page only? Assumed yes.
