import "server-only";
import { assessPhoto, PHOTO_ANALYSIS_VERSION, type PhotoReport } from "@/core/creative/photos";
import type { CompositionInput } from "@/core/creative/composition";
import { propertySkillTags } from "@/verticals/real-estate/property";
import type { WorkspaceContext } from "@/lib/session";
import { fetchAll } from "@/lib/supabase/fetch-all";

export type CompositionPhoto = CompositionInput["photos"][number];
export interface PropertyComposition {
  photos: CompositionPhoto[];
  tags: string[];
}

/** Photo report, or a dimensions-only report for photos not analysed yet (no invented quality). */
export function reportOrDims(p: { width: number; height: number; analysis: unknown }): CompositionPhoto {
  const a = p.analysis as PhotoReport | null;
  if (a?.version === PHOTO_ANALYSIS_VERSION) return { orientation: a.orientation, ratio: a.ratio, brightness: a.brightness, score: a.score, issues: a.issues };
  const r = assessPhoto({ width: p.width, height: p.height, brightness: 0.5, contrast: 0.2, sharpness: 0.5, colors: [], focus: null });
  // Only dimension-based findings are kept when pixels were not analysed.
  return { orientation: r.orientation, ratio: r.ratio, brightness: 0.5, score: r.score, issues: r.issues.filter((i) => i.code.includes("resolution") || i.code === "extreme_ratio" || i.code === "crop_risk") };
}

/** Composition inputs per property (first 6 photos, property character tags). */
export async function loadCompositionData(ctx: WorkspaceContext, propertyIds: string[]): Promise<Record<string, PropertyComposition>> {
  if (!propertyIds.length) return {};
  const [{ data: props }, { data: photos }] = await Promise.all([
    ctx.supabase.from("properties").select("id, title, property_type, transaction_type, price, price_per_m2, area_m2, rooms, description, features, market").eq("workspace_id", ctx.workspace.id).in("id", propertyIds),
    fetchAll((lo, hi) => ctx.supabase.from("property_photos").select("property_id, width, height, analysis, position").eq("workspace_id", ctx.workspace.id).in("property_id", propertyIds).order("position").order("id").range(lo, hi), 2000),
  ]);
  const out: Record<string, PropertyComposition> = {};
  for (const p of props ?? []) out[p.id] = { photos: [], tags: propertySkillTags(p).tags };
  for (const ph of photos ?? []) {
    const e = out[ph.property_id];
    if (e && e.photos.length < 6) e.photos.push(reportOrDims(ph));
  }
  return out;
}
