"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEV_MERCHANT,
  geocodeCity,
  getCustomer,
  getCustomerDots,
  getCommand,
  getHeatmap,
  getProductsOverview,
  getStoreSummary,
  getTrackRecord,
  type CustomerCard,
  type CustomerDot,
  type CommandLocation,
  type CommandView,
  type HeatmapLayer,
  type HeatmapPoint,
  type OverviewProduct,
  type StoreSummary,
  type TrackRecord,
} from "@/lib/api";
import { cached, cachedLoad } from "@/components/shared/Load";
import AttentionStrip, { ATTN_H } from "./AttentionStrip";
import { attention, type AttentionItem } from "./attention";
import GlobeMap, { type PlacedCustomer, type FocusProduct, type HeatmapData, type OrderCity, type PlacedLocation } from "./GlobeMap";
import LayerMenu, { HEAT_LAYERS, LayerLegend, type HeatView } from "./HeatmapPanel";
import Sidebar from "./Sidebar";
import StorePanel, { STORE_W } from "./StorePanel";

function addressOf(l: CommandLocation): string | null {
  return l.city ? [l.city, l.province, l.country].filter(Boolean).join(", ") : null;
}

function cityOf(p: HeatmapPoint): string {
  return [p.city, p.province, p.country].filter(Boolean).join(", ");
}

/** Runs `fn` over `items`, a few at a time, so dozens of cities don't hit the geocoder at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export default function Command() {
  const [data, setData] = useState<CommandView | null>(null);
  const [placed, setPlaced] = useState<PlacedLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Last answers from the shared cache: coming back to Command shows them at once, then they refresh.
  const [summary, setSummary] = useState<StoreSummary | null>(() => cached<StoreSummary>(`store-summary:${DEV_MERCHANT}`));
  const [products, setProducts] = useState<OverviewProduct[]>(() => cached<{ products: OverviewProduct[] }>(`products-overview:${DEV_MERCHANT}`)?.products ?? []);
  const [track, setTrack] = useState<TrackRecord | null>(() => cached<TrackRecord>(`track-record:${DEV_MERCHANT}`));
  const [cities, setCities] = useState<OrderCity[]>([]);
  const [storeOpen, setStoreOpen] = useState(true);
  const [attnOpen, setAttnOpen] = useState(true);
  const [focus, setFocus] = useState<FocusProduct | null>(null);
  // A green dot is one customer: their card replaces "Your store" in the right panel.
  const [people, setPeople] = useState<PlacedCustomer[]>([]);
  const [person, setPerson] = useState<PlacedCustomer | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [card, setCard] = useState<CustomerCard | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const cardTicket = useRef(0);
  const openCustomer = useCallback(
    (id: string | null, at: PlacedCustomer | null = null) => {
      const ticket = ++cardTicket.current;
      setCustomerId(id);
      setCardError(null);
      setPerson(at ?? (id ? (people.find((p) => p.dot.id === id) ?? null) : null));
      if (!id) return setCard(null);
      const key = `customer:${DEV_MERCHANT}:${id}`;
      setCard(cached<CustomerCard>(key));
      setSelected(null);
      setStoreOpen(true);
      cachedLoad(key, () => getCustomer(DEV_MERCHANT, id)).then(
        (d) => ticket === cardTicket.current && setCard(d),
        (e: unknown) => ticket === cardTicket.current && setCardError(e instanceof Error ? e.message : "Could not load."),
      );
    },
    [people],
  );

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const view = await cachedLoad(`command:${DEV_MERCHANT}`, () => getCommand(DEV_MERCHANT));
        const located = await Promise.all(
          view.locations.map(async (l): Promise<PlacedLocation | null> => {
            if (l.lat !== null && l.lng !== null) return { ...l, position: [l.lng, l.lat] };
            const address = addressOf(l);
            const position = address ? await geocodeCity(address) : null;
            return position ? { ...l, position } : null;
          }),
        );
        if (!live) return;
        setData(view);
        setPlaced(located.filter((l): l is PlacedLocation => l !== null));
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not load data");
      }
    })();
    // The rest of the page: each part shows up when it arrives; a failure only hides that part.
    cachedLoad(`store-summary:${DEV_MERCHANT}`, () => getStoreSummary(DEV_MERCHANT)).then((s) => live && setSummary(s), () => undefined);
    cachedLoad(`products-overview:${DEV_MERCHANT}`, () => getProductsOverview(DEV_MERCHANT)).then((o) => live && setProducts(o.products), () => undefined);
    cachedLoad(`track-record:${DEV_MERCHANT}`, () => getTrackRecord(DEV_MERCHANT)).then((t) => live && setTrack(t), () => undefined);
    // Customer dots at their Shopify map position; without one, around their city centre (sunflower spacing).
    cachedLoad(`customer-dots:${DEV_MERCHANT}`, () => getCustomerDots(DEV_MERCHANT))
      .then(async ({ dots }) => {
        const loose = [...new Set(dots.filter((d) => d.lat === null || d.lng === null).map((d) => `${d.city}|${d.country ?? ""}`))];
        const centre = new Map<string, [number, number] | null>();
        const found = await mapLimit(loose, 6, (k) => geocodeCity(k.split("|").filter(Boolean).join(", ")));
        loose.forEach((k, i) => centre.set(k, found[i]));
        const seen = new Map<string, number>();
        const placedPeople = dots.flatMap((d: CustomerDot): PlacedCustomer[] => {
          if (d.lat !== null && d.lng !== null) return [{ dot: d, position: [d.lng, d.lat], exact: true }];
          const k = `${d.city}|${d.country ?? ""}`;
          const c = centre.get(k);
          if (!c) return [];
          const n = seen.get(k) ?? 0;
          seen.set(k, n + 1);
          const r = 0.004 * Math.sqrt(n + 1), a = n * 2.39996;
          return [{ dot: d, position: [c[0] + r * Math.cos(a) * 1.5, c[1] + r * Math.sin(a)], exact: false }];
        });
        if (live) setPeople(placedPeople);
      })
      .catch(() => undefined);
    // Order cities (exact, only cities with enough orders): they frame the globe's home view.
    cachedLoad(`heatmap:orders:${DEV_MERCHANT}`, () => getHeatmap(DEV_MERCHANT, "orders"))
      .then(async (h) => {
        if (h.section.state !== "ready") return;
        const pts = h.points.filter((p) => p.value > 0);
        const pos = await mapLimit(pts, 6, (p) => geocodeCity(cityOf(p)));
        if (live) setCities(pts.flatMap((p, i) => (pos[i] ? [{ name: p.city, country: p.country, position: pos[i] as [number, number], orders: p.value }] : [])));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // Heatmap layer: one request per choice, then city-level geocoding (cached).
  const [heatLayer, setHeatLayer] = useState<HeatmapLayer | null>(null);
  const [heatView, setHeatView] = useState<HeatView | null>(null);
  const [heatData, setHeatData] = useState<HeatmapData | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);
  const [heatError, setHeatError] = useState<string | null>(null);
  const heatRequest = useRef(0);

  const chooseLayer = useCallback(async (layer: HeatmapLayer | null) => {
    const ticket = ++heatRequest.current;
    setHeatLayer(layer);
    setHeatData(null);
    setHeatError(null);
    if (layer === null) {
      setHeatLoading(false);
      return;
    }
    setHeatLoading(true);
    try {
      const heatmap = await getHeatmap(DEV_MERCHANT, layer);
      if (ticket !== heatRequest.current) return;
      if (heatmap.section.state !== "ready") {
        setHeatView({ layer, heatmap, unplaced: 0 });
        return;
      }
      const points = heatmap.points.filter((p) => p.value > 0);
      const positions = await mapLimit(points, 6, (p) => geocodeCity(cityOf(p)));
      if (ticket !== heatRequest.current) return;
      const max = Math.max(0, ...points.map((p) => p.value));
      const placedPoints = points.flatMap((p, i) => {
        const position = positions[i];
        return position && max > 0 ? [{ position, weight: p.value / max }] : [];
      });
      setHeatView({ layer, heatmap, unplaced: points.length - placedPoints.length });
      setHeatData({ points: placedPoints, ramp: HEAT_LAYERS[layer].ramp });
    } catch (e) {
      if (ticket === heatRequest.current) setHeatError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      if (ticket === heatRequest.current) setHeatLoading(false);
    }
  }, []);

  const location = useMemo(() => data?.locations.find((l) => l.id === selected) ?? null, [data, selected]);
  const unplaced = (data?.locations.length ?? 0) - placed.length;
  const att = useMemo(() => (data ? attention(data, products, track) : null), [data, products, track]);
  const onHover = useCallback((it: AttentionItem | null) => setFocus(it ? { title: it.title, at: Object.fromEntries(it.at.map((a) => [a.id, a.units])) } : null), []);
  const insets = { right: storeOpen ? STORE_W + 12 : 0, bottom: attnOpen ? ATTN_H : 0 };
  const attnCount = att ? att.short.length + att.busiest.filter((b) => !att.short.some((s) => s.id === b.id)).length + att.above.length + att.below.length : 0;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 flex-none items-center gap-2 border-b border-edge px-4 text-muted">
          <span>Command</span>
          {heatLayer && <span>/ {HEAT_LAYERS[heatLayer].label}</span>}
          {customerId && <span className="text-[#86efac]">/ Customer {card?.code ?? person?.dot.code ?? ""}</span>}
          {location && <span className="text-[#e7e7f0]">/ {location.name}</span>}
          <span className="flex-1" />
          <LayerMenu active={heatLayer} onChange={(l) => void chooseLayer(l)} view={heatView} loading={heatLoading} error={heatError} />
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <GlobeMap
            locations={placed}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              if (id) openCustomer(null);
            }}
            heatmap={heatData}
            cities={cities}
            focus={focus}
            people={people}
            chosenPerson={person}
            onPerson={(p) => openCustomer(p.dot.id, p)}
            insets={insets}
          />
          <LayerLegend active={heatLayer} view={heatView} bottom={insets.bottom} />
          {error && <div className="glass absolute left-14 top-3 z-10 rounded-lg px-3 py-2 text-red-300">{error}</div>}
          {data && att && (
            <StorePanel
              open={storeOpen}
              onClose={() => setStoreOpen(false)}
              data={data}
              summary={summary}
              track={track}
              attention={att}
              location={location}
              onLocation={setSelected}
              customers={customerId ? { card, loading: card === null && !cardError, error: cardError, onBack: () => openCustomer(null), onOpen: (id) => openCustomer(id) } : null}
              unplaced={unplaced}
              bottom={insets.bottom}
            />
          )}
          {att && <AttentionStrip open={attnOpen} onClose={() => setAttnOpen(false)} a={att} onHover={onHover} />}
          {/* bring the panels back */}
          <button
            type="button"
            onClick={() => setStoreOpen(true)}
            className={`absolute right-3.5 top-3.5 z-[5] rounded-[9px] border border-edge bg-[#0c0c16]/90 px-2.5 py-1 text-xs text-muted transition-opacity delay-150 hover:border-accent hover:text-[#e7e7f0] ${storeOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
          >
            ‹ Your store
          </button>
          <button
            type="button"
            onClick={() => setAttnOpen(true)}
            className={`absolute bottom-3.5 left-1/2 z-[5] -translate-x-1/2 rounded-[9px] border border-edge bg-[#0c0c16]/90 px-2.5 py-1 text-xs text-muted transition-opacity delay-150 hover:border-accent hover:text-[#e7e7f0] ${attnOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
          >
            ⌃ Needs attention{attnCount ? ` · ${attnCount}` : ""}
          </button>
        </div>
      </main>
    </div>
  );
}
