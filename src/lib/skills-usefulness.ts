import "server-only";
import { computeUsefulness, type ItemOutcome, type SkillUsefulness } from "@/core/marketing-engine/skills/usefulness";
import type { WorkspaceContext } from "@/lib/session";

/** Recent materials looked at (per office; data of other offices is never read). */
const WINDOW = 500;

export async function loadSkillUsefulness(ctx: WorkspaceContext): Promise<{ stats: Map<string, SkillUsefulness>; materials: number }> {
  const { data: versions } = await ctx.supabase
    .from("content_versions")
    .select("item_id, source, skills_used")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: false })
    .limit(WINDOW * 4);
  const byItem = new Map<string, ItemOutcome>();
  for (const v of versions ?? []) {
    const o = byItem.get(v.item_id) ?? { skills: [], approved: false, edited: false };
    if (v.source === "manual") o.edited = true;
    if ((v.source === "ai_generate" || v.source === "ai_refine") && Array.isArray(v.skills_used)) {
      for (const s of v.skills_used as { id?: unknown }[]) if (typeof s?.id === "string") o.skills.push(s.id);
    }
    byItem.set(v.item_id, o);
  }
  const ids = [...byItem.entries()].filter(([, o]) => o.skills.length).map(([id]) => id).slice(0, WINDOW);
  const approved = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await ctx.supabase.from("content_items").select("id").eq("workspace_id", ctx.workspace.id).eq("status", "ready").in("id", ids.slice(i, i + 200));
    for (const r of data ?? []) approved.add(r.id);
  }
  const items = ids.map((id) => ({ ...byItem.get(id)!, approved: approved.has(id) }));
  return { stats: computeUsefulness(items), materials: items.length };
}
