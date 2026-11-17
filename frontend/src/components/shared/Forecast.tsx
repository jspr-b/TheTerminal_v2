import type { ForecastRange, ForecastState } from "@/lib/api";
import { day } from "@/lib/format";

/** Bottom of a range, rounded down so it never claims more precision than Kumo gave. */
export const low = (v: number) => Math.floor(v);
/** Top of a range, rounded up. */
export const high = (v: number) => Math.ceil(v);

/** "12–20": a range rounded outward. */
export function rangeText(r: { lower: number; upper: number }): string {
  return `${low(r.lower).toLocaleString()}–${high(r.upper).toLocaleString()}`;
}

/** Kumo's 14-day range, rounded outward so it never claims more precision than Kumo gave. */
export function WillSell({ p }: { p: { forecast_state: ForecastState; forecast: ForecastRange | null } }) {
  if (p.forecast_state === "too_few_sales" || !p.forecast) {
    return <span className="italic text-muted">too few sales to predict</span>;
  }
  const text = rangeText(p.forecast);
  if (p.forecast_state === "stale") {
    const from = day(p.forecast.generated_at);
    return (
      <span title={`Kumo did not answer the latest run. This range is from ${from}.`}>
        <span className="text-muted">{text}</span>
        <span className="stale-tag">stale, from {from}</span>
      </span>
    );
  }
  return <span>{text}</span>;
}
