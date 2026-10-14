import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { STATUS_LABEL, bytes } from "@/components/admin/stat";
import { formatCost } from "@/core/admin/costs";
import { adminPage } from "@/lib/admin/access";
import { costCurrency, workspaceStats } from "@/lib/admin/service";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" }) : "–");

export default async function AdminOffices({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await adminPage();
  const q = ((await searchParams).q ?? "").trim().toLowerCase();
  const { rows } = await workspaceStats();
  const list = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.id.startsWith(q)) : rows;
  const cur = costCurrency();
  return (
    <div>
      <PageHeader title="Biura" description="Liczby z bieżącego miesiąca. Nazwy biur są widoczne; treści materiałów i dane klientów nie." />
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="Szukaj po nazwie lub identyfikatorze" className="h-9 w-full max-w-sm rounded-md border border-line bg-surface px-3 text-[13px]" aria-label="Szukaj biura" /></form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[980px] text-left text-[12.5px]">
          <thead className="text-[12px] text-ink-3"><tr>{["Biuro", "Założone", "Plan / status", "Okres próbny do", "Osoby", "Oferty", "Materiały", "AI (wywołania)", "Filmy", "Pliki", "Koszt (szacunek)"].map((h) => <th key={h} className="px-3 py-2 font-medium first:pl-5">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {list.map((r) => (
              <tr key={r.id} data-testid="admin-office">
                <td className="py-2 pr-3 pl-5"><Link href={`/admin/offices/${r.id}`} className="font-medium underline-offset-2 hover:underline">{r.name}</Link></td>
                <td className="px-3 py-2">{day(r.created_at)}</td>
                <td className="px-3 py-2">{r.plan ?? "–"} · {STATUS_LABEL[r.status ?? "brak"] ?? r.status}</td>
                <td className="px-3 py-2">{r.status === "trialing" ? day(r.trial_ends_at) : "–"}</td>
                <td className="px-3 py-2 tabular-nums">{r.members}</td>
                <td className="px-3 py-2 tabular-nums">{r.properties}</td>
                <td className="px-3 py-2 tabular-nums">{r.content_items}</td>
                <td className="px-3 py-2 tabular-nums">{r.aiCalls}</td>
                <td className="px-3 py-2 tabular-nums">{r.renders}</td>
                <td className="px-3 py-2 tabular-nums">{bytes(r.storageBytes)}</td>
                <td className="px-3 py-2">{formatCost(r.cost.total, cur)}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={11} className="px-5 py-3 text-ink-3">Brak biur.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
