import type { CommandLocation, CommandView } from "@/lib/api";

function Stat({ label, source, value }: { label: string; source: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 py-1.5">
      <span>
        {label}
        <span className="source-chip">{source}</span>
      </span>
      <b>{value}</b>
    </div>
  );
}

export default function RightPanel({ data, location, unplaced, onBack }: { data: CommandView; location: CommandLocation | null; unplaced: number; onBack: () => void }) {
  if (location) {
    const items = data.products
      .map((p) => ({ title: p.title, units: p.by_location.find((b) => b.location_id === location.id)?.units ?? 0 }))
      .filter((p) => p.units !== 0)
      .sort((a, b) => b.units - a.units);
    return (
      <aside className="glass absolute bottom-9 right-3 top-3 z-10 w-80 overflow-auto rounded-[10px] p-3.5">
        <button onClick={onBack} className="mb-2 block text-xs text-accent">Back to overview</button>
        <h2 className="text-[15px] font-semibold">{location.name}</h2>
        <div className="mb-3 text-xs text-muted">{[location.city, location.country].filter(Boolean).join(", ")}</div>
        <Stat label="Units in stock" source="Shopify" value={location.units.toLocaleString()} />
        <Stat label="Products here" source="Shopify" value={location.products.toLocaleString()} />
        <div className="mb-1.5 mt-3.5 text-[11px] uppercase tracking-wide text-muted">Stock here</div>
        {items.map((p) => (
          <div key={p.title} className="flex justify-between gap-3 border-b border-white/10 py-1.5">
            <span className="truncate">{p.title}</span>
            <span>{p.units.toLocaleString()}</span>
          </div>
        ))}
      </aside>
    );
  }
  const units = data.locations.reduce((a, l) => a + l.units, 0);
  return (
    <aside className="glass absolute bottom-9 right-3 top-3 z-10 w-80 overflow-auto rounded-[10px] p-3.5">
      <h2 className="text-[15px] font-semibold">Your store</h2>
      <div className="mb-3 text-xs text-muted">Live from Shopify.</div>
      <Stat label="Locations" source="Shopify" value={data.locations.length.toLocaleString()} />
      <Stat label="Products" source="Shopify" value={data.products.length.toLocaleString()} />
      <Stat label="Units in stock" source="Shopify" value={units.toLocaleString()} />
      <div className="mt-4 text-xs text-muted">Too few sales to predict yet.</div>
      {unplaced > 0 && <div className="mt-2 text-xs text-muted">{unplaced} location{unplaced === 1 ? " has" : "s have"} no city in Shopify, so {unplaced === 1 ? "it isn't" : "they aren't"} on the map.</div>}
    </aside>
  );
}
