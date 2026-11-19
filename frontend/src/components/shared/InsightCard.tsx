"use client";

import type { ReactNode } from "react";
import type { SectionSource } from "@/lib/api";
import SourceChip from "./SourceChip";

/**
 * One overview card: title + source chips, a small visual, one plain-language line.
 * The whole card is a button that opens the detail pop-up. Without `onOpen` it is a plain card.
 */
export default function InsightCard({
  title,
  sources,
  visual,
  line,
  onOpen,
  tag,
  sample = false,
}: {
  title: string;
  sources: SectionSource[];
  tag?: ReactNode;
  /** Made-up preview data: dashed border so it never looks like the real cards. */
  sample?: boolean;
  visual?: ReactNode;
  line: ReactNode;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start text-[11px] font-medium uppercase leading-tight tracking-[0.06em] text-muted [&_.source-chip]:normal-case [&_.source-chip]:tracking-normal">
        <span className="min-w-0">
          {title}
          {sources.map((s) => (
            <SourceChip key={s} source={s} />
          ))}
          {tag}
        </span>
        {onOpen && (
          <span className="ml-auto pl-2 text-[11px] normal-case tracking-normal text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            Open →
          </span>
        )}
      </div>
      {visual && <div className="relative mt-3 min-h-0 flex-1">{visual}</div>}
      <div className="mt-3 text-[13px] leading-snug text-[#c9c9d8] [&_b]:font-medium [&_b]:text-[#e7e7f0]">{line}</div>
    </>
  );
  const cls = `group relative flex h-[260px] min-w-0 flex-col overflow-hidden rounded-[14px] border p-4 text-left ${
    sample ? "border-dashed border-white/25 bg-[#0c0c16]" : "border-white/[0.08] bg-[#0f0f1c]"
  }`;
  if (!onOpen) return <div className={cls}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${cls} transition-colors hover:border-accent/40 hover:bg-[#12122a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
    >
      {body}
    </button>
  );
}

/** Grid for overview cards: 4 columns on wide screens, 2 narrower, 1 on small. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="mb-6 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

/**
 * Compact insight slide for a strip (about 110px high): title + chips, one big figure, one short line.
 * The whole slide is a button that opens the detail pop-up. Without `onOpen` it is plain.
 */
export function InsightSlide({
  title,
  sources,
  big,
  line,
  onOpen,
  tag,
}: {
  title: string;
  sources: SectionSource[];
  tag?: ReactNode;
  big?: ReactNode;
  line: ReactNode;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start text-[10px] font-medium uppercase leading-tight tracking-[0.06em] text-muted [&_.source-chip]:normal-case [&_.source-chip]:tracking-normal">
        <span className="min-w-0">
          {title}
          {sources.map((s) => (
            <SourceChip key={s} source={s} />
          ))}
          {tag}
        </span>
        {onOpen && (
          <span className="ml-auto pl-2 text-[11px] normal-case tracking-normal text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            Open →
          </span>
        )}
      </div>
      <div className="mt-auto flex min-w-0 items-end gap-3">
        {big && <div className="flex-none">{big}</div>}
        <div className="min-w-0 flex-1 text-[12px] leading-snug text-[#c9c9d8] [&_b]:font-medium [&_b]:text-[#e7e7f0]">{line}</div>
      </div>
    </>
  );
  const cls = "group relative flex h-[110px] min-w-[220px] flex-1 flex-col overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#0f0f1c] px-3.5 py-3 text-left";
  if (!onOpen) return <div className={cls}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${cls} transition-colors hover:border-accent/40 hover:bg-[#12122a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
    >
      {body}
    </button>
  );
}
