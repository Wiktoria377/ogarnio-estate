"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WORKSPACE_COOKIE, getWorkspaceContext, requireUser } from "@/lib/session";
import { dbError, type ActionResult } from "@/lib/errors";
import { fieldErrors } from "@/lib/zod-form";

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

export async function createWorkspace(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = z.object({ name: z.string().trim().min(2, "Nazwa musi mieć co najmniej 2 znaki").max(120) }).safeParse({ name: form.get("name") });
  if (!parsed.success) return { ok: false, error: "Popraw nazwę biura.", fieldErrors: fieldErrors(parsed.error) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_workspace", { p_name: parsed.data.name });
  if (error || !data) return { ok: false, error: dbError(error, "Nie udało się utworzyć biura.").message };
  (await cookies()).set(WORKSPACE_COOKIE, data, cookieOpts);
  redirect("/welcome");
}

/** Switches the active workspace; membership is verified before setting the cookie. */
export async function switchWorkspace(workspaceId: string) {
  const ctx = await getWorkspaceContext();
  if (!ctx || !ctx.memberships.some((m) => m.workspace.id === workspaceId)) return;
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, cookieOpts);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
