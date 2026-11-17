"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { PageState, Section } from "@/lib/api";
import SourceChip from "./SourceChip";
import { LoadError, Skeleton } from "./Load";

/** Plain words for a section that cannot show its content yet. Never names models or routes. */
function reason(section: Section): ReactNode {
  switch (section.state) {
    case "not_connected":
      return (
        <>
          {section.message || "Connect the app this needs to see it."}{" "}
          <Link href="/connections" className="text-accent hover:underline">
            Connections
          </Link>
        </>
      );
    case "needs_gpu":
      return "Runs on a GPU server, not set up yet.";
    case "blocked":
      return section.message || "Not available yet.";
    case "not_built":
      return "Coming later.";
    case "ready":
      return null;
  }
}

/** One section, drawn by its state. Ready: the real content. Otherwise a muted card that says why. */
export function SectionCard({ section, children }: { section: Section; children?: ReactNode }) {
  const ready = section.state === "ready";
  return (
    <section className={`rounded-[10px] border border-white/[0.08] p-3.5 ${ready ? "bg-land" : "bg-land/50"}`}>
      <h3 className={`mb-1 font-medium ${ready ? "" : "text-muted"}`}>
        {section.title}
        <SourceChip source={section.source} />
      </h3>
      {ready ? children : <p className="text-xs text-muted">{reason(section)}</p>}
    </section>
  );
}

/**
 * The sections of a page. A ready section is shown only when `render` gives content for it
 * (pages draw some ready sections elsewhere, e.g. as table columns); every other state shows its card.
 */
export function SectionList({
  state,
  error,
  retry,
  render,
  skip = [],
  heading,
  compact = false,
}: {
  state: PageState | null;
  error: string | null;
  retry: () => void;
  render?: (section: Section) => ReactNode | null;
  skip?: string[];
  heading?: ReactNode;
  /** One short line per section instead of cards. */
  compact?: boolean;
}) {
  if (error) return <LoadError message={error} retry={retry} />;
  if (!state) return <Skeleton className="h-20 w-full" />;
  const shown = state.sections
    .filter((s) => !skip.includes(s.key))
    .map((s) => ({ s, content: s.state === "ready" ? (render?.(s) ?? null) : null }))
    .filter(({ s, content }) => s.state !== "ready" || content !== null);
  if (shown.length === 0) return null;
  if (compact) {
    const ready = shown.filter(({ s }) => s.state === "ready");
    const waiting = shown.filter(({ s }) => s.state !== "ready");
    return (
      <>
        {heading}
        {ready.map(({ s, content }) => (
          <SectionCard key={s.key} section={s}>
            {content}
          </SectionCard>
        ))}
        {waiting.length > 0 && (
          <ul className="divide-y divide-white/[0.06] rounded-[10px] border border-white/[0.08] bg-land/50">
            {waiting.map(({ s }) => (
              <li key={s.key} className="flex flex-wrap items-baseline gap-x-3 px-3.5 py-1.5 text-xs">
                <span className="text-[#c9c9d8]">
                  {s.title}
                  <SourceChip source={s.source} />
                </span>
                <span className="ml-auto text-muted">{reason(s)}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }
  return (
    <>
      {heading}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {shown.map(({ s, content }) => (
          <SectionCard key={s.key} section={s}>
            {content}
          </SectionCard>
        ))}
      </div>
    </>
  );
}
