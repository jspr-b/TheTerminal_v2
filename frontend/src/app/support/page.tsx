"use client";

import PageShell, { PageTitle } from "@/components/shell/PageShell";
import { useLoad } from "@/components/shared/Load";
import { SectionList } from "@/components/shared/Sections";
import { DEV_MERCHANT, getPageState } from "@/lib/api";

export default function SupportPage() {
  const page = useLoad(() => getPageState(DEV_MERCHANT, "support"), `page:support:${DEV_MERCHANT}`);
  return (
    <PageShell crumbs={[{ label: "Support" }]}>
      <PageTitle title="Support" sub="Support tickets over the next 14 days." />
      <SectionList state={page.data} error={page.error} retry={page.retry} />
    </PageShell>
  );
}
