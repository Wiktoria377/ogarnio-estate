import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { adminPage } from "@/lib/admin/access";
import { createAdminClient } from "@/lib/supabase/admin";

const dt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "medium" });

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ action?: string; before?: string }> }) {
  await adminPage();
  const sp = await searchParams;
  let q = createAdminClient().from("admin_audit_log").select("*, workspaces(name)").order("id", { ascending: false }).limit(100);
  if (sp.action && /^[a-z_]{1,80}$/.test(sp.action)) q = q.eq("action", sp.action);
  if (sp.before && /^\d+$/.test(sp.before)) q = q.lt("id", Number(sp.before));
  const { data } = await q;
  const rows = data ?? [];
  return (
    <div>
      <PageHeader title="Dziennik działań administracyjnych" description="Wpisy tylko do odczytu (baza blokuje edycję i usuwanie). Zawiera także otwarcia kart biur." />
      <nav className="mb-3 flex flex-wrap gap-1 text-[12.5px]">
        {["", "grant_trial", "update_plan", "set_cost_rate", "delete_cost_rate", "set_budget", "view_office", "cli_grant_admin", "cli_revoke_admin"].map((a) => <Link key={a} href={a ? `/admin/audit?action=${a}` : "/admin/audit"} className={`rounded-md px-2.5 py-1 ${(sp.action ?? "") === a ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-3 hover:bg-sunken"}`}>{a || "Wszystkie"}</Link>)}
      </nav>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-[12.5px]">
          <thead className="text-[12px] text-ink-3"><tr>{["Kiedy", "Kto", "Działanie", "Obiekt", "Biuro", "Powód", "Szczegóły"].map((h) => <th key={h} className="px-3 py-2 font-medium first:pl-5">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} data-testid="audit-row">
                <td className="py-2 pr-3 pl-5 whitespace-nowrap">{dt(r.created_at)}</td>
                <td className="px-3 py-2">{r.actor_email ?? "system / CLI"}</td>
                <td className="px-3 py-2 font-medium">{r.action}</td>
                <td className="px-3 py-2">{r.target_type}{r.target_id ? `: ${r.target_id}` : ""}</td>
                <td className="px-3 py-2">{(r.workspaces as unknown as { name: string } | null)?.name ?? "–"}</td>
                <td className="px-3 py-2">{r.reason ?? "–"}</td>
                <td className="max-w-80 px-3 py-2"><code className="block truncate text-[11.5px] text-ink-3" title={JSON.stringify(r.detail)}>{JSON.stringify(r.detail)}</code></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="px-5 py-3 text-ink-3">Brak wpisów.</td></tr>}
          </tbody>
        </table>
      </Card>
      {rows.length === 100 && <Link href={`/admin/audit?${sp.action ? `action=${sp.action}&` : ""}before=${rows.at(-1)!.id}`} className="mt-3 inline-block text-[13px] underline">Starsze wpisy</Link>}
    </div>
  );
}
