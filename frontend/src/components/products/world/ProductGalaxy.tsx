"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OverviewProduct, ProductPairs } from "@/lib/api";
import { worldData } from "./data";
import { createWorld, type WorldApi } from "./engine";

/**
 * The product page's "Bought together": the same galaxy as the Products world, focused on this product.
 * Click a partner to see its card, "Open product page" goes there; Esc or empty space returns to this product.
 */
export default function ProductGalaxy({ productId, products, pairs }: { productId: string; products: OverviewProduct[]; pairs: ProductPairs }) {
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const api = useRef<WorldApi | null>(null);
  const [failed, setFailed] = useState(false);
  const world = useMemo(() => worldData(products, pairs), [products, pairs]);
  const here = world.index.get(productId) ?? null;

  useEffect(() => {
    const el = host.current;
    const tp = tip.current;
    if (!el || !tp) return;
    let cancelled = false;
    let built: WorldApi | null = null;
    createWorld(
      el,
      tp,
      world.items,
      world.links,
      {
        // nothing picked = back to this product
        onSelect: (i) => api.current?.select(i ?? here),
        onOpen: (i) => router.push(`/products/${encodeURIComponent(world.items[i].id)}?view=together`),
        onView: () => undefined,
      },
      { here },
    )
      .then((w) => {
        if (cancelled) return w.dispose();
        built = w;
        api.current = w;
        w.select(here);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") api.current?.select(here);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      built?.dispose();
      api.current = null;
    };
  }, [world, here, router]);

  return (
    <div className="absolute inset-0">
      <div ref={host} className="absolute inset-0" />
      <div ref={tip} className="pointer-events-none absolute z-[5] hidden" />
      {failed && <p className="absolute inset-0 grid place-items-center text-muted">The 3D view could not start in this browser.</p>}
      <div className="pointer-events-none absolute left-5 top-4 z-[2]">
        <div className="text-sm font-medium">
          Bought in the same order<span className="source-chip">Shopify</span>
        </div>
        <div className="text-[11px] text-muted">Last 90 days, the same galaxy as on Products. Click a product to see it · Esc returns here.</div>
      </div>
    </div>
  );
}
