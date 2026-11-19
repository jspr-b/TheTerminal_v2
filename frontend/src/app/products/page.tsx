"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STAGE_BACKGROUND } from "@/components/shared/BasketGalaxy";
import { LoadError, useLoad } from "@/components/shared/Load";
import { RISK_TEXT, UntestedTag, selloutVisibility } from "@/components/shared/ProductVisuals";
import PageShell from "@/components/shell/PageShell";
import ProductList, { LIST_W } from "@/components/products/world/ProductList";
import { worldData } from "@/components/products/world/data";
import { createWorld, type View, type WorldApi } from "@/components/products/world/engine";
import { DEV_MERCHANT, getProductPairs, getProductsOverview, type OverviewProduct, type Sellout } from "@/lib/api";

const VIEWS: { key: string; label: string; sub: string }[] = [
  { key: "galaxy", label: "Galaxy", sub: "bought together" },
  { key: "skyline", label: "Skyline", sub: "sales per day" },
  { key: "cards", label: "Cards", sub: "3D list" },
];
type Sort = "runout" | "sold" | "name";
const SORTS: [Sort, string][] = [
  ["runout", "Runs out first"],
  ["sold", "Sells most"],
  ["name", "A–Z"],
];

function Answer({ products, sellout }: { products: OverviewProduct[]; sellout: boolean }) {
  if (!sellout) return <>Stock now and what each product will likely sell in the next 14 days.</>;
  const counted = products.filter((p) => p.sellout && p.forecast_state === "forecast");
  const n = (band: Sellout["band"]) => counted.filter((p) => p.sellout?.band === band).length;
  return (
    <>
      In the next 14 days, sell-out risk is <span className={`font-medium ${RISK_TEXT.high}`}>high for {n("high")}</span>,{" "}
      <span className={`font-medium ${RISK_TEXT.medium}`}>medium for {n("medium")}</span> and{" "}
      <span className={`font-medium ${RISK_TEXT.low}`}>low for {n("low")}</span> products.
    </>
  );
}

function World() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const overview = useLoad(() => getProductsOverview(DEV_MERCHANT), `products-overview:${DEV_MERCHANT}`);
  const pairs = useLoad(() => getProductPairs(DEV_MERCHANT), `products-pairs:${DEV_MERCHANT}`);
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const api = useRef<WorldApi | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [type, setType] = useState(params.get("type") ?? "");
  const [sort, setSort] = useState<Sort>(SORTS.some(([k]) => k === params.get("sort")) ? (params.get("sort") as Sort) : "runout");

  const products = useMemo(() => overview.data?.products ?? [], [overview.data]);
  const vis = selloutVisibility(products.map((p) => p.sellout));
  const viewIndex = Math.max(0, VIEWS.findIndex((v) => v.key === params.get("view")));
  const focusId = params.get("focus");

  // The world's products, from the real API: one index per product.
  const world = useMemo(() => {
    if (!overview.data || !pairs.data) return null;
    return worldData(products, pairs.data);
  }, [overview.data, pairs.data, products]);

  // View and focus live in the URL (docs/routing.md): refresh, Back and shared links land in the same place.
  const setParams = useCallback(
    (change: Record<string, string | null>, push = false) => {
      const next = new URLSearchParams(window.location.search);
      Object.entries(change).forEach(([k, v]) => (v === null || v === "" ? next.delete(k) : next.set(k, v)));
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (url === `${pathname}${window.location.search}`) return;
      if (push) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [pathname, router],
  );
  const latest = useRef<{ viewIndex: number; focusId: string | null; filter: [boolean[], number[]] | null }>({ viewIndex, focusId, filter: null });
  latest.current.viewIndex = viewIndex;
  latest.current.focusId = focusId;

  // Build the world once per data set; dispose it on unmount (frees the WebGL context).
  useEffect(() => {
    const el = host.current;
    const tp = tip.current;
    if (!world || !el || !tp) return;
    let cancelled = false;
    let built: WorldApi | null = null;
    createWorld(el, tp, world.items, world.links, {
      onSelect: (i) => setParams({ focus: i === null ? null : world.items[i].id }, i !== null),
      onOpen: (i) => router.push(`/products/${encodeURIComponent(world.items[i].id)}`),
      onView: () => undefined,
    })
      .then((w) => {
        if (cancelled) return w.dispose();
        built = w;
        api.current = w;
        const { viewIndex: v, focusId: f, filter } = latest.current;
        if (filter) w.setFilter(...filter);
        w.setInset(new URLSearchParams(window.location.search).get("list") === "1" ? LIST_W + 34 : 34);
        w.setView(v as View);
        w.select(f ? (world.index.get(f) ?? null) : null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      built?.dispose();
      api.current = null;
    };
  }, [world, router, setParams]);

  // Follow the URL.
  useEffect(() => api.current?.setView(viewIndex as View), [viewIndex]);
  useEffect(() => {
    if (world) api.current?.select(focusId ? (world.index.get(focusId) ?? null) : null);
  }, [focusId, world]);

  // Filters and sort: dimmed products and the order of skyline rows and cards.
  const matches = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return world ? world.items.map((p) => (!ql || p.title.toLowerCase().includes(ql)) && (!type || p.type === type)) : [];
  }, [q, type, world]);
  const order = useMemo(() => {
    if (!world) return [];
    const key = (i: number) => {
      const p = world.items[i];
      return sort === "runout" ? (p.out ? p.out.e : p.f ? 50 : 99) : sort === "sold" ? -p.sold14 : 0;
    };
    return world.items.map((_, i) => i).sort((a, b) => Number(matches[b]) - Number(matches[a]) || key(a) - key(b) || world.items[a].title.localeCompare(world.items[b].title));
  }, [matches, sort, world]);
  useEffect(() => {
    if (!world) return;
    latest.current.filter = [matches, order];
    api.current?.setFilter(matches, order);
  }, [matches, order, world]);

  // The slide-in list (state in the URL: ?list=1).
  const listOpen = params.get("list") === "1";
  useEffect(() => api.current?.setInset(listOpen ? LIST_W + 34 : 34), [listOpen, world]);
  useEffect(() => {
    setParams({ q: q.trim() || null, type: type || null, sort: sort === "runout" ? null : sort });
  }, [q, type, sort, setParams]);
  // Searching down to one product looks at it.
  useEffect(() => {
    if (!world || !q.trim()) return;
    const hits = matches.flatMap((ok, i) => (ok ? [i] : []));
    if (hits.length === 1) setParams({ focus: world.items[hits[0]].id });
  }, [matches, q, world, setParams]);

  const goView = useCallback((i: number) => setParams({ view: i <= 0 ? null : VIEWS[Math.min(2, i)].key }), [setParams]);
  // Esc closes the focus; arrow keys switch views.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setParams({ focus: null });
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowRight" && viewIndex < 2) goView(viewIndex + 1);
      if (e.key === "ArrowLeft" && viewIndex > 0) goView(viewIndex - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewIndex, setParams, goView]);

  const types = useMemo(() => Array.from(new Set(world?.items.map((p) => p.type) ?? [])).sort(), [world]);
  const count = matches.filter(Boolean).length;
  const focused = focusId && world ? world.items[world.index.get(focusId) ?? -1] : undefined;
  const hint = focused
    ? viewIndex === 1
      ? "Click any tower or use ← → to see that day · Esc to go back"
      : "Click another product to jump to it"
    : viewIndex === 0
      ? "Drag a product to move it · click to look closer"
      : viewIndex === 1
        ? "Hover a tower for that day · click a row to look closer"
        : "Click a card to look closer";

  return (
    <PageShell crumbs={focused ? [{ label: "Products", href: "/products" }, { label: focused.title }] : [{ label: "Products" }]} fill>
      <section className="relative min-h-0 flex-1 overflow-hidden" style={{ background: STAGE_BACKGROUND }} aria-label="Products world">
        <div ref={host} className="absolute inset-0" />
        <div
          ref={tip}
          className="pointer-events-none absolute z-[5] hidden whitespace-nowrap rounded-[9px] border border-edge bg-[#0f0f1c]/95 px-2.5 py-1.5 text-xs [&_.gone]:text-[#f87171] [&_.m]:text-[11px] [&_.m]:text-muted [&_b]:font-medium"
        />
        {(overview.error || pairs.error) && (
          <div className="absolute left-4 top-20 z-[4]">
            <LoadError message={overview.error ?? pairs.error ?? ""} retry={overview.error ? overview.retry : pairs.retry} />
          </div>
        )}
        {failed && <p className="absolute inset-0 grid place-items-center text-muted">The 3D view could not start in this browser.</p>}
        {!world && !overview.error && !pairs.error && <p className="absolute inset-0 grid place-items-center text-muted">Loading products…</p>}

        {/* filter bar */}
        <div className="absolute inset-x-4 top-3.5 z-[3] flex flex-wrap items-center gap-2">
          <h1 className="mr-2.5 text-lg font-semibold">Products</h1>
          <label className="flex w-[200px] items-center gap-1.5 rounded-lg border border-edge bg-[#0c0c18]/85 px-2.5 py-1">
            <span aria-hidden="true">⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" aria-label="Search products" className="w-full bg-transparent outline-none" />
          </label>
          <div className="flex overflow-hidden rounded-lg border border-edge bg-[#0c0c18]/85" role="group" aria-label="Sort">
            {SORTS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                aria-pressed={sort === k}
                className={`whitespace-nowrap px-2.5 py-1 text-xs ${sort === k ? "bg-accent/[0.16] text-[#e7e7f0]" : "text-muted hover:text-[#c9c9d8]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Product type" className="rounded-lg border border-edge bg-[#0c0c18]/85 px-2 py-1 text-muted">
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          {world && (
            <span className="whitespace-nowrap text-xs text-[#55556d]">
              {count} of {world.items.length} products
            </span>
          )}
        </div>
        <div className={`pointer-events-none absolute left-4 top-[52px] z-[3] text-[13px] text-[#c9c9d8] transition-opacity duration-300 ${focused ? "opacity-0" : "opacity-100"}`}>
          {overview.data && <Answer products={products} sellout={vis.shown} />}
          {vis.shown && vis.untested && <UntestedTag />}
        </div>
        <button
          type="button"
          onClick={() => setParams({ focus: null })}
          tabIndex={focused ? 0 : -1}
          className={`absolute left-4 top-[52px] z-[4] flex items-center gap-2 rounded-[9px] border border-accent/50 bg-[#14142a]/90 px-3 py-1.5 text-[13px] transition duration-300 ${
            focused ? "opacity-100" : "pointer-events-none -translate-y-1.5 opacity-0"
          }`}
        >
          ← Back to all products <kbd className="rounded border border-edge px-1 font-mono text-[11px] text-muted">Esc</kbd>
        </button>

        <div className={`pointer-events-none absolute bottom-[76px] right-[50px] z-[2] text-right text-[11px] text-[#55556d] transition-opacity ${listOpen ? "opacity-0" : "opacity-100"}`}>
          {hint}
        </div>
        {world && (
          <ProductList
            open={listOpen}
            onToggle={() => setParams({ list: listOpen ? null : "1" })}
            products={products}
            order={order}
            matches={matches}
            focusId={focusId}
            onFocus={(pid) => setParams({ focus: pid === focusId ? null : pid }, pid !== focusId)}
            sellout={vis.shown}
            untested={vis.untested}
          />
        )}
        {/* view switcher: the buttons play the morph animation */}
        <div className="absolute bottom-4 left-1/2 z-[3] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-edge bg-[#0c0c16]/85 p-1.5">
          <button
            type="button"
            onClick={() => goView(viewIndex - 1)}
            disabled={viewIndex === 0}
            aria-label="Previous view"
            className="h-[30px] w-[30px] rounded-full border border-edge bg-[#14142a] text-[15px] hover:border-accent disabled:opacity-30"
          >
            ‹
          </button>
          {VIEWS.map((v, i) => (
            <button
              key={v.key}
              type="button"
              onClick={() => goView(i)}
              aria-pressed={viewIndex === i}
              className={`rounded-lg px-3.5 py-1.5 text-[13px] transition-colors ${viewIndex === i ? "bg-accent/[0.16] text-[#e7e7f0]" : "text-muted hover:text-[#c9c9d8]"}`}
            >
              {v.label}
              <small className="ml-1 text-[#55556d]">{v.sub}</small>
            </button>
          ))}
          <button
            type="button"
            onClick={() => goView(viewIndex + 1)}
            disabled={viewIndex === 2}
            aria-label="Next view"
            className="h-[30px] w-[30px] rounded-full border border-edge bg-[#14142a] text-[15px] hover:border-accent disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </section>
    </PageShell>
  );
}

/** Products: one 3D world (galaxy, skyline, 3D cards). Approved mockup: docs/mockups/products-world.html. */
export default function ProductsPage() {
  return (
    <Suspense>
      <World />
    </Suspense>
  );
}
