"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import PageShell, { PageTitle, SectionTitle } from "@/components/shell/PageShell";
import ProductGalaxy from "@/components/products/world/ProductGalaxy";
import { STAGE_BACKGROUND, neighbours } from "@/components/shared/BasketGalaxy";
import { high, low, rangeText } from "@/components/shared/Forecast";
import { LoadError, Skeleton, useLoad } from "@/components/shared/Load";
import { RISK_TEXT, STOCK, UntestedTag, dayFromToday, dayName, selloutVisibility, useWidth } from "@/components/shared/ProductVisuals";
import Modal from "@/components/shared/Modal";
import SalesSkyline from "@/components/product/SalesSkyline";
import { RunoutChart, runoutShort } from "@/components/shared/Runout";
import SourceChip from "@/components/shared/SourceChip";
import { DEV_MERCHANT, getPageState, getProduct, getProductPairs, getProductsOverview, type ProductDetail } from "@/lib/api";
import { day } from "@/lib/format";

const L = 46;
const R = 16;
const MUTED = "#8d8da6";

/** Shared x scale: the history days (negative) then the 14 forecast days. Day k ends at x(k). */
function timeScale(width: number, history: number) {
  const slot = (width - L - R) / (history + 14);
  return { slot, x: (d: number) => L + (d + history) * slot };
}

/** Our math: stock now minus the range spread evenly over 14 days. */
function StockChart({ p, width }: { p: ProductDetail; width: number }) {
  const f = p.forecast;
  if (!f) return null;
  const H = 130;
  const t = 10;
  const n = p.sales.length;
  const { x } = timeScale(width, n);
  const lowS = Math.min(0, p.units - f.upper);
  const span = Math.max(1, p.units - lowS);
  const y = (v: number) => t + (H - t - 20) * ((p.units - v) / span);
  const ks = Array.from({ length: 15 }, (_, k) => k);
  const upper = ks.map((k) => `${x(k)},${y(p.units - (f.lower * k) / 14)}`);
  const lower = ks.map((k) => `${x(k)},${y(p.units - (f.upper * k) / 14)}`).reverse();
  return (
    <svg width={width} height={H} className="block" role="img" aria-label="Stock left after each of the next 14 days">
      <rect x={x(0)} y={y(0)} width={x(14) - x(0)} height={Math.max(0, y(lowS) - y(0))} fill="#f87171" fillOpacity={0.08} />
      <line x1={x(0)} x2={width - R} y1={y(0)} y2={y(0)} stroke="#f87171" strokeOpacity={0.6} strokeDasharray="3 3" />
      <text x={width - R} y={y(0) - 5} textAnchor="end" fontSize={10} fill="#f87171">
        out of stock
      </text>
      <polygon points={[...upper, ...lower].join(" ")} fill={STOCK} fillOpacity={0.14} stroke={STOCK} strokeOpacity={0.5}>
        <title>{`By ${dayFromToday(14)}: ${Math.max(0, low(p.units - f.upper))}–${Math.max(0, high(p.units - f.lower))} left`}</title>
      </polygon>
      <text x={L - 8} y={y(p.units) + 3} textAnchor="end" fontSize={10} fill={MUTED} className="font-mono">
        {p.units}
      </text>
      <text x={L - 8} y={y(0) + 3} textAnchor="end" fontSize={10} fill={MUTED} className="font-mono">
        0
      </text>
      <text x={x(-n)} y={H / 2} fontSize={10} fill={MUTED}>
        No stock history yet: it starts once daily snapshots are saved
      </text>
      <line x1={x(0)} x2={x(0)} y1={0} y2={H - 20} stroke="rgba(255,255,255,.25)" strokeDasharray="2 3" />
      <text x={x(0)} y={H - 4} fontSize={10} fill={MUTED}>
        today
      </text>
      <text x={x(14)} y={H - 4} textAnchor="end" fontSize={10} fill={MUTED}>
        {dayFromToday(14)}
      </text>
    </svg>
  );
}

function Panel({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <SectionTitle>{title}</SectionTitle>
      <div className="rounded-[10px] border border-white/[0.07] bg-[#11111e] px-4 py-2">{children}</div>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-2.5 border-b border-white/[0.07] py-1.5 last:border-0">{children}</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-1.5 text-xs text-muted">{children}</p>;
}

function Answer({ p, sellout, untested }: { p: ProductDetail; sellout: boolean; untested: boolean }) {
  const f = p.forecast_state !== "too_few_sales" ? p.forecast : null;
  const s = p.sellout;
  return (
    <>
      {f ? (
        <>
          In the next 14 days it will likely sell <b className="font-mono">{rangeText(f)}</b> (sold {p.sold_14d.toLocaleString()} in the last 14).{" "}
        </>
      ) : (
        <>
          Too few sales to predict. Sold {p.sold_14d.toLocaleString()} in the last 14 days; {p.units.toLocaleString()} in stock.{" "}
        </>
      )}
      {sellout && s && (
        <>
          {s.earliest_day !== null ? (
            <>
              It could run out from <b>{dayFromToday(s.earliest_day)}</b>.
            </>
          ) : (
            <>
              It should last past <b>{dayFromToday(14)}</b>.
            </>
          )}
          {untested && <UntestedTag />}
        </>
      )}
    </>
  );
}

/** The views the stage can show; the rail picks one. */
type View = "skyline" | "pairs";
type Open = null | "stock" | "runout";

function BoughtList({ rows }: { rows: { id: string; title: string; orders: number }[] }) {
  return (
    <>
      {rows.map((b) => (
        <Row key={b.id}>
          <Link href={`/products/${encodeURIComponent(b.id)}`} className="hover:text-accent">
            {b.title}
          </Link>
          <span className="text-xs text-muted">
            in <span className="font-mono text-[#e7e7f0]">{b.orders.toLocaleString()}</span> orders
          </span>
        </Row>
      ))}
    </>
  );
}

/** One answer in the ribbon; clickable when it has a detail. */
function Cell({ label, chips, value, sub, onOpen, valueClass = "" }: { label: string; chips: ReactNode; value: ReactNode; sub?: ReactNode; onOpen?: () => void; valueClass?: string }) {
  const body = (
    <>
      <div className="flex items-center whitespace-nowrap text-[10px] uppercase tracking-[0.06em] text-muted [&_.source-chip]:normal-case [&_.source-chip]:tracking-normal">
        {label}
        {chips}
        {onOpen && <span className="ml-auto pl-2 normal-case tracking-normal text-accent opacity-0 transition-opacity group-hover:opacity-100">Open →</span>}
      </div>
      <div className={`mt-0.5 truncate font-mono text-[19px] leading-tight ${valueClass}`}>
        {value}
        {sub && <small className="ml-1.5 font-sans text-xs text-muted">{sub}</small>}
      </div>
    </>
  );
  const cls = "group min-w-0 flex-1 border-r border-white/[0.07] px-3.5 py-2 text-left last:border-0";
  return onOpen ? (
    <button type="button" onClick={onOpen} className={`${cls} hover:bg-white/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params?.id ?? "");
  const product = useLoad(() => getProduct(DEV_MERCHANT, id), `product:${DEV_MERCHANT}:${id}`);
  const pairs = useLoad(() => getProductPairs(DEV_MERCHANT), `products-pairs:${DEV_MERCHANT}`);
  const overview = useLoad(() => getProductsOverview(DEV_MERCHANT), `products-overview:${DEV_MERCHANT}`);
  const search = useSearchParams();
  const router = useRouter();
  const view: View = search.get("view") === "together" ? "pairs" : "skyline";
  const setView = (v: View) => router.replace(v === "pairs" ? `?view=together` : "?", { scroll: false });
  const [open, setOpen] = useState<Open>(null);
  const close = useCallback(() => setOpen(null), []);
  // A new product (via a link) starts on the skyline with every pop-up closed.
  useEffect(() => {
    setOpen(null);
  }, [id]);
  const p = product.data;
  const vis = selloutVisibility([p?.sellout ?? null]);
  const f = p && p.forecast_state !== "too_few_sales" ? p.forecast : null;
  const showStock = vis.shown && f !== null;
  const outDay = vis.shown && p?.sellout ? p.sellout.likely_day : null;

  // Bought together: the galaxy when this product is in it, otherwise the product's own list.
  const inGalaxy = pairs.data !== null && pairs.data.nodes.some((n) => n.id === id) && pairs.data.links.some((l) => l.source === id || l.target === id);
  const together = p
    ? inGalaxy && pairs.data
      ? neighbours(pairs.data, id)
      : p.bought_together.map((b) => ({ id: b.product_id, title: b.title, orders: b.orders }))
    : [];

  return (
    <PageShell crumbs={[{ label: "Products", href: `/products?focus=${encodeURIComponent(id)}` }, { label: p?.title ?? "Product" }]} fill>
      <div className="flex-none px-6 pt-4">
        {product.error && <LoadError message={product.error} retry={product.retry} />}
        {!product.error && !p && <Skeleton className="h-6 w-64" />}
        {p && (
          <PageTitle
            title={p.title}
            sub={p.product_type ?? undefined}
            tag={p.forecast_state === "stale" && p.forecast ? <span className="stale-tag align-middle font-normal">stale · {day(p.forecast.generated_at)}</span> : undefined}
            answer={<Answer p={p} sellout={vis.shown} untested={vis.untested} />}
          />
        )}
        {p && (
          <div className="-mt-1 mb-3 flex overflow-hidden rounded-xl border border-edge bg-[#0f0f1c]">
            <Cell label="In stock" chips={<SourceChip source="shopify" />} value={p.units.toLocaleString()} sub={`${p.by_location.length} ${p.by_location.length === 1 ? "location" : "locations"}`} onOpen={() => setOpen("stock")} />
            <Cell
              label="Likely sells, 14 days"
              chips={<SourceChip source="kumo" />}
              value={f ? rangeText(f) : "–"}
              sub={f ? `middle ${Math.round(f.value)}` : "too few sales"}
            />
            {vis.shown && p.sellout && (
              <Cell
                label="Runs out"
                chips={
                  <>
                    <SourceChip source="our_math" />
                    {vis.untested && <UntestedTag />}
                  </>
                }
                value={p.sellout.earliest_day === null ? "lasts" : runoutShort(p.sellout).replace("could run out ", "")}
                sub={p.sellout.likely_day !== null ? `likely day ${p.sellout.likely_day}` : "past day 14"}
                valueClass={p.sellout.earliest_day === null ? "text-muted" : RISK_TEXT[p.sellout.band]}
                onOpen={() => setOpen("runout")}
              />
            )}
            <Cell
              label="Most bought with"
              chips={<SourceChip source="shopify" />}
              value={<span className="font-sans text-[15px] font-medium">{together[0]?.title ?? "–"}</span>}
              sub={together[0] ? `${together[0].orders.toLocaleString()} orders` : undefined}
            />
          </div>
        )}
      </div>

      {p && (
        <div className="flex min-h-0 flex-1 border-t border-edge">
          <section className="relative min-w-0 flex-1 overflow-hidden" style={{ background: STAGE_BACKGROUND }} aria-label="Stage">
            {/* view switcher, the same ‹ › pattern as the Products world; no side menu */}
            <div className="absolute left-1/2 bottom-[78px] z-[6] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-edge bg-[#0c0c16]/88 p-1" role="group" aria-label="View">
              <button type="button" onClick={() => setView("skyline")} disabled={view === "skyline"} aria-label="Previous view" className="h-7 w-7 rounded-full border border-edge text-sm disabled:opacity-30">
                ‹
              </button>
              {(
                [
                  ["skyline", "Sales skyline"],
                  ["pairs", "Bought together"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k} className={`whitespace-nowrap rounded-lg px-3 py-1 text-xs ${view === k ? "bg-accent/[0.18] text-[#e7e7f0]" : "text-muted hover:text-[#c9c9d8]"}`}>
                  {label}
                </button>
              ))}
              <button type="button" onClick={() => setView("pairs")} disabled={view === "pairs"} aria-label="Next view" className="h-7 w-7 rounded-full border border-edge text-sm disabled:opacity-30">
                ›
              </button>
            </div>
            {view === "skyline" && (
              <SalesSkyline sales={p.sales} forecast={f} stale={p.forecast_state === "stale"} stock={p.units} likelyOutDay={outDay} showStock={showStock} untested={vis.untested} />
            )}
            {view === "pairs" &&
              (inGalaxy && pairs.data ? (
                overview.data ? (
                  <ProductGalaxy productId={id} products={overview.data.products} pairs={pairs.data} />
                ) : null
              ) : (
                <div className="absolute inset-0 overflow-auto px-7 py-6">
                  <Panel title={<>Often bought in the same order<span className="source-chip">Shopify</span></>}>
                    {together.length > 0 ? <BoughtList rows={together} /> : <Empty>Not enough shared orders yet.</Empty>}
                  </Panel>
                </div>
              ))}
          </section>

        </div>
      )}

      {p && (
        <>
          <Modal open={open === "stock"} onClose={close} title="Stock" chips={<SourceChip source="shopify" />}>
            <div className="grid grid-cols-1 gap-x-7 px-7 pb-10 pt-2 lg:grid-cols-2">
              <Panel title={<>Stock per location<span className="source-chip">Shopify</span></>}>
                {p.by_location.length === 0 ? (
                  <Empty>Not stocked at any location.</Empty>
                ) : (
                  p.by_location.map((l) => (
                    <Row key={l.location_id}>
                      <span>{l.name}</span>
                      <span className="font-mono text-xs">{l.units.toLocaleString()}</span>
                    </Row>
                  ))
                )}
              </Panel>
              <Panel title={<>Stock per size or variant<span className="source-chip">Shopify</span></>}>
                {p.by_variant.length === 0 ? (
                  <Empty>No variants.</Empty>
                ) : (
                  p.by_variant.map((v) => (
                    <Row key={v.id}>
                      <span>
                        {v.title ?? v.sku ?? "Variant"}
                        {v.title && v.sku && <span className="ml-2 text-[11px] text-muted">{v.sku}</span>}
                      </span>
                      <span className="font-mono text-xs">{v.units.toLocaleString()}</span>
                    </Row>
                  ))
                )}
              </Panel>
            </div>
          </Modal>
          {vis.shown && p.sellout && (
            <Modal
              open={open === "runout"}
              onClose={close}
              title="Could run out"
              chips={
                <>
                  <SourceChip source="our_math" />
                  {vis.untested && <UntestedTag />}
                </>
              }
            >
              <div className="px-7 pb-10 pt-6">
                <p className="mb-5 max-w-[760px] text-muted">
                  {p.units.toLocaleString()} in stock against Kumo&apos;s range of {f ? rangeText(f) : "–"} for the next 14 days, spread evenly over the days. Bar =
                  earliest to latest day it could run out, dot = most likely day.
                </p>
                <RunoutChart rows={[{ key: p.id, title: p.title, sellout: p.sellout, stale: p.forecast_state === "stale" }]} />
                {showStock && <StockLeft p={p} untested={vis.untested} />}
              </div>
            </Modal>
          )}
        </>
      )}
    </PageShell>
  );
}

/** The stock-left chart (our math) at full width. */
function StockLeft({ p, untested }: { p: ProductDetail; untested: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="mt-8 w-full">
      <SectionTitle>
        Stock left after each day<span className="source-chip">Our math</span>
        {untested && <UntestedTag />}
      </SectionTitle>
      {width > 0 && <StockChart p={p} width={width} />}
    </div>
  );
}
