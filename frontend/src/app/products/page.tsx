"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import GalaxyPanel from "@/components/products/GalaxyPanel";
import InsightStrip from "@/components/products/InsightStrip";
import BasketGalaxy from "@/components/shared/BasketGalaxy";
import Modal from "@/components/shared/Modal";
import SourceChip from "@/components/shared/SourceChip";
import PageShell, { PageTitle, SubHeading } from "@/components/shell/PageShell";
import { rangeText } from "@/components/shared/Forecast";
import { LoadError, Skeleton, useLoad } from "@/components/shared/Load";
import {
  ACCENT,
  DIM,
  RISK_COLOR,
  RISK_TEXT,
  Sparkline,
  StockVsRange,
  UntestedTag,
  runoutWords,
  selloutVisibility,
  useWidth,
} from "@/components/shared/ProductVisuals";
import { RunoutChip } from "@/components/shared/Runout";
import { SectionList } from "@/components/shared/Sections";
import { DEV_MERCHANT, getPageState, getProductPairs, getProductsOverview, getTrackRecord, type OverviewProduct, type Sellout } from "@/lib/api";
import { day } from "@/lib/format";

const SPARK_W = 96;
const GAP = 16;
const MIN_RANGE = 140;
const RUNOUT_W = 168; // a plain chip: "could run out day 3–6"; the chart lives in the "Could run out" pop-up
const OPEN_W = 44;

/** Column widths from the list width. Below the minimums the rows scroll sideways instead of squeezing. */
function columns(width: number, sellout: boolean) {
  const name = width < 760 ? 190 : 236;
  const n = sellout ? 4 : 3;
  const runout = sellout ? RUNOUT_W : 0;
  const range = Math.max(MIN_RANGE, width - name - SPARK_W - runout - OPEN_W - GAP * n);
  const template = sellout ? `${name}px ${SPARK_W}px ${range}px ${runout}px ${OPEN_W}px` : `${name}px ${SPARK_W}px ${range}px ${OPEN_W}px`;
  const total = name + SPARK_W + range + runout + OPEN_W + GAP * n;
  return { range, runout, template, total };
}

/** By sell-out urgency (earliest run-out day first, lasting past day 14 last); otherwise by title. */
function sortProducts(products: OverviewProduct[], bySellout: boolean): OverviewProduct[] {
  const key = (p: OverviewProduct) => (p.sellout ? (p.sellout.earliest_day ?? 50) : 99);
  return [...products].sort((a, b) => (bySellout ? key(a) - key(b) : 0) || a.title.localeCompare(b.title));
}

function Answer({ products, sellout }: { products: OverviewProduct[]; sellout: boolean }) {
  if (!sellout) return <>Stock now and what each product will likely sell in the next 14 days.</>;
  const counted = products.filter((p) => p.sellout && p.forecast_state === "forecast");
  const n = (band: Sellout["band"]) => counted.filter((p) => p.sellout?.band === band).length;
  const stale = products.filter((p) => p.sellout && p.forecast_state === "stale").length;
  return (
    <>
      In the next 14 days, sell-out risk is <span className={`font-medium ${RISK_TEXT.high}`}>high for {n("high")}</span>,{" "}
      <span className={`font-medium ${RISK_TEXT.medium}`}>medium for {n("medium")}</span> and{" "}
      <span className={`font-medium ${RISK_TEXT.low}`}>low for {n("low")}</span> products.
      {stale > 0 && ` ${stale} with a stale range ${stale === 1 ? "is" : "are"} not counted.`}
    </>
  );
}

function ProductRow({
  p,
  cols,
  sellout,
  selected,
  onSelect,
  onOpen,
}: {
  p: OverviewProduct;
  cols: ReturnType<typeof columns>;
  sellout: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const predicted = p.forecast_state !== "too_few_sales" && p.forecast !== null;
  const stale = p.forecast_state === "stale";
  const color = stale ? DIM : sellout && p.sellout ? RISK_COLOR[p.sellout.band] : ACCENT;
  const label = [
    p.title,
    `${p.units} in stock`,
    predicted && p.forecast ? `likely sells ${rangeText(p.forecast)} in 14 days` : "too few sales to predict",
    sellout && p.sellout ? runoutWords(p.sellout) : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <div
      data-product={p.id}
      aria-selected={selected}
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={`${label}. Double-click to open.`}
      className={`grid cursor-pointer items-center border-b border-white/[0.07] py-1.5 pl-2 ${
        selected ? "bg-accent/[0.09] shadow-[inset_2px_0_0_#7c8cff]" : "hover:bg-white/[0.02]"
      }`}
      style={{ gridTemplateColumns: cols.template, columnGap: GAP }}
    >
      <button type="button" onClick={onSelect} aria-label={`Select ${label}`} aria-pressed={selected} className="min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <div className="flex items-baseline">
          <b className="truncate font-medium">{p.title}</b>
          {stale && p.forecast && <span className="stale-tag font-normal">stale · {day(p.forecast.generated_at)}</span>}
        </div>
        <div className="text-[11px] leading-snug text-muted">
          <span className="font-mono">{p.units.toLocaleString()}</span> in stock · sold <span className="font-mono">{p.sold_14d.toLocaleString()}</span> in 14 days
        </div>
        <div className="text-[11px] leading-snug text-muted">
          {predicted && p.forecast ? (
            <>
              likely sells <span className="font-mono text-[#e7e7f0]">{rangeText(p.forecast)}</span> next 14 days
            </>
          ) : (
            <span className="italic">too few sales to predict</span>
          )}
        </div>
      </button>
      <Sparkline values={p.sales_28d} width={SPARK_W} />
      <StockVsRange width={cols.range} units={p.units} range={predicted ? p.forecast : null} color={color} dashed={stale} height={34} />
      {sellout && (p.sellout ? <RunoutChip sellout={p.sellout} stale={stale} /> : <div />)}
      <Link
        href={`/products/${encodeURIComponent(p.id)}`}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Open ${p.title}`}
        className="justify-self-end rounded-md border border-edge px-1.5 py-0.5 text-[11px] text-muted hover:border-accent/50 hover:text-[#e7e7f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Open
      </Link>
    </div>
  );
}

function Legend({ sellout }: { sellout: boolean }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-4 text-[11px] text-muted">
      <span>
        <i className="mr-1.5 inline-block h-2 w-3.5 rounded-sm bg-white/30 align-middle" />
        Stock now (white line)
      </span>
      <span>
        <i className="mr-1.5 inline-block h-2 w-3.5 rounded-sm border border-accent bg-accent/35 align-middle" />
        Likely sold in 14 days, line = middle{sellout ? ", colour = sell-out risk" : ""}
      </span>
      {sellout && (
        <span>
          <i className="mr-1.5 inline-block h-2 w-3.5 rounded-sm bg-[#f87171]/35 align-middle" />
          Could run out: earliest to latest day (the top strip has the day-by-day chart)
        </span>
      )}
      <span>
        <i className="mr-1.5 inline-block h-2 w-3.5 rounded-sm border border-dashed border-[#55556d] align-middle" />
        Stale range
      </span>
      <span>Click a product to see it in the galaxy; Open or double-click for its page</span>
    </div>
  );
}

export default function ProductsPage() {
  const router = useRouter();
  const overview = useLoad(() => getProductsOverview(DEV_MERCHANT), `products-overview:${DEV_MERCHANT}`);
  const page = useLoad(() => getPageState(DEV_MERCHANT, "products"), `page:products:${DEV_MERCHANT}`);
  const pairs = useLoad(() => getProductPairs(DEV_MERCHANT), `products-pairs:${DEV_MERCHANT}`);
  const track = useLoad(() => getTrackRecord(DEV_MERCHANT), `track-record:${DEV_MERCHANT}`);
  const [selected, setSelected] = useState<string | null>(null);
  const [galaxyOpen, setGalaxyOpen] = useState(false);
  const closeGalaxy = useCallback(() => setGalaxyOpen(false), []);
  const [ref, width] = useWidth<HTMLDivElement>();
  const listRef = useRef<HTMLDivElement>(null);
  const products = overview.data?.products ?? [];
  const vis = selloutVisibility(products.map((p) => p.sellout));
  const cols = columns(width, vis.shown);
  const sorted = sortProducts(products, vis.shown);

  // A product picked in the galaxy scrolls into view in the list.
  useEffect(() => {
    if (selected === null) return;
    const row = listRef.current?.querySelector(`[data-product="${CSS.escape(selected)}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const open = (id: string) => router.push(`/products/${encodeURIComponent(id)}`);

  return (
    <PageShell crumbs={[{ label: "Products" }]} fill>
      <div className="flex-none px-6 pt-4">
        <PageTitle title="Products" answer={overview.data ? <Answer products={products} sellout={vis.shown} /> : undefined} />
        <div className="-mt-1 mb-3">
          <InsightStrip
            pairs={pairs}
            track={track}
            onOpenPairs={() => setGalaxyOpen(true)}
            runout={vis.shown ? { untested: vis.untested, rows: products.flatMap((p) => (p.sellout ? [{ key: p.id, title: p.title, href: `/products/${encodeURIComponent(p.id)}`, sellout: p.sellout, stale: p.forecast_state === "stale" }] : [])) } : null}
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 border-t border-edge">
        <div ref={listRef} className="min-w-0 flex-1 overflow-auto px-6 pb-8">
          {overview.error && <LoadError message={overview.error} retry={overview.retry} />}
          <div ref={ref} className="w-full">
            {!overview.error && width > 0 && (
              <div style={{ width: cols.total }}>
                <div
                  className="sticky top-0 z-[1] grid items-end border-b border-edge bg-[#080812] pb-1 pl-2 pt-3 text-[10px] text-muted"
                  style={{ gridTemplateColumns: cols.template, columnGap: GAP }}
                >
                  <span>Product</span>
                  <span>
                    Sold per day, 28 days<span className="source-chip">Shopify</span>
                  </span>
                  <span>
                    Stock <span className="text-[#e7e7f0]">|</span> against likely sold in 14 days
                    <span className="source-chip">Shopify</span>
                    <span className="source-chip">Kumo</span>
                  </span>
                  {vis.shown && (
                    <span className="whitespace-nowrap">
                      Could run out<span className="source-chip">Our math</span>
                      {vis.untested && <UntestedTag />}
                    </span>
                  )}
                  <span />
                </div>
                {!overview.data &&
                  [0, 1, 2].map((i) => (
                    <div key={i} className="border-b border-white/[0.07] py-3">
                      <Skeleton className="h-3 w-48" />
                    </div>
                  ))}
                {overview.data && products.length === 0 && <p className="py-4 text-muted">No products in Shopify yet.</p>}
                {sorted.map((p) => (
                  <ProductRow
                    key={p.id}
                    p={p}
                    cols={cols}
                    sellout={vis.shown}
                    selected={selected === p.id}
                    onSelect={() => setSelected((s) => (s === p.id ? s : p.id))}
                    onOpen={() => open(p.id)}
                  />
                ))}
                {overview.data && products.length > 0 && <Legend sellout={vis.shown} />}
              </div>
            )}
          </div>
          <SectionList compact skip={vis.shown ? ["sellout_risk"] : []} state={page.data} error={page.error} retry={page.retry} heading={<SubHeading>Not ready yet</SubHeading>} />
        </div>
        <GalaxyPanel
          pairs={pairs}
          track={track.data}
          products={products}
          selected={selected}
          onSelect={setSelected}
          onExpand={() => setGalaxyOpen(true)}
        />
      </div>
      {pairs.data && (
        <Modal open={galaxyOpen} onClose={closeGalaxy} title="Bought together" chips={<SourceChip source="shopify" />}>
          <div className="absolute inset-0">
            <BasketGalaxy pairs={pairs.data} products={products} focusId={selected} onFocus={setSelected} />
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
