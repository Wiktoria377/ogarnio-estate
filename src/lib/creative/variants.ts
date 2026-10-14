import "server-only";
import { randomUUID } from "node:crypto";
import { CREATIVE_DIRECTIONS, CREATIVE_DIRECTION_IDS, templateForDirection, type CreativeDirection } from "@/core/creative/composition";
import { FORMATS, SLIDE_KINDS, TEMPLATES, graphicDesignSchema, slotsFor, type GraphicDesign, type TemplateId } from "@/core/graphics/design";
import { can } from "@/core/auth/permissions";
import { generateGraphicCopy } from "@/core/marketing-engine/pipeline";
import { createEngine, guardAiQuota, guardAiUsage, loadBrandKit } from "@/lib/ai";
import { addVersion, loadCurrentBody } from "@/lib/content";
import { reportOrDims } from "@/lib/creative/composition";
import { AppError, dbError } from "@/lib/errors";
import type { Json } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import { AUDIENCE_PRESETS } from "@/verticals/real-estate/content-types";
import { applyFactTexts, factTexts } from "@/verticals/real-estate/graphics";
import { propertyFactSheet, propertySkillTags } from "@/verticals/real-estate/property";

export interface VariantResult {
  setId: string;
  items: { id: string; direction: CreativeDirection; template: TemplateId; reasons: string[] }[];
  failed: { direction: CreativeDirection; error: string }[];
}

/**
 * Creative Engine variants: up to five clearly different approaches to one
 * graphic (minimalist, premium, dynamic, expert, sales). Same format, photos
 * and facts; the brand identity is fixed (brand colours, fonts and logo, no
 * per-variant colour overrides). Each variant is a separate, editable graphic.
 */
export async function createCreativeVariants(ctx: WorkspaceContext, sourceId: string, directions: CreativeDirection[] = CREATIVE_DIRECTION_IDS): Promise<VariantResult> {
  if (!can(ctx.role, "content.edit")) throw new AppError("Warianty tworzy właściciel, administrator, agent lub osoba od marketingu.", "forbidden", 403);
  const dirs = [...new Set(directions)].filter((d) => d in CREATIVE_DIRECTIONS).slice(0, 5);
  if (!dirs.length) throw new AppError("Wybierz co najmniej jeden kierunek.", "validation", 422);
  const { item, body } = await loadCurrentBody<GraphicDesign>(ctx, sourceId);
  if (item.kind !== "graphic") throw new AppError("Warianty można tworzyć z grafiki.", "bad_kind", 422);
  const source = graphicDesignSchema.parse(body);
  await guardAiUsage(ctx, "graphic_copy");
  await guardAiQuota(ctx, dirs.length);

  const brand = await loadBrandKit(ctx);
  let property = null;
  let photos: ReturnType<typeof reportOrDims>[] = [];
  if (source.propertyId) {
    const { data } = await ctx.supabase.from("properties").select("*").eq("id", source.propertyId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    property = data;
    const { data: ph } = await ctx.supabase.from("property_photos").select("width, height, analysis").eq("workspace_id", ctx.workspace.id).eq("property_id", source.propertyId).order("position").limit(6);
    photos = (ph ?? []).map(reportOrDims);
  }
  const propertyTags = property ? propertySkillTags(property).tags : [];
  const facts = property ? propertyFactSheet(property) : null;
  const engine = await createEngine(ctx, brand);
  const setId = randomUUID();

  // Distinct layouts: a direction falls back to its next preferred template when one is taken.
  const used = new Set<TemplateId>();
  const plans = dirs.map((dir) => {
    const base = { format: source.format, photos, textLength: 60, propertyTags, brandStyle: brand.style };
    let choice = templateForDirection(dir, base);
    if (used.has(choice.template)) {
      const alt = CREATIVE_DIRECTIONS[dir].prefer.find((t) => !used.has(t));
      if (alt) choice = { ...choice, template: alt, reasons: [`kierunek: ${CREATIVE_DIRECTIONS[dir].label.toLowerCase()}`, "inny układ niż pozostałe warianty"] };
    }
    used.add(choice.template);
    return { dir, choice };
  });

  const results = await Promise.allSettled(plans.map(async ({ dir, choice }) => {
    const d = CREATIVE_DIRECTIONS[dir];
    // Photo crop edits stay; colour/font overrides are dropped so every variant uses the brand identity.
    const slides = source.slides.map((s) => ({
      ...s,
      photoIds: s.kind === "cover" ? s.photoIds.slice(0, Math.max(1, TEMPLATES[choice.template].photos)) : s.photoIds,
      texts: Object.fromEntries(Object.entries(s.texts).filter(([k]) => slotsFor(s.kind).some((x) => x.key === k && x.source === "fact"))),
      overrides: Object.fromEntries(Object.entries(s.overrides ?? {}).filter(([k]) => k.startsWith("photo")).map(([k, o]) => [k, { zoom: o.zoom, fx: o.fx, fy: o.fy }])),
    }));
    const copy = await generateGraphicCopy(engine, {
      slides: slides.map((s) => slotsFor(s.kind).filter((x) => x.source === "ai").map((x) => ({ key: x.key, label: `${SLIDE_KINDS[s.kind].label}: ${x.label}`, maxChars: x.maxChars }))),
      facts, platform: "instagram", goal: dir === "expert" ? "trust" : dir === "minimal" ? "awareness" : "sales",
      audienceLabel: brand.targetAudience ?? AUDIENCE_PRESETS.brand, brief: "", propertyTags,
      formatLabel: `${FORMATS[source.format].label} ${FORMATS[source.format].size}, ${slides.length} ${slides.length === 1 ? "slajd" : "slajdy"}`,
      direction: { label: d.label, brief: d.brief, tags: [...d.tags] }, process: { type: "creative_variants", id: setId },
    });
    const withCopy = slides.map((s, i) => ({ ...s, texts: { ...s.texts, ...Object.fromEntries(Object.entries(copy.slides[i] ?? {}).filter(([, v]) => v)) } }));
    const design = graphicDesignSchema.parse({
      ...source, template: choice.template, colors: {}, headingFont: null, bodyFont: null, showLogo: true, labelVisualizations: true,
      slides: applyFactTexts(withCopy, factTexts(property, brand)), caption: copy.caption,
    });
    const title = `Wariant ${d.label.toLowerCase()} · ${FORMATS[source.format].label}${property ? ` · ${property.title}` : ""}`.slice(0, 200);
    const { data, error } = await ctx.supabase.from("content_items").insert({
      workspace_id: ctx.workspace.id, property_id: source.propertyId, kind: "graphic", content_type: `graphic_${source.format}`, title, platform: "Instagram",
      params: { format: source.format, template: choice.template, variantOf: sourceId, variantSet: setId, direction: dir, reasons: choice.reasons } as unknown as Json,
      created_by: ctx.userId, updated_by: ctx.userId, current_version: 0,
    }).select("id").single();
    if (error || !data) throw dbError(error);
    await addVersion(ctx, data.id, design, "ai_generate", { operation: `Wariant kreatywny: ${d.label}`.slice(0, 60), skills: copy.skills, model: copy.model, quality: { warnings: copy.warnings } });
    return { id: data.id, direction: dir, template: choice.template, reasons: choice.reasons };
  }));

  const items: VariantResult["items"] = [];
  const failed: VariantResult["failed"] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(r.value);
    else failed.push({ direction: plans[i]!.dir, error: r.reason instanceof Error ? r.reason.message : "Błąd" });
  });
  if (!items.length) throw new AppError(failed[0]?.error ?? "Nie udało się przygotować wariantów.", "variants_failed", 502);
  return { setId, items, failed };
}
