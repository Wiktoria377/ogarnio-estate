"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/observability";
import { authorizePerm } from "@/lib/session";
import { checkConnection, connectSelected, disconnect, startOAuth } from "@/lib/social/connections";
import { SOCIAL_STATUS } from "@/core/publishing/platforms";

/** Starts the official OAuth flow (POST via server action; the redirect goes to the platform). */
export async function startConnect(form: FormData) {
  let url: string;
  try {
    const provider = z.enum(["meta", "linkedin", "tiktok"]).parse(form.get("provider"));
    const ctx = await authorizePerm("social.manage");
    await rateLimit(`oauth:${ctx.userId}`, 20, 600, "Za dużo prób łączenia kont. Spróbuj za kilka minut.");
    url = await startOAuth(ctx, provider);
  } catch (error) {
    const msg = error instanceof AppError ? error.message : "Nie udało się rozpocząć łączenia konta.";
    redirect(`/connections?error=${encodeURIComponent(msg)}`);
  }
  redirect(url);
}

export async function connectAccounts(grantId: string, keys: string[]): Promise<ActionResult<{ count: number }>> {
  try {
    const ctx = await authorizePerm("social.manage");
    const parsed = z.object({ grantId: z.uuid(), keys: z.array(z.string().max(200)).min(1).max(50) }).safeParse({ grantId, keys });
    if (!parsed.success) return { ok: false, error: "Wybierz co najmniej jedno konto." };
    const count = await connectSelected(ctx, parsed.data.grantId, parsed.data.keys);
    revalidatePath("/connections");
    return { ok: true, data: { count }, message: count === 1 ? "Połączono konto." : `Połączono konta: ${count}.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function disconnectAccount(id: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("social.manage");
    const name = await disconnect(ctx, z.uuid().parse(id));
    revalidatePath("/connections");
    return { ok: true, data: undefined, message: `Odłączono „${name}”. Zapisane tokeny zostały usunięte.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function recheckAccount(id: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("social.manage");
    await rateLimit(`social-check:${ctx.workspace.id}`, 30, 600);
    const r = await checkConnection(ctx, z.uuid().parse(id));
    revalidatePath("/connections");
    return { ok: true, data: undefined, message: `Status: ${SOCIAL_STATUS[r.status].label}${r.message ? `. ${r.message}` : ""}` };
  } catch (error) {
    return toActionError(error);
  }
}
