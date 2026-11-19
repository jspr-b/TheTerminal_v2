"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import PageShell, { PageTitle, SectionTitle } from "@/components/shell/PageShell";
import BasketGalaxy, { STAGE_BACKGROUND, neighbours } from "@/components/shared/BasketGalaxy";
import { high, low, rangeText } from "@/components/shared/Forecast";
import { LoadError, Skeleton, useLoad } from "@/components/shared/Load";
import { RISK_TEXT, STOCK, UntestedTag, dayFromToday, dayName, selloutVisibility, useWidth } from "@/components/shared/ProductVisuals";
import Modal from "@/components/shared/Modal";
import SampleCards, { SHOW_SAMPLES } from "@/components/product/SampleCards";
import SalesSkyline from "@/components/product/SalesSkyline";
import { RunoutChart, runoutShort } from "@/components/shared/Runout";
import { SectionList } from "@/components/shared/Sections";
import SourceChip from "@/components/shared/SourceChip";
import { FIRST_CHECK, RESULT_WORDS, TrackGrid, TrackProductCard, TrackSummaryCard, resultOf } from "@/components/shared/TrackCards";
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
type View = "skyline" | "pairs" | "track";
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

/** A rail entry: small picture, name, one line. Picks what the stage shows. */
function Instrument({ on, slim, title, chips, line, thumb, onClick }: { on: boolean; slim: boolean; title: string; chips: ReactNode; line: ReactNode; thumb: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`grid w-full items-center gap-3 border-b border-l-2 border-b-white/[0.07] px-4 py-3 text-left transition-colors ${
        on ? "border-l-accent bg-accent/[0.07]" : "border-l-transparent hover:bg-white/[0.025]"
      } ${slim ? "grid-cols-[104px]" : "grid-cols-[104px_1fr]"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
    >
      <span className="block h-[46px] w-[104px]">{thumb}</span>
      {!slim && (
        <span className="min-w-0">
          <span className="flex flex-wrap items-center text-[10px] uppercase tracking-[0.06em] text-muted [&_.source-chip]:normal-case [&_.source-chip]:tracking-normal">
            {title}
            {chips}
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-[#c9c9d8] [&_b]:font-medium [&_b]:text-[#e7e7f0]">{line}</span>
        </span>
      )}
    </button>
  );
}

/** Rail picture: the last 18 days solid, the next 8 as Kumo's middle with the top of the range outlined. */
function SkylineThumb({ p, outDay }: { p: ProductDetail; outDay: number | null }) {
  const f = p.forecast_state !== "too_few_sales" ? p.forecast : null;
  const past = p.sales.slice(-18).map((s) => s.units);
  const ahead = f ? Array.from({ length: 8 }, () => ({ mid: f.value / 14, hi: f.upper / 14 })) : [];
  const max = Math.max(1, ...past, ...ahead.map((a) => a.hi));
  const y = (v: number) => (v / max) * 42;
  return (
    <svg width={104} height={46} aria-hidden="true">
      {past.map((v, i) => (
        <rect key={i} x={i * 4} y={44 - y(v)} width={3} height={y(v)} fill="#c9cbe0" opacity={0.75} />
      ))}
      {ahead.map((a, i) => (
        <g key={i}>
          <rect x={72 + i * 4} y={44 - y(a.mid)} width={3} height={y(a.mid)} fill={outDay !== null && i + 1 >= outDay ? "#f87171" : "#7c8cff"} opacity={0.7} />
          <rect x={72 + i * 4} y={44 - y(a.hi)} width={3} height={y(a.hi)} fill="none" stroke="#9aa6ff" strokeWidth={0.5} />
        </g>
      ))}
    </svg>
  );
}

/** Rail picture: this product in the middle, its pairs around it, thicker line = more shared orders. */
function PairsThumb({ rows }: { rows: { orders: number }[] }) {
  const top = rows.slice(0, 6);
  const max = Math.max(1, ...top.map((r) => r.orders));
  const at = (i: number): [number, number] => {
    const a = (i / Math.max(1, top.length)) * Math.PI * 2 - Math.PI / 2;
    return [52 + Math.cos(a) * 40, 23 + Math.sin(a) * 18];
  };
  return (
    <svg width={104} height={46} aria-hidden="true">
      {top.map((r, i) => {
        const [x, y] = at(i);
        return <line key={i} x1={52} y1={23} x2={x} y2={y} stroke="#7c8cff" strokeWidth={0.5 + (2 * r.orders) / max} opacity={0.7} />;
      })}
      {top.map((r, i) => {
        const [x, y] = at(i);
        return <circle key={i} cx={x} cy={y} r={2 + (2 * r.orders) / max} fill="#8fa2ff" />;
      })}
      <circle cx={52} cy={23} r={6} fill="#fff" />
    </svg>
  );
}

/** Rail picture: the last checks as small bands with a white dot for what sold. */
function TrackThumb({ rows }: { rows: ProductDetail["track_record"] }) {
  const top = rows.slice(0, 4);
  const lo = Math.min(...top.map((r) => Math.min(r.lower, r.actual)));
  const hi = Math.max(...top.map((r) => Math.max(r.upper, r.actual)));
  const x = (v: number) => 4 + ((v - lo) / Math.max(1, hi - lo)) * 96;
  return (
    <svg width={104} height={46} aria-hidden="true">
      {top.map((r, i) => (
        <g key={r.generated_at}>
          <rect x={x(r.lower)} y={3 + i * 11} width={Math.max(2, x(r.upper) - x(r.lower))} height={7} rx={2} fill="rgba(124,140,255,.3)" />
          <circle cx={x(r.actual)} cy={6.5 + i * 11} r={2.6} fill="#fff" />
        </g>
      ))}
    </svg>
  );
}

export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params?.id ?? "");
  const product = useLoad(() => getProduct(DEV_MERCHANT, id), `product:${DEV_MERCHANT}:${id}`);
  const page = useLoad(() => getPageState(DEV_MERCHANT, "product"), `page:product:${DEV_MERCHANT}`);
  const pairs = useLoad(() => getProductPairs(DEV_MERCHANT), `products-pairs:${DEV_MERCHANT}`);
  const overview = useLoad(() => getProductsOverview(DEV_MERCHANT), `products-overview:${DEV_MERCHANT}`);
  const [view, setView] = useState<View>("skyline");
  const [open, setOpen] = useState<Open>(null);
  const close = useCallback(() => setOpen(null), []);
  // A new product (via a link) starts on the skyline with every pop-up closed.
  useEffect(() => {
    setOpen(null);
    setView("skyline");
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
  const latest = p?.track_record[0];
  const held = p ? p.track_record.filter((r) => resultOf(r) === "inside").length : 0;
  const slim = view !== "skyline";

  return (
    <PageShell crumbs={[{ label: "Products", href: "/products" }, { label: p?.title ?? "Product" }]} fill>
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
              label="Last check"
              chips={
                <>
                  <SourceChip source="kumo" />
                  <SourceChip source="shopify" />
                </>
              }
              value={latest ? (resultOf(latest) === "inside" ? "inside" : resultOf(latest) === "above" ? "sold more" : "sold less") : "–"}
              sub={latest ? `${held} of ${p.track_record.length} held` : "first check later"}
            />
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
            {view === "skyline" && (
              <SalesSkyline sales={p.sales} forecast={f} stale={p.forecast_state === "stale"} stock={p.units} likelyOutDay={outDay} showStock={showStock} untested={vis.untested} />
            )}
            {view === "pairs" &&
              (inGalaxy && pairs.data ? (
                <div className="absolute inset-0">
                  <BasketGalaxy pairs={pairs.data} products={overview.data?.products} focusId={id} />
                </div>
              ) : (
                <div className="absolute inset-0 overflow-auto px-7 py-6">
                  <Panel title={<>Often bought in the same order<span className="source-chip">Shopify</span></>}>
                    {together.length > 0 ? <BoughtList rows={together} /> : <Empty>Not enough shared orders yet.</Empty>}
                  </Panel>
                </div>
              ))}
            {view === "track" && (
              <div className="absolute inset-0 overflow-auto px-7 pb-10 pt-6">
                <div className="mb-1 flex items-center text-[15px] font-semibold">
                  Track record<span className="source-chip">Kumo</span>
                  <span className="source-chip">Shopify</span>
                </div>
                <p className="mb-5 max-w-[720px] text-xs text-muted">
                  Every past range for {p.title} whose 14 days are over, next to what really sold. A white dot inside the band means Kumo&apos;s range held.
                </p>
                {p.track_record.length === 0 ? (
                  <p className="text-muted">{FIRST_CHECK}</p>
                ) : (
                  <TrackGrid>
                    {p.track_record.length > 1 && (
                      <TrackSummaryCard
                        label={`Last ${p.track_record.length} checks`}
                        name="Kumo's ranges held for"
                        held={held}
                        total={p.track_record.length}
                        unit="checks"
                        dots={p.track_record.map((r) => ({ key: r.generated_at, title: `Made ${dayName(r.generated_at)}`, inside: resultOf(r) === "inside" }))}
                      />
                    )}
                    {p.track_record.map((r) => (
                      <TrackProductCard key={r.generated_at} kicker={`Kumo said, ${dayName(r.generated_at)}`} name={p.title} r={r} result={resultOf(r)} />
                    ))}
                  </TrackGrid>
                )}
              </div>
            )}
          </section>

          <aside className={`flex flex-none flex-col overflow-y-auto border-l border-edge bg-[#0f0f1c] transition-[width] duration-300 ${slim ? "w-[136px]" : "w-[372px]"}`}>
            {!slim && <div className="px-4 pb-1.5 pt-3.5 text-[10px] uppercase tracking-[0.08em] text-[#55556d]">Look closer: pick one for the stage</div>}
            <Instrument
              on={view === "skyline"}
              slim={slim}
              title="Sales skyline"
              chips={
                <>
                  <SourceChip source="shopify" />
                  <SourceChip source="kumo" />
                </>
              }
              line={
                f ? (
                  <>
                    Sold <b className="font-mono">{p.sold_14d.toLocaleString()}</b> last 14 days, likely <b className="font-mono">{rangeText(f)}</b> next 14
                  </>
                ) : (
                  <>
                    Sold <b className="font-mono">{p.sold_14d.toLocaleString()}</b> last 14 days; too few sales to predict
                  </>
                )
              }
              thumb={<SkylineThumb p={p} outDay={outDay} />}
              onClick={() => setView("skyline")}
            />
            <Instrument
              on={view === "pairs"}
              slim={slim}
              title="Bought together"
              chips={<SourceChip source="shopify" />}
              line={
                together.length > 0 ? (
                  <>
                    Most with <b>{together[0].title}</b>
                    {together[1] ? <>, then {together[1].title}</> : null}
                  </>
                ) : (
                  "Not enough shared orders yet."
                )
              }
              thumb={<PairsThumb rows={together} />}
              onClick={() => setView("pairs")}
            />
            <Instrument
              on={view === "track"}
              slim={slim}
              title="Track record"
              chips={
                <>
                  <SourceChip source="kumo" />
                  <SourceChip source="shopify" />
                </>
              }
              line={
                latest ? (
                  <>
                    Kumo&apos;s range held <b>{held} of {p.track_record.length}</b> times. Last: {RESULT_WORDS[resultOf(latest)]}
                  </>
                ) : (
                  FIRST_CHECK
                )
              }
              thumb={latest ? <TrackThumb rows={p.track_record} /> : <span />}
              onClick={() => setView("track")}
            />
            {!slim && page.data && SHOW_SAMPLES && <SampleCards rows p={p} sections={page.data.sections} others={together.map((t) => t.title)} />}
            {!slim && (
              <div className="px-4 pb-4">
                <SectionList compact skip={vis.shown ? ["runs_out"] : []} state={page.data} error={page.error} retry={page.retry} heading={<SectionTitle>Not ready yet</SectionTitle>} />
              </div>
            )}
          </aside>
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
