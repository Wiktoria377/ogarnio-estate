import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page-header";
import { LEAD_STATUSES, type LeadStatus } from "@/core/analytics/metrics";
import { can } from "@/core/auth/permissions";
import { requireWorkspace } from "@/lib/session";
import { formatRelative } from "@/lib/utils";
import { Tray } from "@phosphor-icons/react/dist/ssr";

export const metadata = { title: "Zapytania" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireWorkspace();
  if (!can(ctx.role, "leads.view_all") && !can(ctx.role, "leads.view_assigned")) redirect("/dashboard?denied=leads.view_all");
  const sp = await searchParams;
  const status = sp.status && sp.status in LEAD_STATUSES ? (sp.status as LeadStatus) : null;
  // RLS limits agents to leads assigned to them or about their offers.
  let q = ctx.supabase.from("leads").select("id, name, status, channel, created_at, property_id, assigned_to").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const [{ data: leads }, { data: props }] = await Promise.all([q, ctx.supabase.from("properties").select("id, title").eq("workspace_id", ctx.workspace.id).limit(1000)]);
  const title = new Map((props ?? []).map((p) => [p.id, p.title]));
  return (
    <div className="max-w-5xl">
      <PageHeader title="Zapytania" description={can(ctx.role, "leads.view_all") ? "Zapytania z formularzy na stronach ofert, ze źródłem (kanał, kampania, link) i zapisaną zgodą." : "Zapytania przypisane do Ciebie lub dotyczące Twoich ofert."} />
      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Status">
        <Link href="/leads" className={`rounded-md px-2.5 py-1 text-[12.5px] ${!status ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-3 hover:bg-sunken"}`}>Wszystkie</Link>
        {(Object.keys(LEAD_STATUSES) as LeadStatus[]).map((s) => <Link key={s} href={`/leads?status=${s}`} className={`rounded-md px-2.5 py-1 text-[12.5px] ${status === s ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-3 hover:bg-sunken"}`}>{LEAD_STATUSES[s].label}</Link>)}
      </nav>
      {!leads?.length ? (
        <EmptyState icon={<Tray />} title="Brak zapytań" description="Włącz publiczną stronę oferty i udostępnij link śledzący, aby zbierać zapytania z formularza." />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {leads.map((l) => (
              <li key={l.id} data-testid="lead-row">
                <Link href={`/leads/${l.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-sunken/60">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">{l.name}</span>
                    <span className="block text-[12px] text-ink-3">{l.property_id ? title.get(l.property_id) ?? "Oferta" : "Bez oferty"} · {l.channel ?? "bezpośrednio"} · {formatRelative(l.created_at)}</span>
                  </span>
                  <Badge tone={LEAD_STATUSES[l.status].tone}>{LEAD_STATUSES[l.status].label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
