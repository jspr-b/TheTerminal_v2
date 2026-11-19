"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import SalesSkyline from "@/components/product/SalesSkyline";
import { selloutVisibility } from "@/components/shared/ProductVisuals";
import { GalaxyStage, PairRow, STAGE_BACKGROUND, TypeKeys, neighbours, typeColors } from "@/components/shared/BasketGalaxy";
import { WillSell, rangeText } from "@/components/shared/Forecast";
import { LoadError, Skeleton, type Loaded } from "@/components/shared/Load";
import SourceChip from "@/components/shared/SourceChip";
import { BandSvg, RESULT_WORDS } from "@/components/shared/TrackCards";
import type { OverviewProduct, ProductPairs, TrackRecord } from "@/lib/api";

function Sec({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 mt-4 flex items-center text-[10px] uppercase tracking-[0.06em] text-muted first:mt-0 [&_.source-chip]:normal-case [&_.source-chip]:tracking-normal">
      {children}
    </div>
  );
}

/**
 * Products command center, right panel: the basket galaxy (turning slowly while nothing is selected)
 * and, under it, the selected product in short or the strongest pairs.
 */
export default function GalaxyPanel({
  pairs,
  track,
  products,
  selected,
  onSelect,
  onExpand,
}: {
  pairs: Loaded<ProductPairs>;
  track: TrackRecord | null;
  products: OverviewProduct[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onExpand: () => void;
}) {
  const data = pairs.data;
  const colors = useMemo(() => (data ? typeColors(data.nodes) : new Map<string, string>()), [data]);
  const inGalaxy = data !== null && selected !== null && data.nodes.some((n) => n.id === selected);
  const hasPairs = data !== null && data.links.length > 0;
  const max = data ? Math.max(1, ...data.links.map((l) => l.orders)) : 1;
  const product = selected !== null ? products.find((p) => p.id === selected) : undefined;
  // Nothing selected: the product that could run out first, else the best seller.
  const fallback = useMemo(
    () => [...products].sort((a, b) => (a.sellout?.earliest_day ?? 99) - (b.sellout?.earliest_day ?? 99) || b.sold_14d - a.sold_14d)[0],
    [products],
  );
  const shown = product ?? fallback;

  return (
    <aside className="hidden w-[420px] flex-none flex-col border-l border-edge bg-[#0f0f1c] lg:flex">
      <div className="flex h-10 flex-none items-center border-b border-white/[0.07] px-4 text-[11px] font-medium uppercase tracking-[0.06em] text-muted [&_.source-chip]:normal-case [&_.source-chip]:tracking-normal">
        Bought together
        <SourceChip source="shopify" />
        {hasPairs && (
          <button
            type="button"
            onClick={onExpand}
            className="ml-auto rounded-md border border-edge px-2 py-0.5 text-[11px] normal-case tracking-normal text-[#c9c9d8] hover:border-accent/50 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            ⤢ Expand
          </button>
        )}
      </div>
      {/* Galaxy and skyline share the column equally. A clicked product shows its data on top of the galaxy. */}
      <div className="relative min-h-0 w-full flex-1 overflow-hidden" style={{ background: STAGE_BACKGROUND }}>
        {pairs.error ? (
          <div className="p-4">
            <LoadError message={pairs.error} retry={pairs.retry} />
          </div>
        ) : !data ? (
          <Skeleton className="h-full w-full" />
        ) : hasPairs ? (
          <>
            <GalaxyStage pairs={data} colors={colors} focus={inGalaxy ? selected : null} autoRotate={selected === null} onFocus={onSelect} />
            <TypeKeys colors={colors} small />
            {!product && <div className="pointer-events-none absolute bottom-2 left-3 z-[2] text-[10px] text-muted">Drag to rotate · click a product</div>}
            {product && <PickedStrip product={product} pairs={data} track={track} onSelect={onSelect} />}
          </>
        ) : (
          <p className="p-4 text-muted">Not enough shared orders yet.</p>
        )}
      </div>
      {/* Under the galaxy: the sales skyline of the selected product (or the most urgent one), clickable per day. */}
      <div className="relative min-h-0 flex-1 border-t border-edge">{shown && <SkylinePanel p={shown} picked={product !== undefined} track={track} onClear={() => onSelect(null)} />}</div>
    </aside>
  );
}

function Summary({
  product: p,
  pairs,
  track,
  max,
  onSelect,
  compact = false,
}: {
  /** On top of the galaxy: stock and range are already in the skyline header, so leave them out. */
  compact?: boolean;
  product: OverviewProduct;
  pairs: ProductPairs | null;
  track: TrackRecord | null;
  max: number;
  onSelect: (id: string | null) => void;
}) {
  const check = track?.products.find((r) => r.product_id === p.id);
  const together = pairs ? neighbours(pairs, p.id).slice(0, 3) : [];
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{p.title}</h3>
        <button type="button" onClick={() => onSelect(null)} className="flex-none text-[11px] text-muted hover:text-[#e7e7f0]">
          Clear
        </button>
      </div>
      {p.product_type && <div className="text-[11px] text-muted">{p.product_type}</div>}
      <Link href={`/products/${encodeURIComponent(p.id)}`} className="mt-1 inline-block text-xs text-accent hover:underline">
        Open product page →
      </Link>

      {!compact && (
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <Sec>
            Stock now<SourceChip source="shopify" />
          </Sec>
          <span className="font-mono text-[18px]">{p.units.toLocaleString()}</span>
          <div className="text-[11px] text-muted">sold {p.sold_14d.toLocaleString()} in the last 14 days</div>
        </div>
        <div>
          <Sec>
            Next 14 days<SourceChip source="kumo" />
          </Sec>
          <span className="font-mono text-[18px]">
            <WillSell p={p} />
          </span>
          <div className="text-[11px] text-muted">likely sold</div>
        </div>
      </div>
      )}

      <Sec>
        Latest check<SourceChip source="kumo" />
        <SourceChip source="shopify" />
      </Sec>
      {check ? (
        <div className="flex items-center gap-3">
          <BandSvg r={check} width={compact ? 80 : 150} labels={false} height={22} />
          <span className="text-xs">
            <span className={check.result === "inside" ? "text-[#a5afff]" : "text-[#e7e7f0]"}>{RESULT_WORDS[check.result]}</span>
            <span className="block text-[11px] text-muted">
              sold {check.actual.toLocaleString()}, range {rangeText(check)}
            </span>
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted">No finished check for this product yet.</p>
      )}

      <Sec>
        Bought in the same order with<SourceChip source="shopify" />
      </Sec>
      {together.length === 0 ? (
        <p className="text-xs text-muted">Not enough shared orders yet.</p>
      ) : (
        together.map((b) => <PairRow key={b.id} label={b.title} orders={b.orders} max={max} onClick={() => onSelect(b.id)} />)
      )}
    </div>
  );
}

/** The skyline for one product of the overview: the 28 exact days end today (UTC), as the API counts them. */
function SkylinePanel({ p, picked, track, onClear }: { p: OverviewProduct; picked: boolean; track: TrackRecord | null; onClear: () => void }) {
  const days = p.sales_28d;
  const sales = useMemo(() => {
    const today = new Date();
    return days.map((units, i) => {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days.length - 1 - i)));
      return { date: d.toISOString().slice(0, 10), units };
    });
  }, [days]);
  const vis = selloutVisibility([p.sellout]);
  const f = p.forecast_state !== "too_few_sales" ? p.forecast : null;
  const check = track?.products.find((r) => r.product_id === p.id);
  return (
    <SalesSkyline
      key={p.id}
      compact
      sales={sales}
      forecast={f}
      stale={p.forecast_state === "stale"}
      stock={p.units}
      likelyOutDay={vis.shown && p.sellout ? p.sellout.likely_day : null}
      showStock={vis.shown && f !== null}
      untested={vis.untested}
      heading={
        <div className="flex items-start gap-2">
          <div className="pointer-events-none min-w-0 flex-1">
            <div className="flex items-center text-[10px] uppercase tracking-[0.06em] text-muted [&_.source-chip]:normal-case [&_.source-chip]:tracking-normal">
              Sales skyline<SourceChip source="shopify" />
              <SourceChip source="kumo" />
              {!picked && <span className="ml-1.5 normal-case tracking-normal text-[#55556d]">· runs out first</span>}
            </div>
            <div className="truncate text-[14px] font-semibold">{p.title}</div>
            <div className="truncate text-[11px] text-muted">
              <span className="font-mono text-[#e7e7f0]">{p.units.toLocaleString()}</span> in stock · likely{" "}
              <span className="font-mono text-[#e7e7f0]">{f ? rangeText(f) : "–"}</span>
              {check && <> · last check {check.result === "inside" ? "inside" : check.result === "above" ? "sold more" : "sold less"}</>}
            </div>
          </div>
          <Link href={`/products/${encodeURIComponent(p.id)}`} className="flex-none rounded-md border border-edge bg-[#0c0c16]/80 px-1.5 py-0.5 text-[11px] text-muted hover:border-accent/50 hover:text-[#e7e7f0]">
            Open
          </Link>
          {picked && (
            <button type="button" onClick={onClear} className="flex-none rounded-md border border-edge bg-[#0c0c16]/80 px-1.5 py-0.5 text-[11px] text-muted hover:text-[#e7e7f0]">
              Clear
            </button>
          )}
        </div>
      }
    />
  );
}

/** Clicked in the galaxy: a slim strip along the bottom, so the product itself stays visible in the middle. */
function PickedStrip({ product: p, pairs, track, onSelect }: { product: OverviewProduct; pairs: ProductPairs; track: TrackRecord | null; onSelect: (id: string | null) => void }) {
  const check = track?.products.find((r) => r.product_id === p.id);
  const together = neighbours(pairs, p.id).slice(0, 3);
  return (
    <div className="absolute inset-x-2 bottom-2 z-[3] rounded-xl border border-edge bg-[#0f0f1c]/92 px-3 py-2 text-[11px] shadow-[0_12px_40px_rgba(0,0,0,.5)] backdrop-blur">
      <div className="flex items-center gap-2">
        <b className="min-w-0 truncate text-[13px] font-semibold">{p.title}</b>
        {p.product_type && <span className="flex-none text-muted">{p.product_type}</span>}
        <Link href={`/products/${encodeURIComponent(p.id)}`} className="ml-auto flex-none text-accent hover:underline">
          Open →
        </Link>
      </div>
      <div className="mt-1 flex items-center gap-2 text-muted">
        <span className="flex-none uppercase tracking-[0.06em] text-[10px]">Last check</span>
        {check ? (
          <>
            <BandSvg r={check} width={70} labels={false} height={16} />
            <span className={`flex-none ${check.result === "inside" ? "text-[#a5afff]" : "text-[#e7e7f0]"}`}>
              {check.result === "inside" ? "inside the range" : check.result === "above" ? "sold more" : "sold less"}
            </span>
            <span className="truncate whitespace-nowrap">
              · sold <span className="font-mono text-[#e7e7f0]">{check.actual}</span>, range <span className="font-mono">{rangeText(check)}</span>
            </span>
          </>
        ) : (
          <span>no finished check yet</span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5 overflow-hidden text-muted">
        <span className="flex-none uppercase tracking-[0.06em] text-[10px]">With</span>
        {together.length === 0 ? (
          <span>not enough shared orders yet</span>
        ) : (
          together.map((b) => (
            <button key={b.id} type="button" onClick={() => onSelect(b.id)} className="flex-none rounded-full border border-edge px-2 py-px hover:border-accent/50 hover:text-[#e7e7f0]">
              {b.title} <span className="font-mono text-[#e7e7f0]">{b.orders}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
