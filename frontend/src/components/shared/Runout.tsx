"use client";

import Link from "next/link";
import type { Sellout } from "@/lib/api";
import { DIM, RISK_COLOR, dayFromToday, useWidth } from "./ProductVisuals";

/** Short words for when it could run out: "day 3–6", "from day 13", "lasts past day 14". */
export function runoutShort(s: Sellout): string {
  const e = s.earliest_day;
  if (e === null) return "lasts past day 14";
  if (s.latest_day === null) return `could run out from day ${e}`;
  return e === s.latest_day ? `could run out day ${e}` : `could run out day ${e}–${s.latest_day}`;
}

/** A plain chip for the product list, coloured by sell-out band. No mini chart: it stays readable. */
export function RunoutChip({ sellout, stale = false }: { sellout: Sellout; stale?: boolean }) {
  const color = stale ? DIM : RISK_COLOR[sellout.band];
  const lasts = sellout.earliest_day === null;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px]"
      style={{ borderColor: `${color}55`, color: lasts ? "#8d8da6" : color, background: lasts ? "transparent" : `${color}14` }}
    >
      <i className="inline-block h-1.5 w-1.5 flex-none rounded-full" style={{ background: color }} />
      {runoutShort(sellout)}
    </span>
  );
}

export interface RunoutRow {
  key: string;
  title: string;
  href?: string;
  sellout: Sellout;
  stale?: boolean;
}

const ROW_H = 34;

/**
 * Full-width run-out chart: one row per product at risk on a shared day axis 0..14 and 14+.
 * Capsule = earliest to latest day it could run out, dot = most likely day. Rows that last
 * past day 14 are listed below as text only.
 */
export function RunoutChart({ rows, compact = false }: { rows: RunoutRow[]; compact?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  // Compact (inside a card): every row on the axis, no name or text columns.
  const risk = rows.filter((r) => compact || r.sellout.earliest_day !== null).sort((a, b) => (a.sellout.earliest_day ?? 99) - (b.sellout.earliest_day ?? 99));
  const lasting = compact ? [] : rows.filter((r) => r.sellout.earliest_day === null);
  const NAME_W = compact ? 0 : 190;
  const TEXT_W = compact ? 0 : 210;
  const chartW = compact ? width : Math.max(240, width - NAME_W - TEXT_W);
  const x = (d: number) => 10 + (d / 15) * (chartW - 20);
  const axisH = 26;
  const H = axisH + risk.length * ROW_H + 6;
  return (
    <div ref={ref} className="w-full">
      {width > 0 && risk.length > 0 && (
        <div className="flex">
          {!compact && <div style={{ width: NAME_W }} className="flex-none">
            <div style={{ height: axisH }} />
            {risk.map((r) => (
              <div key={r.key} style={{ height: ROW_H }} className="flex items-center pr-3 text-[13px]">
                {r.href ? (
                  <Link href={r.href} className="truncate hover:text-accent">
                    {r.title}
                  </Link>
                ) : (
                  <span className="truncate">{r.title}</span>
                )}
              </div>
            ))}
          </div>}
          <svg width={chartW} height={H} className="block flex-none" role="img" aria-label="When each product could run out, day 0 to 14">
            {Array.from({ length: 15 }, (_, d) => (
              <g key={d}>
                <line x1={x(d)} x2={x(d)} y1={axisH - 4} y2={H} stroke={d % 7 === 0 ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)"} />
                {(!compact || d % 7 === 0) && <text x={x(d)} y={12} textAnchor="middle" fontSize={10} fill="#8d8da6" className="font-mono">
                  {d}
                </text>}
              </g>
            ))}
            {!compact && (
              <text x={x(15)} y={12} textAnchor="middle" fontSize={10} fill="#8d8da6" className="font-mono">
                14+
              </text>
            )}
            <text x={x(0)} y={23} fontSize={9} fill="#55556d">
              today
            </text>
            {risk.map((r, i) => {
              const s = r.sellout;
              const color = r.stale ? DIM : RISK_COLOR[s.band];
              const cy = axisH + i * ROW_H + ROW_H / 2;
              const e = s.earliest_day ?? 15;
              const l = s.latest_day ?? 15;
              return (
                <g key={r.key}>
                  <line x1={x(0)} x2={x(15)} y1={cy} y2={cy} stroke="rgba(255,255,255,.04)" />
                  <line x1={x(e)} x2={x(l)} y1={cy} y2={cy} stroke={color} strokeOpacity={0.35} strokeWidth={12} strokeLinecap="round" strokeDasharray={r.stale ? "3 3" : undefined} />
                  {s.latest_day === null && <path d={`M${x(15) - 2},${cy - 7} L${x(15) + 6},${cy} L${x(15) - 2},${cy + 7}`} stroke={color} fill="none" strokeWidth={1.5} />}
                  {s.likely_day !== null && <circle cx={x(s.likely_day)} cy={cy} r={5.5} fill={color} stroke="#080812" strokeWidth={1.5} />}
                </g>
              );
            })}
          </svg>
          {!compact && <div style={{ width: TEXT_W }} className="flex-none pl-4">
            <div style={{ height: axisH }} />
            {risk.map((r) => {
              const s = r.sellout;
              return (
                <div key={r.key} style={{ height: ROW_H }} className="flex flex-col justify-center text-[12px] leading-tight">
                  <span style={{ color: RISK_COLOR[s.band] }}>{runoutShort(s).replace("could run out ", "")}</span>
                  <span className="text-[11px] text-muted">
                    {dayFromToday(s.earliest_day ?? 14)}
                    {s.likely_day !== null && <> · likely {dayFromToday(s.likely_day)}</>}
                  </span>
                </div>
              );
            })}
          </div>}
        </div>
      )}
      {!compact && risk.length === 0 && <p className="text-muted">No product could run out in the next 14 days.</p>}
      {lasting.length > 0 && (
        <p className="mt-5 text-[12px] leading-relaxed text-muted">
          <span className="text-[#c9c9d8]">Lasts past day 14: </span>
          {lasting.map((r, i) => (
            <span key={r.key}>
              {i > 0 && ", "}
              {r.href ? (
                <Link href={r.href} className="hover:text-accent">
                  {r.title}
                </Link>
              ) : (
                r.title
              )}
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}
