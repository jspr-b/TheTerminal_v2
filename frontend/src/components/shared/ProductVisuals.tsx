"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Sellout } from "@/lib/api";

/** Red, amber, green: used only for sell-out risk. */
export const RISK_COLOR: Record<Sellout["band"], string> = {
  low: "#34d399",
  medium: "#fbbf24",
  high: "#f87171",
};
export const RISK_TEXT: Record<Sellout["band"], string> = {
  low: "text-[#34d399]",
  medium: "text-[#fbbf24]",
  high: "text-[#f87171]",
};
export const ACCENT = "#7c8cff";
export const DIM = "#55556d";
export const STOCK = "#e7e7f0";

/** Local development switch: show sell-out before its backtest, tagged "untested". */
const SHOW_UNTESTED = process.env.NEXT_PUBLIC_SHOW_UNTESTED === "1";

/**
 * CLAUDE.md: sell-out risk needs a backtest before merchants see it.
 * Shown when every sell-out given is tested, or in local dev with NEXT_PUBLIC_SHOW_UNTESTED=1.
 */
export function selloutVisibility(sellouts: (Sellout | null)[]): { shown: boolean; untested: boolean } {
  const given = sellouts.filter((s): s is Sellout => s !== null);
  if (given.length === 0) return { shown: false, untested: false };
  const tested = given.every((s) => s.tested);
  return { shown: tested || SHOW_UNTESTED, untested: !tested };
}

export function UntestedTag() {
  return (
    <span
      title="Not backtested yet. Shown in local development only."
      className="ml-1.5 whitespace-nowrap rounded border border-amber-400/40 px-1 text-[10px] font-normal normal-case tracking-normal text-amber-400"
    >
      untested
    </span>
  );
}

/** "Sat 28 Nov": today plus n days. */
export function dayFromToday(n: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** "Sat 28 Nov" for a date string. */
export function dayName(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** Width of an element, kept up to date. The element must always be rendered. */
export function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.floor(el.clientWidth));
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setWidth(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** 28 days of exact sales as small bars, oldest first. */
export function Sparkline({ values, width = 112, height = 26 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const slot = width / Math.max(1, values.length);
  const total = values.reduce((a, v) => a + v, 0);
  return (
    <svg width={width} height={height} role="img" aria-label={`Sold per day, last ${values.length} days: ${total} in total`} className="block">
      <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="#2a2a3e" />
      {values.map((v, i) => {
        const h = (v / max) * (height - 3);
        return (
          <rect key={i} x={i * slot + slot * 0.15} y={height - 1 - h} width={Math.max(1, slot * 0.7)} height={h} rx={0.8} fill="rgba(231,231,240,.38)">
            <title>{`Day ${i + 1} of ${values.length}: ${v} sold`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Stock as a white line against the likely range: a translucent band with a middle tick. */
export function StockVsRange({
  width,
  units,
  range,
  color,
  dashed = false,
  height = 40,
}: {
  width: number;
  units: number;
  range: { lower: number; value: number; upper: number } | null;
  color: string;
  dashed?: boolean;
  height?: number;
}) {
  if (width <= 0) return null;
  const max = Math.max(1, units, range?.upper ?? 0) * 1.08;
  const x = (v: number) => (Math.max(0, v) / max) * width;
  const mid = height / 2;
  return (
    <svg width={width} height={height} className="block" aria-hidden="true">
      <rect x={0} y={mid - 2} width={x(units)} height={4} rx={2} fill="rgba(255,255,255,.2)" />
      {range && (
        <>
          <rect
            x={x(range.lower)}
            y={mid - 9}
            width={Math.max(2, x(range.upper) - x(range.lower))}
            height={18}
            rx={4}
            fill={color}
            fillOpacity={0.22}
            stroke={color}
            strokeOpacity={0.8}
            strokeDasharray={dashed ? "3 3" : undefined}
          />
          <line x1={x(range.value)} x2={x(range.value)} y1={mid - 9} y2={mid + 9} stroke={color} strokeWidth={2} />
        </>
      )}
      <line x1={Math.max(1, x(units))} x2={Math.max(1, x(units))} y1={mid - 11} y2={mid + 11} stroke={STOCK} strokeWidth={2} />
    </svg>
  );
}

/** x position of day d (0..15, where 15 is the "14+" edge) on a run-out strip of this width. */
export const runoutX = (width: number, d: number) => 8 + (d / 15) * (width - 16);

/** Day axis for the run-out strip: 0..14 and 14+. Lines up exactly with RunoutStrip of the same width. */
export function RunoutAxis({ width }: { width: number }) {
  if (width <= 0) return null;
  const ticks = [0, 2, 4, 6, 8, 10, 12, 14];
  return (
    <span className="relative block h-3.5" style={{ width }}>
      {ticks.map((d) => (
        <span key={d} className="absolute -translate-x-1/2 font-mono" style={{ left: runoutX(width, d) }}>
          {d}
        </span>
      ))}
      <span className="absolute -translate-x-1/2 font-mono" style={{ left: runoutX(width, 15) }}>
        14+
      </span>
    </span>
  );
}

/** When it could run out: a capsule from the earliest to the latest day, dot on the likely day. */
export function RunoutStrip({ width, sellout, dashed = false, height = 40 }: { width: number; sellout: Sellout; dashed?: boolean; height?: number }) {
  if (width <= 0) return null;
  const x = (d: number) => runoutX(width, d);
  const mid = height / 2;
  const e = sellout.earliest_day;
  const color = dashed ? DIM : RISK_COLOR[sellout.band];
  return (
    <svg width={width} height={height} className="block" aria-hidden="true">
      {[0, 7, 14].map((d) => (
        <line key={d} x1={x(d)} x2={x(d)} y1={4} y2={height - 4} stroke="rgba(255,255,255,.05)" />
      ))}
      {e === null ? (
        <>
          <line x1={x(14.6)} x2={x(15)} y1={mid} y2={mid} stroke={DIM} strokeWidth={6} strokeLinecap="round" />
          <text x={x(14.2)} y={mid + 4} textAnchor="end" fontSize={10} fill="#8d8da6">
            lasts past day 14
          </text>
        </>
      ) : (
        <>
          <line
            x1={x(e)}
            x2={x(sellout.latest_day ?? 15)}
            y1={mid}
            y2={mid}
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeOpacity={0.35}
          />
          {sellout.likely_day !== null && <circle cx={x(sellout.likely_day)} cy={mid} r={5} fill={color} />}
          {sellout.latest_day === null && (
            <path d={`M${x(15) - 6},${mid - 6} L${x(15)},${mid} L${x(15) - 6},${mid + 6}`} stroke={color} fill="none" strokeWidth={1.5} />
          )}
        </>
      )}
    </svg>
  );
}

/** Plain words for a run-out strip (screen readers and tooltips). */
export function runoutWords(s: Sellout): string {
  if (s.earliest_day === null) return `should last past ${dayFromToday(14)}`;
  const latest = s.latest_day === null ? "after day 14" : dayFromToday(s.latest_day);
  return `could run out between ${dayFromToday(s.earliest_day)} and ${latest}`;
}
