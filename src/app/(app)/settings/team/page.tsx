import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { SettingsNav } from "@/components/settings/settings-nav";
import { InviteForm, InviteRow, MemberRow, type TeamInvite, type TeamMember } from "@/components/team/team-manager";
import { can, ROLE_DESCRIPTIONS, ROLE_LABELS, WORKSPACE_ROLES, type Role } from "@/core/auth/permissions";
import { getUsageSummary } from "@/lib/billing/usage";
import { requireWorkspace } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Zespół" };

export default async function TeamPage() {
  const ctx = await requireWorkspace();
  const manage = can(ctx.role, "team.manage");
  const admin = createAdminClient();
  // Read with the user's client (RLS: members only), e-mails via the auth admin API.
  const [{ data: rows }, usage, { data: invites }, { data: props }] = await Promise.all([
    ctx.supabase.from("workspace_members").select("user_id, role, status, created_at").eq("workspace_id", ctx.workspace.id).order("created_at"),
    getUsageSummary(ctx),
    manage ? ctx.supabase.from("workspace_invitations").select("id, email, role, expires_at").eq("workspace_id", ctx.workspace.id).is("accepted_at", null).is("revoked_at", null).order("created_at") : Promise.resolve({ data: [] }),
    ctx.supabase.from("properties").select("agent_id").eq("workspace_id", ctx.workspace.id).not("agent_id", "is", null),
  ]);
  // Deactivated members are hidden from them by RLS but visible to the owner via the server.
  const all = manage ? (await admin.from("workspace_members").select("user_id, role, status, created_at").eq("workspace_id", ctx.workspace.id).order("created_at")).data ?? [] : rows ?? [];
  const { data: profiles } = await ctx.supabase.from("profiles").select("id, full_name").in("id", all.map((r) => r.user_id));
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const members: TeamMember[] = await Promise.all(
    all.map(async (r) => {
      const email = manage || r.user_id === ctx.userId ? (await admin.auth.admin.getUserById(r.user_id)).data.user?.email ?? "" : "";
      return { id: r.user_id, name: names.get(r.user_id) || email.split("@")[0] || "Członek zespołu", email, role: r.role as Role, status: r.status, isMe: r.user_id === ctx.userId, assigned: (props ?? []).filter((p) => p.agent_id === r.user_id).length };
    }),
  );
  const pending: TeamInvite[] = (invites ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role as Role, expiresAt: i.expires_at, expired: new Date(i.expires_at) < new Date() }));

  return (
    <>
      <PageHeader title="Ustawienia" description="Zespół biura, role i zaproszenia." />
      <SettingsNav />
      <div className="flex flex-col gap-5">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">Członkowie zespołu</h2>
            <span className="text-[12.5px] text-ink-3" data-testid="seats">Miejsca: {usage.users.used} / {usage.users.limit} (z zaproszeniami)</span>
          </div>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line">
            {members.map((m) => <MemberRow key={m.id} m={m} manage={manage} workspaceName={ctx.workspace.name} />)}
          </ul>
          {!manage && <p className="mt-3 text-[12.5px] text-ink-3">Zespołem zarządza właściciel biura.</p>}
        </Card>

        {manage && (
          <Card className="p-5 sm:p-6">
            <h2 className="mb-3 text-[15px] font-semibold text-ink">Zaproś do zespołu</h2>
            <InviteForm canInvite={manage} seatsLeft={usage.users.limit - usage.users.used} />
            {pending.length > 0 && (
              <>
                <h3 className="mt-6 mb-2 text-[13px] font-medium text-ink">Oczekujące zaproszenia</h3>
                <ul className="divide-y divide-line rounded-md border border-line">{pending.map((i) => <InviteRow key={i.id} inv={i} />)}</ul>
              </>
            )}
          </Card>
        )}

        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Role i uprawnienia</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            {WORKSPACE_ROLES.map((r) => (
              <div key={r} className="rounded-md border border-line px-3 py-2.5">
                <dt className="text-[13px] font-medium text-ink">{ROLE_LABELS[r]}</dt>
                <dd className="mt-0.5 text-[12.5px] text-ink-3">{ROLE_DESCRIPTIONS[r]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[12px] text-ink-3">Uprawnienia sprawdza serwer i baza danych przy każdej operacji, nie tylko interfejs.</p>
        </Card>
      </div>
    </>
  );
}
