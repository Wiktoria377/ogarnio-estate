import "server-only";
import { recommendCompositions } from "@/core/creative/composition";
import { AUTOPILOT_KINDS, PILLARS, engineGoal, type AutopilotKind, type Pillar } from "@/core/autopilot/plan";
import { FORMATS, SLIDE_KINDS, defaultSlides, graphicDesignSchema, slotsFor, type GraphicDesign } from "@/core/graphics/design";
import { generateContent, generateGraphicCopy, type TaskInput } from "@/core/marketing-engine/pipeline";
import type { GenerationRequest } from "@/core/marketing-engine/prompt";
import type { TextBody } from "@/core/marketing-engine/request";
import { PLATFORMS, type CtaType, type Platform } from "@/core/marketing-engine/taxonomy";
import type { BusinessGoal } from "@/core/strategy/director";
import { createEngine, loadBrandKit } from "@/lib/ai";
import { addVersion, newVariantId } from "@/lib/content";
import { loadCompositionData } from "@/lib/creative/composition";
import { dbError } from "@/lib/errors";
import { JobFailure, type JobRun } from "@/lib/jobs/types";
import { pickPhotos, rankPropertyPhotos } from "@/lib/photos";
import { runQa } from "@/lib/qa";
import type { WorkspaceContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AutopilotItemRow, Json, PropertyRow } from "@/lib/supabase/database.types";
import { AUDIENCE_PRESETS, getContentType } from "@/verticals/real-estate/content-types";
import { applyFactTexts, factTexts } from "@/verticals/real-estate/graphics";
import { propertyFactSheet, propertySkillTags } from "@/verticals/real-estate/property";
import { settleRun } from "./service";

const CTA_FOR: Record<BusinessGoal, CtaType> = { sell_listings: "viewing", leads: "message", acquire_listings: "valuation", expert_brand: "soft", agent_brand: "soft", premium: "viewing" };

function instructions(item: AutopilotItemRow): string {
  const pillar = PILLARS[item.pillar as Pillar];
  return [
    `Materiał z planu marketingu biura (pozycja ${item.position}, ${AUTOPILOT_KINDS[item.kind].label.toLowerCase()}).`,
    pillar ? `Filar: ${pillar.label}. ${pillar.brief}` : "",
    item.kind === "ad_proposal" ? "To propozycja tekstu reklamy do decyzji użytkownika; nie podawaj budżetu ani prognoz wyników." : "",
  ].filter(Boolean).join("\n");
}

/** Content item for this queue position: a new one, or a new version of the existing one (regenerate). */
async function upsertContent(ctx: WorkspaceContext, item: AutopilotItemRow, row: { kind: "text" | "graphic"; content_type: string; title: string; platform: string; params: Record<string, unknown> }): Promise<string> {
  if (item.content_item_id) {
    const { data } = await ctx.supabase.from("content_items").select("id").eq("id", item.content_item_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (data) return data.id;
  }
  const { data, error } = await ctx.supabase.from("content_items").insert({
    workspace_id: ctx.workspace.id, property_id: item.property_id, kind: row.kind, content_type: row.content_type, title: row.title.slice(0, 200), platform: row.platform,
    params: { ...row.params, autopilotRun: item.run_id, autopilotItem: item.id } as Json, status: "draft", created_by: ctx.userId, updated_by: ctx.userId, current_version: 0,
  }).select("id").single();
  if (error || !data) throw dbError(error, "Nie udało się zapisać materiału.");
  return data.id;
}

async function textMaterial(ctx: WorkspaceContext, item: AutopilotItemRow, property: PropertyRow | null): Promise<string> {
  const def = getContentType(item.content_type);
  if (!def) throw new JobFailure("Nieznany rodzaj treści.", "bad_type");
  const brand = await loadBrandKit(ctx);
  const platform: Platform = (def.platforms as readonly string[]).includes(item.platform) ? (item.platform as Platform) : def.platforms[0]!;
  const goal = item.goal as BusinessGoal;
  const request: GenerationRequest = {
    contentType: def.id, platform, goal: engineGoal(goal), audience: "brand", topic: item.topic, propertyId: property?.id ?? null, tone: "brand", length: "short",
    ctaType: CTA_FOR[goal] ?? "soft", variants: 1, extraInstructions: instructions(item), marketData: "",
  };
  const input: TaskInput = {
    def, request, facts: property ? propertyFactSheet(property) : null, audienceLabel: brand.targetAudience || AUDIENCE_PRESETS.brand,
    propertyTags: property ? propertySkillTags(property).tags : [], process: { type: "autopilot", id: item.run_id },
  };
  const result = await generateContent(await createEngine(ctx, brand), input);
  const now = new Date().toISOString();
  const variants = result.variants.map((v) => ({ id: newVariantId(), variant: v.variant, quality: v.quality, createdAt: now, origin: "ai" as const }));
  const body: TextBody = { request, variants, selected: variants[0]!.id, gaps: result.gaps };
  const id = await upsertContent(ctx, item, { kind: "text", content_type: def.id, title: `${def.label}${property ? ` · ${property.title}` : item.topic ? ` · ${item.topic}` : ""}`, platform: PLATFORMS[platform].label, params: { ...request } });
  await addVersion(ctx, id, body, "ai_generate", { operation: `Autopilot: ${AUTOPILOT_KINDS[item.kind].label}`.slice(0, 60), skills: result.skills, quality: variants.map((v) => ({ id: v.id, score: v.quality.score })), model: result.model });
  return id;
}

async function graphicMaterial(ctx: WorkspaceContext, item: AutopilotItemRow, property: PropertyRow): Promise<string> {
  const format = item.format ?? "square";
  const brand = await loadBrandKit(ctx);
  const photoIds = pickPhotos(await rankPropertyPhotos(ctx, property.id), 8);
  const comp = (await loadCompositionData(ctx, [property.id]))[property.id];
  const goal = item.goal as BusinessGoal;
  const template = recommendCompositions({ format, photos: comp?.photos ?? [], textLength: 60, message: goal === "premium" ? "premium" : "sales", propertyTags: comp?.tags ?? [], brandStyle: brand.style })[0]!.template;
  let slides = defaultSlides(format, photoIds);
  if (format === "carousel") slides = slides.slice(0, 5);
  slides = applyFactTexts(slides, factTexts(property, brand));
  const facts = propertyFactSheet(property);
  const copy = await generateGraphicCopy(await createEngine(ctx, brand), {
    slides: slides.map((s) => slotsFor(s.kind).filter((x) => x.source === "ai").map((x) => ({ key: x.key, label: `${SLIDE_KINDS[s.kind].label}: ${x.label}`, maxChars: x.maxChars }))),
    facts, propertyTags: propertySkillTags(property).tags, platform: item.platform === "facebook" ? "facebook" : "instagram", goal: engineGoal(goal),
    audienceLabel: brand.targetAudience || AUDIENCE_PRESETS.brand, brief: instructions(item),
    formatLabel: `${FORMATS[format].label} ${FORMATS[format].size}, ${slides.length} ${slides.length === 1 ? "plansza" : "plansz"}`, process: { type: "autopilot", id: item.run_id },
  });
  slides = slides.map((s, i) => ({ ...s, texts: { ...s.texts, ...Object.fromEntries(Object.entries(copy.slides[i] ?? {}).filter(([, v]) => v.trim())) } }));
  const design: GraphicDesign = graphicDesignSchema.parse({ format, template, propertyId: property.id, slides, caption: copy.caption.slice(0, 2200) });
  const id = await upsertContent(ctx, item, { kind: "graphic", content_type: `graphic_${format}`, title: `${AUTOPILOT_KINDS[item.kind].label} · ${property.title}`, platform: PLATFORMS[item.platform].label, params: { format, template } });
  await addVersion(ctx, id, design, "ai_generate", { operation: `Autopilot: ${AUTOPILOT_KINDS[item.kind].label}`.slice(0, 60), skills: copy.skills, model: copy.model, quality: { warnings: copy.warnings } });
  return id;
}

/** Background job: prepares one material of the approval queue, then checks its quality (no AI cost). */
export async function runAutopilotItem({ job, ctx, progress }: JobRun): Promise<Json> {
  const itemId = (job.payload as { itemId?: string }).itemId;
  if (!itemId) throw new JobFailure("Zadanie nie wskazuje pozycji autopilota.", "bad_job");
  const admin = createAdminClient();
  const { data: item } = await admin.from("autopilot_items").select("*").eq("id", itemId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!item) throw new JobFailure("Pozycja autopilota nie istnieje.", "not_found");
  try {
    let property: PropertyRow | null = null;
    if (item.property_id) {
      property = (await ctx.supabase.from("properties").select("*").eq("id", item.property_id).eq("workspace_id", ctx.workspace.id).maybeSingle()).data;
      if (!property) throw new JobFailure("Oferta z planu została usunięta.", "property_missing");
    }
    await progress(10);
    const graphic = AUTOPILOT_KINDS[item.kind as AutopilotKind].output === "graphic";
    const contentId = graphic && property ? await graphicMaterial(ctx, item, property) : await textMaterial(ctx, item, property);
    await progress(80);
    let qa: { problems: number; warnings: number } | null = null;
    try {
      qa = (await runQa(ctx, contentId)).summary;
    } catch {
      /* QA is advisory: the material is still ready for review */
    }
    await admin.from("autopilot_items").update({ status: "ready", content_item_id: contentId, generations: Math.min(10, item.generations + 1), error: null }).eq("id", item.id);
    await settleRun(item.run_id);
    return { contentItemId: contentId, qa } as unknown as Json;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 480) : "Nie udało się przygotować materiału.";
    await admin.from("autopilot_items").update({ status: "failed", error: message }).eq("id", item.id);
    await settleRun(item.run_id);
    throw error instanceof JobFailure ? error : new JobFailure(message, "autopilot_failed");
  }
}
