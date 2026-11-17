"use client";

import PageShell, { PageTitle } from "@/components/shell/PageShell";
import { useLoad } from "@/components/shared/Load";
import { SectionList } from "@/components/shared/Sections";
import { DEV_MERCHANT, getPageState } from "@/lib/api";

export default function MoneyPage() {
  const page = useLoad(() => getPageState(DEV_MERCHANT, "money"), `page:money:${DEV_MERCHANT}`);
  return (
    <PageShell crumbs={[{ label: "Money" }]}>
      <PageTitle title="Money" sub="Money in and out over the next 14 days." />
      <SectionList state={page.data} error={page.error} retry={page.retry} />
    </PageShell>
  );
}
