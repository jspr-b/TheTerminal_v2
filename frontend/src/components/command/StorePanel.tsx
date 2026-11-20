"use client";

import Link from "next/link";
import type { CommandLocation, CommandView, StorePeriod, StoreSummary, TrackRecord } from "@/lib/api";
import { day } from "@/lib/format";
import type { Attention } from "./attention";
import CustomerPanel from "./CustomerPanel";
import type { CustomerCard } from "@/lib/api";

export const STORE_W = 316;

function money(v: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

/** "16 more" / "3 fewer" / "the same": the change against the 14 days before, in plain words. */
function change(now: number, before: number, unit = "", fmt: (n: number) => string = (n) => n.toLocaleString()) {
  const d = now - before;
  if (d === 0) return "same as the 14 days before";
  return `${fmt(Math.abs(d))}${unit} ${d > 0 ? "more" : unit ? "less" : "fewer"} than the 14 days before`;
}

function Kpi({ value, label, delta, up }: { value: string; label: string; delta?: string; up?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-xl leading-tight">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
      {delta && <div className={`text-[10.5px] leading-snug ${up ? "text-[#9aa6ff]" : "text-[#6c6c86]"}`}>{delta}</div>}
    </div>
  );
}

function Heading({ children, right }: { children: React.ReactNode; right?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between text-[10px] uppercase tracking-[.07em] text-muted">
      <span>{children}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

function Shopify({ s }: { s: StoreSummary }) {
  const c: StorePeriod = s.current;
  const p: StorePeriod = s.previous;
  const max = Math.max(1, ...s.daily_units);
  const half = s.daily_units.length / 2;
  return (
    <div>
      <Heading right="exact">
        Last {s.days} days <span className="source-chip">Shopify</span>
      </Heading>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        {c.revenue !== null && s.currency ? (
          <Kpi value={money(c.revenue, s.currency)} label="revenue" delta={p.revenue !== null ? change(c.revenue, p.revenue, "", (n) => money(n, s.currency ?? "EUR")) : undefined} up={p.revenue !== null && c.revenue >= p.revenue} />
        ) : (
          <Kpi value="–" label="revenue" delta="orders use more than one currency" />
        )}
        <Kpi value={c.orders.toLocaleString()} label="orders" delta={change(c.orders, p.orders)} up={c.orders >= p.orders} />
        <Kpi value={c.units.toLocaleString()} label="units sold" delta={change(c.units, p.units)} up={c.units >= p.units} />
        <Kpi value={c.customers.toLocaleString()} label={`customers · ${c.countries} ${c.countries === 1 ? "country" : "countries"}`} />
      </div>
      <svg className="mt-2.5 block" width="100%" height="40" viewBox={`0 0 ${s.daily_units.length * 10} 40`} preserveAspectRatio="none" role="img" aria-label={`Units sold per day, last ${s.daily_units.length} days`}>
        {s.daily_units.map((u, i) => (
          <rect key={i} x={i * 10 + 1.5} width={7} y={38 - (u / max) * 34} height={(u / max) * 34} rx={1.5} fill={i >= half ? "#9aa6ff" : "#3a3f7a"} />
        ))}
      </svg>
      <div className="text-[10.5px] text-[#6c6c86]">Units sold per day, last {s.daily_units.length} days · brighter = the last {s.days}</div>
    </div>
  );
}

function Kumo({ a, track }: { a: Attention; track: TrackRecord | null }) {
  return (
    <div>
      <Heading right="per product">
        Next 14 days <span className="source-chip">Kumo</span>
      </Heading>
      {a.forecasted === 0 ? (
        <p className="text-xs text-muted">Kumo has no fresh 14-day ranges yet.</p>
      ) : (
        <>
          <Line label="Kumo expects more than your stock" value={`${a.short.length} of ${a.forecasted}`} />
          {a.busiest[0]?.range && (
            <div className="flex justify-between gap-2.5 border-b border-white/[0.05] py-1.5 text-xs">
              <span className="min-w-0">
                Busiest, per Kumo
                <span className="block break-words text-[10.5px] leading-snug text-muted">
                  {a.busiest[0].title} · you have {a.busiest[0].stock}
                </span>
              </span>
              <span className="flex-none font-mono">
                {a.busiest[0].range.lo}–{a.busiest[0].range.hi}
              </span>
            </div>
          )}
          {a.tooFew > 0 && <Line label="Too few sales for a range" value={String(a.tooFew)} />}
          {a.stale > 0 && <Line label="Kumo did not answer the last run: last range shown" value={String(a.stale)} />}
        </>
      )}
      {track && track.checked > 0 ? (
        <div className="flex justify-between gap-2.5 py-1.5 text-xs">
          <span>
            Kumo&apos;s range held
            <span className="block text-[10.5px] text-muted">
              last check, {day(track.window_start ?? "")} – {day(track.window_end ?? "")}
            </span>
            <span className="mt-1 flex gap-[3px]" aria-hidden="true">
              {Array.from({ length: track.checked }, (_, i) => (
                <i key={i} className={`h-2 w-2 rounded-full border border-accent ${i < track.inside ? "bg-accent" : ""}`} />
              ))}
            </span>
          </span>
          <span className="font-mono">
            {track.inside} of {track.checked}
          </span>
        </div>
      ) : (
        <p className="py-1.5 text-[11px] text-muted">The first check comes 14 days after Kumo&apos;s first forecast.</p>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2.5 border-b border-white/[0.05] py-1.5 text-xs">
      <span>{label}</span>
      <span className="flex-none font-mono">{value}</span>
    </div>
  );
}

export default function StorePanel({
  open,
  onClose,
  data,
  summary,
  track,
  attention,
  location,
  onLocation,
  unplaced,
  bottom,
  customers = null,
}: {
  open: boolean;
  onClose: () => void;
  data: CommandView;
  summary: StoreSummary | null;
  track: TrackRecord | null;
  attention: Attention;
  location: CommandLocation | null;
  onLocation: (id: string | null) => void;
  unplaced: number;
  bottom: number;
  /** A green dot is chosen: the panel shows its customers instead of the store. */
  customers?: { card: CustomerCard | null; loading: boolean; error: string | null; onBack: () => void; onOpen: (id: string) => void } | null;
}) {
  const units = data.locations.reduce((a, l) => a + l.units, 0);
  return (
    <aside
      aria-label={customers ? "Customer" : location ? location.name : "Your store"}
      inert={!open || undefined}
      className={`absolute right-3 top-3 z-[6] overflow-auto rounded-xl border border-edge bg-[#0c0c18]/92 p-3.5 backdrop-blur transition-[transform,opacity,bottom] duration-[450ms] [transition-timing-function:cubic-bezier(.2,.8,.2,1)] ${
        open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[calc(100%+24px)] opacity-0"
      }`}
      style={{ width: STORE_W, bottom: bottom + 12 }}
    >
      <button type="button" onClick={onClose} aria-label="Hide panel" className="absolute right-2 top-2 h-6 w-6 rounded-full border border-edge text-[13px] leading-none text-muted hover:border-accent hover:text-[#e7e7f0]">
        ✕
      </button>
      {customers ? (
        <CustomerPanel card={customers.card} loading={customers.loading} error={customers.error} onBack={customers.onBack} onOpen={customers.onOpen} />
      ) : location ? (
        <LocationView data={data} location={location} onBack={() => onLocation(null)} attention={attention} />
      ) : (
        <>
          <h2 className="text-[15px] font-semibold">Your store</h2>
          <div className="mb-3 text-[11px] text-muted">
            {data.locations.length} locations ·{" "}
            <Link href="/products" className="hover:text-accent">
              {data.products.length} products
            </Link>{" "}
            · {units.toLocaleString()} units in stock
          </div>
          {summary ? <Shopify s={summary} /> : <p className="text-xs text-muted">Loading store numbers…</p>}
          <div className="mt-3 border-t border-white/[0.07] pt-3">
            <Kumo a={attention} track={track} />
          </div>
          <div className="mt-3 border-t border-white/[0.07] pt-3">
            <Heading right="units">
              Locations <span className="source-chip">Shopify</span>
            </Heading>
            {data.locations.map((l) => {
              return (
                <button key={l.id} type="button" onClick={() => onLocation(l.id)} className="group flex w-full items-center gap-2 border-b border-white/[0.05] py-1.5 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-xs group-hover:text-accent">{l.name}</span>
                  </span>
                  <span className="font-mono text-xs">{l.units.toLocaleString()}</span>
                </button>
              );
            })}
            {unplaced > 0 && (
              <p className="mt-2 text-[11px] text-muted">
                {unplaced} location{unplaced === 1 ? " has" : "s have"} no city in Shopify, so {unplaced === 1 ? "it isn't" : "they aren't"} on the map.
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function LocationView({ data, location, onBack, attention }: { data: CommandView; location: CommandLocation; onBack: () => void; attention: Attention }) {
  const items = data.products
    .map((p) => ({ id: p.id, title: p.title, units: p.by_location.find((b) => b.location_id === location.id)?.units ?? 0 }))
    .filter((p) => p.units !== 0)
    .sort((a, b) => b.units - a.units);
  return (
    <>
      <button type="button" onClick={onBack} className="mb-2 block text-xs text-accent">
        ← Your store
      </button>
      <h2 className="pr-7 text-[15px] font-semibold">{location.name}</h2>
      <div className="mb-3 text-[11px] text-muted">{[location.city, location.country].filter(Boolean).join(", ")}</div>
      <div className="grid grid-cols-2 gap-3">
        <Kpi value={location.units.toLocaleString()} label="units in stock" />
        <Kpi value={location.products.toLocaleString()} label="products here" />
      </div>
      <div className="mb-1.5 mt-3.5 text-[10px] uppercase tracking-[.07em] text-muted">
        Stock here <span className="source-chip">Shopify</span>
      </div>
      {items.map((p) => (
        <Link key={p.id} href={`/products/${encodeURIComponent(p.id)}`} className="flex justify-between gap-3 border-b border-white/[0.05] py-1.5 text-xs hover:text-accent">
          <span className="min-w-0 break-words">
            {p.title}
          </span>
          <span className="font-mono">{p.units.toLocaleString()}</span>
        </Link>
      ))}
    </>
  );
}
