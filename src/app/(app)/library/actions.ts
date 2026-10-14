"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkManualEdit } from "@/core/marketing-engine/pipeline";
import { variantSchema } from "@/core/marketing-engine/schemas";
import type { TextBody } from "@/core/marketing-engine/request";
import { loadBrandKit } from "@/lib/ai";
import { addVersion, buildTaskInput, loadCurrentBody } from "@/lib/content";
import { getStorage } from "@/lib/storage";
import { itemHref } from "@/lib/routes";
import { authorize } from "@/lib/session";
import { AppError, dbError, toActionError, type ActionResult } from "@/lib/errors";
import type { QualityReport } from "@/core/marketing-engine/schemas";
import { candidatesFromEdit, diffVariant, type Candidate } from "@/core/brand-memory/learn";
import { memoryEnabled, recordFeedback } from "@/lib/brand-memory/service";

const id = z.uuid();

export async function saveManualEdit(itemId: string, variantId: string, variant: unknown): Promise<ActionResult<{ quality: QualityReport; remember: Candidate[] }>> {
  try {
    const ctx = await authorize("editor");
    const v = variantSchema.safeParse(variant);
    if (!id.safeParse(itemId).success || !v.success) return { ok: false, error: "Nieprawidłowe dane materiału." };
    const { body } = await loadCurrentBody<TextBody>(ctx, itemId);
    if (!body.variants.some((x) => x.id === variantId)) throw new AppError("Nie znaleziono wariantu.", "not_found", 404);
    const brand = await loadBrandKit(ctx);
    const input = await buildTaskInput(ctx, body.request, brand).catch(() => null);
    const checked = input ? checkManualEdit({ brand }, input, v.data) : null;
    const next: TextBody = {
      ...body,
      selected: variantId,
      variants: body.variants.map((x) => (x.id === variantId ? { ...x, variant: checked?.variant ?? v.data, quality: checked?.quality ?? x.quality, origin: "manual" as const, createdAt: new Date().toISOString(), changeSummary: "Edycja ręczna" } : x)),
    };
    await addVersion(ctx, itemId, next, "manual", { operation: "Edycja ręczna" });
    // Brand Memory: the decision is recorded; what to remember is offered, never assumed.
    const prev = body.variants.find((x) => x.id === variantId)!.variant;
    const diff = diffVariant(prev, v.data);
    let remember: Candidate[] = [];
    if (diff.cta || diff.headline || diff.removed.length) {
      await recordFeedback(ctx, { kind: "content_edited", subjectType: "content_item", subjectId: itemId, data: { contentType: body.request.contentType, platform: body.request.platform, headline: diff.headline ?? null, cta: diff.cta ?? null, removed: diff.removed } });
      if (await memoryEnabled(ctx)) remember = candidatesFromEdit(diff);
    }
    revalidatePath(`/studio/${itemId}`);
    return { ok: true, data: { quality: (checked?.quality ?? body.variants.find((x) => x.id === variantId)!.quality) as QualityReport, remember }, message: "Zapisano nową wersję" };
  } catch (error) {
    return toActionError(error);
  }
}

async function recordAccepted(ctx: Awaited<ReturnType<typeof authorize>>, itemId: string) {
  const { body } = await loadCurrentBody<TextBody>(ctx, itemId).catch(() => ({ body: null }));
  const sel = body?.variants.find((v) => v.id === body.selected)?.variant;
  if (!body || !sel) return;
  const excerpt = sel.sections.map((s) => s.content).join(" ").slice(0, 400);
  await recordFeedback(ctx, { kind: "content_accepted", subjectType: "content_item", subjectId: itemId, data: { contentType: body.request.contentType, platform: body.request.platform, headline: sel.headline.slice(0, 200), hook: sel.hook.slice(0, 300), cta: sel.cta.slice(0, 200), excerpt, angle: sel.angle } });
}

export async function selectVariant(itemId: string, variantId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("editor");
    const { body } = await loadCurrentBody<TextBody>(ctx, itemId);
    if (body.selected === variantId || !body.variants.some((v) => v.id === variantId)) return { ok: true, data: undefined };
    await addVersion(ctx, itemId, { ...body, selected: variantId }, "manual", { operation: "Wybór wariantu" });
    const chosen = body.variants.find((v) => v.id === variantId)!;
    await recordFeedback(ctx, { kind: "variant_selected", subjectType: "content_item", subjectId: itemId, data: { angle: chosen.variant.angle, of: body.variants.length, contentType: body.request.contentType } });
    revalidatePath(`/studio/${itemId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeVariant(itemId: string, variantId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("editor");
    const { body } = await loadCurrentBody<TextBody>(ctx, itemId);
    if (body.variants.length <= 1) throw new AppError("Materiał musi mieć co najmniej jeden wariant.", "last_variant");
    const variants = body.variants.filter((v) => v.id !== variantId);
    const rejected = body.variants.find((v) => v.id === variantId);
    await addVersion(ctx, itemId, { ...body, variants, selected: body.selected === variantId ? variants[0]!.id : body.selected }, "manual", { operation: "Usunięcie wariantu" });
    if (rejected) await recordFeedback(ctx, { kind: "variant_rejected", subjectType: "content_item", subjectId: itemId, data: { angle: rejected.variant.angle, headline: rejected.variant.headline, contentType: body.request.contentType } });
    revalidatePath(`/studio/${itemId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateItemMeta(itemId: string, patch: { title?: string; status?: "draft" | "review" | "ready" }): Promise<ActionResult> {
  try {
    const ctx = await authorize("editor");
    const parsed = z.object({ title: z.string().trim().min(1).max(200).optional(), status: z.enum(["draft", "review", "ready"]).optional() }).safeParse(patch);
    if (!id.safeParse(itemId).success || !parsed.success) return { ok: false, error: "Nieprawidłowe dane." };
    const { data: item } = await ctx.supabase.from("content_items").select("status, kind").eq("id", itemId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    const { error } = await ctx.supabase.from("content_items").update({ ...parsed.data, updated_by: ctx.userId }).eq("id", itemId).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error);
    // Marking a text as ready = an accepted example of the office's style (used selectively as a style sample).
    if (parsed.data.status === "ready" && item && item.status !== "ready" && item.kind === "text") await recordAccepted(ctx, itemId);
    revalidatePath("/library");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** The user checked an outdated material (e.g. after a price change) and confirms it is still correct. */
export async function markChecked(itemId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("editor");
    if (!id.safeParse(itemId).success) return { ok: false, error: "Nieprawidłowe dane." };
    const { error } = await ctx.supabase.from("content_items").update({ stale_reason: null, stale_since: null, updated_by: ctx.userId }).eq("id", itemId).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error);
    revalidatePath("/library");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function restoreVersion(itemId: string, version: number): Promise<ActionResult> {
  try {
    const ctx = await authorize("editor");
    if (!Number.isInteger(version) || version < 1) throw new AppError("Nieprawidłowy numer wersji.", "bad_request");
    const { data: v } = await ctx.supabase.from("content_versions").select("body, version").eq("item_id", itemId).eq("workspace_id", ctx.workspace.id).eq("version", version).maybeSingle();
    if (!v) throw new AppError("Nie znaleziono wersji.", "not_found", 404);
    await addVersion(ctx, itemId, v.body as Record<string, unknown>, "manual", { operation: `Przywrócenie wersji ${version}` });
    revalidatePath(`/studio/${itemId}`);
    revalidatePath(`/graphics/${itemId}`);
    return { ok: true, data: undefined, message: `Przywrócono wersję ${version} jako nową wersję.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateItem(itemId: string): Promise<ActionResult> {
  let newId: string;
  let kind: string;
  try {
    const ctx = await authorize("editor");
    const { item, body } = await loadCurrentBody<Record<string, unknown>>(ctx, itemId);
    const { data, error } = await ctx.supabase
      .from("content_items")
      .insert({ workspace_id: ctx.workspace.id, property_id: item.property_id, kind: item.kind, content_type: item.content_type, title: `${item.title} (kopia)`.slice(0, 200), platform: item.platform, params: item.params, status: "draft", created_by: ctx.userId, updated_by: ctx.userId, current_version: 0 })
      .select("id")
      .single();
    if (error || !data) throw dbError(error);
    await addVersion(ctx, data.id, body, "duplicate", { operation: "Duplikat" });
    newId = data.id;
    kind = item.kind;
    revalidatePath("/library");
  } catch (error) {
    return toActionError(error);
  }
  redirect(itemHref({ kind, id: newId }));
}

export async function deleteItem(itemId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("editor");
    // Rendered MP4s and posters live in storage; collect them before the rows cascade away.
    const { data: rendered } = await ctx.supabase.from("rendered_files").select("storage_path, meta").eq("content_item_id", itemId).eq("workspace_id", ctx.workspace.id);
    const { error } = await ctx.supabase.from("content_items").delete().eq("id", itemId).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error);
    const keys = (rendered ?? []).flatMap((r) => [r.storage_path, (r.meta as { poster?: string } | null)?.poster].filter((k): k is string => !!k));
    if (keys.length) await getStorage(ctx.supabase).remove(keys).catch(() => {});
    revalidatePath("/library");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
