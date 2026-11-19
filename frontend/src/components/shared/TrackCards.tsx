"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { TrackResult } from "@/lib/api";
import { high, low } from "./Forecast";

/** Violet band for Kumo's range; white dot for what really sold. Never risk colours. */
const BAND = "#7c8cff";
const CARD_BG = "#0f0f1c";

/** Empty state before any Kumo range has had its 14 days. */
export const FIRST_CHECK = "The first check comes 14 days after Kumo's first forecast.";

export const RESULT_WORDS: Record<TrackResult, string> = {
  inside: "Inside Kumo's range",
  above: "Sold more than Kumo's range",
  below: "Sold less than Kumo's range",
};

/** Where the actual fell, against the range rounded outward (the range the merchant saw). */
export function resultOf(r: { lower: number; upper: number; actual: number }): TrackResult {
  if (r.actual > high(r.upper)) return "above";
  if (r.actual < low(r.lower)) return "below";
  return "inside";
}

interface Band {
  lower: number;
  value: number;
  upper: number;
  actual: number;
}

/** The range as a capsule with a middle tick, the actual as a dot (white = inside). Labels under the ends. */
export function BandSvg({ r, width = 226, labels = true, height }: { r: Band; width?: number; labels?: boolean; height?: number }) {
  const lo = low(r.lower);
  const hi = high(r.upper);
  const inside = resultOf(r) === "inside";
  const max = Math.max(1, hi, r.actual) * 1.15;
  const x = (v: number) => 4 + ((width - 8) * Math.max(0, v)) / max;
  const big = labels;
  const h = height ?? (big ? 46 : 22);
  const mid = big ? 22 : h / 2;
  const bh = big ? 20 : 12;
  const dot = big ? 7 : 4.5;
  return (
    <svg width={width} height={h} className="block overflow-visible" role="img" aria-label={`Range ${lo}–${hi}, sold ${r.actual}`}>
      <line x1={4} x2={width - 4} y1={mid} y2={mid} stroke="rgba(255,255,255,.08)" strokeWidth={2} />
      <rect x={x(lo)} y={mid - bh / 2} width={Math.max(2, x(hi) - x(lo))} height={bh} rx={bh / 2} fill={BAND} fillOpacity={0.25} stroke={BAND} />
      <line x1={x(r.value)} x2={x(r.value)} y1={mid - bh / 2} y2={mid + bh / 2} stroke={BAND} strokeWidth={2} />
      <circle cx={x(r.actual)} cy={mid} r={dot} fill={inside ? "#ffffff" : CARD_BG} stroke="#ffffff" strokeWidth={big ? 2.5 : 2} />
      {labels && (
        <>
          <text x={x(lo)} y={46} fill="#8d8da6" fontSize={11} className="font-mono">
            {lo}
          </text>
          <text x={x(hi)} y={46} fill="#8d8da6" fontSize={11} textAnchor="end" className="font-mono">
            {hi}
          </text>
        </>
      )}
    </svg>
  );
}

const CARD =
  "relative flex aspect-[4/5] flex-col overflow-hidden rounded-[18px] border border-[#22223a] bg-[#0f0f1c] p-[22px] before:absolute before:left-[22px] before:right-[22px] before:top-0 before:h-0.5 before:content-['']";

/** Summary card: how many of Kumo's ranges held in one window. */
export function TrackSummaryCard({
  label,
  name,
  held,
  total,
  dots,
  unit,
}: {
  label: string;
  name: string;
  held: number;
  total: number;
  dots: { key: string; title: string; inside: boolean }[];
  /** What was counted, e.g. "products" or "checks". */
  unit?: string;
}) {
  return (
    <div className={`${CARD} before:bg-accent before:opacity-90`}>
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="mt-1.5 text-[19px] font-semibold">{name}</span>
      <div className="mt-auto font-mono text-[84px] leading-none tracking-[-0.02em]">
        {held}
        <small className="ml-2 font-sans text-sm tracking-normal text-muted">
          of {total} {unit ?? (total === 1 ? "product" : "products")}
        </small>
      </div>
      <Dots dots={dots} />
      <div className="mt-3.5 flex justify-between border-t border-white/[0.07] pt-3 text-[11px] text-[#55556d]">
        <span>The Terminal · Kumo + Shopify</span>
      </div>
    </div>
  );
}

/** One dot per product: filled = Kumo's range held. */
export function Dots({ dots, size = 14, className = "mt-[18px] gap-2" }: { dots: { key: string; title: string; inside: boolean }[]; size?: number; className?: string }) {
  return (
    <div className={`flex flex-wrap ${className}`}>
      {dots.map((d) => (
        <i
          key={d.key}
          title={`${d.title}: ${d.inside ? "inside" : "outside"} Kumo's range`}
          className={`rounded-full border-[1.5px] border-[#a5afff] ${d.inside ? "bg-[#a5afff]" : ""}`}
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  );
}

/** One check: what Kumo said next to what really sold in those 14 days. */
export function TrackProductCard({ kicker, name, r, result, href }: { kicker: string; name: string; r: Band; result: TrackResult; href?: string }) {
  const inside = result === "inside";
  const body = (
    <>
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted">{kicker}</span>
      <span className="mt-1.5 line-clamp-2 text-[19px] font-semibold">{name}</span>
      <div className="mt-auto font-mono text-[56px] leading-none tracking-[-0.02em]">
        {r.actual.toLocaleString()}
        <small className="ml-2 font-sans text-sm tracking-normal text-muted">sold in 14 days</small>
      </div>
      <div className="mb-2.5 mt-[18px]">
        <BandSvg r={r} />
      </div>
      <span className={`text-[15px] font-medium ${inside ? "text-[#a5afff]" : "text-muted"}`}>{RESULT_WORDS[result]}</span>
      <div className="mt-3.5 flex justify-between border-t border-white/[0.07] pt-3 text-[11px] text-[#55556d]">
        <span className="font-mono">
          Range {low(r.lower)}–{high(r.upper)}
        </span>
        <span>Kumo + Shopify</span>
      </div>
    </>
  );
  const cls = `${CARD} ${inside ? "before:bg-accent before:opacity-90" : "before:bg-[#55556d]"}`;
  if (!href) return <div className={cls}>{body}</div>;
  return (
    <Link href={href} className={`${cls} transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}>
      {body}
    </Link>
  );
}

/** Grid of track-record cards, as in the approved mockup. */
export function TrackGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-[18px]">{children}</div>;
}

/** One line per product: name, the band with its dot, and the numbers in words. */
export function BandRows({ rows }: { rows: { key: string; title: string; href?: string; r: Band }[] }) {
  return (
    <div className="divide-y divide-white/[0.07]">
      {rows.map(({ key, title, href, r }) => (
        <div key={key} className="grid grid-cols-[minmax(160px,1fr)_260px_minmax(170px,auto)] items-center gap-6 py-2.5">
          {href ? (
            <Link href={href} className="truncate font-medium hover:text-accent">
              {title}
            </Link>
          ) : (
            <span className="truncate font-medium">{title}</span>
          )}
          <BandSvg r={r} width={260} labels={false} height={24} />
          <span className="whitespace-nowrap text-right text-xs text-muted">
            sold <span className="font-mono text-[#e7e7f0]">{r.actual.toLocaleString()}</span> · range{" "}
            <span className="font-mono text-[#e7e7f0]">
              {low(r.lower)}–{high(r.upper)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
