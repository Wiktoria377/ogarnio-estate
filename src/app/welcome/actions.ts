"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { brandColorsSchema } from "@/core/brand/model";
import { authorizePerm } from "@/lib/session";
import { updateOnboarding, type OnboardingStepId } from "@/lib/onboarding";
import { dbError, toActionError, type ActionResult } from "@/lib/errors";
import type { Json } from "@/lib/supabase/database.types";

const OPTIONAL: OnboardingStepId[] = ["logo", "colors", "social"];

export async function skipStep(step: OnboardingStepId): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("workspace.settings");
    if (!OPTIONAL.includes(step)) return { ok: false, error: "Tego kroku nie można pominąć." };
    await updateOnboarding(ctx, { skip: step });
    revalidatePath("/welcome");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveColors(colors: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("brand.edit");
    const parsed = brandColorsSchema.safeParse(colors);
    if (!parsed.success) return { ok: false, error: "Podaj kolory w formacie #RRGGBB." };
    const { error } = await ctx.supabase.from("brand_profiles").update({ colors: parsed.data as unknown as Json, updated_by: ctx.userId }).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error);
    if (ctx.role === "owner") await updateOnboarding(ctx, { colors_saved: true });
    revalidatePath("/welcome");
    return { ok: true, data: undefined, message: "Zapisano kolory marki." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function confirmSaved(): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("workspace.settings");
    await updateOnboarding(ctx, { saved: true });
    revalidatePath("/welcome");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function startTrial(): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("workspace.settings");
    await updateOnboarding(ctx, { trial_accepted: true });
    revalidatePath("/welcome");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function pauseOnboarding() {
  const ctx = await authorizePerm("workspace.settings");
  await updateOnboarding(ctx, { paused_at: new Date().toISOString() });
  redirect("/dashboard");
}

export async function finishOnboarding() {
  const ctx = await authorizePerm("workspace.settings");
  const { state } = await updateOnboarding(ctx, {});
  redirect(state.current === null ? "/dashboard?onboarding=done" : "/welcome");
}
