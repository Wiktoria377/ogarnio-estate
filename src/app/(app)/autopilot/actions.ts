"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiErrorMessage } from "@/lib/ai";
import { archiveRun, createAutopilotRun, decideItem, generateRun, regenerateItem, scheduleItems } from "@/lib/autopilot/service";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { authorizePerm } from "@/lib/session";

const id = z.uuid();
const refresh = (runId?: string) => {
  revalidatePath("/autopilot");
  if (runId) revalidatePath(`/autopilot/${runId}`);
};

/** „Przygotuj mój marketing”: plan and queue (no AI cost yet). */
export async function planMarketing(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorizePerm("content.edit");
    const r = await createAutopilotRun(ctx, input);
    refresh();
    return { ok: true, data: r, message: "Plan gotowy. Sprawdź go i przygotuj materiały." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function prepareMaterials(runId: string): Promise<ActionResult<{ queued: number; skipped: number }>> {
  try {
    const ctx = await authorizePerm("content.edit");
    const r = await generateRun(ctx, id.parse(runId));
    refresh(runId);
    return { ok: true, data: r, message: r.skipped ? `Przygotowuję ${r.queued} materiałów. ${r.skipped} pozostaje do przygotowania (limit AI planu).` : `Przygotowuję ${r.queued} materiałów.` };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };
    return { ok: false, error: aiErrorMessage(error) };
  }
}

export async function regenerate(runId: string, itemId: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("content.edit");
    await regenerateItem(ctx, id.parse(itemId));
    refresh(runId);
    return { ok: true, data: undefined, message: "Przygotowuję nową wersję materiału." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function decide(runId: string, itemId: string, action: "accept" | "reject" | "restore"): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("content.edit");
    await decideItem(ctx, id.parse(itemId), z.enum(["accept", "reject", "restore"]).parse(action));
    refresh(runId);
    return { ok: true, data: undefined, message: action === "accept" ? "Zaakceptowano." : action === "reject" ? "Odrzucono." : "Przywrócono." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function schedule(runId: string, itemIds: string[]): Promise<ActionResult<{ scheduled: number; skipped: string[] }>> {
  try {
    const ctx = await authorizePerm("content.edit");
    const r = await scheduleItems(ctx, z.array(id).max(40).parse(itemIds));
    refresh(runId);
    revalidatePath("/planner");
    return { ok: true, data: r, message: r.scheduled ? `Dodano do planera: ${r.scheduled}. Publikacja wymaga osobnej akceptacji.` : "Nic nie dodano do planera." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function archive(runId: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("content.edit");
    await archiveRun(ctx, id.parse(runId));
    refresh(runId);
    return { ok: true, data: undefined, message: "Plan przeniesiony do archiwum." };
  } catch (error) {
    return toActionError(error);
  }
}
