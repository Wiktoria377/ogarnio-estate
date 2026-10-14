import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { LeadControls } from "@/components/analytics/lead-controls";
import { LEAD_STATUSES } from "@/core/analytics/metrics";
import { can } from "@/core/auth/permissions";
import { loadAgents } from "@/lib/members";
import { requireWorkspace } from "@/lib/session";

export const metadata = { title: "Zapytanie" };

const EVENT: Record<string, string> = { created: "Zapytanie z formularza", status: "Zmiana statusu", assigned: "Przypisanie", note: "Notatka" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!can(ctx.role, "leads.view_all") && !can(ctx.role, "leads.view_assigned")) redirect("/dashboard?denied=leads.view_all");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { data: l } = await ctx.supabase.from("leads").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!l) notFound();
  const [{ data: prop }, { data: events }, agents] = await Promise.all([
    l.property_id ? ctx.supabase.from("properties").select("id, title").eq("id", l.property_id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.supabase.from("lead_events").select("kind, detail, created_at").eq("lead_id", id).order("created_at"),
    loadAgents(ctx),
  ]);
  const fmt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "medium", timeStyle: "short" });
  const utm = l.utm as Record<string, string>;
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow={<Link href="/leads" className="hover:text-ink">Zapytania</Link>} title={l.name} description={prop ? <>Oferta: <Link href={`/properties/${prop.id}`} className="text-accent-ink hover:underline">{prop.title}</Link></> : undefined} />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Kontakt" />
            <CardBody className="grid gap-1.5 text-[14px]">
              {l.email && <p>E-mail: <a href={`mailto:${l.email}`} className="text-accent-ink hover:underline">{l.email}</a></p>}
              {l.phone && <p>Telefon: <a href={`tel:${l.phone.replace(/\s/g, "")}`} className="text-accent-ink hover:underline">{l.phone}</a></p>}
              {l.message && <p className="mt-2 whitespace-pre-line text-ink-2">{l.message}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Źródło i zgoda" description="Dowód zgody na kontakt zapisany w chwili wysłania formularza." />
            <CardBody className="grid gap-1 text-[13px] text-ink-2" data-testid="lead-consent">
              <p>Kanał: {l.channel ?? "bezpośrednio"}{Object.keys(utm).length ? ` · ${Object.entries(utm).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""}</p>
              <p>Zgoda udzielona: {fmt(l.consent_at)} (wersja {l.consent_version})</p>
              <p className="text-ink-3">„{l.consent_text}”</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Historia" />
            <ul className="divide-y divide-line text-[13px]">
              {(events ?? []).map((e, i) => (
                <li key={i} className="px-5 py-2.5"><span className="text-ink-4">{fmt(e.created_at)}</span> · {EVENT[e.kind] ?? e.kind}{e.kind === "status" ? `: ${LEAD_STATUSES[(e.detail as { to: keyof typeof LEAD_STATUSES }).to]?.label ?? ""}` : ""}</li>
              ))}
            </ul>
            {l.notes && <CardBody className="whitespace-pre-line border-t border-line text-[13px] text-ink-2">{l.notes}</CardBody>}
          </Card>
        </div>
        <aside>
          <LeadControls id={l.id} status={l.status} assignedTo={l.assigned_to} agents={agents.map((a) => ({ id: a.id, name: a.name }))} canManage={can(ctx.role, "leads.manage")} canAssign={can(ctx.role, "leads.view_all")} />
        </aside>
      </div>
    </div>
  );
}
