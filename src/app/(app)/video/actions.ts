"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GOALS, type Goal } from "@/core/marketing-engine/taxonomy";
import { VIDEO_STYLE_IDS, videoDesignSchema } from "@/core/video/model";
import { guardAiUsage } from "@/lib/ai";
import { addVersion, loadCurrentBody } from "@/lib/content";
import { AppError, dbError, toActionError, type ActionResult } from "@/lib/errors";
import { enqueueJobs, getRenderQuota } from "@/lib/jobs/queue";
import { authorize } from "@/lib/session";
import { initialVideoDesign, loadVideoProperty, writeScript } from "@/lib/video";
import { assertActivePlan } from "@/lib/billing/usage";

const createSchema = z.object({
  propertyId: z.uuid(),
  style: z.enum(VIDEO_STYLE_IDS),
  length: z.union([z.literal(10), z.literal(15), z.literal(20), z.literal(30)]),
  photoIds: z.array(z.uuid()).max(6).default([]),
  goal: z.string().optional(),
  instructions: z.string().max(600).default(""),
});

/** Wizard: photos + style + length → new video with an AI script (waiting for approval). */
export async function createVideo(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize("editor");
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Wybierz nieruchomość, styl i długość filmu." };
    const o = parsed.data;
    const goal: Goal = o.goal && o.goal in GOALS ? (o.goal as Goal) : "sales";
    await guardAiUsage(ctx, "generate");
    const { property, photos } = await loadVideoProperty(ctx, o.propertyId);
    const unknownPhoto = o.photoIds.find((id) => !photos.some((p) => p.id === id));
    if (unknownPhoto) throw new AppError("Wybrane zdjęcie nie należy do tej nieruchomości.", "bad_photo");
    const base = await initialVideoDesign(ctx, { propertyId: o.propertyId, style: o.style, length: o.length, photoIds: o.photoIds });
    const design = await writeScript(ctx, base, { property, photos, goal, instructions: o.instructions });
    const { data: item, error } = await ctx.supabase
      .from("content_items")
      .insert({ workspace_id: ctx.workspace.id, property_id: o.propertyId, kind: "video", content_type: "video_reel", title: `Reels · ${property.title}`.slice(0, 200), platform: "Instagram / TikTok", params: { style: o.style, length: o.length }, created_by: ctx.userId, updated_by: ctx.userId, current_version: 0 })
      .select("id")
      .single();
    if (error || !item) throw dbError(error, "Nie udało się zapisać wideo.");
    try {
      await addVersion(ctx, item.id, design as unknown as Record<string, unknown>, "ai_generate", { operation: "Scenariusz AI" });
    } catch (e) {
      await ctx.supabase.from("content_items").delete().eq("id", item.id);
      throw e;
    }
    revalidatePath("/video");
    return { ok: true, data: { id: item.id } };
  } catch (error) {
    return toActionError(error);
  }
}

/** New AI script for the current photos/order (texts only). Saved as a new version. */
export async function rewriteScript(itemId: string, design: unknown, instructions: string): Promise<ActionResult<{ design: unknown; version: number }>> {
  try {
    const ctx = await authorize("editor");
    const parsed = videoDesignSchema.safeParse(design);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Nieprawidłowy projekt wideo." };
    const { item } = await loadCurrentBody(ctx, itemId);
    if (item.kind !== "video") throw new AppError("To nie jest wideo.", "bad_kind");
    await guardAiUsage(ctx, "generate");
    const { property, photos } = await loadVideoProperty(ctx, parsed.data.propertyId);
    const next = await writeScript(ctx, parsed.data, { property, photos, instructions: instructions.slice(0, 600) });
    const version = await addVersion(ctx, itemId, next as unknown as Record<string, unknown>, "ai_refine", { operation: "Nowy scenariusz AI" });
    revalidatePath(`/video/${itemId}`);
    return { ok: true, data: { design: next, version: version ?? 0 } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveVideo(itemId: string, design: unknown, operation?: string): Promise<ActionResult<{ version: number }>> {
  try {
    const ctx = await authorize("editor");
    const parsed = videoDesignSchema.safeParse(design);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Nieprawidłowy projekt wideo." };
    const { item } = await loadCurrentBody(ctx, itemId);
    if (item.kind !== "video") throw new AppError("To nie jest wideo.", "bad_kind");
    const { photos } = await loadVideoProperty(ctx, parsed.data.propertyId);
    if (parsed.data.scenes.some((s) => !photos.some((p) => p.id === s.photoId))) throw new AppError("Scena używa zdjęcia spoza tej oferty.", "bad_photo");
    if (parsed.data.musicAssetId) {
      const { data: m } = await ctx.supabase.from("media_assets").select("id").eq("id", parsed.data.musicAssetId).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (!m) throw new AppError("Wybrany utwór nie istnieje w bibliotece biura.", "bad_music");
    }
    const version = await addVersion(ctx, itemId, parsed.data as unknown as Record<string, unknown>, "manual", { operation: (operation ?? "Edycja wideo").slice(0, 80) });
    revalidatePath(`/video/${itemId}`);
    revalidatePath("/video");
    return { ok: true, data: { version: version ?? 0 } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Queues an MP4 render of the saved, approved version (monthly render limit applies). */
export async function renderVideo(itemId: string): Promise<ActionResult<{ jobId: string }>> {
  try {
    const ctx = await authorize("editor");
    const { item, body } = await loadCurrentBody(ctx, itemId);
    if (item.kind !== "video") throw new AppError("To nie jest wideo.", "bad_kind");
    const parsed = videoDesignSchema.safeParse(body);
    if (!parsed.success) throw new AppError("Projekt wideo jest niekompletny. Zapisz go ponownie.", "bad_design");
    if (!parsed.data.scriptApproved) throw new AppError("Najpierw zatwierdź scenariusz.", "not_approved", 409);
    await assertActivePlan(ctx);
    const quota = await getRenderQuota(ctx);
    if (quota.used >= quota.limit) throw new AppError(`Wykorzystano miesięczny limit renderów wideo (${quota.limit}). Limit odnowi się na początku miesiąca.`, "render_quota", 402);
    const [job] = await enqueueJobs(ctx, [{ kind: "video_render", label: `Render MP4 · ${item.title}`, contentItemId: item.id, dedupeKey: `video:${item.id}`, payload: { version: item.current_version } }]);
    revalidatePath(`/video/${itemId}`);
    return { ok: true, data: { jobId: job!.id } };
  } catch (error) {
    return toActionError(error);
  }
}
