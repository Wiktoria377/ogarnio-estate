import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { STATUS_LABEL, Stat, bytes } from "@/components/admin/stat";
import { TrialForm } from "@/components/admin/admin-forms";
import { formatCost } from "@/core/admin/costs";
import { adminPage, logAdmin } from "@/lib/admin/access";
import { costCurrency, workspaceStats } from "@/lib/admin/service";
import { createAdminClient } from "@/lib/supabase/admin";

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" }) : "–");

export default async function AdminOffice({ params }: { params: Promise<{ id: string }> }) {
  const admin = await adminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { rows } = await workspaceStats();
  const w = rows.find((r) => r.id === id);
  if (!w) notFound();
  // Opening an office's record is itself logged (who looked at which customer, when).
  await logAdmin(admin, "view_office", { targetType: "workspace", targetId: id, workspaceId: id });
  const db = createAdminClient();
  const [{ data: plans }, { data: audit }, { count: errors }] = await Promise.all([
    db.from("plans").select("id, name, is_active").eq("is_active", true).order("sort"),
    db.from("admin_audit_log").select("id, action, actor_email, reason, created_at").eq("workspace_id", id).neq("action", "view_office").order("created_at", { ascending: false }).limit(20),
    db.from("app_errors").select("id", { count: "exact", head: true }).eq("workspace_id", id).gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
  ]);
  const cur = costCurrency();
  return (
    <div>
      <PageHeader eyebrow={<Link href="/admin/offices" className="hover:text-ink">Biura</Link>} title={w.name} description={`Założone ${dt(w.created_at)} · identyfikator ${w.id}`} />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Plan" value={w.plan ?? "–"} note={STATUS_LABEL[w.status ?? "brak"]} testId="office-plan" />
        <Stat label="Okres próbny do" value={w.status === "trialing" ? dt(w.trial_ends_at) : "–"} testId="office-trial" />
        <Stat label="Osoby / oferty" value={`${w.members} / ${w.properties}`} />
        <Stat label="AI w tym miesiącu" value={w.aiCalls} note={`${w.tokens} tokenów, ${w.aiErrors} błędów`} />
        <Stat label="Filmy w tym miesiącu" value={w.renders} note={`${Math.round(w.renderSeconds)} s renderowania`} />
        <Stat label="Błędy (7 dni)" value={errors ?? 0} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <Stat label="Koszt AI" value={formatCost(w.cost.ai, cur)} />
        <Stat label="Koszt renderowania" value={formatCost(w.cost.render, cur)} />
        <Stat label="Pliki" value={bytes(w.storageBytes)} note={formatCost(w.cost.storage, cur)} />
        <Stat label="Razem (szacunek)" value={formatCost(w.cost.total, cur)} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Przyznaj okres próbny" description={w.provider === "stripe" && ["active", "past_due", "incomplete"].includes(w.status ?? "") ? "Biuro płaci przez Stripe: okres próbny ustaw w Stripe." : "Wydłuża bieżący okres próbny albo rozpoczyna nowy. Wymaga podania powodu."} />
          <CardBody>{admin.role === "admin" ? <TrialForm workspaceId={w.id} plans={(plans ?? []).map((p) => ({ id: p.id, name: p.name }))} current={w.plan ?? "trial"} /> : <p className="text-[13px] text-ink-3">Rola „podgląd” nie pozwala na zmiany.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Działania administratorów w tym biurze" />
          <ul className="divide-y divide-line text-[12.5px]" data-testid="office-audit">
            {audit?.length ? audit.map((a) => <li key={a.id} className="px-5 py-2"><span className="font-medium">{a.action}</span> · {a.actor_email ?? "system"} · {dt(a.created_at)}{a.reason ? <span className="block text-ink-3">Powód: {a.reason}</span> : null}</li>) : <li className="px-5 py-3 text-ink-3">Brak działań.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
