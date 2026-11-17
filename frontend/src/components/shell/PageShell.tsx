"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import Sidebar from "@/components/command/Sidebar";

export interface Crumb {
  label: string;
  href?: string;
}

/** Sidebar left, breadcrumb on top, content right. Used by every page except Command. */
export default function PageShell({ crumbs, children }: { crumbs: Crumb[]; children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <nav aria-label="Breadcrumb" className="flex h-11 flex-none items-center gap-2 border-b border-edge px-4 text-muted">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <Fragment key={`${c.label}-${i}`}>
                {i > 0 && <span>/</span>}
                {c.href && !last ? (
                  <Link href={c.href} className="hover:text-[#e7e7f0]">
                    {c.label}
                  </Link>
                ) : (
                  <span className={last ? "font-medium text-[#e7e7f0]" : undefined}>{c.label}</span>
                )}
              </Fragment>
            );
          })}
        </nav>
        <div className="min-h-0 flex-1 overflow-auto px-6 pb-10 pt-5">{children}</div>
      </main>
    </div>
  );
}

/** Page title. `tag` sits next to the title (e.g. stale); `answer` is the one-line answer under it. */
export function PageTitle({ title, sub, tag, answer }: { title: string; sub?: string; tag?: ReactNode; answer?: ReactNode }) {
  return (
    <header className="mb-4">
      <h1 className="text-lg font-semibold tracking-[-0.01em]">
        {title}
        {tag}
      </h1>
      {sub && <div className="text-xs text-muted">{sub}</div>}
      {answer && <p className="mt-1.5 text-[15px] text-muted [&_b]:font-medium [&_b]:text-[#e7e7f0]">{answer}</p>}
    </header>
  );
}

/** Small uppercase section title with its source chips, like the approved mockup. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2.5 mt-6 flex flex-wrap items-center gap-x-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted [&_.source-chip]:normal-case [&_.source-chip]:tracking-normal">{children}</h2>;
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-6 text-[11px] font-medium uppercase tracking-wide text-muted">{children}</h2>;
}
