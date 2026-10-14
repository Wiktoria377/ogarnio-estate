import { PageHeader } from "@/components/ui/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PasswordForm, ProfileForm, WorkspaceForm } from "@/components/settings/forms";
import { getQuota } from "@/lib/ai";
import { aiAvailability } from "@/lib/env";
import { loadMembers } from "@/lib/members";
import { canAdmin, requireWorkspace } from "@/lib/session";
import { formatRelative } from "@/lib/utils";

export const metadata = { title: "Ustawienia" };

const ROLE: Record<string, string> = { owner: "Właściciel", admin: "Administrator", agent: "Agent", viewer: "Podgląd" };
const OP: Record<string, string> = { generate: "Generowanie tekstu", refine: "Poprawka tekstu", graphic_copy: "Teksty na grafikę", review: "Kontrola jakości AI", repair: "Automatyczna poprawka" };
const STATUS_TONE = { ok: "success", error: "danger", rejected: "warning" } as const;
const STATUS_LABEL = { ok: "OK", error: "Błąd", rejected: "Odrzucone" } as const;

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-20 gap-4 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const ctx = await requireWorkspace();
  const ws = ctx.workspace.id;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [{ data: profile }, members, quota, { data: sub }, { data: events }] = await Promise.all([
    ctx.supabase.from("profiles").select("full_name").eq("id", ctx.userId).maybeSingle(),
    loadMembers(ctx),
    getQuota(ctx).catch(() => null),
    ctx.supabase.rpc("usage_summary", { p_ws: ws }).then((r) => ({ data: r.data?.[0] ?? null })),
    ctx.supabase.from("ai_usage_events").select("id, operation, model, input_tokens, output_tokens, status, error_code, user_id, created_at").eq("workspace_id", ws).gte("created_at", monthStart).order("created_at", { ascending: false }).limit(500),
  ]);
  const ai = aiAvailability();
  const names = new Map(members.map((m) => [m.id, m.name]));
  const byOp = new Map<string, { count: number; input: number; output: number }>();
  for (const e of events ?? []) {
    if (e.status !== "ok") continue;
    const s = byOp.get(e.operation) ?? { count: 0, input: 0, output: 0 };
    s.count++;
    s.input += e.input_tokens;
    s.output += e.output_tokens;
    byOp.set(e.operation, s);
  }
  const pct = quota && quota.limit > 0 ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;
  const admin = canAdmin(ctx.role);

  return (
    <>
      <PageHeader title="Ustawienia" description="Profil, biuro i zużycie AI." />
      <SettingsNav />
      <Card className="p-6 sm:p-8">
        <Section title="Profil" description="Twoje imię i nazwisko widzą członkowie zespołu.">
          <ProfileForm fullName={profile?.full_name ?? ctx.userName} email={ctx.userEmail} />
        </Section>
        <Section title="Hasło">
          <PasswordForm />
        </Section>
        <Section title="Biuro" description={`Twoja rola: ${ROLE[ctx.role]}.`}>
          <WorkspaceForm name={ctx.workspace.name} canAdmin={admin} />
          <div className="mt-6">
            <p className="mb-2 text-[13px] font-medium text-ink">Zespół</p>
            <ul className="divide-y divide-line rounded-md border border-line">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-3 py-2.5 text-[13px]">
                  <span>{m.name}{m.id === ctx.userId && <span className="text-ink-3"> (Ty)</span>}</span>
                  <Badge tone="outline">{ROLE[m.role] ?? m.role}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-ink-3">Zapraszanie członków zespołu jest zaplanowane na kolejny etap (role są już obsługiwane w bazie i uprawnieniach).</p>
          </div>
        </Section>
        <Section id="usage" title="Zużycie AI" description="Limit planu dotyczy generowań, poprawek, tekstów na grafiki, briefów i scenariuszy. Kontrola jakości jest wliczona w cenę.">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-medium text-ink">Plan {sub?.plan_name ?? "—"}</span>
              <a href="/settings/billing" className="text-accent hover:underline">Plan, limity i płatności →</a>
            </div>
            {quota && (
              <div>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="text-ink-2">Wykorzystano w tym miesiącu</span>
                  <span className="font-medium text-ink tabular-nums">{quota.used} / {quota.limit}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Zużycie limitu">
                  <div className={pct >= 90 ? "h-full bg-danger" : "h-full bg-accent"} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
            <p className="rounded-md bg-sunken px-3 py-2 text-[12.5px] text-ink-3">
              {ai.mode === "anthropic" ? `Model: ${ai.model} (kontrola jakości: ${ai.reviewModel}).` : ai.mode === "test" ? "Tryb testowy: odpowiedzi składane są offline, bez AI. Ustaw ANTHROPIC_API_KEY na serwerze, aby włączyć prawdziwe generowanie." : "AI wymaga konfiguracji: brak ANTHROPIC_API_KEY na serwerze."}
            </p>
            {byOp.size > 0 && (
              <div className="grid gap-2 sm:grid-cols-3">
                {[...byOp].map(([op, s]) => (
                  <div key={op} className="rounded-md border border-line px-3 py-2.5">
                    <p className="text-[12px] text-ink-3">{OP[op] ?? op}</p>
                    <p className="text-[18px] font-semibold text-ink tabular-nums">{s.count}</p>
                    <p className="text-[11.5px] text-ink-4 tabular-nums">{(s.input + s.output).toLocaleString("pl-PL")} tokenów</p>
                  </div>
                ))}
              </div>
            )}
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[560px] text-left text-[12.5px]">
                <thead className="border-b border-line text-ink-3"><tr><th className="px-3 py-2 font-medium">Kiedy</th><th className="px-3 py-2 font-medium">Operacja</th><th className="px-3 py-2 font-medium">Kto</th><th className="px-3 py-2 font-medium">Tokeny</th><th className="px-3 py-2 font-medium">Status</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {(events ?? []).slice(0, 20).map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2 text-ink-3">{formatRelative(e.created_at)}</td>
                      <td className="px-3 py-2 text-ink">{OP[e.operation] ?? e.operation}</td>
                      <td className="px-3 py-2 text-ink-3">{e.user_id ? names.get(e.user_id) ?? "Były członek" : "—"}</td>
                      <td className="px-3 py-2 text-ink-3 tabular-nums">{(e.input_tokens + e.output_tokens).toLocaleString("pl-PL")}</td>
                      <td className="px-3 py-2"><Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}{e.error_code ? ` · ${e.error_code}` : ""}</Badge></td>
                    </tr>
                  ))}
                  {!events?.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-ink-3">Brak wywołań AI w tym miesiącu.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      </Card>
    </>
  );
}
