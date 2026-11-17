# What Kumo can predict per integration

Generated 2026-11-16 from the idea list in CLAUDE.md (#8 dropped), Kumo Relational docs and the Nango catalog.
Covers all of Kumo Relational (regression, yes/no, multiclass, ranking, multi-step), not only forecasting.
STORE TOTAL = one number for the whole store, Kumo's tested weak spot (RESULT.md): test these directly first.

## The four Kumo models (checked 2026-11-16)

| Model | Data shape | Licence (Hugging Face card) | Runs | Best fit here |
|---|---|---|---|---|
| Relational | Several linked tables | OpenMDW-1.1 | Hosted API, NIM, or local CPU (~30M params) | Almost all 41: per product, customer, order, campaign |
| Tabular | One flat table, one row per item | OpenMDW-1.1 | Hosted API, NIM, or local | Items whose features already sit in one row (#5, #25, #26, #27, #29, #32); retest #7, which lost to logistic regression on flat features |
| Forecast | Time series (one or more numeric columns per day) | Apache-2.0 | Python only, GPU recommended (~340M params) | Store totals: #23, #28, #30, #31, #34, #39, base of #42 |
| Anomaly | Time series | Apache-2.0, but README says "research and development only" | Python only (~8M params) | New ideas: sudden sales drop, refund or dispute spike, ad spend spike, ticket surge, orders stopping |

- D008 (PLAN.md) marks Forecast and Anomaly research-only. Forecast's card now says Apache-2.0; Anomaly's card
  still says research only. The owner re-checks both before use.
- Kumo Forecast returns one value per day, no quantiles. Our rule needs a range: a range would have to come from
  backtest error (our math) or a range method still to be tested.
- Forecast needs a long history: 256 to 2,048 rows of context. 256 daily rows is about 8.5 months.

Display codes: R range ("96–164 units") · B band chip (low/medium/high) · C count per band · L ranked list ·
M map layer (city/region level) · S statement card (says what is happening, never advice).

| # | Prediction | Needs | Kumo task | Entity | Display | Where | Note |
|---|---|---|---|---|---|---|---|
| 1 | Demand per product | Shopify | regression | product | R range + per-day band on timeline | Products drawer, product page | PASSED narrowly (UK wholesaler 2011) |
| 2 | Demand per product+location | Shopify | regression | product×location | R range per location; M node label | Map, location panel | needs fulfillments import |
| 3 | Sell-out risk | Shopify | #1 + our math | product | B band + S 'could run out around day N'; M node colour | Map, drawer, product page | needs pilot store to test |
| 4 | Delivery delay by lane | Shopify | regression | lane | M route line coloured by band; R days-late range | Map lines | needs fulfillment events |
| 5 | Return risk per order | Shopify | yes/no | order | C count per band of open orders; B per order | Right panel, product page | needs refunds import |
| 6 | Return rate per product | Shopify | regression | product | R units returned (range, not a %) | Product page | needs refunds import |
| 7 | Customers likely to stop buying | Shopify | yes/no | customer | C count per band per region (hidden until it passes) | Customers | FAILED vs logistic; 14d too short |
| 9 | Next purchase, top 5 | Shopify | ranking | customer | L top products customers will buy next | Customers, product page |  |
| 10 | First-time buyers likely to return | Shopify | yes/no | customer | C count per band per region; M region shade | Customers, map |  |
| 11 | Abandoned checkouts coming back | Shopify | yes/no | checkout | C count per band | Customers | needs checkouts sync |
| 12 | Discount-only customers | Shopify | yes/no | customer | C count per band per region | Customers |  |
| 13 | Campaign revenue, 7d | Ads + Shopify | regression | campaign | R revenue range per campaign | Ads |  |
| 14 | Demand with ad spend as signal | Ads + Shopify | regression | product | R improves #1; chip 'Kumo · Shopify + Ads' | Products |  |
| 15 | Demand by region | Ads + Shopify | regression | product×region | R range per region; M region shade | Map |  |
| 16 | Campaigns missing return target | Ads + Shopify | yes/no | campaign | B per campaign | Ads |  |
| 17 | Ads about to fade | Ads | yes/no | ad | B per ad | Ads | Meta/TikTok |
| 18 | New ads likely to win | Ads | yes/no | ad | B per new ad | Ads | Meta/TikTok |
| 19 | Search terms wasting money | Ads | yes/no | search term | L search terms, highest band first | Ads | Google; custom GAQL sync |
| 20 | Products likely to sell from Shopping ads | Ads + Shopify | yes/no | product | B per product | Products drawer, Ads | Google |
| 21 | Best platform per product | Ads + Shopify | multiclass | product | platform name + B how sure | Product page | needs 2+ ad platforms |
| 22 | Campaign spend, 7d | Ads | regression | campaign | R spend range per campaign | Ads |  |
| 23 | Ticket volume, 14d | Gorgias | regression | store total | R + per-day band | Support | STORE TOTAL |
| 24 | Products likely to cause complaints | Gorgias + Shopify | yes/no | product | B per product | Product page, drawer |  |
| 25 | Tickets likely to end in refund | Gorgias | yes/no | ticket | B per ticket; C count | Support |  |
| 26 | Tickets likely to get a low score | Gorgias | yes/no | ticket | B per ticket; C count | Support |  |
| 27 | Chargeback risk per order | Payments + Shopify | yes/no | order | B per order; C count | Money, right panel |  |
| 28 | Disputes, 14d | Payments | regression | store total | R count range | Money | STORE TOTAL |
| 29 | Disputes likely to be won | Payments | yes/no | dispute | B per dispute | Money |  |
| 30 | Refund amounts, 14d | Payments | regression | store total | R money range | Money | STORE TOTAL |
| 31 | Money coming in, 14d | Payments | regression | store total | R money range + per-day band | Money, timeline | STORE TOTAL |
| 32 | Subscription payments likely to fail | Payments | yes/no | subscription | C count per band | Money |  |
| 33 | Subscribers likely to cancel | Payments | yes/no | subscription | C count per band per region | Customers |  |
| 34 | Renewal revenue, 14d | Payments | regression | store total | R money range | Money | STORE TOTAL |
| 35 | Sell-out with ads still running | Ads + Shopify | #3 + our math | product | S 'runs out around day N while N campaigns run' | Right panel, map | wording: state it, no 'pause' advice |
| 36 | Profit per product after ads/refunds/disputes | Ads + Gorgias + Payments + Shopify | several + our math | product | R profit range per product | Product page, drawer |  |
| 37 | Customer value by ad platform | Ads + Shopify | regression | customer | R value range per platform | Ads |  |
| 38 | Campaigns bringing returns/disputes | Ads + Payments + Shopify | regression | campaign | R returns range per campaign | Ads |  |
| 39 | Support surges after campaign/delay | Ads + Gorgias + Shopify | regression | store total | R per-day band on support timeline | Support | STORE TOTAL |
| 40 | Churn using tickets + failed payments | Gorgias + Payments + Shopify | yes/no | customer | C count per band per region (waits on #7 decision) | Customers | same horizon issue as #7 |
| 41 | Riskiest orders, all history | Gorgias + Payments + Shopify | yes/no | order | B per order; C count | Money, right panel |  |
| 42 | Cash covers next reorder | Payments + Shopify | #31 + our math | store total | R money in only; 'covers reorder' needs reorder data and risks advice | Money | built on a STORE TOTAL |

## Pages

Command (globe), Products, Customers, Ads, Support, Money. Each is its own sidebar item: no tabs (CLAUDE.md).
Every number keeps its source chip and its state: fresh, stale with date, or too few sales.

## Unlock order (PLAN.md: Shopify, then ads, then payments, then Gorgias)

| Connect | New predictions | Total |
|---|---|---|
| Shopify | 11 | 11 |
| + one ad platform (Google, Meta or TikTok) | 12 | 23 |
| + Stripe or PayPal | 10 | 33 |
| + Gorgias | 8 | 41 |

## Nango providers (catalog checked 2026-11-16)

shopify, google-ads, meta-marketing-api, tiktok-ads, microsoft-ads, pinterest, snapchat, stripe, paypal, gorgias,
klaviyo, recharge, loop-returns, shipstation, shippo, judgeme, google-analytics, amazon-selling-partner.
Pre-built syncs checked only for Google Ads (structure; daily metrics need a custom GAQL sync) and Gorgias
(tickets, messages, satisfaction surveys). Others: assume custom syncs.
