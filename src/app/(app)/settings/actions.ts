"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, WORKSPACE_COOKIE, type WorkspaceContext } from "@/lib/session";
import { getStorage, listWorkspaceKeys } from "@/lib/storage";
import { serverEnv } from "@/lib/env";
import { AppError, dbError, toActionError, type ActionResult } from "@/lib/errors";
import { fieldErrors } from "@/lib/zod-form";

/** Re-checks the password without touching the session cookies. */
async function verifyPassword(email: string, password: string) {
  const env = serverEnv();
  const client = createPlainClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new AppError("Nieprawidłowe hasło.", "bad_password", 400);
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
}

export async function saveProfile(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const parsed = z.object({ fullName: z.string().trim().min(2, "Podaj imię i nazwisko").max(120) }).safeParse({ fullName: form.get("fullName") });
    if (!parsed.success) return { ok: false, error: "Popraw zaznaczone pola.", fieldErrors: fieldErrors(parsed.error) };
    const { error } = await ctx.supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", ctx.userId);
    if (error) throw dbError(error);
    await ctx.supabase.auth.updateUser({ data: { full_name: parsed.data.fullName } });
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Zapisano profil" };
  } catch (error) {
    return toActionError(error);
  }
}

export async function renameWorkspace(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const ctx = await authorize("admin");
    const parsed = z.object({ name: z.string().trim().min(2, "Nazwa musi mieć co najmniej 2 znaki").max(120) }).safeParse({ name: form.get("name") });
    if (!parsed.success) return { ok: false, error: "Popraw zaznaczone pola.", fieldErrors: fieldErrors(parsed.error) };
    const { error } = await ctx.supabase.from("workspaces").update({ name: parsed.data.name }).eq("id", ctx.workspace.id);
    if (error) throw dbError(error);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Zmieniono nazwę biura" };
  } catch (error) {
    return toActionError(error);
  }
}

const newPassword = z.string().min(10, "Hasło musi mieć co najmniej 10 znaków").max(72).regex(/[a-zA-Z]/, "Dodaj literę").regex(/[0-9]/, "Dodaj cyfrę");

export async function changePassword(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const parsed = z
      .object({ current: z.string().min(1, "Podaj obecne hasło"), password: newPassword, confirm: z.string() })
      .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Hasła nie są identyczne" })
      .safeParse({ current: form.get("current"), password: form.get("password"), confirm: form.get("confirm") });
    if (!parsed.success) return { ok: false, error: "Popraw zaznaczone pola.", fieldErrors: fieldErrors(parsed.error) };
    try {
      await verifyPassword(ctx.userEmail, parsed.data.current);
    } catch {
      return { ok: false, error: "Obecne hasło jest nieprawidłowe.", fieldErrors: { current: "Nieprawidłowe hasło" } };
    }
    const { error } = await ctx.supabase.auth.updateUser({ password: parsed.data.password });
    if (error) throw new AppError("Nie udało się zmienić hasła. Wybierz inne hasło.", "password_update");
    return { ok: true, data: undefined, message: "Zmieniono hasło" };
  } catch (error) {
    return toActionError(error);
  }
}

/** Removes a workspace with all its rows (FK cascade) and stored files. */
async function purgeWorkspace(ctx: WorkspaceContext, workspaceId: string) {
  const keys = await listWorkspaceKeys(ctx.supabase, workspaceId);
  const { error } = await ctx.supabase.from("workspaces").delete().eq("id", workspaceId);
  if (error) throw dbError(error, "Nie udało się usunąć biura.");
  // Files after rows: a failed file delete leaves orphans in a private bucket, never dangling rows.
  // The memberships are gone with the rows, so storage RLS would refuse the user's client:
  // remove files with the service role (keys were listed while the user was still a member).
  const storage = getStorage(createAdminClient() as unknown as WorkspaceContext["supabase"]);
  for (let i = 0; i < keys.length; i += 100) await storage.remove(keys.slice(i, i + 100)).catch((e) => console.error("[purge] file cleanup failed", workspaceId, e));
}

export async function deleteWorkspace(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const ctx = await authorize("admin");
    if (ctx.role !== "owner") throw new AppError("Biuro może usunąć tylko właściciel.", "forbidden", 403);
    if (String(form.get("confirm") ?? "").trim() !== ctx.workspace.name) return { ok: false, error: "Wpisz dokładną nazwę biura, aby potwierdzić.", fieldErrors: { confirm: "Nazwa się nie zgadza" } };
    await verifyPassword(ctx.userEmail, String(form.get("password") ?? ""));
    await purgeWorkspace(ctx, ctx.workspace.id);
    (await cookies()).delete(WORKSPACE_COOKIE);
  } catch (error) {
    if (error instanceof AppError && error.code === "bad_password") return { ok: false, error: "Nieprawidłowe hasło.", fieldErrors: { password: "Nieprawidłowe hasło" } };
    return toActionError(error);
  }
  redirect("/dashboard");
}

/**
 * RODO: deletes the account. Workspaces where the user is the only owner are
 * removed with all data and files; in shared workspaces the membership ends and
 * the office keeps its materials (authorship is cleared by ON DELETE SET NULL).
 */
export async function deleteAccount(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "USUŃ") return { ok: false, error: "Wpisz USUŃ, aby potwierdzić.", fieldErrors: { confirm: "Wpisz USUŃ" } };
    try {
      await verifyPassword(ctx.userEmail, String(form.get("password") ?? ""));
    } catch {
      return { ok: false, error: "Nieprawidłowe hasło.", fieldErrors: { password: "Nieprawidłowe hasło" } };
    }
    const admin = createAdminClient();
    const purge: string[] = [];
    for (const m of ctx.memberships.filter((x) => x.role === "owner")) {
      const { data: members } = await admin.from("workspace_members").select("user_id, role").eq("workspace_id", m.workspace.id).eq("status", "active");
      const otherOwners = (members ?? []).filter((o) => o.role === "owner" && o.user_id !== ctx.userId);
      const others = (members ?? []).filter((o) => o.user_id !== ctx.userId);
      if (otherOwners.length) continue;
      // Never wipe an office other people still work in: ownership must be handed over first.
      if (others.length) return { ok: false, error: `W biurze „${m.workspace.name}” pracują inne osoby. Przekaż własność biura (Ustawienia → Zespół) albo usuń najpierw członków zespołu.` };
      purge.push(m.workspace.id);
    }
    for (const ws of purge) await purgeWorkspace(ctx, ws);
    const { error } = await admin.auth.admin.deleteUser(ctx.userId);
    if (error) throw new AppError("Nie udało się usunąć konta. Spróbuj ponownie lub skontaktuj się z pomocą.", "delete_user", 500);
    const supabase = await createClient();
    await supabase.auth.signOut().catch(() => undefined);
    (await cookies()).delete(WORKSPACE_COOKIE);
  } catch (error) {
    return toActionError(error);
  }
  redirect("/login?notice=deleted");
}
