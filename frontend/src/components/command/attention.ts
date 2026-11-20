import type { CommandLocation, CommandView, OverviewProduct, TrackRecord } from "@/lib/api";

/**
 * Command, "Needs attention": only Kumo's own numbers next to Shopify facts. No run-out days, no factors, no
 * risk bands of our own: each card puts Kumo's 14-day range beside the exact stock, or Kumo's past range beside
 * what really sold. Nothing here adds forecasts up into store totals.
 */
export interface AttentionItem {
  id: string;
  title: string;
  stock: number;
  /** Kumo's 14-day range, rounded outwards. */
  range: { lo: number; hi: number } | null;
  /** Units per location, biggest first. */
  at: { id: string; city: string; units: number }[];
  /** Track record: what really sold in Kumo's last finished window, and Kumo's range for it. */
  actual?: number;
  checked?: { lo: number; hi: number };
}

export interface Attention {
  /** Kumo's range reaches above the stock: Kumo expects more sales than there is stock. */
  short: AttentionItem[];
  /** The products Kumo expects to sell most (middle of the range). */
  busiest: AttentionItem[];
  above: AttentionItem[];
  below: AttentionItem[];
  forecasted: number;
  tooFew: number;
  stale: number;
}

export const BUSIEST = 3;

export function attention(cmd: CommandView, products: OverviewProduct[], track: TrackRecord | null): Attention {
  const locs = new Map<string, CommandLocation>(cmd.locations.map((l) => [l.id, l]));
  const byLoc = new Map(cmd.products.map((p) => [p.id, p.by_location]));
  const predicted = (p: OverviewProduct) => p.forecast !== null && p.forecast_state !== "too_few_sales";
  const item = (p: OverviewProduct): AttentionItem => ({
    id: p.id,
    title: p.title,
    stock: p.units,
    range: p.forecast && predicted(p) ? { lo: Math.floor(p.forecast.lower), hi: Math.ceil(p.forecast.upper) } : null,
    at: (byLoc.get(p.id) ?? [])
      .filter((b) => b.units !== 0)
      .map((b) => ({ id: b.location_id, city: locs.get(b.location_id)?.city ?? locs.get(b.location_id)?.name ?? "?", units: b.units }))
      .sort((a, b) => b.units - a.units),
  });
  const withRange = products.filter(predicted);
  // Fresh ranges only: a stale range still shows on Products, but raises no alert here.
  const fresh = withRange.filter((p) => p.forecast_state === "forecast");
  const short = fresh
    .filter((p) => p.forecast !== null && Math.ceil(p.forecast.upper) > p.units)
    .sort((a, b) => (b.forecast?.upper ?? 0) - b.units - ((a.forecast?.upper ?? 0) - a.units))
    .map(item);
  const busiest = [...fresh].sort((a, b) => (b.forecast?.value ?? 0) - (a.forecast?.value ?? 0)).slice(0, BUSIEST).map(item);
  const byId = new Map(products.map((p) => [p.id, p]));
  const checked = (result: "above" | "below") =>
    (track?.products ?? [])
      .filter((t) => t.result === result && byId.has(t.product_id))
      .map((t) => ({ ...item(byId.get(t.product_id) as OverviewProduct), actual: t.actual, checked: { lo: Math.floor(t.lower), hi: Math.ceil(t.upper) } }));
  return {
    short,
    busiest,
    above: checked("above"),
    below: checked("below"),
    forecasted: fresh.length,
    tooFew: products.filter((p) => p.forecast_state === "too_few_sales").length,
    stale: withRange.filter((p) => p.forecast_state === "stale").length,
  };
}
