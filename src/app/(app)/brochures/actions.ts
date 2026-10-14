"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BROCHURE_VARIANTS, BROCHURE_VARIANT_IDS, brochureDesignSchema } from "@/core/brochures/model";
import { loadBrandKit } from "@/lib/ai";
import { brochureDefaults } from "@/lib/brochures";
import { addVersion, loadCurrentBody } from "@/lib/content";
import { authorize } from "@/lib/session";
import { AppError, dbError, toActionError, type ActionResult } from "@/lib/errors";

export async function createBrochure(input: { variant: string; propertyIds: string[] }): Promise<ActionResult> {
  let id: string;
  try {
    const ctx = await authorize("editor");
    const parsed = z.object({ variant: z.enum(BROCHURE_VARIANT_IDS), propertyIds: z.array(z.uuid()).min(1).max(12) }).safeParse(input);
    if (!parsed.success) return { ok: false, error: "Wybierz rodzaj broszury i nieruchomości." };
    const { variant, propertyIds } = parsed.data;
    const v = BROCHURE_VARIANTS[variant];
    if (propertyIds.length < v.min || propertyIds.length > v.max) return { ok: false, error: v.min === v.max ? `${v.label} obejmuje jedną nieruchomość.` : `${v.label}: wybierz od ${v.min} do ${v.max} nieruchomości.` };
    const { data: rows } = await ctx.supabase.from("properties").select("*").in("id", propertyIds).eq("workspace_id", ctx.workspace.id);
    if ((rows?.length ?? 0) !== propertyIds.length) throw new AppError("Nie znaleziono części nieruchomości.", "not_found", 404);
    const ordered = propertyIds.map((pid) => rows!.find((r) => r.id === pid)!);
    const design = brochureDefaults(variant, ordered, await loadBrandKit(ctx));
    const title = (variant === "catalog" ? `${v.label} · ${ordered.length} ofert` : `${v.label} · ${ordered[0]!.title}`).slice(0, 200);
    const { data, error } = await ctx.supabase
      .from("content_items")
      .insert({ workspace_id: ctx.workspace.id, property_id: variant === "catalog" ? null : ordered[0]!.id, kind: "document", content_type: `brochure_${variant}`, title, platform: "PDF", params: { variant }, created_by: ctx.userId, updated_by: ctx.userId, current_version: 0 })
      .select("id")
      .single();
    if (error || !data) throw dbError(error);
    await addVersion(ctx, data.id, design as unknown as Record<string, unknown>, "template", { operation: "Nowa broszura" });
    id = data.id;
    revalidatePath("/brochures");
  } catch (error) {
    return toActionError(error);
  }
  redirect(`/brochures/${id}`);
}

export async function saveBrochure(itemId: string, design: unknown): Promise<ActionResult<{ version: number }>> {
  try {
    const ctx = await authorize("editor");
    const parsed = brochureDesignSchema.safeParse(design);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Broszura zawiera nieprawidłowe dane." };
    const { item } = await loadCurrentBody(ctx, itemId);
    if (item.kind !== "document") throw new AppError("To nie jest broszura.", "bad_kind");
    const version = await addVersion(ctx, itemId, parsed.data as unknown as Record<string, unknown>, "manual", { operation: "Edycja broszury" });
    revalidatePath(`/brochures/${itemId}`);
    revalidatePath("/brochures");
    return { ok: true, data: { version: version ?? 0 }, message: "Zapisano broszurę" };
  } catch (error) {
    return toActionError(error);
  }
}
