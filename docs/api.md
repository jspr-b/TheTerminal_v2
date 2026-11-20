# API contract (internal)

Developer reference for backend_v2 and the Next.js app. Merchants never see this: the app shows pages,
states and plain words, not routes or model names.

All routes: `Authorization: Bearer <Supabase JWT>`, and the user must belong to `{m}` (403 otherwise).
Every lookup by id also checks the merchant (404 when the id belongs to someone else).

## Reads (one per page, plus the state of every section)

| Route | Used by | Returns |
|---|---|---|
| `GET /merchants/{m}/pages/{page}` | every page | `PageState` |
| `GET /merchants/{m}/command` | Command, Products | `CommandView` (locations, stock, 14-day ranges) |
| `GET /merchants/{m}/command/summary` | Command | `StoreSummary` ("Your store": exact Shopify numbers) |
| `GET /merchants/{m}/heatmap/{layer}` | Command | `Heatmap`; layer = orders, demand, returns, delays, first_time |
| `GET /merchants/{m}/products/overview` | Products | `ProductsOverview` |
| `GET /merchants/{m}/products/pairs` | Products, Product page | `ProductPairs` (basket galaxy) |
| `GET /merchants/{m}/products/track-record` | Products | `TrackRecord` |
| `GET /merchants/{m}/products/{pid}` | Product page | `ProductDetail` |
| `GET /merchants/{m}/customers/regions` | Customers | `CustomerRegions` |
| `GET /merchants/{m}/customers/dots` | Command (green dots) | `CustomerDots` (one per customer per shipping address, last 14 days) |
| `GET /merchants/{m}/customers/city?city=&country=` | Command (customer panel) | `CityCustomers` (customer cards with addresses) |
| `GET /merchants/{m}/connections` | Connections | `Connections` |

`page` = command, products, product, customers, ads, support, money, connections.

## Writes (only start work; nothing approves or carries out an action)

| Route | Does |
|---|---|
| `POST /merchants/{m}/integrations/{iid}/import` | Shopify import through Nango |
| `POST /merchants/{m}/forecasts` | Kumo Relational demand run (hosted or local) |
| `POST /merchants/{m}/forecasts/store-totals` | Kumo Forecast on daily store totals. 503 until `KUMO_GPU_URL` is set |
| `POST /merchants/{m}/anomalies` | Kumo Anomaly on daily store series. 503 until `KUMO_GPU_URL` is set |

## Shapes

```ts
type SectionState = "ready" | "not_connected" | "needs_gpu" | "blocked" | "not_built";
interface Section {
  key: string;            // e.g. "demand_14d", "heatmap_orders"
  idea: number | null;    // idea number in CLAUDE.md
  title: string;          // merchant-facing title
  shows: "exact" | "range" | "band" | "count" | "list" | "statement";
  source: "shopify" | "kumo" | "our_math";
  model: "relational" | "tabular" | "forecast" | "anomaly" | null;   // never shown to merchants
  needs: ("shopify" | "ads" | "payments" | "support")[];
  state: SectionState;
  message: string;        // merchant-facing reason, "" when ready
}
interface PageState { page: string; connected: string[]; sections: Section[] }

// Command "Your store". Exact Shopify, cancelled orders left out. No forecasts here: Kumo stays per product.
interface StorePeriod { orders: number; revenue: number | null; units: number; customers: number; countries: number }
interface StoreSummary {
  days: number;                 // 14
  currency: string | null;      // null (and revenue null) when orders use more than one currency
  current: StorePeriod;         // last 14 days
  previous: StorePeriod;        // the 14 days before
  daily_units: number[];        // 28 values, oldest first, the last one is today
}

// Command green dots and customer cards. Exact Shopify order facts and shipping addresses, for the merchant only
// (never sent to NVIDIA). Never names, emails or phones: code = short id. No small-number rule here (the heatmap keeps it).
interface CityProduct { product_id: string; title: string; units: number }
interface CustomerAddress { street: string | null; street2: string | null; zip: string | null; city: string | null; country: string | null; orders: number; last_order: string }
interface SameAddressAccount { id: string; code: string; orders: number; spent: number | null; last_order: string }  // another account, same street + postcode
interface CustomerCard {
  id: string; code: string; orders: number; spent: number | null; average_order: number | null;
  first_order: string; last_order: string; discount_orders: number; ship_cities: string[];
  top_products: CityProduct[]; refunds: number; refunded: number;
  weekly: number[];             // orders per week, last 12 weeks, oldest first
  addresses: CustomerAddress[]; same_address: SameAddressAccount[];
}
interface CityCustomers {
  city: string; country: string | null; days: number;
  orders: number; customers: number; guest_orders: number; returning: number;
  average_order: number | null; currency: string | null; top_products: CityProduct[]; cards: CustomerCard[];
}
interface CustomerDot {         // lat/lng from Shopify; null = place near the city centre
  id: string; code: string; city: string; country: string | null; street: string | null; zip: string | null;
  lat: number | null; lng: number | null; orders: number; last_order: string;
}
interface CustomerDots { days: number; dots: CustomerDot[] }

interface HeatmapPoint { city: string; province: string | null; country: string | null; value: number }
interface Heatmap { layer: string; section: Section; min_count: number; points: HeatmapPoint[] }
// orders: value = orders in the last 14 days per city (exact). Cities under min_count are left out.

interface ProductDetail {
  id: string; title: string; product_type: string | null; units: number;
  by_location: { location_id: string; name: string; units: number }[];
  forecast_state: "forecast" | "stale" | "too_few_sales";
  forecast: { lower: number; value: number; upper: number; generated_at: string } | null;
  sales: { date: string; units: number }[];   // last 28 days, exact Shopify, one row per day (zeros included)
}

// Sell-out: our math on the Kumo range (range spread evenly over its 14 days; per-day forecasts come later).
// CLAUDE.md: sell-out risk needs a backtest before merchants see it. tested=false until then;
// the app shows it only when NEXT_PUBLIC_SHOW_UNTESTED=1 (local dev), tagged "untested".
interface Sellout {
  band: "low" | "medium" | "high";   // by day 14: high = middle of range >= stock, medium = top of range >= stock
  earliest_day: number | null;       // day 1..14 it could run out at the top of the range; null = lasts past day 14
  likely_day: number | null;         // at the middle of the range
  latest_day: number | null;         // at the bottom of the range
  tested: boolean;
}

// GET /merchants/{m}/products/overview  (Products page)
interface ProductsOverview {
  products: {
    id: string; title: string; product_type: string | null;
    units: number;                     // stock now, exact
    sold_14d: number;                  // units sold in the last 14 days, exact
    sales_28d: number[];               // 28 values, oldest first, exact units per day
    forecast_state: "forecast" | "stale" | "too_few_sales";
    forecast: { lower: number; value: number; upper: number; generated_at: string } | null;
    sellout: Sellout | null;           // null when there is no forecast
  }[];
}

// GET /merchants/{m}/products/pairs  (basket galaxy; exact Shopify data, no prediction)
interface ProductPairs {
  days: number;                 // window: last 90 days of orders (cancelled excluded)
  min_orders: number;           // a pair needs at least this many shared orders (2)
  nodes: { id: string; title: string; product_type: string | null; sold: number }[];  // sold = units in the window
  links: { source: string; target: string; orders: number }[];   // source/target = product ids; each pair once
}

// GET /merchants/{m}/products/track-record  (latest Kumo demand run whose 14 days are over)
interface TrackRecord {
  window_start: string | null;  // when that run's range was made; null = no finished window yet
  window_end: string | null;    // window_start + 14 days
  checked: number; inside: number; above: number; below: number;   // counts of products
  products: { product_id: string; title: string; lower: number; value: number; upper: number; actual: number;
              result: "inside" | "above" | "below" }[];  // above = sold more than the top of the range; sorted: above, below, inside, then by how far off
}

// ProductDetail (GET /merchants/{m}/products/{pid}) also has:
//   sold_14d: number;
//   sellout: Sellout | null;
//   by_variant: { id: string; title: string | null; sku: string | null; units: number }[];      // exact stock per variant
//   bought_together: { product_id: string; title: string; orders: number }[];  // exact: top 5 products in the same orders in the last 90 days (same window as ProductPairs), at least 2 orders
//   track_record: { generated_at: string; lower: number; value: number; upper: number; actual: number }[];
//       // past Kumo ranges whose 14 days are over, with what really sold in those 14 days; newest first, at most 6

interface CustomerRegions { min_count: number; hidden: number; regions: { city: string; country: string | null; customers: number }[] }
// customers with an order in the last 365 days, per ship city; cities under min_count are counted in `hidden` only

interface Connections {
  apps: { app: "shopify" | "ads" | "payments" | "support"; name: string; connected: boolean;
          integrations: { provider: string; status: string; last_sync_at: string | null }[] }[];
  kumo: { hosted: boolean; local: boolean; gpu: boolean;
          last_runs: { model: string; query_name: string; status: string; finished_at: string | null }[] };
}
```

## Settings (backend_v2/.env)

| Key | Effect |
|---|---|
| `NVIDIA_API_KEY` | Hosted Kumo Relational and Tabular |
| `KUMO_RUNTIME=local` | Kumo Relational on this server (open weights, CPU) |
| `KUMO_GPU_URL` | The GPU worker (gpu_worker/). Unset: Forecast and Anomaly sections show "needs GPU" |
| `KUMO_GPU_ANOMALY_URL` | The Anomaly container, when it runs apart from Forecast (docker-compose.gpu.yml: :8102) |
