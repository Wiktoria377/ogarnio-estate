"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { propertyFormSchema } from "@/verticals/real-estate/property";
import { authorizePerm, type WorkspaceContext } from "@/lib/session";
import { can, canEditProperty } from "@/core/auth/permissions";
import { getStorage } from "@/lib/storage";
import { AppError, dbError, toActionError, type ActionResult } from "@/lib/errors";
import { fieldErrors } from "@/lib/zod-form";
import { analyzePropertyPhotos } from "@/lib/creative/photos";

/**
 * Loads an offer and checks the caller may edit it: owner/admin edit any offer,
 * agents only those assigned to them or created by them, marketing and viewers
 * none. The same rule is enforced by RLS (can_edit_property).
 */
async function requireEditableProperty(propertyId: string): Promise<WorkspaceContext> {
  const ctx = await authorizePerm("property.edit_assigned");
  const { data } = await ctx.supabase.from("properties").select("agent_id, created_by").eq("id", propertyId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) throw new AppError("Nie znaleziono nieruchomości.", "not_found", 404);
  if (!canEditProperty(ctx.role, ctx.userId, data)) throw new AppError("Ta oferta jest przypisana innemu agentowi. Edytować ją może agent prowadzący, właściciel lub administrator.", "forbidden", 403);
  return ctx;
}

export async function saveProperty(id: string | null, input: unknown, opts?: { onboarding?: boolean }): Promise<ActionResult<{ id: string }>> {
  let savedId: string;
  try {
    const ctx = id ? await requireEditableProperty(id) : await authorizePerm("property.create");
    const parsed = propertyFormSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Popraw zaznaczone pola.", fieldErrors: fieldErrors(parsed.error) };
    // Only owner/admin choose the agent; an agent's own offers stay with them.
    if (!can(ctx.role, "property.edit_any")) {
      if (id) delete (parsed.data as { agent_id?: unknown }).agent_id;
      else parsed.data.agent_id = ctx.userId;
    }
    if (id) {
      const { error } = await ctx.supabase.from("properties").update(parsed.data).eq("id", id).eq("workspace_id", ctx.workspace.id);
      if (error) throw dbError(error);
      savedId = id;
    } else {
      const { data, error } = await ctx.supabase
        .from("properties")
        .insert({ ...parsed.data, workspace_id: ctx.workspace.id, created_by: ctx.userId })
        .select("id")
        .single();
      if (error || !data) throw dbError(error);
      savedId = data.id;
    }
    revalidatePath("/properties");
  } catch (error) {
    return toActionError(error);
  }
  redirect(`/properties/${savedId}${id ? "?saved=1" : opts?.onboarding ? "?created=1&onboarding=1" : "?created=1"}`);
}

export async function deleteProperty(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireEditableProperty(id);
    const { data: photos } = await ctx.supabase.from("property_photos").select("storage_path").eq("property_id", id).eq("workspace_id", ctx.workspace.id);
    const { data: deleted, error } = await ctx.supabase.from("properties").delete().eq("id", id).eq("workspace_id", ctx.workspace.id).select("id");
    if (error) throw dbError(error);
    if (!deleted?.length) throw new AppError("Nie znaleziono nieruchomości lub nie masz uprawnień do jej usunięcia.", "not_found", 404);
    if (photos?.length) await getStorage(ctx.supabase).remove(photos.map((p) => p.storage_path)).catch((e) => console.error("photo cleanup", e));
    revalidatePath("/properties");
  } catch (error) {
    return toActionError(error);
  }
  redirect("/properties?deleted=1");
}

export async function deletePhoto(photoId: string): Promise<ActionResult> {
  try {
    const ctx = await photoCtx(photoId);
    const { data, error } = await ctx.supabase.from("property_photos").delete().eq("id", photoId).eq("workspace_id", ctx.workspace.id).select("storage_path, property_id").maybeSingle();
    if (error) throw dbError(error);
    if (data) {
      await getStorage(ctx.supabase).remove([data.storage_path]);
      revalidatePath(`/properties/${data.property_id}`);
    }
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function reorderPhotos(propertyId: string, ids: string[]): Promise<ActionResult> {
  try {
    const ctx = await requireEditableProperty(propertyId);
    const parsed = z.array(z.uuid()).max(40).safeParse(ids);
    if (!parsed.success) return { ok: false, error: "Nieprawidłowa kolejność." };
    const { error } = await ctx.supabase.rpc("reorder_property_photos", { p_property: propertyId, p_ids: parsed.data });
    if (error) throw dbError(error);
    revalidatePath(`/properties/${propertyId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updatePhoto(photoId: string, patch: { is_visualization?: boolean; caption?: string | null }): Promise<ActionResult> {
  try {
    const ctx = await photoCtx(photoId);
    const parsed = z.object({ is_visualization: z.boolean().optional(), caption: z.string().trim().max(200).nullable().optional() }).safeParse(patch);
    if (!parsed.success) return { ok: false, error: "Nieprawidłowe dane." };
    const { error } = await ctx.supabase.from("property_photos").update(parsed.data).eq("id", photoId).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

async function photoCtx(photoId: string) {
  const ctx = await authorizePerm("property.edit_assigned");
  const { data } = await ctx.supabase.from("property_photos").select("property_id").eq("id", photoId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) throw new AppError("Nie znaleziono zdjęcia.", "not_found", 404);
  return requireEditableProperty(data.property_id);
}

/** Technical photo check (resolution, exposure, sharpness, crop risk) for photos without a current analysis. */
export async function analyzePhotos(propertyId: string): Promise<ActionResult<{ analyzed: number; failed: number }>> {
  try {
    const ctx = await requireEditableProperty(z.uuid().parse(propertyId));
    const r = await analyzePropertyPhotos(ctx, propertyId);
    revalidatePath(`/properties/${propertyId}`);
    return { ok: true, data: r, message: r.failed ? `Sprawdzono ${r.analyzed} zdjęć, ${r.failed} nie udało się odczytać.` : `Sprawdzono ${r.analyzed} zdjęć.` };
  } catch (error) {
    return toActionError(error);
  }
}
