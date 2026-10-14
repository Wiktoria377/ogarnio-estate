"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FORMATS, FORMAT_IDS, TEMPLATES, TEMPLATE_IDS, defaultSlides, graphicDesignSchema, savedTemplateSchema, slidesFromSaved, toSavedTemplate } from "@/core/graphics/design";
import { loadBrandKit } from "@/lib/ai";
import { addVersion, loadCurrentBody } from "@/lib/content";
import { authorize } from "@/lib/session";
import { recordFeedback } from "@/lib/brand-memory/service";
import { AppError, dbError, toActionError, type ActionResult } from "@/lib/errors";
import { applyFactTexts, factTexts } from "@/verticals/real-estate/graphics";

export async function createGraphic(input: { propertyId: string | null; format: string; template: string; savedTemplateId?: string | null }): Promise<ActionResult> {
  let id: string;
  try {
    const ctx = await authorize("editor");
    const parsed = z.object({ propertyId: z.uuid().nullable(), format: z.enum(FORMAT_IDS), template: z.enum(TEMPLATE_IDS), savedTemplateId: z.uuid().nullish() }).safeParse(input);
    if (!parsed.success) return { ok: false, error: "Wybierz format i szablon." };
    const { propertyId, savedTemplateId } = parsed.data;
    let { format, template } = parsed.data;
    let saved = null;
    let savedName = "";
    if (savedTemplateId) {
      const { data: row } = await ctx.supabase.from("design_templates").select("*").eq("id", savedTemplateId).eq("workspace_id", ctx.workspace.id).maybeSingle();
      const look = row ? savedTemplateSchema.safeParse(row.design) : null;
      if (!row || !look?.success) throw new AppError("Nie znaleziono szablonu biura.", "not_found", 404);
      saved = look.data;
      savedName = row.name;
      format = z.enum(FORMAT_IDS).catch(format).parse(row.format);
      template = saved.template;
    }
    const brand = await loadBrandKit(ctx);
    let property = null;
    let photoIds: string[] = [];
    if (propertyId) {
      const { data } = await ctx.supabase.from("properties").select("*").eq("id", propertyId).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (!data) throw new AppError("Nie znaleziono nieruchomości.", "not_found", 404);
      property = data;
      const { data: ph } = await ctx.supabase.from("property_photos").select("id").eq("property_id", propertyId).order("position").limit(10);
      photoIds = (ph ?? []).map((p) => p.id);
    }
    const facts = factTexts(property, brand);
    const design = saved
      ? graphicDesignSchema.parse({ format, template, propertyId, colors: saved.colors, headingFont: saved.headingFont, bodyFont: saved.bodyFont, showLogo: saved.showLogo, labelVisualizations: saved.labelVisualizations, slides: applyFactTexts(slidesFromSaved(saved, photoIds), facts) })
      : graphicDesignSchema.parse({ format, template, propertyId, slides: applyFactTexts(defaultSlides(format, photoIds), facts) });
    const title = `${FORMATS[format].label} · ${savedName || TEMPLATES[template].label}${property ? ` · ${property.title}` : ""}`.slice(0, 200);
    const { data, error } = await ctx.supabase
      .from("content_items")
      .insert({ workspace_id: ctx.workspace.id, property_id: propertyId, kind: "graphic", content_type: `graphic_${format}`, title, platform: "Instagram", params: { format, template }, created_by: ctx.userId, updated_by: ctx.userId, current_version: 0 })
      .select("id")
      .single();
    if (error || !data) throw dbError(error);
    await addVersion(ctx, data.id, design, "template", { operation: saved ? `Z szablonu biura „${savedName}”`.slice(0, 60) : "Nowa grafika z szablonu" });
    id = data.id;
    if (!saved) await recordFeedback(ctx, { kind: "graphic_template", subjectType: "graphic", subjectId: data.id, data: { template, templateLabel: TEMPLATES[template].label, format } });
    revalidatePath("/graphics");
  } catch (error) {
    return toActionError(error);
  }
  redirect(`/graphics/${id}`);
}

export async function saveGraphic(itemId: string, design: unknown, operation = "Edycja grafiki"): Promise<ActionResult<{ version: number }>> {
  try {
    const ctx = await authorize("editor");
    const parsed = graphicDesignSchema.safeParse(design);
    if (!parsed.success) return { ok: false, error: "Projekt zawiera nieprawidłowe dane." };
    const { item, body: before } = await loadCurrentBody<{ colors?: Record<string, string>; template?: string }>(ctx, itemId);
    if (item.kind !== "graphic") throw new AppError("To nie jest grafika.", "bad_kind");
    const version = await addVersion(ctx, itemId, parsed.data, "manual", { operation: operation.slice(0, 60) });
    // Brand Memory: colours set by hand in this edit (repeated choices become suggestions).
    const changed = Object.entries(parsed.data.colors ?? {}).filter(([k, v]) => v && before?.colors?.[k] !== v).map(([, v]) => String(v).toUpperCase());
    if (changed.length || (before?.template && before.template !== parsed.data.template)) {
      await recordFeedback(ctx, { kind: "graphic_edited", subjectType: "graphic", subjectId: itemId, data: { colors: [...new Set(changed)], template: parsed.data.template, templateChanged: before?.template !== parsed.data.template } });
    }
    await ctx.supabase.from("content_items").update({ params: { format: parsed.data.format, template: parsed.data.template }, content_type: `graphic_${parsed.data.format}` }).eq("id", itemId);
    revalidatePath(`/graphics/${itemId}`);
    revalidatePath("/library");
    return { ok: true, data: { version: version ?? 0 }, message: "Zapisano grafikę" };
  } catch (error) {
    return toActionError(error);
  }
}

/** Saves the look and layout of a design (no texts, photos or facts) as an office template. */
export async function saveDesignTemplate(name: string, design: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize("editor");
    const n = z.string().trim().min(2, "Nazwa musi mieć co najmniej 2 znaki.").max(80).safeParse(name);
    if (!n.success) return { ok: false, error: n.error.issues[0]?.message ?? "Podaj nazwę szablonu." };
    const d = graphicDesignSchema.safeParse(design);
    if (!d.success) return { ok: false, error: "Projekt zawiera nieprawidłowe dane." };
    const { count } = await ctx.supabase.from("design_templates").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
    if ((count ?? 0) >= 60) return { ok: false, error: "Biuro ma już 60 szablonów. Usuń nieużywane, aby dodać nowy." };
    const { data, error } = await ctx.supabase
      .from("design_templates")
      .insert({ workspace_id: ctx.workspace.id, name: n.data, base_template: d.data.template, format: d.data.format, design: toSavedTemplate(d.data), created_by: ctx.userId })
      .select("id")
      .single();
    if (error || !data) throw dbError(error);
    revalidatePath("/graphics/new");
    return { ok: true, data: { id: data.id }, message: `Zapisano szablon „${n.data}”` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteDesignTemplate(id: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("editor");
    if (!z.uuid().safeParse(id).success) return { ok: false, error: "Nieprawidłowy szablon." };
    const { error } = await ctx.supabase.from("design_templates").delete().eq("id", id).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error);
    revalidatePath("/graphics/new");
    return { ok: true, data: undefined, message: "Usunięto szablon" };
  } catch (error) {
    return toActionError(error);
  }
}
