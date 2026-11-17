# Pages and features (merchant view)

Agreed list for mockups (KF0001 02_ux_mockups) and the build (11_ux_build). Merchant-facing only: no API detail.
✅ = works with Shopify alone (first release). Others unlock when the named app is connected.

## On every page
- Every number has a source chip (Shopify, Kumo, our math) and is a range or a low/medium/high band.
- States: fresh; stale with the date; too few sales; not connected (says which app to connect).
- No advice and no action buttons. The app says what is happening; the merchant decides.
- Sidebar items only, no tabs.

## 1. Command (home, 3D globe)
- ✅ Warehouses and stores on the globe, coloured by sell-out risk
- ✅ Day 0-14 slider: stock dropping day by day
- ✅ Delivery lines to customer cities/regions only (no transfers, no supplier routes), coloured when a delay is likely
- ✅ Heatmap filters: orders last 14 days (exact), returns likely, delivery delays likely, first-time buyers coming back
- Demand heatmap: waits on the city-totals test, or shows one product at a time
- ✅ Side panel: "could run out around day N" cards
- + Ads: "selling out while ads still run" cards
- Kumo Anomaly alerts (sales drop, refund spike, orders stopping): after the licence check
- ✅ Bottom drawer: products with stock and the 14-day range

## 2. Products
- ✅ Table: stock, will sell in 14 days (range), sell-out risk, likely returns
- ✅ Filter by location, risk band, product type
- + Gorgias: complaint risk
- All apps: profit after ads, refunds and disputes

Product page:
- ✅ 14-day sales curve, overall and per location
- ✅ When it could run out
- ✅ Units likely to come back
- ✅ What customers usually buy next
- + Ads: best ad platform; Shopping ad likelihood

## 3. Customers (groups per region, never names)
- ✅ First-time buyers likely to return
- ✅ Discount-only buyers
- ✅ Products customers are most likely to buy next
- ✅ Abandoned checkouts likely to come back (needs a checkout sync)
- Customers likely to stop buying: hidden until it passes a backtest
- + Recharge or Stripe: subscribers likely to cancel
- + Ads: customer value by ad platform

## 4. Ads (+ Google, Meta or TikTok)
- Campaigns: 7-day revenue and spend ranges, likely to miss return target
- Ads about to fade; new ads likely to win
- Search terms likely to waste money (Google)
- Campaigns bringing returns and disputes
- Campaign page: one campaign's next 7 days

## 5. Support (+ Gorgias)
- Tickets per day, next 14 days
- Surges after a campaign or delivery delay
- Tickets likely to end in a refund or a low score
- Products causing the most complaints

## 6. Money (+ Stripe or PayPal)
- Next 14 days: money in, refunds, disputes, renewals (ranges)
- Risky open orders by order number: chargeback, return
- Disputes likely to be won
- Subscription payments likely to fail

## 7. Connections
- ✅ Connect Shopify, ad platforms, payments, Gorgias and extras (Recharge, Loop, ShipStation, Klaviyo, Judge.me)
- ✅ Last sync time and status per app
- ✅ Last Kumo run: fresh or stale, with date
