"use server";
import { revalidatePath } from "next/cache";
import { decideRecommendation } from "@/lib/recommendations/service";
import { toActionError, type ActionResult } from "@/lib/errors";
import { authorizePerm } from "@/lib/session";

const MESSAGES = { dismissed: "Ukryto na 30 dni.", done: "Oznaczono jako zrobione. Jeśli dane się nie zmienią, rekomendacja wróci za 14 dni.", restore: "Rekomendacja znów jest widoczna." } as const;

export async function decide(key: string, action: "dismissed" | "done" | "restore"): Promise<ActionResult<null>> {
  try {
    const ctx = await authorizePerm("content.edit");
    if (!(action in MESSAGES)) throw new Error("bad action");
    await decideRecommendation(ctx, key, action);
    revalidatePath("/recommendations");
    revalidatePath("/dashboard");
    return { ok: true, data: null, message: MESSAGES[action] };
  } catch (error) {
    return toActionError(error);
  }
}
