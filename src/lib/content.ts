import "server-only";
import { randomUUID } from "node:crypto";
import type { TaskInput } from "@/core/marketing-engine/pipeline";
import type { GenerationRequest } from "@/core/marketing-engine/prompt";
import type { BrandKit } from "@/core/brand/model";
import type { TextBody } from "@/core/marketing-engine/request";
import type { SkillUsage } from "@/core/marketing-engine/skills/composer";
import type { Json } from "@/lib/supabase/database.types";
import { AUDIENCE_PRESETS, AUDIENCE_TAGS, getContentType, type AudiencePreset } from "@/verticals/real-estate/content-types";
import { propertyFactSheet, propertySkillTags } from "@/verticals/real-estate/property";
import { AppError, dbError } from "@/lib/errors";
import type { WorkspaceContext } from "@/lib/session";

export const newVariantId = () => randomUUID().slice(0, 8);

/** Resolves a request into engine input: content type, property facts, audience. */
export async function buildTaskInput(ctx: WorkspaceContext, request: GenerationRequest, brand: BrandKit): Promise<TaskInput> {
  const def = getContentType(request.contentType);
  if (!def) throw new AppError("Nieznany rodzaj treści.", "bad_type");
  if (!def.platforms.includes(request.platform) && request.platform !== "general") throw new AppError("Ta platforma nie pasuje do wybranego rodzaju treści.", "bad_platform");
  let facts = null;
  let propertyTags: string[] = [];
  if (request.propertyId) {
    const { data: p } = await ctx.supabase.from("properties").select("*").eq("id", request.propertyId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!p) throw new AppError("Nie znaleziono nieruchomości.", "not_found", 404);
    const { data: photos } = await ctx.supabase.from("property_photos").select("is_visualization").eq("property_id", p.id);
    facts = propertyFactSheet(p, photos ?? []);
    propertyTags = propertySkillTags(p).tags;
  } else if (def.property === "required") {
    throw new AppError("Ten rodzaj treści wymaga wybrania nieruchomości.", "property_required");
  }
  const preset = request.audience in AUDIENCE_PRESETS ? (request.audience as AudiencePreset) : null;
  const audienceLabel = preset === "brand" ? brand.targetAudience || "Grupa docelowa biura" : preset ? AUDIENCE_PRESETS[preset] : request.audience || "Szeroka grupa osób zainteresowanych nieruchomościami";
  return { def, request, facts, audienceLabel, audienceTags: preset ? AUDIENCE_TAGS[preset] ?? [] : [], propertyTags };
}

export async function addVersion(ctx: WorkspaceContext, itemId: string, body: TextBody | Record<string, unknown>, source: "ai_generate" | "ai_refine" | "manual" | "template" | "duplicate", o: { operation?: string; skills?: SkillUsage; quality?: unknown; model?: string } = {}) {
  const args = {
    p_item: itemId,
    p_body: body as unknown as Json,
    p_source: source,
    p_operation: o.operation ?? null,
    p_skills: (o.skills ?? []) as unknown as Json,
    p_quality: (o.quality ?? null) as Json,
    p_model: o.model ?? null,
  };
  const { data, error } = ctx.actor === "worker"
    ? await ctx.supabase.rpc("add_content_version_as", { ...args, p_actor: ctx.userId })
    : await ctx.supabase.rpc("add_content_version", args);
  if (error) throw dbError(error, "Nie udało się zapisać wersji.");
  return data;
}

export async function loadCurrentBody<T>(ctx: WorkspaceContext, itemId: string) {
  const { data: item } = await ctx.supabase.from("content_items").select("*").eq("id", itemId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!item) throw new AppError("Nie znaleziono materiału.", "not_found", 404);
  const { data: version } = await ctx.supabase.from("content_versions").select("*").eq("item_id", itemId).eq("version", item.current_version).single();
  if (!version) throw new AppError("Nie znaleziono wersji materiału.", "not_found", 404);
  return { item, version, body: version.body as unknown as T };
}
