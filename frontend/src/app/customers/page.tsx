"use client";

import PageShell, { PageTitle, SubHeading } from "@/components/shell/PageShell";
import { LoadError, Skeleton, useLoad } from "@/components/shared/Load";
import { SectionList } from "@/components/shared/Sections";
import { DEV_MERCHANT, getCustomerRegions, getPageState } from "@/lib/api";

export default function CustomersPage() {
  const regions = useLoad(() => getCustomerRegions(DEV_MERCHANT), `regions:${DEV_MERCHANT}`);
  const page = useLoad(() => getPageState(DEV_MERCHANT, "customers"), `page:customers:${DEV_MERCHANT}`);
  const r = regions.data;
  const rows = r ? [...r.regions].sort((a, b) => b.customers - a.customers) : [];

  return (
    <PageShell crumbs={[{ label: "Customers" }]}>
      <PageTitle title="Customers" sub="In groups per city. This page never shows who a customer is." />
      <SubHeading>Customers per city, last 365 days</SubHeading>
      {regions.error ? (
        <LoadError message={regions.error} retry={regions.retry} />
      ) : !r ? (
        <Skeleton className="h-24 w-full max-w-xl" />
      ) : (
        <>
          <table className="w-full max-w-xl border-collapse">
            <thead>
              <tr className="border-b border-edge text-left text-muted">
                <th scope="col" className="px-2.5 py-2 font-medium">City</th>
                <th scope="col" className="px-2.5 py-2 font-medium">Country</th>
                <th scope="col" className="px-2.5 py-2 font-medium">
                  Customers<span className="source-chip">Shopify</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2.5 py-4 text-muted">No city has enough customers to show yet.</td>
                </tr>
              )}
              {rows.map((c) => (
                <tr key={`${c.city}|${c.country ?? ""}`} className="border-b border-white/[0.08]">
                  <td className="px-2.5 py-2">{c.city}</td>
                  <td className="px-2.5 py-2 text-muted">{c.country ?? ""}</td>
                  <td className="px-2.5 py-2 tabular-nums">{c.customers.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 max-w-xl text-xs text-muted">
            Customers with an order in the last 365 days, by the city they ship to. Cities with fewer than {r.min_count} customers are not shown, so no
            single customer can be picked out.
            {r.hidden > 0 && ` ${r.hidden.toLocaleString()} customer${r.hidden === 1 ? " lives" : "s live"} in cities that are not shown.`}
          </p>
        </>
      )}
      <SectionList state={page.data} error={page.error} retry={page.retry} heading={<SubHeading>Predictions</SubHeading>} />
    </PageShell>
  );
}
