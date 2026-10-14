"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/observability";
import { requireWorkspace } from "@/lib/session";
import { assertActivePlan } from "@/lib/billing/usage";
import { approvePublication, cancelPublication, composePublications, confirmNotPublished, editPublication, requestApproval, retryPublication } from "@/lib/publishing/service";

/* Thin wrappers: permission checks live in the service (role matrix), so every
 * entry point (UI, planner, future API) enforces the same rules. */

const done = (message: string) => {
  revalidatePath("/publications");
  revalidatePath("/planner");
  return { ok: true as const, data: undefined, message };
};

export async function createPublications(input: unknown): Promise<ActionResult<{ entryId: string; ids: string[] }>> {
  try {
    const ctx = await requireWorkspace();
    await assertActivePlan(ctx);
    await rateLimit(`publish:${ctx.userId}`, 60, 600, "Za dużo operacji publikacji w krótkim czasie.");
    const r = await composePublications(ctx, input);
    revalidatePath("/publications");
    revalidatePath("/planner");
    const submit = (input as { submit?: string })?.submit;
    return { ok: true, data: r, message: submit === "approve" ? "Zatwierdzono i zaplanowano publikację." : submit === "draft" ? "Zapisano szkic publikacji." : "Wysłano do akceptacji." };
  } catch (error) {
    return toActionError(error);
  }
}

const id = z.uuid();

export async function approve(pubId: string): Promise<ActionResult> {
  try {
    const ctx = await requireWorkspace();
    await assertActivePlan(ctx);
    await approvePublication(ctx, id.parse(pubId));
    return done("Zatwierdzono. Publikacja jest w harmonogramie.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function submitForApproval(pubId: string): Promise<ActionResult> {
  try {
    await requestApproval(await requireWorkspace(), id.parse(pubId));
    return done("Wysłano do akceptacji.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancel(pubId: string): Promise<ActionResult> {
  try {
    await cancelPublication(await requireWorkspace(), id.parse(pubId));
    return done("Anulowano publikację.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function retry(pubId: string): Promise<ActionResult> {
  try {
    const ctx = await requireWorkspace();
    await assertActivePlan(ctx);
    await retryPublication(ctx, id.parse(pubId));
    return done("Publikacja wróciła do harmonogramu.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function confirmAbsent(pubId: string): Promise<ActionResult> {
  try {
    await confirmNotPublished(await requireWorkspace(), id.parse(pubId));
    return done("Zapisano. Możesz teraz ponowić publikację.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function edit(pubId: string, patch: unknown): Promise<ActionResult<{ backToDraft: boolean }>> {
  try {
    const r = await editPublication(await requireWorkspace(), id.parse(pubId), patch);
    revalidatePath("/publications");
    revalidatePath("/planner");
    return { ok: true, data: r, message: r.backToDraft ? "Zapisano. Treść się zmieniła, więc publikacja wymaga ponownej akceptacji." : "Zmieniono termin." };
  } catch (error) {
    return toActionError(error);
  }
}

export interface MaterialInfo {
  kind: "text" | "graphic" | "video" | "document";
  title: string;
  caption: string;
  slides: { index: number; width: number; height: number }[];
  hasVideo: boolean;
  video: { width: number | null; height: number | null; durationMs: number | null } | null;
  propertyId: string | null;
}

/** What a material can contribute to a post: caption text, graphic slides, rendered video. */
export async function loadMaterial(itemId: string): Promise<ActionResult<MaterialInfo>> {
  try {
    const ctx = await requireWorkspace();
    const { loadCurrentBody } = await import("@/lib/content");
    const { item, body } = await loadCurrentBody<Record<string, unknown>>(ctx, id.parse(itemId));
    let caption = "";
    let slides: MaterialInfo["slides"] = [];
    let video: MaterialInfo["video"] = null;
    if (item.kind === "text") {
      const { variantToText } = await import("@/core/marketing-engine/schemas");
      const b = body as unknown as import("@/core/marketing-engine/request").TextBody;
      const v = b.variants?.find((x) => x.id === b.selected) ?? b.variants?.[0];
      if (v) caption = variantToText(v.variant);
    } else if (item.kind === "graphic") {
      const { graphicDesignSchema, FORMATS } = await import("@/core/graphics/design");
      const d = graphicDesignSchema.parse(body);
      slides = d.slides.map((_, index) => ({ index, width: FORMATS[d.format].w, height: FORMATS[d.format].h }));
      const c = (d as { caption?: string }).caption;
      if (typeof c === "string") caption = c;
    } else if (item.kind === "video") {
      const { data: f } = await ctx.supabase.from("rendered_files").select("meta").eq("content_item_id", item.id).eq("kind", "video_mp4").order("version", { ascending: false }).limit(1).maybeSingle();
      if (f) {
        const m = (f.meta ?? {}) as { width?: number; height?: number; durationMs?: number };
        video = { width: m.width ?? null, height: m.height ?? null, durationMs: m.durationMs ?? null };
      }
      const s = (body as { script?: { caption?: string } }).script?.caption;
      if (typeof s === "string") caption = s;
    }
    return { ok: true, data: { kind: item.kind, title: item.title, caption, slides, hasVideo: !!video, video, propertyId: item.property_id } };
  } catch (error) {
    return toActionError(error);
  }
}
