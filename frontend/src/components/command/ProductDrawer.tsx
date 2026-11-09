"use client";

import { useMemo, useState } from "react";
import type { CommandProduct } from "@/lib/api";

export default function ProductDrawer({ products, selected }: { products: CommandProduct[]; selected: string | null }) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    const unitsOf = (p: CommandProduct) => (selected ? p.by_location.find((b) => b.location_id === selected)?.units ?? 0 : p.units);
    return products.map((p) => ({ ...p, shown: unitsOf(p) })).filter((p) => !selected || p.shown !== 0);
  }, [products, selected]);

  return (
    <section className={`glass absolute bottom-9 left-3 right-[344px] z-[5] flex flex-col overflow-hidden rounded-[10px] ${open ? "h-[280px]" : "h-11"}`}>
      <button onClick={() => setOpen(!open)} className="flex h-11 w-full flex-none items-center justify-between px-3.5 font-medium">
        <span>
          Products <span className="text-xs font-normal text-muted">{rows.length}</span>
        </span>
        <span className="text-xs font-normal text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 bg-[#12121f] text-left text-muted">
                <th className="px-3.5 py-1.5 font-medium">Product</th>
                <th className="px-2 py-1.5 font-medium">Stock<span className="source-chip">Shopify</span></th>
                <th className="px-2 py-1.5 font-medium">Will sell, 14 days<span className="source-chip">Kumo</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-white/10">
                  <td className="max-w-[320px] truncate px-3.5 py-1.5">{p.title}</td>
                  <td className="px-2 py-1.5">{p.shown.toLocaleString()}</td>
                  <td className="px-2 py-1.5 italic text-muted">too few sales to predict</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
