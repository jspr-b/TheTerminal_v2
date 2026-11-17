"use client";

import Link from "next/link";
import PageShell, { PageTitle, SubHeading } from "@/components/shell/PageShell";
import { rangeText } from "@/components/shared/Forecast";
import { LoadError, Skeleton, useLoad } from "@/components/shared/Load";
import {
  ACCENT,
  DIM,
  RISK_COLOR,
  RISK_TEXT,
  RunoutAxis,
  RunoutStrip,
  Sparkline,
  StockVsRange,
  UntestedTag,
  runoutWords,
  selloutVisibility,
  useWidth,
} from "@/components/shared/ProductVisuals";
import { SectionList } from "@/components/shared/Sections";
import { DEV_MERCHANT, getPageState, getProductsOverview, type OverviewProduct, type Sellout } from "@/lib/api";
import { day } from "@/lib/format";

const SPARK_W = 118;
const GAP = 24;
const TEXT_W = 92; // the range as text, next to the stock-vs-range bar
const MIN_RANGE = 230;
const MIN_RUNOUT = 210;

/** Column widths from the page width. Below the minimums the rows scroll sideways instead of squeezing. */
function columns(width: number, sellout: boolean) {
  const name = width < 1000 ? 180 : 230;
  const rest = width - name - SPARK_W - GAP * (sellout ? 3 : 2);
  const range = sellout ? Math.max(MIN_RANGE, Math.floor(rest * 0.52)) : Math.max(MIN_RANGE, rest);
  const runout = sellout ? Math.max(MIN_RUNOUT, rest - range) : 0;
  const template = sellout ? `${name}px ${SPARK_W}px ${range}px ${runout}px` : `${name}px ${SPARK_W}px ${range}px`;
  const total = name + SPARK_W + range + runout + GAP * (sellout ? 3 : 2);
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

function ProductRow({ p, cols, sellout }: { p: OverviewProduct; cols: ReturnType<typeof columns>; sellout: boolean }) {
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
    <Link
      href={`/products/${encodeURIComponent(p.id)}`}
      aria-label={label}
      title={label}
      className="grid items-center border-b border-white/[0.07] py-2 hover:bg-white/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      style={{ gridTemplateColumns: cols.template, columnGap: GAP }}
    >
      <div className="min-w-0">
        <div className="flex items-baseline">
          <b className="truncate font-medium">{p.title}</b>
          {stale && p.forecast && <span className="stale-tag font-normal">stale · {day(p.forecast.generated_at)}</span>}
        </div>
        {p.product_type && <div className="truncate text-[11px] text-muted">{p.product_type}</div>}
        <div className="text-[11px] text-muted">
          <span className="font-mono">{p.units.toLocaleString()}</span> in stock · sold{" "}
          <span className="font-mono">{p.sold_14d.toLocaleString()}</span> in the last 14 days
        </div>
        {!predicted && <div className="text-[11px] italic text-muted">too few sales to predict</div>}
      </div>
      <Sparkline values={p.sales_28d} width={SPARK_W} />
      <div className="flex items-center gap-2">
        <StockVsRange width={cols.range - TEXT_W - 8} units={p.units} range={predicted ? p.forecast : null} color={color} dashed={stale} />
        <div className="w-[92px] flex-none text-[11px] leading-tight text-muted">
          {predicted && p.forecast ? (
            <>
              <span className="font-mono text-[#e7e7f0]">{rangeText(p.forecast)}</span>
              <br />
              likely sold
            </>
          ) : (
            <span className="italic">no range</span>
          )}
        </div>
      </div>
      {sellout && (p.sellout ? <RunoutStrip width={cols.runout} sellout={p.sellout} dashed={stale} /> : <div />)}
    </Link>
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
          Earliest to latest run-out day, dot = most likely
        </span>
      )}
      <span>
        <i className="mr-1.5 inline-block h-2 w-3.5 rounded-sm border border-dashed border-[#55556d] align-middle" />
        Stale range
      </span>
      <span>Click a product for its page</span>
    </div>
  );
}

export default function ProductsPage() {
  const overview = useLoad(() => getProductsOverview(DEV_MERCHANT), `products-overview:${DEV_MERCHANT}`);
  const page = useLoad(() => getPageState(DEV_MERCHANT, "products"), `page:products:${DEV_MERCHANT}`);
  const [ref, width] = useWidth<HTMLDivElement>();
  const products = overview.data?.products ?? [];
  const vis = selloutVisibility(products.map((p) => p.sellout));
  const cols = columns(width, vis.shown);
  const sorted = sortProducts(products, vis.shown);

  return (
    <PageShell crumbs={[{ label: "Products" }]}>
      <PageTitle title="Products" answer={overview.data ? <Answer products={products} sellout={vis.shown} /> : undefined} />
      {overview.error && <LoadError message={overview.error} retry={overview.retry} />}
      <div ref={ref} className="w-full overflow-x-auto">
        {!overview.error && width > 0 && (
          <div style={{ width: cols.total }}>
            <div
              className="grid items-end border-b border-edge pb-1 text-[10px] text-muted"
              style={{ gridTemplateColumns: cols.template, columnGap: GAP }}
            >
              <span>Product</span>
              <span>
                Sold per day, 28 days<span className="source-chip">Shopify</span>
              </span>
              <span>
                Stock <span className="text-[#e7e7f0]">|</span> against what it will likely sell in 14 days
                <span className="source-chip">Shopify</span>
                <span className="source-chip">Kumo</span>
              </span>
              {vis.shown && (
                <span>
                  <span className="mb-0.5 block">
                    Could run out on day…<span className="source-chip">Our math</span>
                    {vis.untested && <UntestedTag />}
                  </span>
                  <RunoutAxis width={cols.runout} />
                </span>
              )}
            </div>
            {!overview.data &&
              [0, 1, 2].map((i) => (
                <div key={i} className="border-b border-white/[0.07] py-3">
                  <Skeleton className="h-3 w-48" />
                </div>
              ))}
            {overview.data && products.length === 0 && <p className="py-4 text-muted">No products in Shopify yet.</p>}
            {sorted.map((p) => (
              <ProductRow key={p.id} p={p} cols={cols} sellout={vis.shown} />
            ))}
            {overview.data && products.length > 0 && <Legend sellout={vis.shown} />}
          </div>
        )}
      </div>
      <SectionList compact skip={vis.shown ? ["sellout_risk"] : []} state={page.data} error={page.error} retry={page.retry} heading={<SubHeading>Not ready yet</SubHeading>} />
    </PageShell>
  );
}
