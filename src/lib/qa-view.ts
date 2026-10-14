import type { QaReport } from "@/core/qa/types";
import { QA_VERSION } from "@/core/qa/types";
import type { ContentItemRow } from "@/lib/supabase/database.types";

/** Stored QA report of a material for the editors (stale when the material changed since). */
export function qaFor(item: Pick<ContentItemRow, "qa" | "qa_version" | "current_version">): { report: QaReport; stale: boolean } | null {
  const r = item.qa as unknown as QaReport | null;
  if (!r || r.version !== QA_VERSION) return null;
  return { report: r, stale: item.qa_version !== item.current_version };
}
