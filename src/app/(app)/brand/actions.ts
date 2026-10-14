"use server";
import { revalidatePath } from "next/cache";
import { brandFormSchema } from "@/core/brand/model";
import { authorize } from "@/lib/session";
import { getStorage } from "@/lib/storage";
import { dbError, toActionError, type ActionResult } from "@/lib/errors";
import { fieldErrors } from "@/lib/zod-form";
import { recordVersion } from "@/lib/brand-intel/service";

export async function saveBrand(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("admin");
    const parsed = brandFormSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Popraw zaznaczone pola.", fieldErrors: fieldErrors(parsed.error) };
    const { error } = await ctx.supabase
      .from("brand_profiles")
      .update({ ...parsed.data, updated_by: ctx.userId })
      .eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error);
    await recordVersion(ctx, "Zmiana w Brand Studio");
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Zapisano markę. Nowe materiały będą jej używać." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBrandAsset(id: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("admin");
    const { data, error } = await ctx.supabase.from("brand_assets").delete().eq("id", id).eq("workspace_id", ctx.workspace.id).select("storage_path").maybeSingle();
    if (error) throw dbError(error);
    if (data) await getStorage(ctx.supabase).remove([data.storage_path]);
    revalidatePath("/brand");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
