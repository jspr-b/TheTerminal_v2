"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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

export default function HeatmapPanel({
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
  const style = active ? HEAT_LAYERS[active] : null;
  const current = view && view.layer === active ? view : null;
  const section = current?.heatmap.section ?? null;

  return (
    <div className="glass absolute left-3 top-[84px] z-10 flex w-[250px] flex-col rounded-[10px] p-2">
      <div className="px-1.5 pb-1 pt-0.5 text-[11px] uppercase tracking-wide text-muted">Heatmap</div>
      <div role="radiogroup" aria-label="Heatmap" className="flex flex-col gap-0.5">
        <Option on={active === null} onClick={() => onChange(null)}>
          <span className="h-2 w-[26px] flex-none rounded border border-white/10" />
          Off
        </Option>
        {ORDER.map((k) => {
          const l = HEAT_LAYERS[k];
          return (
            <Option key={k} on={active === k} onClick={() => onChange(k)}>
              <span className="h-2 w-[26px] flex-none rounded" style={gradient(l.ramp)} />
              <span className="min-w-0 flex-1">{l.label}</span>
              <span className="source-chip">{SOURCE_LABEL[l.source]}</span>
            </Option>
          );
        })}
      </div>

      {style && (
        <div className="mt-2 border-t border-white/[0.08] px-1.5 pb-1 pt-2.5 text-xs">
          {error ? (
            <span className="text-[#f87171]">{error}</span>
          ) : loading || !current || !section ? (
            <span className="text-muted">Loading…</span>
          ) : section.state !== "ready" ? (
            <>
              <b className="font-medium">
                {section.title}
                <span className="source-chip">{SOURCE_LABEL[section.source]}</span>
              </b>
              <p className="mt-1 text-muted">
                {section.state === "needs_gpu"
                  ? "Runs on a GPU server, not set up yet."
                  : section.state === "not_built"
                    ? "Coming later."
                    : section.message || "Not available yet."}
                {section.state === "not_connected" && (
                  <>
                    {" "}
                    <Link href="/connections" className="text-accent hover:underline">
                      Connections
                    </Link>
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <b className="font-medium">
                {section.title}
                <span className="source-chip">{SOURCE_LABEL[section.source]}</span>
              </b>
              <div className="mb-1 mt-1.5 h-2 rounded" style={gradient(style.ramp)} />
              <div className="flex justify-between text-[11px] text-muted">
                <span>{style.legend[0]}</span>
                <span>{style.legend[1]}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted">
                {style.about} City level only.{" "}
                {active === "orders"
                  ? `Cities with fewer than ${current.heatmap.min_count} orders are not shown, so no single customer can be picked out.`
                  : "Cities with too few orders are not shown, so no single customer can be picked out."}
              </p>
              {current.heatmap.points.length === 0 && <p className="mt-1.5 text-[11px] text-muted">No city has enough data to show yet.</p>}
              {current.unplaced > 0 && (
                <p className="mt-1.5 text-[11px] text-muted">
                  {current.unplaced} {current.unplaced === 1 ? "city" : "cities"} could not be found on the map.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
