"use client";

import { useState, type ReactNode } from "react";
import InsightCard, { CardGrid } from "@/components/shared/InsightCard";
import Modal from "@/components/shared/Modal";
import { STOCK, StockVsRange, dayFromToday, useWidth } from "@/components/shared/ProductVisuals";
import { SubHeading } from "@/components/shell/PageShell";
import SourceChip from "@/components/shared/SourceChip";
import type { ProductDetail, Section, SectionSource } from "@/lib/api";

/**
 * Local design preview only: made-up numbers for sections that are not connected or not built yet,
 * so the owner can judge the cards. Never in a production build (next.config.js refuses the flag).
 */
export const SHOW_SAMPLES = process.env.NEXT_PUBLIC_SHOW_SAMPLES === "1";

const BLUE = { low: "#3d4f8f", medium: "#5b74d6", high: "#9db6ff" } as const;
type Chance = keyof typeof BLUE;
const ACCENT = "#7c8cff";

/** Same product, same made-up numbers on every load. */
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function SampleTag() {
  return (
    <span
      title="Made-up numbers to preview the design. Not real data."
      className="ml-1.5 whitespace-nowrap rounded border border-dashed border-white/40 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.08)_0_4px,transparent_4px_8px)] px-1 text-[10px] font-semibold normal-case tracking-normal text-[#e7e7f0]"
    >
      sample data
    </span>
  );
}

function ChanceChip({ c }: { c: Chance }) {
  return (
    <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: `${BLUE[c]}88`, color: BLUE[c], background: `${BLUE[c]}1f` }}>
      {c} chance
    </span>
  );
}

interface Sample {
  title: string;
  sources: SectionSource[];
  visual: ReactNode;
  line: ReactNode;
  detail: ReactNode;
}

type Ctx = { p: ProductDetail; rnd: () => number; others: string[] };
type Range = { lower: number; value: number; upper: number };
const r0 = (n: number) => Math.max(0, Math.round(n));
const rangeOf = (v: number, spread = 0.35): Range => ({ lower: r0(v * (1 - spread)), value: r0(v), upper: r0(v * (1 + spread)) });
const words = (r: Range) => `${r.lower}–${r.upper}`;

/** 14 per-day ranges with a weekly shape, adding up to about the real 14-day middle. */
function dailyRanges({ p, rnd }: Ctx): Range[] {
  const total = p.forecast?.value ?? Math.max(14, p.sold_14d);
  const start = new Date().getDay();
  const w = Array.from({ length: 14 }, (_, i) => {
    const wd = (start + i + 1) % 7;
    return (wd === 0 || wd === 6 ? 1.5 : wd === 5 ? 1.2 : 0.85) * (0.85 + rnd() * 0.3);
  });
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x, i) => {
    const v = (total * x) / sum;
    const s = 0.25 + i * 0.02; // wider further out
    return { lower: v * (1 - s), value: v, upper: v * (1 + s) };
  });
}

function DailyChart({ days, height }: { days: Range[]; height: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const max = Math.max(1, ...days.map((d) => d.upper)) * 1.1;
  const slot = width / 14;
  const y = (v: number) => 6 + (height - 24) * (1 - v / max);
  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={width} height={height} className="block" aria-hidden="true">
          {days.map((d, i) => (
            <g key={i}>
              <rect x={i * slot + slot * 0.2} y={y(d.upper)} width={slot * 0.6} height={Math.max(2, y(d.lower) - y(d.upper))} rx={3} fill={ACCENT} fillOpacity={0.22} stroke={ACCENT} strokeOpacity={0.6} />
              <line x1={i * slot + slot * 0.2} x2={i * slot + slot * 0.8} y1={y(d.value)} y2={y(d.value)} stroke={ACCENT} strokeWidth={2} />
              {(i === 0 || i === 6 || i === 13) && (
                <text x={i === 0 ? 0 : i === 13 ? width : i * slot + slot / 2} y={height - 4} textAnchor={i === 0 ? "start" : i === 13 ? "end" : "middle"} fontSize={10} fill="#8d8da6">
                  {dayFromToday(i + 1).slice(0, 6)}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

function Big({ children, unit }: { children: ReactNode; unit: string }) {
  return (
    <div className="font-mono text-[34px] leading-none tracking-[-0.02em]">
      {children}
      <small className="ml-2 font-sans text-sm tracking-normal text-muted">{unit}</small>
    </div>
  );
}

function BarRow({ label, value, max, right, color = "rgba(231,231,240,.45)" }: { label: ReactNode; value: number; max: number; right: ReactNode; color?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 text-[12px]">
      <span className="truncate">{label}</span>
      <span className="font-mono text-muted">{right}</span>
      <span className="col-span-2 mt-1 h-1.5 rounded-sm bg-white/[0.06]">
        <span className="block h-1.5 rounded-sm" style={{ width: `${(100 * value) / Math.max(1, max)}%`, background: color }} />
      </span>
    </div>
  );
}

function LocationRows({ rows, big }: { rows: { name: string; units: number; r: Range }[]; big?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const scaleMax = Math.max(1, ...rows.map((l) => Math.max(l.units, l.r.upper)));
  return (
    <div ref={ref} className="flex flex-col gap-2">
      {width > 0 &&
        rows.map((l) => (
          <div key={l.name}>
            <div className="flex justify-between gap-3 text-[12px]">
              <span className="min-w-0 truncate">{l.name}</span>
              <span className="flex-none whitespace-nowrap text-muted">
                {big && (
                  <>
                    <span className="font-mono text-[#e7e7f0]">{l.units}</span> in stock ·{" "}
                  </>
                )}
                likely <span className="font-mono text-[#e7e7f0]">{words(l.r)}</span>
              </span>
            </div>
            <StockVsRange width={width} units={l.units} range={l.r} color={ACCENT} height={big ? 30 : 22} scaleMax={scaleMax} />
          </div>
        ))}
    </div>
  );
}

const PLATFORMS = ["Meta", "Google", "TikTok", "Pinterest"];
const REASONS = ["Too small", "Too big", "Not as pictured", "Changed mind"];

/** One made-up card per section key that is not ready. Unknown keys get no sample. */
function build(key: string, ctx: Ctx): Sample | null {
  const { p, rnd, others } = ctx;
  const f = p.forecast ?? rangeOf(Math.max(10, p.sold_14d));
  switch (key) {
    case "daily_demand": {
      const days = dailyRanges(ctx);
      const peak = days.reduce((b, d, i) => (d.value > days[b].value ? i : b), 0);
      return {
        title: "Sales curve, next 14 days",
        sources: ["kumo"],
        visual: <DailyChart days={days} height={120} />,
        line: (
          <>
            Busiest day likely <b>{dayFromToday(peak + 1)}</b>, about <b className="font-mono">{words(rangeOf(days[peak].value, 0.3))}</b>.
          </>
        ),
        detail: (
          <>
            <DailyChart days={days} height={260} />
            <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-1 text-[12px] md:grid-cols-4">
              {days.map((d, i) => (
                <div key={i} className="flex justify-between border-b border-white/[0.07] py-1">
                  <span className="text-muted">{dayFromToday(i + 1)}</span>
                  <span className="font-mono">{words({ lower: r0(d.lower), value: r0(d.value), upper: Math.max(r0(d.upper), r0(d.lower) + 1) })}</span>
                </div>
              ))}
            </div>
          </>
        ),
      };
    }
    case "location_demand": {
      const locs = p.by_location.length > 0 ? p.by_location.map((l) => ({ name: l.name, units: l.units })) : [{ name: "Warehouse", units: 60 }, { name: "Amsterdam store", units: 18 }];
      const totalUnits = Math.max(1, locs.reduce((a, l) => a + Math.max(0, l.units), 0));
      const rows = locs
        .map((l) => ({ ...l, r: rangeOf((f.value * (Math.max(0, l.units) / totalUnits)) * (0.8 + rnd() * 0.4)) }))
        .sort((a, b) => b.r.value - a.r.value);
      return {
        title: "Will sell per location",
        sources: ["kumo"],
        visual: (
          <div className="flex h-full flex-col justify-end">
            <LocationRows rows={rows.slice(0, 2)} />
          </div>
        ),
        line: (
          <>
            Most likely sold at <b>{rows[0].name}</b> ({rows.length} {rows.length === 1 ? "location" : "locations"}).
          </>
        ),
        detail: <LocationRows rows={rows} big />,
      };
    }
    case "product_returns": {
      const r = rangeOf(Math.max(2, f.value * (0.04 + rnd() * 0.06)), 0.5);
      const reasons = REASONS.map((name) => ({ name, n: 1 + Math.floor(rnd() * 9) })).sort((a, b) => b.n - a.n);
      const max = Math.max(...reasons.map((x) => x.n));
      return {
        title: "Units likely to come back",
        sources: ["kumo"],
        visual: (
          <div className="flex h-full flex-col">
            <Big unit="likely returned">{words(r)}</Big>
            <div className="mt-auto flex flex-col gap-1.5">
              {reasons.slice(0, 2).map((x) => (
                <BarRow key={x.name} label={x.name} value={x.n} max={max} right={x.n} />
              ))}
            </div>
          </div>
        ),
        line: (
          <>
            Of the next 14 days&apos; sales, <b className="font-mono">{words(r)}</b> likely come back. Top reason: <b>{reasons[0].name.toLowerCase()}</b>.
          </>
        ),
        detail: (
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <Big unit="units likely back">{words(r)}</Big>
              <p className="mt-3 text-muted">Returns asked for on orders of the next 14 days. Middle {r.value}.</p>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-[11px] uppercase tracking-[0.06em] text-muted">Return reasons, last 90 days</p>
              {reasons.map((x) => (
                <BarRow key={x.name} label={x.name} value={x.n} max={max} right={`${x.n} returns`} />
              ))}
            </div>
          </div>
        ),
      };
    }
    case "bought_next": {
      const names = (others.length >= 3 ? others : [...others, "Canvas Tote", "Leather Belt", "Wool Scarf"]).slice(0, 5);
      const chances: Chance[] = ["high", "medium", "medium", "low", "low"];
      const rows = names.map((name, i) => ({ name, c: chances[i], days: 5 + Math.floor(rnd() * 20) }));
      return {
        title: "What customers buy next",
        sources: ["kumo"],
        visual: (
          <ul className="flex h-full flex-col justify-end gap-2 text-[12px]">
            {rows.slice(0, 3).map((x) => (
              <li key={x.name} className="flex items-center justify-between gap-2">
                <span className="truncate">{x.name}</span>
                <ChanceChip c={x.c} />
              </li>
            ))}
          </ul>
        ),
        line: (
          <>
            After buying this, customers most likely come back for <b>{rows[0].name}</b>.
          </>
        ),
        detail: (
          <div className="max-w-[640px]">
            {rows.map((x) => (
              <div key={x.name} className="flex items-center justify-between gap-3 border-b border-white/[0.07] py-2.5">
                <span>{x.name}</span>
                <span className="flex items-center gap-3 text-[12px] text-muted">
                  usually within {x.days} days <ChanceChip c={x.c} />
                </span>
              </div>
            ))}
          </div>
        ),
      };
    }
    case "best_platform": {
      const rows = PLATFORMS.map((name) => ({ name, r: rangeOf(f.value * (0.1 + rnd() * 0.5), 0.4) })).sort((a, b) => b.r.value - a.r.value);
      const max = Math.max(...rows.map((x) => x.r.upper));
      return {
        title: "Best ad platform",
        sources: ["kumo"],
        visual: (
          <div className="flex h-full flex-col justify-end gap-2">
            {rows.slice(0, 3).map((x, i) => (
              <BarRow key={x.name} label={x.name} value={x.r.value} max={max} right={words(x.r)} color={i === 0 ? ACCENT : "rgba(124,140,255,.35)"} />
            ))}
          </div>
        ),
        line: (
          <>
            <b>{rows[0].name}</b> likely brings the most sales: <b className="font-mono">{words(rows[0].r)}</b> in 14 days.
          </>
        ),
        detail: (
          <div className="flex max-w-[720px] flex-col gap-4">
            <p className="text-muted">Likely sales from each platform&apos;s ads in the next 14 days, at today&apos;s spend.</p>
            {rows.map((x, i) => (
              <BarRow key={x.name} label={x.name} value={x.r.value} max={max} right={`${words(x.r)} sales`} color={i === 0 ? ACCENT : "rgba(124,140,255,.35)"} />
            ))}
          </div>
        ),
      };
    }
    case "shopping_ads": {
      const c: Chance = rnd() < 0.33 ? "low" : rnd() < 0.6 ? "medium" : "high";
      const scale = (big: boolean) => (
        <div className="flex gap-1.5">
          {(["low", "medium", "high"] as const).map((k) => (
            <span
              key={k}
              className={`flex-1 rounded-md border text-center ${big ? "py-4 text-sm" : "py-2 text-[11px]"}`}
              style={k === c ? { borderColor: BLUE[k], background: `${BLUE[k]}33`, color: STOCK } : { borderColor: "rgba(255,255,255,.08)", color: "#55556d" }}
            >
              {k}
            </span>
          ))}
        </div>
      );
      return {
        title: "Likely to sell from Shopping ads",
        sources: ["kumo"],
        visual: <div className="flex h-full flex-col justify-end">{scale(false)}</div>,
        line: (
          <>
            <b>{c[0].toUpperCase() + c.slice(1)} chance</b> it sells at least once from a Shopping ad in the next 14 days.
          </>
        ),
        detail: <div className="max-w-[560px]">{scale(true)}</div>,
      };
    }
    default:
      return null;
  }
}

/** Made-up cards for every section on this page that is not connected or not built yet. */
export default function SampleCards({ p, sections, others, rows = false }: { p: ProductDetail; sections: Section[]; others: string[]; rows?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const samples = sections
    .filter((s) => s.state !== "ready")
    .flatMap((s) => {
      const built = build(s.key, { p, rnd: seeded(`${p.id}:${s.key}`), others });
      return built ? [{ section: s, ...built }] : [];
    });
  if (!SHOW_SAMPLES || samples.length === 0) return null;
  const shown = samples.find((s) => s.section.key === open);
  const modal = shown && (
    <Modal
      open
      onClose={() => setOpen(null)}
      title={shown.title}
      chips={
        <>
          {shown.sources.map((src) => (
            <SourceChip key={src} source={src} />
          ))}
          <SampleTag />
        </>
      }
    >
      <div className="px-7 pb-10 pt-6">
        <p className="mb-6 max-w-[760px] rounded-lg border border-dashed border-white/25 px-3 py-2 text-[12px] text-muted">
          Sample data: these numbers are made up. {(shown.section.message || "Not ready yet").replace(/\.?$/, ".")}
        </p>
        {shown.detail}
      </div>
    </Modal>
  );
  // Slim dashed rows for a side rail: title and the one-line answer; each opens the same detail.
  if (rows)
    return (
      <div className="px-4 pb-4">
        <div className="mb-1.5 flex items-center pt-3 text-[10px] uppercase tracking-[0.08em] text-[#55556d]">
          Not connected yet
          <SampleTag />
        </div>
        {samples.map((s) => (
          <button
            key={s.section.key}
            type="button"
            onClick={() => setOpen(s.section.key)}
            className="mt-1.5 block w-full rounded-lg border border-dashed border-white/[0.18] px-2.5 py-2 text-left text-[12px] text-[#c9c9d8] hover:border-white/35 [&_b]:font-medium [&_b]:text-[#e7e7f0]"
          >
            <span className="block text-[10px] uppercase tracking-[0.06em] text-muted">{s.title}</span>
            <span className="line-clamp-2">{s.line}</span>
          </button>
        ))}
        <p className="mt-2 text-[11px] text-[#55556d]">Made-up numbers to judge the design. Local development only.</p>
        {modal}
      </div>
    );
  return (
    <>
      <SubHeading>
        Not connected yet: sample data <SampleTag />
      </SubHeading>
      <p className="-mt-1 mb-3 max-w-[760px] text-[12px] text-muted">
        Made-up numbers so you can see how these cards would look. Shown in local development only, never to merchants.
      </p>
      <CardGrid>
        {samples.map((s) => (
          <InsightCard key={s.section.key} sample title={s.title} sources={s.sources} tag={<SampleTag />} visual={s.visual} line={s.line} onOpen={() => setOpen(s.section.key)} />
        ))}
      </CardGrid>
      {modal}
    </>
  );
}
