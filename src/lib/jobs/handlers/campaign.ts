import "server-only";
import { propertySkillTags } from "@/verticals/real-estate/property";
import { FORMATS, SLIDE_KINDS, defaultSlides, graphicDesignSchema, slotsFor, type GraphicDesign } from "@/core/graphics/design";
import { briefInstructions, generateCampaignBrief, DIRECTOR_VERSION, type StoredBrief } from "@/core/marketing-engine/director";
import { generateContent, generateGraphicCopy, type TaskInput } from "@/core/marketing-engine/pipeline";
import type { GenerationRequest } from "@/core/marketing-engine/prompt";
import type { TextBody } from "@/core/marketing-engine/request";
import { PLATFORMS } from "@/core/marketing-engine/taxonomy";
import { createEngine, guardAiQuota, loadBrandKit } from "@/lib/ai";
import { loadCampaignContext, type CampaignContext } from "@/lib/campaigns";
import { addVersion, newVariantId } from "@/lib/content";
import { dbError } from "@/lib/errors";
import { pickPhotos, rankPropertyPhotos } from "@/lib/photos";
import type { Json } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import { DELIVERABLES, DELIVERABLE_ORDER, type DeliverableId } from "@/verticals/real-estate/campaign";
import { getContentType } from "@/verticals/real-estate/content-types";
import { applyFactTexts, factTexts } from "@/verticals/real-estate/graphics";
import { pickTemplate } from "@/verticals/real-estate/templates";
import { JobDeferred, JobFailure, type JobRun } from "../types";

type AssetResult = { contentItemId: string; warnings?: string[] };

// ---------------------------------------------------------------- brief

export async function runCampaignBrief({ job, ctx, progress }: JobRun): Promise<Json> {
  if (!job.campaign_id) throw new JobFailure("Zadanie nie wskazuje kampanii.", "bad_job");
  await guardAiQuota(ctx);
  const brand = await loadBrandKit(ctx);
  const c = await loadCampaignContext(ctx, job.campaign_id, brand);
  await progress(10);
  const engine = await createEngine(ctx, brand);
  const deliverables = (c.campaign.deliverables as DeliverableId[]).filter((d) => d in DELIVERABLES).map((d) => ({ id: d, label: DELIVERABLES[d].label, hint: DELIVERABLES[d].hint }));
  const brief = await generateCampaignBrief(engine, {
    goalLabel: c.goal.label,
    goalDescription: c.goal.description,
    engineGoal: c.goal.engineGoal,
    goalTags: c.goal.tags,
    styleLabel: c.style.label,
    styleHint: c.style.hint,
    audienceLabel: c.audience.label,
    audienceTags: c.audience.tags,
    platforms: c.campaign.platforms,
    deliverables,
    facts: c.facts,
    notes: c.options.notes,
    brandStyle: brand.style,
  });
  await progress(90);
  const { error } = await ctx.supabase
    .from("campaigns")
    .update({ brief: brief as unknown as Json, brief_version: DIRECTOR_VERSION, updated_by: ctx.userId })
    .eq("id", c.campaign.id)
    .eq("workspace_id", ctx.workspace.id);
  if (error) throw dbError(error, "Nie udało się zapisać briefu kampanii.");
  return { warnings: brief.warnings, skills: brief.skills.map((s) => `${s.id}@${s.version}`), model: brief.model };
}

// ---------------------------------------------------------------- assets

/** Waits for the brief; fails clearly when the brief job failed. */
async function requireBrief(ctx: WorkspaceContext, c: CampaignContext): Promise<StoredBrief> {
  if (c.brief) return c.brief;
  const { data: briefJob } = await ctx.supabase
    .from("generation_jobs")
    .select("status")
    .eq("campaign_id", c.campaign.id)
    .eq("workspace_id", ctx.workspace.id)
    .eq("kind", "campaign_brief")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (briefJob && (briefJob.status === "queued" || briefJob.status === "running")) throw new JobDeferred(3000);
  throw new JobFailure("Brief kampanii nie powstał, więc materiał nie może być spójny z kampanią. Ponów najpierw zadanie „Brief kampanii”.", "brief_missing");
}

/** Existing material for this deliverable (retries add a version instead of a duplicate). */
async function linkedItem(ctx: WorkspaceContext, campaignId: string, deliverable: string): Promise<string | null> {
  const { data } = await ctx.supabase.from("campaign_assets").select("content_item_id").eq("campaign_id", campaignId).eq("deliverable", deliverable).eq("workspace_id", ctx.workspace.id).maybeSingle();
  return data?.content_item_id ?? null;
}

async function upsertItem(
  ctx: WorkspaceContext,
  c: CampaignContext,
  deliverable: DeliverableId,
  item: { kind: "text" | "graphic" | "video" | "document"; content_type: string; title: string; platform: string | null; params: Record<string, unknown> },
): Promise<{ id: string; created: boolean }> {
  const existing = await linkedItem(ctx, c.campaign.id, deliverable);
  if (existing) {
    const { data } = await ctx.supabase.from("content_items").select("id").eq("id", existing).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (data) return { id: data.id, created: false };
  }
  const { data, error } = await ctx.supabase
    .from("content_items")
    .insert({ workspace_id: ctx.workspace.id, property_id: c.property.id, ...item, params: item.params as Json, title: item.title.slice(0, 200), status: "draft", created_by: ctx.userId, updated_by: ctx.userId, current_version: 0 })
    .select("id")
    .single();
  if (error || !data) throw dbError(error, "Nie udało się zapisać materiału kampanii.");
  const { error: linkError } = await ctx.supabase
    .from("campaign_assets")
    .upsert({ workspace_id: ctx.workspace.id, campaign_id: c.campaign.id, deliverable, content_item_id: data.id }, { onConflict: "campaign_id,deliverable" });
  if (linkError) {
    await ctx.supabase.from("content_items").delete().eq("id", data.id).eq("workspace_id", ctx.workspace.id);
    throw dbError(linkError, "Nie udało się powiązać materiału z kampanią.");
  }
  return { id: data.id, created: true };
}

const titleFor = (c: CampaignContext, deliverable: DeliverableId) => `${DELIVERABLES[deliverable].label} · ${c.campaign.name}`;

async function textAsset(ctx: WorkspaceContext, c: CampaignContext, brief: StoredBrief, deliverable: DeliverableId, progress: JobRun["progress"]): Promise<AssetResult> {
  const d = DELIVERABLES[deliverable];
  if (d.kind !== "text") throw new JobFailure("Nieprawidłowy materiał.", "bad_deliverable");
  const def = getContentType(d.contentType);
  if (!def) throw new JobFailure("Nieznany rodzaj treści.", "bad_type");
  const brand = await loadBrandKit(ctx);
  const request: GenerationRequest = {
    contentType: def.id,
    platform: d.platform,
    goal: c.goal.engineGoal,
    audience: c.audience.label.slice(0, 300),
    topic: "",
    propertyId: c.property.id,
    tone: c.style.tone,
    length: "medium",
    ctaType: c.goal.cta,
    variants: 2,
    extraInstructions: briefInstructions(brief, deliverable),
    marketData: "",
  };
  const input: TaskInput = { def, request, facts: c.facts, audienceLabel: c.audience.label, audienceTags: [...c.audience.tags, ...c.goal.tags, "campaign"] };
  await progress(15);
  const result = await generateContent(await createEngine(ctx, brand), input);
  await progress(85);
  const now = new Date().toISOString();
  const variants = result.variants.map((v) => ({ id: newVariantId(), variant: v.variant, quality: v.quality, createdAt: now, origin: "ai" as const }));
  const body: TextBody = { request: { ...request, sequenceCount: undefined }, variants, selected: variants[0]!.id, gaps: result.gaps };
  const item = await upsertItem(ctx, c, deliverable, { kind: "text", content_type: def.id, title: titleFor(c, deliverable), platform: PLATFORMS[d.platform].label, params: { ...request, campaignId: c.campaign.id } });
  await addVersion(ctx, item.id, body, "ai_generate", { operation: `Kampania: ${d.label}`.slice(0, 60), skills: result.skills, quality: variants.map((v) => ({ id: v.id, score: v.quality.score })), model: result.model });
  return { contentItemId: item.id };
}

async function graphicAsset(ctx: WorkspaceContext, c: CampaignContext, brief: StoredBrief, deliverable: DeliverableId, progress: JobRun["progress"]): Promise<AssetResult> {
  const d = DELIVERABLES[deliverable];
  if (d.kind !== "graphic") throw new JobFailure("Nieprawidłowy materiał.", "bad_deliverable");
  const brand = await loadBrandKit(ctx);
  const ranked = await rankPropertyPhotos(ctx, c.property.id);
  const photoIds = pickPhotos(ranked, 8);
  const template = pickTemplate({ campaignStyle: c.campaign.style, brandStyle: brand.style, goal: c.campaign.goal, format: d.format, photoCount: photoIds.length });
  let slides = defaultSlides(d.format, photoIds);
  if (d.format === "carousel") slides = slides.slice(0, d.slides);
  slides = applyFactTexts(slides, factTexts(c.property, brand));
  await progress(20);
  const copy = await generateGraphicCopy(await createEngine(ctx, brand), {
    slides: slides.map((s) => slotsFor(s.kind).filter((x) => x.source === "ai").map((x) => ({ key: x.key, label: `${SLIDE_KINDS[s.kind].label}: ${x.label}`, maxChars: x.maxChars }))),
    facts: c.facts,
    propertyTags: propertySkillTags(c.property).tags,
    platform: "instagram",
    goal: c.goal.engineGoal,
    audienceLabel: c.audience.label,
    brief: briefInstructions(brief, deliverable),
    formatLabel: `${FORMATS[d.format].label} ${FORMATS[d.format].size}, ${slides.length} plansz`,
  });
  await progress(85);
  slides = slides.map((s, i) => ({ ...s, texts: { ...s.texts, ...Object.fromEntries(Object.entries(copy.slides[i] ?? {}).filter(([, v]) => v.trim())) } }));
  const design: GraphicDesign = graphicDesignSchema.parse({ format: d.format, template, propertyId: c.property.id, slides, caption: copy.caption.slice(0, 2200) });
  const item = await upsertItem(ctx, c, deliverable, { kind: "graphic", content_type: `graphic_${d.format}`, title: titleFor(c, deliverable), platform: "Instagram", params: { format: d.format, template, campaignId: c.campaign.id } });
  await addVersion(ctx, item.id, design, "ai_generate", { operation: `Kampania: ${d.label}`.slice(0, 60), skills: copy.skills, model: copy.model });
  return { contentItemId: item.id, warnings: copy.warnings };
}

export async function runCampaignAsset({ job, ctx, progress }: JobRun): Promise<Json> {
  if (!job.campaign_id || !job.deliverable || !(job.deliverable in DELIVERABLES)) throw new JobFailure("Zadanie nie wskazuje materiału kampanii.", "bad_job");
  const deliverable = job.deliverable as DeliverableId;
  const def = DELIVERABLES[deliverable];
  const brand = await loadBrandKit(ctx);
  const c = await loadCampaignContext(ctx, job.campaign_id, brand);
  if (def.kind === "schedule") return (await import("./schedule")).campaignSchedule(ctx, c, job.id);
  const brief = await requireBrief(ctx, c);
  await guardAiQuota(ctx);
  let res: AssetResult;
  switch (def.kind) {
    case "text":
      res = await textAsset(ctx, c, brief, deliverable, progress);
      break;
    case "graphic":
      res = await graphicAsset(ctx, c, brief, deliverable, progress);
      break;
    case "video": {
      const item = await upsertItem(ctx, c, deliverable, { kind: "video", content_type: "video_reel", title: titleFor(c, deliverable), platform: "Instagram / TikTok", params: { campaignId: c.campaign.id } });
      res = { contentItemId: item.id, ...(await (await import("@/lib/video")).createReelDraft(ctx, { itemId: item.id, property: c.property, facts: c.facts, brief, campaignStyle: c.campaign.style, goal: c.goal.engineGoal, progress })) };
      break;
    }
    case "document": {
      const item = await upsertItem(ctx, c, deliverable, { kind: "document", content_type: "brochure", title: titleFor(c, deliverable), platform: "PDF", params: { campaignId: c.campaign.id } });
      res = { contentItemId: item.id, ...(await (await import("@/lib/brochures")).createBrochureDraft(ctx, { itemId: item.id, property: c.property, brief, campaignGoal: c.campaign.goal, progress })) };
      break;
    }
  }
  await ctx.supabase.from("campaigns").update({ updated_by: ctx.userId }).eq("id", c.campaign.id).eq("workspace_id", ctx.workspace.id);
  return res as unknown as Json;
}

export { DELIVERABLE_ORDER };
