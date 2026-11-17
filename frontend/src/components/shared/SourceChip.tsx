import type { SectionSource } from "@/lib/api";
import { SOURCE_LABEL } from "@/lib/format";

export default function SourceChip({ source }: { source: SectionSource }) {
  return <span className="source-chip">{SOURCE_LABEL[source]}</span>;
}
