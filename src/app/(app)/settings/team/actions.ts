"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assignableRoles, ROLE_LABELS, type Role } from "@/core/auth/permissions";
import { randomToken, sha256 } from "@/lib/crypto";
import { AppError, dbError, toActionError, type ActionResult } from "@/lib/errors";
import { sendMail } from "@/lib/mailer";
import { rateLimit } from "@/lib/observability";
import { authorizePerm, type WorkspaceContext } from "@/lib/session";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Team management. Every action checks the permission on the server
 * (team.manage = owner) and runs the write with the service role only after
 * that check, always filtered by the active office. Seat limits and the
 * last-owner rule are additionally enforced by database triggers.
 */

const inviteSchema = z.object({
  email: z.email("Podaj poprawny adres e-mail").max(254).transform((v) => v.trim().toLowerCase()),
  role: z.enum(["admin", "agent", "marketing", "viewer"]),
});

function inviteUrl(token: string) {
  return `${serverEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/invite/${token}`;
}

async function sendInvite(ctx: WorkspaceContext, email: string, role: Role, token: string) {
  return sendMail({
    to: email,
    subject: `Zaproszenie do biura ${ctx.workspace.name} w Ogarnio Estate`,
    paragraphs: [
      `${ctx.userName || ctx.userEmail} zaprasza Cię do biura „${ctx.workspace.name}” w Ogarnio Estate z rolą: ${ROLE_LABELS[role]}.`,
      "Zaproszenie jest ważne 7 dni. Jeśli nie masz konta, załóż je na ten sam adres e-mail.",
    ],
    action: { label: "Dołącz do biura", url: inviteUrl(token) },
    replyTo: ctx.userEmail || undefined,
  });
}

export async function inviteMember(_: ActionResult<{ link?: string }> | null, form: FormData): Promise<ActionResult<{ link?: string }>> {
  try {
    const ctx = await authorizePerm("team.manage");
    await rateLimit(`invite:${ctx.workspace.id}`, 20, 3600, "Za dużo zaproszeń w ciągu godziny. Spróbuj później.");
    const parsed = inviteSchema.safeParse({ email: form.get("email"), role: form.get("role") });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Popraw dane." };
    const { email, role } = parsed.data;
    if (!assignableRoles(ctx.role).includes(role)) throw new AppError("Nie możesz nadać tej roli.", "forbidden", 403);
    const admin = createAdminClient();
    // Already a member? (look up by e-mail through the auth admin API)
    const { data: members } = await admin.from("workspace_members").select("user_id, status").eq("workspace_id", ctx.workspace.id);
    for (const m of members ?? []) {
      const { data: u } = await admin.auth.admin.getUserById(m.user_id);
      if (u.user?.email?.toLowerCase() === email && m.status === "active") throw new AppError("Ta osoba już należy do biura.", "already_member", 409);
    }
    const token = randomToken(32);
    const { error } = await admin.from("workspace_invitations").insert({ workspace_id: ctx.workspace.id, email, role, token_hash: sha256(token), invited_by: ctx.userId });
    if (error?.code === "23505") throw new AppError("Ta osoba ma już aktywne zaproszenie. Wyślij je ponownie z listy poniżej.", "duplicate", 409);
    if (error) throw dbError(error, "Nie udało się utworzyć zaproszenia.");
    const sent = await sendInvite(ctx, email, role, token);
    revalidatePath("/settings/team");
    // Without SMTP the owner gets the link to pass on (shown once; only its hash is stored).
    return sent
      ? { ok: true, data: {}, message: `Wysłano zaproszenie do ${email}.` }
      : { ok: true, data: { link: inviteUrl(token) }, message: "Zaproszenie utworzone. Wysyłka e-maili nie jest skonfigurowana: przekaż link osobie zapraszanej." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resendInvitation(id: string): Promise<ActionResult<{ link?: string }>> {
  try {
    const ctx = await authorizePerm("team.manage");
    await rateLimit(`invite:${ctx.workspace.id}`, 20, 3600, "Za dużo zaproszeń w ciągu godziny. Spróbuj później.");
    const admin = createAdminClient();
    const { data: inv } = await admin.from("workspace_invitations").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).is("accepted_at", null).is("revoked_at", null).maybeSingle();
    if (!inv) throw new AppError("Nie znaleziono aktywnego zaproszenia.", "not_found", 404);
    // A new token invalidates the previous link.
    const token = randomToken(32);
    const { error } = await admin.from("workspace_invitations").update({ token_hash: sha256(token), expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(), last_sent_at: new Date().toISOString() }).eq("id", inv.id);
    if (error) throw dbError(error);
    const sent = await sendInvite(ctx, inv.email, inv.role as Role, token);
    revalidatePath("/settings/team");
    return sent ? { ok: true, data: {}, message: "Wysłano ponownie." } : { ok: true, data: { link: inviteUrl(token) }, message: "Nowy link zaproszenia (poprzedni przestał działać)." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function revokeInvitation(id: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("team.manage");
    const { data, error } = await createAdminClient().from("workspace_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", ctx.workspace.id).is("accepted_at", null).select("id");
    if (error) throw dbError(error);
    if (!data?.length) throw new AppError("Nie znaleziono zaproszenia.", "not_found", 404);
    revalidatePath("/settings/team");
    return { ok: true, data: undefined, message: "Zaproszenie anulowane." };
  } catch (error) {
    return toActionError(error);
  }
}

async function loadMember(ctx: WorkspaceContext, userId: string) {
  if (userId === ctx.userId) throw new AppError("Nie możesz zmienić własnej roli ani dezaktywować siebie. Najpierw przekaż własność innej osobie.", "self", 409);
  const { data } = await createAdminClient().from("workspace_members").select("user_id, role, status").eq("workspace_id", ctx.workspace.id).eq("user_id", userId).maybeSingle();
  if (!data) throw new AppError("Nie znaleziono członka zespołu.", "not_found", 404);
  return data;
}

function memberError(error: { message?: string } | null) {
  if (error?.message?.includes("last_owner")) return new AppError("Biuro musi mieć co najmniej jednego aktywnego właściciela.", "last_owner", 409);
  return dbError(error);
}

export async function changeMemberRole(userId: string, role: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("team.manage");
    const r = z.enum(["admin", "agent", "marketing", "viewer"]).parse(role);
    const m = await loadMember(ctx, userId);
    if (m.role === "owner") throw new AppError("Rolę właściciela zmienia się przez przekazanie własności.", "owner", 409);
    const { error } = await createAdminClient().from("workspace_members").update({ role: r }).eq("workspace_id", ctx.workspace.id).eq("user_id", userId);
    if (error) throw memberError(error);
    // Assigned offers stay assigned only to roles that can edit properties.
    if (!["admin", "agent"].includes(r)) await createAdminClient().from("properties").update({ agent_id: null }).eq("workspace_id", ctx.workspace.id).eq("agent_id", userId);
    revalidatePath("/settings/team");
    return { ok: true, data: undefined, message: `Zmieniono rolę na: ${ROLE_LABELS[r]}.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setMemberActive(userId: string, active: boolean): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("team.manage");
    const m = await loadMember(ctx, userId);
    if (m.role === "owner" && !active) throw new AppError("Nie można dezaktywować właściciela.", "owner", 409);
    const patch = active ? { status: "active" as const, deactivated_at: null, deactivated_by: null } : { status: "deactivated" as const, deactivated_at: new Date().toISOString(), deactivated_by: ctx.userId };
    const { error } = await createAdminClient().from("workspace_members").update(patch).eq("workspace_id", ctx.workspace.id).eq("user_id", userId);
    if (error) throw memberError(error);
    if (!active) await createAdminClient().from("properties").update({ agent_id: null }).eq("workspace_id", ctx.workspace.id).eq("agent_id", userId);
    revalidatePath("/settings/team");
    return { ok: true, data: undefined, message: active ? "Konto członka zespołu znów jest aktywne." : "Dezaktywowano. Ta osoba straciła dostęp do biura; jej materiały zostają." };
  } catch (error) {
    return toActionError(error);
  }
}

/** Hands ownership to another active member; the previous owner becomes admin. */
export async function transferOwnership(userId: string, confirm: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("team.manage");
    if (confirm.trim() !== ctx.workspace.name) throw new AppError("Wpisz dokładną nazwę biura, aby potwierdzić.", "confirm", 400);
    const m = await loadMember(ctx, userId);
    if (m.status !== "active") throw new AppError("Własność można przekazać tylko aktywnemu członkowi.", "inactive", 409);
    const admin = createAdminClient();
    const up = await admin.from("workspace_members").update({ role: "owner" }).eq("workspace_id", ctx.workspace.id).eq("user_id", userId);
    if (up.error) throw memberError(up.error);
    const down = await admin.from("workspace_members").update({ role: "admin" }).eq("workspace_id", ctx.workspace.id).eq("user_id", ctx.userId);
    if (down.error) throw memberError(down.error);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Przekazano własność biura. Masz teraz rolę administratora." };
  } catch (error) {
    return toActionError(error);
  }
}

/** Assigns an offer to an agent (owner/admin). */
export async function assignProperty(propertyId: string, agentId: string | null): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("property.edit_any");
    const { data, error } = await ctx.supabase.from("properties").update({ agent_id: agentId }).eq("id", propertyId).eq("workspace_id", ctx.workspace.id).select("id");
    if (error) throw dbError(error);
    if (!data?.length) throw new AppError("Nie znaleziono oferty.", "not_found", 404);
    revalidatePath(`/properties/${propertyId}`);
    return { ok: true, data: undefined, message: agentId ? "Przypisano agenta." : "Usunięto przypisanie." };
  } catch (error) {
    return toActionError(error);
  }
}
