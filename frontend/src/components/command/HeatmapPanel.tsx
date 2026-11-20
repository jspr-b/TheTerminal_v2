"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Heatmap, HeatmapLayer } from "@/lib/api";
import { SOURCE_LABEL } from "@/lib/format";

export interface LayerStyle {
  label: string;
  /** Shown before the answer arrives; the answer's own section source wins after that. */
  source: "shopify" | "kumo";
  ramp: [string, string, string, string];
  legend: [string, string];
  about: string;
}

export const HEAT_LAYERS: Record<HeatmapLayer, LayerStyle> = {
  orders: {
    label: "Orders, last 14 days",
    source: "shopify",
    ramp: ["rgba(124,140,255,0)", "#3b3f9e", "#7c8cff", "#c7ceff"],
    legend: ["fewer", "more orders"],
    about: "Exact, from Shopify.",
  },
  demand: {
    label: "Demand, next 14 days",
    source: "kumo",
    ramp: ["rgba(45,212,191,0)", "#0f766e", "#2dd4bf", "#ccfbf1"],
    legend: ["lower", "higher demand"],
    about: "Estimate for the next 14 days.",
  },
  returns: {
    label: "Returns likely",
    source: "kumo",
    ramp: ["rgba(251,191,36,0)", "#92400e", "#fbbf24", "#f87171"],
    legend: ["low", "high"],
    about: "How likely orders to each city are to come back.",
  },
  delays: {
    label: "Delivery delays likely",
    source: "kumo",
    ramp: ["rgba(232,121,249,0)", "#86198f", "#e879f9", "#fae8ff"],
    legend: ["low", "high"],
    about: "Deliveries to customers only.",
  },
  first_time: {
    label: "First-time buyers coming back",
    source: "kumo",
    ramp: ["rgba(52,211,153,0)", "#065f46", "#34d399", "#d1fae5"],
    legend: ["low", "high"],
    about: "How likely first-time buyers in each city are to order again.",
  },
};

const ORDER: HeatmapLayer[] = ["orders", "demand", "returns", "delays", "first_time"];

const gradient = (ramp: LayerStyle["ramp"]) => ({ background: `linear-gradient(90deg, ${ramp.slice(1).join(", ")})` });

function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${on ? "bg-white/[0.07] text-[#e7e7f0]" : "text-muted hover:bg-white/[0.04]"}`}
    >
      {children}
    </button>
  );
}

export interface HeatView {
  layer: HeatmapLayer;
  heatmap: Heatmap;
  /** Cities that could not be placed on the map. */
  unplaced: number;
}

/** The heatmap is a filter on the globe: a small "Map layer" menu in the top bar. */
export default function LayerMenu({
  active,
  onChange,
  view,
  loading,
  error,
}: {
  active: HeatmapLayer | null;
  onChange: (layer: HeatmapLayer | null) => void;
  view: HeatView | null;
  loading: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const style = active ? HEAT_LAYERS[active] : null;
  const current = view && view.layer === active ? view : null;
  const section = current?.heatmap.section ?? null;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-2 rounded-lg border bg-[#0e0e1c] px-2.5 py-1 text-xs ${open ? "border-accent/50 text-[#e7e7f0]" : "border-edge text-muted hover:text-[#e7e7f0]"}`}
      >
        <span className="h-[7px] w-[18px] rounded-[3px] border border-edge" style={style ? gradient(style.ramp) : undefined} />
        {style ? style.label : "Map layer: none"} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[270px] rounded-[10px] border border-edge bg-[#0f0f1c] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,.5)]">
          <div className="px-2 pb-1.5 pt-1 text-[10px] uppercase tracking-wide text-muted">Map layer · a filter on the globe</div>
          <div role="radiogroup" aria-label="Map layer" className="flex flex-col gap-0.5">
            <Option on={active === null} onClick={() => onChange(null)}>
              <span className="h-2 w-[26px] flex-none rounded border border-white/10" />
              None
            </Option>
            {ORDER.map((k) => {
              const l = HEAT_LAYERS[k];
              return (
                <Option key={k} on={active === k} onClick={() => onChange(k)}>
                  <span className="h-2 w-[26px] flex-none rounded" style={gradient(l.ramp)} />
                  <span className="min-w-0 flex-1 break-words">{l.label}</span>
                  <span className="source-chip">{SOURCE_LABEL[l.source]}</span>
                </Option>
              );
            })}
          </div>
          {style && <div className="mt-1.5 border-t border-white/[0.08] px-2 pb-1 pt-2 text-xs">{status(style, current, section, loading, error)}</div>}
        </div>
      )}
    </div>
  );
}

function status(style: LayerStyle, current: HeatView | null, section: HeatView["heatmap"]["section"] | null, loading: boolean, error: string | null) {
  if (error) return <span className="text-[#f87171]">{error}</span>;
  if (loading || !current || !section) return <span className="text-muted">Loading…</span>;
  if (section.state !== "ready") {
    return (
      <p className="text-muted">
        {section.state === "needs_gpu" ? "Runs on a GPU server, not set up yet." : section.state === "not_built" ? "Coming later." : section.message || "Not available yet."}
        {section.state === "not_connected" && (
          <>
            {" "}
            <Link href="/connections" className="text-accent hover:underline">
              Connections
            </Link>
          </>
        )}
      </p>
    );
  }
  return (
    <p className="text-[11px] leading-snug text-muted">
      {style.about} City level, on land only. Cities with fewer than {current.heatmap.min_count} orders are not shown, so no single customer can be picked out.
      {current.heatmap.points.length === 0 && " No city has enough data yet."}
      {current.unplaced > 0 && ` ${current.unplaced} ${current.unplaced === 1 ? "city" : "cities"} could not be found on the map.`}
    </p>
  );
}

/** The legend chip on the map while a layer is on. */
export function LayerLegend({ active, view, bottom }: { active: HeatmapLayer | null; view: HeatView | null; bottom: number }) {
  if (!active || !view || view.layer !== active || view.heatmap.section.state !== "ready") return null;
  const style = HEAT_LAYERS[active];
  return (
    <div className="absolute left-[58px] z-[6] flex items-center gap-2 rounded-[9px] border border-edge bg-[#0c0c16]/88 px-2.5 py-1 text-[11px] text-muted transition-[bottom] duration-[450ms]" style={{ bottom: bottom + (bottom ? 16 : 42) }}>
      <span>{style.legend[0]}</span>
      <span className="h-[7px] w-[70px] rounded-[3px]" style={gradient(style.ramp)} />
      <span>{style.legend[1]}</span>
      <span className="source-chip">{SOURCE_LABEL[view.heatmap.section.source]}</span>
    </div>
  );
}
