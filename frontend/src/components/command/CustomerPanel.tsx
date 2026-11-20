"use client";

import Link from "next/link";
import { SHOW_SAMPLES } from "@/components/product/SampleCards";
import type { CustomerCard } from "@/lib/api";
import { day } from "@/lib/format";

/** The customer colour: green, so customers read apart from products (violet) on Command. */
const GREEN = "#4ade80";

function money(v: number | null, currency: string | null) {
  if (v === null || !currency) return "–";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

function Tier({ title, chip, sample, locked, children }: { title: string; chip?: string; sample?: boolean; locked?: boolean; children: React.ReactNode }) {
  return (
    <div className={`mt-2.5 border-t border-white/[0.06] pt-2.5 ${locked ? "opacity-60" : ""}`}>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[.07em] text-muted">
        {locked && <span aria-hidden="true">🔒</span>}
        {title}
        {chip && <span className="source-chip normal-case tracking-normal">{chip}</span>}
        {sample && <span className="rounded border border-dashed border-white/35 px-1 text-[9.5px] normal-case tracking-normal text-[#c9c9d8]">sample</span>}
      </h4>
      {sample ? <div className="rounded-[9px] border border-dashed border-white/25 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.02)_0_6px,transparent_6px_12px)] px-2.5 py-2">{children}</div> : children}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-[3px] text-xs">
      <span className="min-w-0 flex-1 text-muted">{k}</span>
      <span className={`max-w-[62%] flex-none text-right [overflow-wrap:anywhere] ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}

const Why = ({ children }: { children: React.ReactNode }) => <p className="mt-1 text-[10.5px] leading-snug text-[#6c6c86]">{children}</p>;
const Band = ({ children }: { children: React.ReactNode }) => <span className="whitespace-nowrap rounded-[5px] bg-[#4ade80]/[0.14] px-1.5 text-[11px] text-[#86efac]">{children}</span>;

/** One customer, as in docs/mockups/customer-dot.html: order facts now; Shopify extras and Kumo as samples (local only); personal data locked. */
function Profile({ c, onOpen }: { c: CustomerCard; onOpen: (id: string) => void }) {
  const currency = c.currency;
  const max = Math.max(1, ...c.weekly);
  return (
    <div>
      <Tier title="From Shopify" chip="Shopify">
        <Row k="Orders" v={c.orders} mono />
        <Row k="First order · last order" v={`${day(c.first_order)} · ${day(c.last_order)}`} />
        <Row
          k="Buys most"
          v={
            c.top_products.length
              ? c.top_products.map((p) => (
                  <Link key={p.product_id} href={`/products/${encodeURIComponent(p.product_id)}`} className="block hover:text-accent">
                    {p.title} <span className="font-mono text-muted">{p.units}</span>
                  </Link>
                ))
              : "–"
          }
        />
        <Row k="Returns" v={c.refunds ? `${c.refunds} ${c.refunds === 1 ? "refund" : "refunds"}${c.refunded > 0 ? ` · ${money(c.refunded, currency)}` : ""}` : "none"} />
        <Row k="Used a discount" v={c.discount_orders ? `${c.discount_orders} of ${c.orders} orders` : "never"} />
        <Row k="Ships to" v={c.ship_cities.length ? c.ship_cities.join(", ") : "–"} />
        <div className="pt-1 text-xs text-muted">Orders per week, last 12 weeks</div>
        <div className="mt-1 flex h-[26px] items-end gap-[2px]" role="img" aria-label={`Orders per week: ${c.weekly.join(", ")}`}>
          {c.weekly.map((w, i) => (
            <i key={i} className="flex-1 rounded-[1px]" style={{ height: 3 + (w / max) * 22, background: w ? GREEN : "#2a2a44" }} />
          ))}
        </div>
      </Tier>
      <Tier title="Shipping addresses" chip="Shopify">
        {c.addresses.length ? (
          c.addresses.map((a, i) => (
            <div key={i} className="flex justify-between gap-3 py-[3px] text-xs">
              <span className="min-w-0 break-words">
                {a.street}
                {a.street2 ? `, ${a.street2}` : ""}
                <span className="block text-[11px] text-muted">{[a.zip, a.city, a.country].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="flex-none text-right font-mono text-muted">
                {a.orders} {a.orders === 1 ? "order" : "orders"}
              </span>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted">No street address on their orders.</p>
        )}
      </Tier>
      <Tier title="Same address, other accounts" chip="Shopify">
        {c.same_address.length ? (
          <>
            {c.same_address.map((t) => (
              <button key={t.id} type="button" onClick={() => onOpen(t.id)} className="block w-full rounded-md py-1 text-left text-xs hover:text-[#86efac]">
                <span className="font-medium">Customer {t.code} →</span>
                <span className="block text-[11px] text-muted">
                  {t.orders} {t.orders === 1 ? "order" : "orders"} · {money(t.spent, t.spent === null ? null : currency)} · last {day(t.last_order)}
                </span>
              </button>
            ))}
            <Why>Another account in your shop shipped to the same street and postcode. Often the same person or household; it can also be a shared building.</Why>
          </>
        ) : (
          <p className="text-xs text-muted">No other account shipped to these addresses.</p>
        )}
      </Tier>
      {SHOW_SAMPLES ? (
        <>
          <Tier title="From Shopify, not imported yet" sample>
            <Row k="Customer since" v="Mar 2025" />
            <Row k="Email marketing" v="subscribed" />
            <Row k="Tags (set in Shopify)" v="VIP · wholesale" />
            <Row k="Where they order" v="Online store 20 · Shop app 2" />
            <Row k="Shipping they choose" v="Express 14 · Standard 8" />
            <Row k="Shopify fraud check, last order" v="low" />
            <Row k="First came from" v="Instagram" />
            <Why>All from Shopify without names or emails; needs one importer change through Nango.</Why>
          </Tier>
          <Tier title="Kumo, a new question" chip="Kumo" sample>
            <Row k="Chance of another order, next 14 days" v={<Band>high</Band>} />
            <Row k="Chance they stop buying" v={<Band>low</Band>} />
            <Row k="Most likely next product" v="Linen Shirt" />
            <Why>Kumo gets only customer ids, orders and products, never names, emails or addresses. Needs a new Kumo run.</Why>
          </Tier>
        </>
      ) : (
        <Tier title="Coming later">
          <Why>More Shopify details (consent, tags, channel, shipping, fraud check) need an importer change; Kumo&apos;s chance of another order needs a new Kumo question.</Why>
        </Tier>
      )}
      <Tier title="Name, email, phone" locked>
        <Row k="Name · email · phone" v={<span className="text-[#55556d]">not imported</span>} />
        <Why>Not imported. Addresses are shown to you only and never sent to NVIDIA.</Why>
      </Tier>
    </div>
  );
}

/** The right panel when a green dot is chosen: that one customer, every line wrapped to fit the card. */
export default function CustomerPanel({
  card,
  loading,
  error,
  onBack,
  onOpen,
}: {
  card: CustomerCard | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  /** Open another customer (an account at the same address). */
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <button type="button" onClick={onBack} className="mb-2 block text-xs text-[#86efac] hover:text-[#bbf7d0]">
        ← Your store
      </button>
      {error && <p className="text-xs text-[#f87171]">{error}</p>}
      {loading && !card && <p className="text-xs text-muted">Loading…</p>}
      {card && (
        <div className="rounded-[11px] border border-[#4ade80]/45 bg-[#0f1f1a] p-3">
          <div className="flex items-start gap-2.5 pr-6">
            <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full font-mono text-[11px] text-[#0b2a18]" style={{ background: GREEN }}>
              {card.code.slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h2 className="text-[15px] font-semibold">Customer {card.code}</h2>
                <span className="source-chip">Shopify</span>
              </div>
              <p className="text-[11px] leading-snug text-muted">
                {card.orders} {card.orders === 1 ? "order" : "orders"} since {day(card.first_order)}, last {day(card.last_order)}
              </p>
            </div>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-[9px] bg-[#4ade80]/[0.06] p-2">
            <div>
              <div className="font-mono text-lg leading-tight">{money(card.spent, card.currency)}</div>
              <div className="text-[10.5px] text-muted">spent in total</div>
            </div>
            <div>
              <div className="font-mono text-lg leading-tight">{money(card.average_order, card.currency)}</div>
              <div className="text-[10.5px] text-muted">average order</div>
            </div>
          </div>
          <Profile c={card} onOpen={onOpen} />
        </div>
      )}
    </>
  );
}
