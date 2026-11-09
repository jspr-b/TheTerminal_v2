"use client";

import { useEffect, useMemo, useState } from "react";
import { DEV_MERCHANT, geocodeCity, getCommand, type CommandLocation, type CommandView } from "@/lib/api";
import GlobeMap, { type PlacedLocation } from "./GlobeMap";
import ProductDrawer from "./ProductDrawer";
import RightPanel from "./RightPanel";
import Sidebar from "./Sidebar";

function addressOf(l: CommandLocation): string | null {
  return l.city ? [l.city, l.province, l.country].filter(Boolean).join(", ") : null;
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

  const location = useMemo(() => data?.locations.find((l) => l.id === selected) ?? null, [data, selected]);
  const unplaced = (data?.locations.length ?? 0) - placed.length;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 flex-none items-center gap-2 border-b border-edge px-4 text-muted">
          <span>Command</span>
          {location && <span className="text-[#e7e7f0]">/ {location.name}</span>}
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <GlobeMap locations={placed} selected={selected} onSelect={setSelected} />
          {error && <div className="glass absolute left-3 top-3 z-10 rounded-lg px-3 py-2 text-red-300">{error}</div>}
          {data && <RightPanel data={data} location={location} unplaced={unplaced} onBack={() => setSelected(null)} />}
          {data && <ProductDrawer products={data.products} selected={selected} />}
        </div>
      </main>
    </div>
  );
}
