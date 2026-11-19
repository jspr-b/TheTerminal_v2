"use client";

import Link from "next/link";
import { rangeText } from "@/components/shared/Forecast";
import { ACCENT, DIM, RISK_COLOR, StockVsRange, UntestedTag } from "@/components/shared/ProductVisuals";
import { RunoutChip } from "@/components/shared/Runout";
import type { OverviewProduct } from "@/lib/api";

export const LIST_W = 340;

/**
 * The Products world's slide-in list: every product with the few numbers that matter, from Kumo and Shopify.
 * A row focuses that product in the world; "Open" goes to its page. Filters and sort match the world.
 */
export default function ProductList({
  open,
  onToggle,
  products,
  order,
  matches,
  focusId,
  onFocus,
  sellout,
  untested,
}: {
  open: boolean;
  onToggle: () => void;
  products: OverviewProduct[];
  order: number[];
  matches: boolean[];
  focusId: string | null;
  onFocus: (id: string) => void;
  sellout: boolean;
  untested: boolean;
}) {
  const rows = order.filter((i) => matches[i]).map((i) => products[i]);
  return (
    <aside
      className={`absolute bottom-0 right-0 top-0 z-[6] flex transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-[340px]"}`}
      style={{ width: LIST_W + 34 }}
      aria-label="All products"
    >
      {/* the handle: always visible, slides the list in and out */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="product-list"
        className="mt-[120px] flex h-[112px] w-[34px] flex-none flex-col items-center justify-center gap-2 self-start rounded-l-xl border border-r-0 border-edge bg-[#0f0f1c]/92 text-muted hover:text-[#e7e7f0]"
      >
        <span className="text-sm">{open ? "›" : "‹"}</span>
        <span className="text-[11px] [writing-mode:vertical-rl]">All products</span>
      </button>
      <div id="product-list" className="flex min-w-0 flex-1 flex-col border-l border-edge bg-[#0b0b16]/95 backdrop-blur" inert={!open || undefined}>
        <div className="flex-none border-b border-edge px-4 pb-2.5 pt-3.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">All products</h2>
            <span className="text-[11px] text-muted">{rows.length}</span>
          </div>
          <div className="mt-1 text-[11px] leading-snug text-muted">
            Stock <span className="source-chip">Shopify</span> against what Kumo says will likely sell in 14 days <span className="source-chip">Kumo</span>
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((p) => {
            const predicted = p.forecast_state !== "too_few_sales" && p.forecast !== null;
            const stale = p.forecast_state === "stale";
            const color = stale ? DIM : sellout && p.sellout ? RISK_COLOR[p.sellout.band] : ACCENT;
            const on = focusId === p.id;
            return (
              <li key={p.id} className={`border-b border-white/[0.06] ${on ? "bg-accent/[0.1] shadow-[inset_2px_0_0_#7c8cff]" : "hover:bg-white/[0.03]"}`}>
                <div className="flex items-start gap-2 px-4 pt-2">
                  <button type="button" onClick={() => onFocus(p.id)} aria-pressed={on} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-[13px] font-medium">
                      {p.title}
                      {stale && <span className="stale-tag font-normal">stale</span>}
                    </div>
                    <div className="text-[11px] text-muted">
                      <span className="font-mono text-[#e7e7f0]">{p.units.toLocaleString()}</span> in stock ·{" "}
                      {predicted && p.forecast ? (
                        <>
                          likely <span className="font-mono text-[#e7e7f0]">{rangeText(p.forecast)}</span>
                        </>
                      ) : (
                        <span className="italic">too few sales to predict</span>
                      )}
                    </div>
                  </button>
                  <Link
                    href={`/products/${encodeURIComponent(p.id)}`}
                    className="mt-0.5 flex-none rounded-md border border-edge px-1.5 py-0.5 text-[11px] text-muted hover:border-accent/50 hover:text-[#e7e7f0]"
                    aria-label={`Open ${p.title}`}
                  >
                    Open
                  </Link>
                </div>
                <button type="button" onClick={() => onFocus(p.id)} tabIndex={-1} className="flex w-full items-center gap-2 px-4 pb-2 pt-1">
                  <StockVsRange width={sellout ? 150 : 290} units={p.units} range={predicted ? p.forecast : null} color={color} dashed={stale} height={18} />
                  {sellout && p.sellout && <RunoutChip sellout={p.sellout} stale={stale} />}
                </button>
              </li>
            );
          })}
          {rows.length === 0 && <li className="px-4 py-3 text-xs text-muted">No product matches the filter.</li>}
        </ul>
        <div className="flex-none border-t border-edge px-4 py-2 text-[10px] leading-snug text-[#6c6c86]">
          White line = stock now, band = likely sold in 14 days{sellout ? ", colour = sell-out risk" : ""}.
          {sellout && untested && (
            <>
              {" "}Run-out days are our math <UntestedTag />
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
