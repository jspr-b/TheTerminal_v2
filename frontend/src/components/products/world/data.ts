import { typeColors } from "@/components/shared/BasketGalaxy";
import { selloutVisibility } from "@/components/shared/ProductVisuals";
import type { OverviewProduct, ProductPairs } from "@/lib/api";
import type { WorldPair, WorldProduct } from "./engine";

const NEUTRAL = "#a0a3c4";

/** One mapping from the API to the world, used by the Products page and the product page alike. */
export function worldData(products: OverviewProduct[], pairs: ProductPairs) {
  const colors = typeColors(pairs.nodes);
  const showSellout = selloutVisibility(products.map((p) => p.sellout)).shown;
  const index = new Map(products.map((p, i) => [p.id, i]));
  const items: WorldProduct[] = products.map((p) => {
    const f = p.forecast_state !== "too_few_sales" && p.forecast ? { lo: Math.floor(p.forecast.lower), mid: Math.round(p.forecast.value), hi: Math.ceil(p.forecast.upper) } : null;
    const s = showSellout ? p.sellout : null;
    return {
      id: p.id,
      title: p.title,
      type: p.product_type ?? "Other",
      color: (p.product_type && colors.get(p.product_type)) || NEUTRAL,
      stock: p.units,
      f,
      out: s && s.earliest_day !== null ? { e: s.earliest_day, l: s.latest_day } : null,
      band: s ? s.band : null,
      past: p.sales_28d,
      sold14: p.sold_14d,
    };
  });
  const links: WorldPair[] = pairs.links.flatMap((l) => {
    const a = index.get(l.source);
    const b = index.get(l.target);
    return a === undefined || b === undefined ? [] : [{ a, b, o: l.orders }];
  });
  return { items, links, index };
}
