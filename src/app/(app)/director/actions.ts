"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiErrorMessage } from "@/lib/ai";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { authorizePerm, getWorkspaceContext } from "@/lib/session";
import { deleteStrategy, generateStrategy, setStrategyStatus } from "@/lib/strategy/service";

const id = z.uuid();

/** „Zaproponuj mi strategię”. Model errors (no key, quota, limits) come back as readable messages. */
export async function proposeStrategy(input: unknown): Promise<ActionResult<{ id: string; warnings: number }>> {
  try {
    const ctx = await authorizePerm("content.edit");
    const s = await generateStrategy(ctx, input);
    revalidatePath("/director");
    return { ok: true, data: { id: s.id, warnings: s.warnings.length }, message: "Strategia gotowa. Sprawdź ją przed użyciem." };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };
    return { ok: false, error: aiErrorMessage(error) };
  }
}

export async function decideStrategy(strategyId: string, status: "draft" | "accepted" | "archived"): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("content.edit");
    await setStrategyStatus(ctx, id.parse(strategyId), z.enum(["draft", "accepted", "archived"]).parse(status));
    revalidatePath("/director");
    revalidatePath(`/director/${strategyId}`);
    return { ok: true, data: undefined, message: status === "accepted" ? "Strategia zaakceptowana." : status === "archived" ? "Strategia przeniesiona do archiwum." : "Przywrócono jako szkic." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeStrategy(strategyId: string): Promise<ActionResult> {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) throw new AppError("Sesja wygasła. Zaloguj się ponownie.", "unauthenticated", 401);
    await deleteStrategy(ctx, id.parse(strategyId));
    revalidatePath("/director");
    return { ok: true, data: undefined, message: "Usunięto strategię." };
  } catch (error) {
    return toActionError(error);
  }
}
