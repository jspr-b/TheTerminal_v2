"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEV_MERCHANT, geocodeCity, getCommand, getHeatmap, type CommandLocation, type CommandView, type HeatmapLayer, type HeatmapPoint } from "@/lib/api";
import GlobeMap, { type HeatmapData, type PlacedLocation } from "./GlobeMap";
import HeatmapPanel, { HEAT_LAYERS, type HeatView } from "./HeatmapPanel";
import ProductDrawer from "./ProductDrawer";
import RightPanel from "./RightPanel";
import Sidebar from "./Sidebar";

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

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const view = await getCommand(DEV_MERCHANT);
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 flex-none items-center gap-2 border-b border-edge px-4 text-muted">
          <span>Command</span>
          {heatLayer && <span>/ {HEAT_LAYERS[heatLayer].label}</span>}
          {location && <span className="text-[#e7e7f0]">/ {location.name}</span>}
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <GlobeMap locations={placed} selected={selected} onSelect={setSelected} heatmap={heatData} />
          <HeatmapPanel active={heatLayer} onChange={(l) => void chooseLayer(l)} view={heatView} loading={heatLoading} error={heatError} />
          {error && <div className="glass absolute left-14 top-3 z-10 rounded-lg px-3 py-2 text-red-300">{error}</div>}
          {data && <RightPanel data={data} location={location} unplaced={unplaced} onBack={() => setSelected(null)} />}
          {data && <ProductDrawer products={data.products} selected={selected} />}
        </div>
      </main>
    </div>
  );
}
