/** The one API client. Components never call fetch themselves. */

export interface CommandLocation {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  kind: string;
  units: number;
  products: number;
}

export interface ForecastRange {
  lower: number;
  value: number;
  upper: number;
  /** When Kumo made this range (ISO time). Shown when the range is stale. */
  generated_at: string;
}

/** forecast: fresh Kumo range. stale: last range, Kumo's latest run failed. too_few_sales: no number. */
export type ForecastState = "forecast" | "stale" | "too_few_sales";

export interface CommandProduct {
  id: string;
  title: string;
  units: number;
  by_location: { location_id: string; units: number }[];
  forecast_state: ForecastState;
  forecast: ForecastRange | null;
}

export interface CommandView {
  locations: CommandLocation[];
  products: CommandProduct[];
}

// ---- Page and section states (docs/api.md) ----

export type SectionState = "ready" | "not_connected" | "needs_gpu" | "blocked" | "not_built";
export type SectionSource = "shopify" | "kumo" | "our_math";
export type AppKind = "shopify" | "ads" | "payments" | "support";

export interface Section {
  key: string;
  idea: number | null;
  /** Merchant-facing title. */
  title: string;
  shows: "exact" | "range" | "band" | "count" | "list" | "statement";
  source: SectionSource;
  /** Developer detail. Never shown to merchants. */
  model: "relational" | "tabular" | "forecast" | "anomaly" | null;
  needs: AppKind[];
  state: SectionState;
  /** Merchant-facing reason, "" when ready. */
  message: string;
}

export type PageName = "command" | "products" | "product" | "customers" | "ads" | "support" | "money" | "connections";

export interface PageState {
  page: string;
  connected: string[];
  sections: Section[];
}

// ---- Heatmaps ----

export type HeatmapLayer = "orders" | "demand" | "returns" | "delays" | "first_time";

export interface HeatmapPoint {
  city: string;
  province: string | null;
  country: string | null;
  value: number;
}

export interface Heatmap {
  layer: string;
  section: Section;
  /** Cities under this count are left out. */
  min_count: number;
  points: HeatmapPoint[];
}

// ---- Product page ----

export interface ProductDetail {
  id: string;
  title: string;
  product_type: string | null;
  units: number;
  by_location: { location_id: string; name: string; units: number }[];
  forecast_state: ForecastState;
  forecast: ForecastRange | null;
  /** Last 28 days, exact Shopify, one row per day (zeros included). */
  sales: { date: string; units: number }[];
  /** Units sold in the last 14 days, exact Shopify. */
  sold_14d: number;
  sellout: Sellout | null;
  /** Exact stock per variant. */
  by_variant: { id: string; title: string | null; sku: string | null; units: number }[];
  /** Exact: top 5 products in the same orders, at least 2 orders. */
  bought_together: { product_id: string; title: string; orders: number }[];
  /** Past Kumo ranges whose 14 days are over, with what really sold. Newest first, at most 6. */
  track_record: { generated_at: string; lower: number; value: number; upper: number; actual: number }[];
}

// ---- Sell-out (our math on the Kumo range) ----

/**
 * The Kumo range spread evenly over its 14 days. Needs a backtest before merchants see it:
 * tested=false until then, and the app shows it only when NEXT_PUBLIC_SHOW_UNTESTED=1.
 */
export interface Sellout {
  /** By day 14: high = middle of range >= stock, medium = top of range >= stock. */
  band: "low" | "medium" | "high";
  /** Day 1..14 it could run out at the top of the range; null = lasts past day 14. */
  earliest_day: number | null;
  /** At the middle of the range. */
  likely_day: number | null;
  /** At the bottom of the range. */
  latest_day: number | null;
  tested: boolean;
}

// ---- Products page ----

export interface OverviewProduct {
  id: string;
  title: string;
  product_type: string | null;
  /** Stock now, exact. */
  units: number;
  /** Units sold in the last 14 days, exact. */
  sold_14d: number;
  /** 28 values, oldest first, exact units per day. */
  sales_28d: number[];
  forecast_state: ForecastState;
  forecast: ForecastRange | null;
  /** null when there is no forecast. */
  sellout: Sellout | null;
}

export interface ProductsOverview {
  products: OverviewProduct[];
}

// ---- Bought together (exact Shopify data, no prediction) ----

export interface PairNode {
  id: string;
  title: string;
  product_type: string | null;
  /** Units sold in the window. */
  sold: number;
  /** Orders with this product in the window. */
  orders: number;
  /** Distinct customers among those orders (orders without a customer are not counted). */
  customers: number;
  /** Customers with more than one of those orders. */
  repeat_customers: number;
  /** Units refunded in the window. */
  returned: number;
}

export interface PairLink {
  /** Product ids; each pair appears once. */
  source: string;
  target: string;
  orders: number;
}

export interface ProductPairs {
  /** Window: the last `days` days of orders (cancelled excluded). */
  days: number;
  /** A pair needs at least this many shared orders. */
  min_orders: number;
  nodes: PairNode[];
  links: PairLink[];
}

// ---- Track record (latest Kumo demand run whose 14 days are over) ----

export type TrackResult = "inside" | "above" | "below";

export interface TrackRecordProduct {
  product_id: string;
  title: string;
  lower: number;
  value: number;
  upper: number;
  actual: number;
  /** above = sold more than the top of the range. */
  result: TrackResult;
}

export interface TrackRecord {
  /** When that run's range was made; null = no finished window yet. */
  window_start: string | null;
  window_end: string | null;
  checked: number;
  inside: number;
  above: number;
  below: number;
  /** Sorted: above, below, inside, then by how far off. */
  products: TrackRecordProduct[];
}

// ---- Customers ----

export interface CustomerRegion {
  city: string;
  country: string | null;
  customers: number;
}

export interface CustomerRegions {
  min_count: number;
  /** Customers in cities under min_count, counted here only. */
  hidden: number;
  regions: CustomerRegion[];
}

// ---- Connections ----

export interface Integration {
  provider: string;
  status: string;
  last_sync_at: string | null;
}

export interface ConnectedApp {
  app: AppKind;
  name: string;
  connected: boolean;
  integrations: Integration[];
}

export interface KumoRun {
  model: string;
  query_name: string;
  status: string;
  finished_at: string | null;
}

export interface Connections {
  apps: ConnectedApp[];
  kumo: { hosted: boolean; local: boolean; gpu: boolean; last_runs: KumoRun[] };
}

// ---- Client ----

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
// Local development only, until the login screen exists.
const DEV_TOKEN = process.env.NEXT_PUBLIC_DEV_TOKEN ?? "";
export const DEV_MERCHANT = process.env.NEXT_PUBLIC_DEV_MERCHANT ?? "";

/** Thrown for any failed read. The message is plain words; the status is for the developer console. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${DEV_TOKEN}` },
      cache: "no-store",
    });
  } catch {
    // Our server did not answer at all (down, or the network is gone).
    throw new ApiError("Could not load.", 0);
  }
  if (!res.ok) {
    const message = res.status === 404 ? "Not found." : "Could not load.";
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

export function getCommand(merchantId: string): Promise<CommandView> {
  return get<CommandView>(`/merchants/${enc(merchantId)}/command`);
}

export interface StorePeriod {
  orders: number;
  /** null when orders use more than one currency: never added up across currencies. */
  revenue: number | null;
  units: number;
  customers: number;
  countries: number;
}
/** Command "Your store": exact Shopify numbers, docs/api.md. */
export interface StoreSummary {
  days: number;
  currency: string | null;
  current: StorePeriod;
  previous: StorePeriod;
  /** Oldest first, twice `days` long; the last value is today. */
  daily_units: number[];
}

export interface CityProduct {
  product_id: string;
  title: string;
  units: number;
}
export interface CustomerAddress {
  street: string | null;
  street2: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  orders: number;
  last_order: string;
}
/** Another account of this shop that shipped to one of the same addresses. */
export interface SameAddressAccount {
  id: string;
  code: string;
  orders: number;
  spent: number | null;
  last_order: string;
}
/** One customer from their orders: no name, email or phone. Shipping addresses are for the merchant only. docs/api.md */
export interface CustomerCard {
  id: string;
  code: string;
  orders: number;
  /** null when their orders use more than one currency (then spent is null too). */
  currency: string | null;
  spent: number | null;
  average_order: number | null;
  first_order: string;
  last_order: string;
  discount_orders: number;
  ship_cities: string[];
  top_products: CityProduct[];
  refunds: number;
  refunded: number;
  /** Orders per week, last 12 weeks, oldest first. */
  weekly: number[];
  addresses: CustomerAddress[];
  same_address: SameAddressAccount[];
}
/** One customer at one shipping address. lat/lng from Shopify; null means place it at the city. */
export interface CustomerDot {
  id: string;
  code: string;
  city: string;
  country: string | null;
  street: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  orders: number;
  last_order: string;
}
export function getCustomer(merchantId: string, customerId: string): Promise<CustomerCard> {
  return get<CustomerCard>(`/merchants/${enc(merchantId)}/customers/${enc(customerId)}`);
}
export function getCustomerDots(merchantId: string): Promise<{ days: number; dots: CustomerDot[] }> {
  return get<{ days: number; dots: CustomerDot[] }>(`/merchants/${enc(merchantId)}/customers/dots`);
}
export interface CityCustomers {
  city: string;
  country: string | null;
  days: number;
  orders: number;
  customers: number;
  guest_orders: number;
  returning: number;
  average_order: number | null;
  currency: string | null;
  top_products: CityProduct[];
  cards: CustomerCard[];
}

export function getCityCustomers(merchantId: string, city: string, country: string | null): Promise<CityCustomers> {
  const q = new URLSearchParams({ city, ...(country ? { country } : {}) });
  return get<CityCustomers>(`/merchants/${enc(merchantId)}/customers/city?${q}`);
}

export function getStoreSummary(merchantId: string): Promise<StoreSummary> {
  return get<StoreSummary>(`/merchants/${enc(merchantId)}/command/summary`);
}

export function getPageState(merchantId: string, page: PageName): Promise<PageState> {
  return get<PageState>(`/merchants/${enc(merchantId)}/pages/${page}`);
}

export function getHeatmap(merchantId: string, layer: HeatmapLayer): Promise<Heatmap> {
  return get<Heatmap>(`/merchants/${enc(merchantId)}/heatmap/${layer}`);
}

export function getProductsOverview(merchantId: string): Promise<ProductsOverview> {
  return get<ProductsOverview>(`/merchants/${enc(merchantId)}/products/overview`);
}

export function getProduct(merchantId: string, productId: string): Promise<ProductDetail> {
  return get<ProductDetail>(`/merchants/${enc(merchantId)}/products/${enc(productId)}`);
}

export function getProductPairs(merchantId: string): Promise<ProductPairs> {
  return get<ProductPairs>(`/merchants/${enc(merchantId)}/products/pairs`);
}

export function getTrackRecord(merchantId: string): Promise<TrackRecord> {
  return get<TrackRecord>(`/merchants/${enc(merchantId)}/products/track-record`);
}

export function getCustomerRegions(merchantId: string): Promise<CustomerRegions> {
  return get<CustomerRegions>(`/merchants/${enc(merchantId)}/customers/regions`);
}

export function getConnections(merchantId: string): Promise<Connections> {
  return get<Connections>(`/merchants/${enc(merchantId)}/connections`);
}

// ---- Geocoding (city level only) ----

const GEO_CACHE_PREFIX = "terminal.geocode.v1:";

function readGeoCache(query: string): [number, number] | null | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(GEO_CACHE_PREFIX + query.toLowerCase());
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null) return null;
    if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((n) => typeof n === "number")) {
      return [parsed[0] as number, parsed[1] as number];
    }
  } catch {
    // Unreadable cache entry: fall through and ask Mapbox again.
  }
  return undefined;
}

function writeGeoCache(query: string, value: [number, number] | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GEO_CACHE_PREFIX + query.toLowerCase(), JSON.stringify(value));
  } catch {
    // Storage full or blocked: the result is simply not cached.
  }
}

/** City-level position for a place. Shopify gives addresses, not coordinates. Cached in localStorage. */
export async function geocodeCity(query: string): Promise<[number, number] | null> {
  const cached = readGeoCache(query);
  if (cached !== undefined) return cached;
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${enc(query)}&types=place&limit=1&access_token=${MAPBOX_TOKEN}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return null;
  }
  // Only a real answer is cached; a failed request is tried again next time.
  if (!res.ok) return null;
  const body: { features?: { geometry: { coordinates: [number, number] } }[] } = await res.json();
  const position = body.features?.[0]?.geometry.coordinates ?? null;
  writeGeoCache(query, position);
  return position;
}

export { MAPBOX_TOKEN };
