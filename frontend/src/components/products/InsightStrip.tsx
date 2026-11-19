"use client";

import { useState, type ReactNode } from "react";
import { strongestPairs } from "@/components/shared/BasketGalaxy";
import { rangeText } from "@/components/shared/Forecast";
import { InsightSlide } from "@/components/shared/InsightCard";
import { LoadError, Skeleton, type Loaded } from "@/components/shared/Load";
import Modal from "@/components/shared/Modal";
import { RISK_TEXT, UntestedTag, dayName } from "@/components/shared/ProductVisuals";
import { RunoutChart, runoutShort, type RunoutRow } from "@/components/shared/Runout";
import SourceChip from "@/components/shared/SourceChip";
import { BandRows, Dots, FIRST_CHECK, TrackGrid, TrackProductCard, TrackSummaryCard } from "@/components/shared/TrackCards";
import type { ProductPairs, TrackRecord } from "@/lib/api";

type Open = null | "track" | "above" | "below" | "runout";
const href = (id: string) => `/products/${encodeURIComponent(id)}`;

export function windowText(t: TrackRecord): string {
  return t.window_start && t.window_end ? `${dayName(t.window_start)} – ${dayName(t.window_end)}` : "";
}

/** A finished 14-day window with at least one product checked. */
export function finishedWindow(t: TrackRecord | null): TrackRecord | null {
  return t !== null && t.window_start !== null && t.checked > 0 ? t : null;
}

const Big = ({ children }: { children: ReactNode }) => <span className="font-mono text-[30px] leading-none tracking-[-0.02em]">{children}</span>;

function Chips() {
  return (
    <>
      <SourceChip source="kumo" />
      <SourceChip source="shopify" />
    </>
  );
}

/** Products command center, top strip: four compact slides, each opening its detail. */
export default function InsightStrip({
  pairs,
  track,
  onOpenPairs,
  runout,
}: {
  pairs: Loaded<ProductPairs>;
  track: Loaded<TrackRecord>;
  onOpenPairs: () => void;
  /** Our math on Kumo's range; null when sell-out may not be shown (CLAUDE.md backtest rule). */
  runout: { rows: RunoutRow[]; untested: boolean } | null;
}) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const t = track.data;
  const checked = finishedWindow(t);
  const p = pairs.data;
  const top = p ? strongestPairs(p, 1)[0] : undefined;
  const waiting = <Skeleton className="h-4 w-40" />;
  const atRisk = runout ? runout.rows.filter((r) => r.sellout.earliest_day !== null).sort((a, b) => (a.sellout.earliest_day ?? 99) - (b.sellout.earliest_day ?? 99)) : [];
  const trackLine = (content: ReactNode) => (track.error ? <LoadError message={track.error} retry={track.retry} /> : !t ? waiting : !checked ? FIRST_CHECK : content);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-1">
        <InsightSlide
          title="Track record"
          sources={["kumo", "shopify"]}
          onOpen={checked ? () => setOpen("track") : undefined}
          big={
            checked ? (
              <Big>
                {checked.inside}
                <small className="ml-1.5 font-sans text-xs tracking-normal text-muted">of {checked.checked} held</small>
              </Big>
            ) : undefined
          }
          line={trackLine(
            checked && (
              <>
                <Dots size={8} className="gap-1" dots={checked.products.map((r) => ({ key: r.product_id, title: r.title, inside: r.result === "inside" }))} />
                <span className="mt-1 block truncate text-[11px] text-muted">{windowText(checked)}</span>
              </>
            ),
          )}
        />
        {(["above", "below"] as const).map((side) => {
          const rows = checked ? checked.products.filter((r) => r.result === side) : [];
          const first = rows[0];
          return (
            <InsightSlide
              key={side}
              title={side === "above" ? "Sold more than Kumo expected" : "Sold less than Kumo expected"}
              sources={["kumo", "shopify"]}
              onOpen={rows.length > 0 ? () => setOpen(side) : undefined}
              big={checked ? <Big>{rows.length}</Big> : undefined}
              line={trackLine(
                first ? (
                  <>
                    <span className="block truncate">
                      <b>{first.title}</b>
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      sold <span className="font-mono text-[#e7e7f0]">{first.actual.toLocaleString()}</span>, range <span className="font-mono">{rangeText(first)}</span>
                    </span>
                  </>
                ) : side === "above" ? (
                  "No product sold more than the top of Kumo's range."
                ) : (
                  "No product sold less than the bottom of Kumo's range."
                ),
              )}
            />
          );
        })}
        {runout && (
          <InsightSlide
            title="Could run out"
            sources={["our_math"]}
            tag={runout.untested ? <UntestedTag /> : undefined}
            onOpen={() => setOpen("runout")}
            big={<Big>{atRisk.length}</Big>}
            line={
              atRisk[0] ? (
                <>
                  <span className="block truncate">
                    <b>{atRisk[0].title}</b>
                  </span>
                  <span className={`block truncate text-[11px] ${RISK_TEXT[atRisk[0].sellout.band]}`}>{runoutShort(atRisk[0].sellout)}</span>
                </>
              ) : (
                "Every product should last past day 14."
              )
            }
          />
        )}
      </div>

      {runout && (
        <Modal
          open={open === "runout"}
          onClose={close}
          title="Could run out"
          chips={
            <>
              <SourceChip source="our_math" />
              {runout.untested && <UntestedTag />}
            </>
          }
        >
          <div className="px-7 pb-10 pt-6">
            <p className="mb-5 max-w-[760px] text-muted">
              Stock now against Kumo&apos;s range for the next 14 days, spread evenly over the days. Bar = earliest to latest day it could run out, dot =
              most likely day. {atRisk.length} of {runout.rows.length} products could run out within 14 days.
            </p>
            <RunoutChart rows={runout.rows} />
          </div>
        </Modal>
      )}
      {checked && (
        <>
          <Modal open={open === "track"} onClose={close} title="Track record" chips={<Chips />}>
            <div className="px-7 pb-10 pt-6">
              <p className="mb-5 max-w-[720px] text-muted">
                What Kumo said on {dayName(checked.window_start ?? "")}, next to what really sold in the 14 days after. A white dot inside the band
                means Kumo&apos;s range held.
              </p>
              <TrackGrid>
                <TrackSummaryCard
                  label={windowText(checked)}
                  name="Kumo's ranges held for"
                  held={checked.inside}
                  total={checked.checked}
                  dots={checked.products.map((r) => ({ key: r.product_id, title: r.title, inside: r.result === "inside" }))}
                />
                {checked.products.map((r) => (
                  <TrackProductCard key={r.product_id} kicker={`Kumo said, ${dayName(checked.window_start ?? "")}`} name={r.title} r={r} result={r.result} href={href(r.product_id)} />
                ))}
              </TrackGrid>
            </div>
          </Modal>
          {(["above", "below"] as const).map((side) => (
            <Modal key={side} open={open === side} onClose={close} title={side === "above" ? "Sold more than Kumo expected" : "Sold less than Kumo expected"} chips={<Chips />}>
              <div className="px-7 pb-10 pt-6">
                <p className="mb-4 text-muted">
                  {side === "above" ? "Sold more than the top" : "Sold less than the bottom"} of Kumo&apos;s range, {windowText(checked)}. Band = Kumo&apos;s range,
                  line = middle, dot = what really sold.
                </p>
                <BandRows rows={checked.products.filter((r) => r.result === side).map((r) => ({ key: r.product_id, title: r.title, href: href(r.product_id), r }))} />
              </div>
            </Modal>
          ))}
        </>
      )}
    </>
  );
}
