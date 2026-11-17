import type { SectionSource } from "./api";

/** "15 Nov" */
export function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** "15 Nov, 14:05" */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const SOURCE_LABEL: Record<SectionSource, string> = {
  shopify: "Shopify",
  kumo: "Kumo",
  our_math: "Our math",
};
