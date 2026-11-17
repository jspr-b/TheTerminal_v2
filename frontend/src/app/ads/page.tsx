"use client";

import PageShell, { PageTitle } from "@/components/shell/PageShell";
import { useLoad } from "@/components/shared/Load";
import { SectionList } from "@/components/shared/Sections";
import { DEV_MERCHANT, getPageState } from "@/lib/api";

export default function AdsPage() {
  const page = useLoad(() => getPageState(DEV_MERCHANT, "ads"), `page:ads:${DEV_MERCHANT}`);
  return (
    <PageShell crumbs={[{ label: "Ads" }]}>
      <PageTitle title="Ads" sub="Your campaigns over the next 7 to 14 days." />
      <SectionList state={page.data} error={page.error} retry={page.retry} />
    </PageShell>
  );
}
