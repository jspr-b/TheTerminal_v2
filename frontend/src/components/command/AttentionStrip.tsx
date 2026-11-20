"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Attention, AttentionItem } from "./attention";

export const ATTN_H = 190;

const ACCENT = "#7c8cff";

/** A value (white line) against a range (violet band), scaled to fit the card. */
function Bar({ value, range }: { value: number; range: { lo: number; hi: number } | null }) {
  if (!range) return <div className="h-3.5" />;
  const m = Math.max(value, range.hi, 1) * 1.08;
  const x = (v: number) => `${(Math.max(0, v) / m) * 100}%`;
  return (
    <div className="relative mt-auto h-3.5 flex-none overflow-hidden" aria-hidden="true">
      <span className="absolute left-0 top-[5px] h-[3px] rounded-sm bg-white/25" style={{ width: x(value) }} />
      <span className="absolute top-px h-2.5 rounded-[3px] border" style={{ left: x(range.lo), width: `calc(${x(range.hi)} - ${x(range.lo)})`, borderColor: ACCENT, background: `${ACCENT}33` }} />
      <span className="absolute -top-px h-3.5 w-0.5 bg-white" style={{ left: x(value) }} />
    </div>
  );
}

function Card({
  it,
  head,
  value,
  line2,
  line3,
  bar,
  onHover,
}: {
  it: AttentionItem;
  head: string;
  value: string;
  line2: string;
  line3: string;
  bar: { value: number; range: { lo: number; hi: number } | null };
  onHover: (it: AttentionItem | null) => void;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      data-product={it.id}
      onClick={() => router.push(`/products/${encodeURIComponent(it.id)}`)}
      onMouseEnter={() => onHover(it)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(it)}
      onBlur={() => onHover(null)}
      aria-label={`${it.title}: ${head} ${value}. ${line2}. Open product page`}
      className="flex h-[118px] w-[236px] flex-none flex-col gap-0.5 overflow-hidden rounded-[10px] border border-[#2e2e4a] bg-[#11112a] px-[11px] pb-2 pt-[9px] text-left transition hover:-translate-y-0.5 hover:border-accent/70 hover:bg-[#15153a] focus-visible:border-accent"
    >
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
        <span className="min-w-0 flex-1 break-words">{it.title}</span>
        <span className="flex-none text-[10.5px] font-normal text-[#55556d]">Open →</span>
      </div>
      <div className="break-words text-[12.5px] leading-snug">
        {head} <b className="font-mono font-medium text-[#c3c9ff]">{value}</b>
      </div>
      <div className="break-words text-[11px] leading-snug text-muted">{line2}</div>
      <div className="break-words text-[11px] leading-snug text-muted">{line3}</div>
      <Bar value={bar.value} range={bar.range} />
    </button>
  );
}

const where = (it: AttentionItem) => it.at.map((a) => `${a.city} ${a.units}`).join(" · ");

function Group({ title, chips, children }: { title: string; chips: string[]; children: React.ReactNode }) {
  return (
    <div className="flex flex-none flex-col gap-1.5 [&+&]:border-l [&+&]:border-white/[0.06] [&+&]:pl-[18px]">
      <div className="text-[10px] uppercase tracking-[.06em] text-muted">
        {title}
        {chips.map((c) => (
          <span key={c} className="source-chip normal-case tracking-normal">
            {c}
          </span>
        ))}
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

/** "Needs attention": Kumo's numbers next to Shopify facts, grouped by the question they answer. */
export default function AttentionStrip({ open, onClose, a, onHover }: { open: boolean; onClose: () => void; a: Attention; onHover: (it: AttentionItem | null) => void }) {
  const shortIds = new Set(a.short.map((s) => s.id));
  const busiest = a.busiest.filter((b) => !shortIds.has(b.id));   // never the same card twice
  const count = a.short.length + busiest.length + a.above.length + a.below.length;
  const stock = (it: AttentionItem) => ({ value: it.stock, range: it.range });
  const sold = (it: AttentionItem) => ({ value: it.actual ?? 0, range: it.checked ?? null });
  return (
    <section
      aria-label="Needs attention"
      inert={!open || undefined}
      className={`absolute inset-x-3 bottom-3 z-[6] rounded-xl border border-edge bg-[#0c0c18]/92 px-3 py-2.5 backdrop-blur transition-[transform,opacity] duration-[450ms] [transition-timing-function:cubic-bezier(.2,.8,.2,1)] ${
        open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[calc(100%+24px)] opacity-0"
      }`}
      style={{ height: ATTN_H - 12 }}
    >
      <button type="button" onClick={onClose} aria-label="Hide needs attention" className="absolute right-2 top-2 h-6 w-6 rounded-full border border-edge text-[13px] leading-none text-muted hover:border-accent hover:text-[#e7e7f0]">
        ✕
      </button>
      <div className="mb-2 flex items-baseline gap-2.5 pr-8">
        <b className="text-[13px]">Needs attention</b>
        <span className="min-w-0 text-[11px] text-muted">Kumo&apos;s numbers next to your Shopify stock and sales · hover to see where the stock sits, click to open</span>
        <Link href="/products" className="ml-auto flex-none text-[11px] text-accent">
          All products →
        </Link>
      </div>
      {count === 0 ? (
        <p className="text-xs text-muted">Nothing stands out right now.</p>
      ) : (
        <div className="flex gap-[18px] overflow-x-auto px-0.5 pb-1.5 pt-0.5 [scrollbar-width:thin]">
          {a.short.length > 0 && (
            <Group title="Kumo expects more than your stock" chips={["Kumo", "Shopify"]}>
              {a.short.map((it) => (
                <Card key={it.id} it={it} head="Kumo: likely sells" value={`${it.range?.lo}–${it.range?.hi}`} line2={`you have ${it.stock} · next 14 days`} line3={where(it)} bar={stock(it)} onHover={onHover} />
              ))}
            </Group>
          )}
          {busiest.length > 0 && (
            <Group title="Kumo's busiest next 14 days" chips={["Kumo"]}>
              {busiest.map((it) => (
                <Card key={it.id} it={it} head="Kumo: likely sells" value={`${it.range?.lo}–${it.range?.hi}`} line2={`you have ${it.stock}`} line3={where(it)} bar={stock(it)} onHover={onHover} />
              ))}
            </Group>
          )}
          {a.above.length > 0 && (
            <Group title="Sold more than Kumo expected" chips={["Kumo", "Shopify"]}>
              {a.above.map((it) => (
                <Card key={it.id} it={it} head="Sold" value={`${it.actual} in 14 days`} line2={`Kumo's range was ${it.checked?.lo}–${it.checked?.hi}`} line3={`you have ${it.stock} · ${where(it)}`} bar={sold(it)} onHover={onHover} />
              ))}
            </Group>
          )}
          {a.below.length > 0 && (
            <Group title="Sold less than Kumo expected" chips={["Kumo", "Shopify"]}>
              {a.below.map((it) => (
                <Card key={it.id} it={it} head="Sold" value={`${it.actual} in 14 days`} line2={`Kumo's range was ${it.checked?.lo}–${it.checked?.hi}`} line3={`you have ${it.stock} · ${where(it)}`} bar={sold(it)} onHover={onHover} />
              ))}
            </Group>
          )}
        </div>
      )}
    </section>
  );
}
