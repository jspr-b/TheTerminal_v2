"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import PageShell, { PageTitle, SectionTitle, SubHeading } from "@/components/shell/PageShell";
import { high, low, rangeText } from "@/components/shared/Forecast";
import { LoadError, Skeleton, useLoad } from "@/components/shared/Load";
import { ACCENT, STOCK, UntestedTag, dayFromToday, dayName, selloutVisibility, useWidth } from "@/components/shared/ProductVisuals";
import { SectionList } from "@/components/shared/Sections";
import { DEV_MERCHANT, getPageState, getProduct, type ProductDetail } from "@/lib/api";
import { day } from "@/lib/format";

const L = 46;
const R = 16;
const MUTED = "#8d8da6";

/** Shared x scale: the history days (negative) then the 14 forecast days. Day k ends at x(k). */
function timeScale(width: number, history: number) {
  const slot = (width - L - R) / (history + 14);
  return { slot, x: (d: number) => L + (d + history) * slot };
}

/** 28 exact history bars, then Kumo's one 14-day range spread evenly over its days. */
function SalesChart({ p, width }: { p: ProductDetail; width: number }) {
  const H = 190;
  const top = 14;
  const n = p.sales.length;
  const { slot, x } = timeScale(width, n);
  const f = p.forecast_state !== "too_few_sales" ? p.forecast : null;
  const perDay = f ? { lower: f.lower / 14, value: f.value / 14, upper: f.upper / 14 } : null;
  const maxY = Math.max(1, ...p.sales.map((s) => s.units), perDay?.upper ?? 0) * 1.15;
  const y = (v: number) => top + (H - top - 22) * (1 - v / maxY);
  const ticks = Array.from(new Set([0, Math.ceil(maxY / 2), Math.ceil(maxY * 0.95)]));
  const stale = p.forecast_state === "stale";
  return (
    <svg width={width} height={H} className="block" role="img" aria-label="Sold per day for the last 28 days, then the likely range per day for the next 14">
      {ticks.map((v) => (
        <g key={v}>
          <text x={L - 8} y={y(v) + 3} textAnchor="end" fontSize={10} fill={MUTED} className="font-mono">
            {v}
          </text>
          <line x1={L} x2={width - R} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.05)" />
        </g>
      ))}
      {p.sales.map((s, i) => (
        <rect key={s.date} x={x(i - n) + slot * 0.18} y={y(s.units)} width={slot * 0.64} height={y(0) - y(s.units)} rx={1.5} fill="rgba(231,231,240,.32)">
          <title>{`${dayName(s.date)}: ${s.units} sold`}</title>
        </rect>
      ))}
      {perDay && (
        <g>
          <rect
            x={x(0)}
            y={y(perDay.upper)}
            width={x(14) - x(0)}
            height={Math.max(1, y(perDay.lower) - y(perDay.upper))}
            fill={ACCENT}
            fillOpacity={stale ? 0.1 : 0.2}
            stroke={stale ? ACCENT : "none"}
            strokeOpacity={0.5}
            strokeDasharray={stale ? "3 3" : undefined}
          >
            <title>{`Likely ${rangeText(f!)} over the next 14 days, about ${rangeText(perDay)} per day`}</title>
          </rect>
          <line x1={x(0)} x2={x(14)} y1={y(perDay.value)} y2={y(perDay.value)} stroke={ACCENT} strokeWidth={2} />
        </g>
      )}
      <line x1={x(0)} x2={x(0)} y1={top - 6} y2={H - 20} stroke="rgba(255,255,255,.25)" strokeDasharray="2 3" />
      <text x={x(0) + 5} y={top + 2} fontSize={10} fill={MUTED}>
        today
      </text>
      {n > 0 && (
        <text x={x(-n)} y={H - 4} fontSize={10} fill={MUTED}>
          {dayName(p.sales[0].date)}
        </text>
      )}
      <text x={x(14)} y={H - 4} textAnchor="end" fontSize={10} fill={MUTED}>
        {dayFromToday(14)}
      </text>
    </svg>
  );
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

/** Past ranges whose 14 days are over: the band, and a white dot for what really sold. */
function TrackRecord({ rows }: { rows: ProductDetail["track_record"] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const max = Math.max(1, ...rows.flatMap((r) => [r.upper, r.actual])) * 1.08;
  const W = Math.max(60, width - 96 - 168 - 20);
  const xx = (v: number) => 4 + (Math.max(0, v) / max) * (W - 8);
  return (
    <div ref={ref}>
      {rows.length === 0 ? (
        <Empty>Kumo has not been here long enough: the first check comes 14 days after the first forecast.</Empty>
      ) : (
        width > 0 &&
        rows.map((r) => {
          const lo = low(r.lower);
          const hi = high(r.upper);
          const where = r.actual < lo ? "below the range" : r.actual > hi ? "above the range" : "inside the range";
          return (
            <Row key={r.generated_at}>
              <span className="w-24 flex-none text-xs">
                Made {day(r.generated_at)}
                <span className={`block text-[11px] ${where === "inside the range" ? "text-muted" : "text-[#e7e7f0]"}`}>{where}</span>
              </span>
              <svg width={W} height={18} aria-hidden="true">
                <rect x={xx(r.lower)} y={3} width={Math.max(2, xx(r.upper) - xx(r.lower))} height={12} rx={3} fill={ACCENT} fillOpacity={0.22} stroke={ACCENT} strokeOpacity={0.8} />
                <line x1={xx(r.value)} x2={xx(r.value)} y1={3} y2={15} stroke={ACCENT} strokeWidth={1.5} />
                <circle cx={xx(r.actual)} cy={9} r={4} fill={STOCK} />
              </svg>
              <span className="w-[168px] flex-none whitespace-nowrap text-right text-[11px] text-muted">
                range <span className="font-mono text-[#e7e7f0]">{rangeText(r)}</span> · sold{" "}
                <span className="font-mono text-[#e7e7f0]">{r.actual.toLocaleString()}</span>
              </span>
            </Row>
          );
        })
      )}
    </div>
  );
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

export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params?.id ?? "");
  const product = useLoad(() => getProduct(DEV_MERCHANT, id), `product:${DEV_MERCHANT}:${id}`);
  const page = useLoad(() => getPageState(DEV_MERCHANT, "product"), `page:product:${DEV_MERCHANT}`);
  const [ref, width] = useWidth<HTMLDivElement>();
  const p = product.data;
  const vis = selloutVisibility([p?.sellout ?? null]);
  const showStock = vis.shown && p !== null && p.forecast !== null && p.forecast_state !== "too_few_sales";

  return (
    <PageShell crumbs={[{ label: "Products", href: "/products" }, { label: p?.title ?? "Product" }]}>
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
      <div ref={ref} className="w-full">
        {p && width > 0 && (
          <>
            <SectionTitle>
              Sold per day, then the likely range per day<span className="source-chip">Shopify</span>
              <span className="source-chip">Kumo</span>
            </SectionTitle>
            <SalesChart p={p} width={width} />
            {p.forecast_state !== "too_few_sales" && p.forecast ? (
              <p className="mt-1 text-[11px] text-muted">
                Kumo gives one range for all 14 days; it is spread evenly here. Day-by-day forecasts come later.
              </p>
            ) : (
              <p className="mt-1 text-[11px] italic text-muted">too few sales to predict</p>
            )}

            {showStock && (
              <>
                <SectionTitle>
                  Stock left after each day<span className="source-chip">Our math</span>
                  {vis.untested && <UntestedTag />}
                </SectionTitle>
                <StockChart p={p} width={width} />
              </>
            )}

            <div className="mt-2 grid grid-cols-1 gap-x-7 lg:grid-cols-2">
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
              {p.by_variant.length > 1 && (
                <Panel title={<>Stock per size or variant<span className="source-chip">Shopify</span></>}>
                  {p.by_variant.map((v) => (
                    <Row key={v.id}>
                      <span>
                        {v.title ?? v.sku ?? "Variant"}
                        {v.title && v.sku && <span className="ml-2 text-[11px] text-muted">{v.sku}</span>}
                      </span>
                      <span className="font-mono text-xs">{v.units.toLocaleString()}</span>
                    </Row>
                  ))}
                </Panel>
              )}
              <Panel title={<>Often bought in the same order<span className="source-chip">Shopify</span></>}>
                {p.bought_together.length === 0 ? (
                  <Empty>Not enough shared orders yet</Empty>
                ) : (
                  p.bought_together.map((b) => (
                    <Row key={b.product_id}>
                      <Link href={`/products/${encodeURIComponent(b.product_id)}`} className="hover:text-accent">
                        {b.title}
                      </Link>
                      <span className="text-xs text-muted">
                        in <span className="font-mono text-[#e7e7f0]">{b.orders.toLocaleString()}</span> orders
                      </span>
                    </Row>
                  ))
                )}
              </Panel>
              <Panel
                title={
                  <>
                    Track record<span className="source-chip">Kumo</span>
                    <span className="source-chip">Shopify</span>
                  </>
                }
              >
                <TrackRecord rows={p.track_record} />
              </Panel>
            </div>
          </>
        )}
      </div>
      <SectionList compact skip={vis.shown ? ["runs_out"] : []} state={page.data} error={page.error} retry={page.retry} heading={<SubHeading>Not ready yet</SubHeading>} />
    </PageShell>
  );
}
