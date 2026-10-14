"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin/access";
import { budgetSchema, deleteRate, grantTrial, planSchema, rateSchema, setBudget, setRate, trialSchema, updatePlan } from "@/lib/admin/service";
import { toActionError, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/observability";

async function writer() {
  const a = await requirePlatformAdmin(true);
  await rateLimit(`admin:${a.userId}`, 60, 60, "Za dużo operacji administracyjnych w krótkim czasie.");
  return a;
}

export async function grantTrialAction(input: z.input<typeof trialSchema>): Promise<ActionResult<{ until: string }>> {
  try {
    const until = await grantTrial(await writer(), input);
    revalidatePath(`/admin/offices/${input.workspaceId}`);
    return { ok: true, data: { until }, message: "Przyznano okres próbny." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updatePlanAction(input: z.input<typeof planSchema>): Promise<ActionResult<{ changed: number }>> {
  try {
    const changed = await updatePlan(await writer(), input);
    revalidatePath("/admin/plans");
    return { ok: true, data: { changed }, message: changed ? `Zapisano zmiany (${changed}).` : "Brak zmian." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setRateAction(input: z.input<typeof rateSchema>): Promise<ActionResult> {
  try {
    await setRate(await writer(), input);
    revalidatePath("/admin/costs");
    return { ok: true, data: undefined, message: "Zapisano stawkę." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteRateAction(id: string): Promise<ActionResult> {
  try {
    await deleteRate(await writer(), id);
    revalidatePath("/admin/costs");
    return { ok: true, data: undefined, message: "Usunięto stawkę." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setBudgetAction(input: z.input<typeof budgetSchema>): Promise<ActionResult> {
  try {
    await setBudget(await writer(), input);
    revalidatePath("/admin/costs");
    return { ok: true, data: undefined, message: "Zapisano budżet." };
  } catch (error) {
    return toActionError(error);
  }
}
