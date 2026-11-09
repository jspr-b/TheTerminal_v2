# The Terminal

Know what will sell in the next 14 days, whether your stock will last,
and what's on its way. For Shopify merchants.

## Status
First version: Shopify through Nango, Kumo forecasts, the Command map.
The first map shows only what Shopify knows: locations, stock, deliveries out.
Later: ads, then payments, then Gorgias, one app at a time. Plan: festivals/PLAN.md
The old backend is gone. Old frontend is reference only: copy a piece in
when real data exists for it, and adapt it. Never revive it wholesale.

## Layout
frontend/             New Next.js app
backend_v2/           FastAPI service and database
backend_v2/db/migrations/   Schema, in order
experiments/kumo_test/      Backtests and results
festivals/            Plan and decisions

## Product rules
- Forecasts are estimates. Always show a range, never one exact number.
- Likelihoods (risk, churn, yes/no) show as low, medium or high, never an exact percent.
- Maximum horizon is 14 days.
- Too few sales: show "too few sales to predict", not a number.
- Every number on screen is data from a connected app, Kumo, or our own math. Know which.
- Exact things (totals, stock, approvals) are never predicted.
- Kumo only, no fallback model. If Kumo is down, forecasts go stale and say so.
- Command states what is happening. No recommendations about reordering or money,
  no approve or dismiss buttons, nothing is carried out from it.
- Never auto-execute. Any future action needs the merchant's approval and must be doable through Nango.
- No manual data entry. Data comes from integrations through Nango.
- Claim only the accuracy we measured, and name the data it was measured on.
  Never quote accuracy from the dev store.

## Kumo
- Hosted API, JSON tasks (not PQL). Notes: experiments/kumo_test/KUMO_NOTES.md
- Forecast = the 0.5 quantile. Range = the 0.1 to 0.9 quantiles. Kumo runs low,
  so stock decisions use the top of the range.
- Do not add product forecasts up into store totals. Kumo tested worse than
  the baseline there.
- Give Kumo only data from before the prediction date.
- Kumo is decided. Backtests inform what we claim; they do not block building (D019).
- Send no names, emails or street addresses.
- Real merchant data goes to NVIDIA only after the owner confirms (D016).
- Keys live in backend_v2/.env. Never print or commit them.

## What Kumo can predict
Ideas, by data source. Each one still needs a backtest before it ships.

### Shopify
| # | Kumo predicts | Merchant can |
|---|---|---|
| 1 | 14-day demand per product | Plan stock |
| 2 | Demand per product and location | Move stock between locations |
| 3 | Sell-out risk | Reorder in time |
| 4 | Delivery delay by lane | Change carrier or warn customers |
| 5 | Return risk per order | Check the order before shipping |
| 6 | Return rate per product | Fix sizing or listing |
| 7 | Customers likely to stop buying | Win them back |
| 9 | Next purchase, top 5 products | Recommend the right product |
| 10 | First-time buyers likely to return | Follow up with the right ones |
| 11 | Abandoned checkouts likely to come back | Skip discounts where not needed |
| 12 | Customers who only buy with a discount | Limit discount codes |

### Google, Meta, TikTok
| # | Kumo predicts | Merchant can |
|---|---|---|
| 13 | Campaign revenue over 7 days | Shift budget |
| 14 | Product demand with ad spend as a signal | Plan stock around ads |
| 15 | Demand by region | Target regions |
| 16 | Campaigns likely to miss their return target | Cut early |
| 17 | Ads about to fade (Meta, TikTok) | Replace them |
| 18 | New ads likely to win (Meta, TikTok) | Scale them early |
| 19 | Search terms likely to waste money (Google) | Exclude them |
| 20 | Products likely to sell from Shopping ads (Google) | Prioritize them |
| 21 | Best platform for each product | Choose where to advertise |
| 22 | Campaign spend over 7 days | Catch overspending |

### Gorgias
| # | Kumo predicts | Merchant can |
|---|---|---|
| 23 | Ticket volume over 14 days | Staff support |
| 24 | Products likely to cause complaints | Fix them or pause sales |
| 25 | Tickets likely to end in a refund | Handle them first |
| 26 | Tickets likely to get a low score | Escalate them |

### Stripe, PayPal
| # | Kumo predicts | Merchant can |
|---|---|---|
| 27 | Chargeback risk per order | Review before shipping |
| 28 | Disputes over 14 days | Set money aside |
| 29 | Disputes likely to be won | Fight the right ones |
| 30 | Refund amounts over 14 days | Plan cash |
| 31 | Money coming in over 14 days, with a range | Time purchases |
| 32 | Subscription payments likely to fail | Ask for a new card first |
| 33 | Subscribers likely to cancel | Offer a pause |
| 34 | Renewal revenue over 14 days | Plan cash |

### Combined apps (the strongest part)
Kumo reads linked tables, so these use several apps at once.

| # | Using | Result |
|---|---|---|
| 35 | Shopify + ads | Products about to sell out with ads still running, so pause the ads |
| 36 | All | Profit per product over 14 days after ads, refunds and disputes |
| 37 | Shopify + ads | Customer value by ad platform |
| 38 | Ads + Shopify + payments | Campaigns that bring the most returns and disputes |
| 39 | Ads + Shopify + Gorgias | Support surges after a campaign or delivery delay |
| 40 | Shopify + Gorgias + payments | Better churn prediction using tickets and failed payments |
| 41 | Shopify + payments + Gorgias | Riskiest orders, using all history |
| 42 | Payments + Shopify | Whether cash will cover the next reorder (#31 plus our math) |

## Backend
- FastAPI async, Pydantic for every request and response. Logging, no print.
- All data goes through OntologyService. Every method takes merchant_id.
- Login required on every merchant route.
- Tokens stay in Nango; we store connection ids only.
- Imports upsert on (merchant_id, source, external_id) and keep the
  platform's own timestamps.
- Schema changes are new migrations. Hosted database only on the owner's say-so.

## Frontend
- TypeScript strict, Tailwind. Inline styles only for computed values.
- All calls go through one typed API client. No raw fetch in components.
- A screen ships only when its endpoint returns real data. No demo data.
  Mockups (docs/mockups/) may use made-up numbers and must say so on screen.
- Every page: sidebar left, breadcrumb on top, content right.
  No tab bars or secondary nav.

## Map
The map is the home screen and the heart of the product.
- Import MapGL from react-map-gl/mapbox, always with ssr: false.
- No symbol layers with text-field. Use HTML markers for labels.
- First version: warehouse rounded square, fulfillment hexagon, deliveries out dotted.
- Once inbound data exists: supplier circle, and ship dashed via oceanRoute.ts (searoute-ts), air solid great-circle,
  truck dotted. All risk-coloured.
- One GeoJSON source with per-feature opacity. Each route is one continuous line.
- Progress: bright and dim halves, both split with turf from the same point.
- Corridor detection is for icons only. It never splits lines.
- Slider covers day 0-14 and must not fire a request per step.
- Customer and demand data stay at city or region level.

## Design
- Dark theme: water #080812, land #0f0f1a, borders #2a2a3e.
- Panels: rgba(15,15,26,0.92), blur 14px, 1px border rgba(255,255,255,0.08).
- Sidebar 240px (64px collapsed), right panel 320px, bottom product drawer.
- Labels never overlap. Timeline labels line up exactly with their data.

## Tests
- Backend: cd backend_v2 && tests/run_on_plain_postgres.sh
  Full stack, when Docker has space: supabase db reset --local, then pytest.
- Tests run on a local database only.
- Isolation tests must pass. Any new table or route needs a test proving
  merchant A cannot reach merchant B.
- For a new safety test, break the code on purpose and watch it fail.
- Frontend: typecheck and build must pass.
- UI and map changes: open them in a browser and look. Passing tests are not enough.
- Report failures and skipped steps plainly.

## Working with the owner
- Short, plain answers.
- "Artifact" means a clickable mockup in the app's design.
- Mockup first for anything the owner will see, then build.
- Commit only when asked.
