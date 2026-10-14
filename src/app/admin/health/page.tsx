import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { adminPage } from "@/lib/admin/access";
import { health } from "@/lib/admin/service";

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" }) : "–");

function Counts({ title, rows, empty, testId }: { title: string; rows: { key: string; count: number }[]; empty: string; testId: string }) {
  return (
    <Card>
      <CardHeader title={title} />
      <ul className="divide-y divide-line text-[13px]" data-testid={testId}>
        {rows.length ? rows.map((r) => <li key={r.key} className="flex justify-between gap-3 px-5 py-2"><span className="break-all">{r.key}</span><span className="tabular-nums">{r.count}</span></li>) : <li className="px-5 py-3 text-ink-3">{empty}</li>}
      </ul>
    </Card>
  );
}

export default async function AdminHealth() {
  await adminPage();
  const h = await health();
  const statuses = ["queued", "running", "succeeded", "failed", "canceled"] as const;
  return (
    <div>
      <PageHeader title="Błędy integracji i zadania" description={`Ostatnie 7 dni. Błędy aplikacji w ostatniej dobie: ${h.errors24h}. Widoczne są kody i obszary błędów, bez treści materiałów.`} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Counts title="Błędy aplikacji (obszar · kod)" rows={h.errorsByArea} empty="Brak błędów." testId="errors-by-area" />
        <Counts title="Konta social wymagające uwagi" rows={h.connections} empty="Wszystkie konta działają." testId="connection-issues" />
        <Counts title="Publikacje nieudane / do działania" rows={h.publications} empty="Brak." testId="publication-issues" />
      </div>
      <Card className="mt-5 overflow-x-auto">
        <CardHeader title="Kolejka zadań (7 dni)" />
        <table className="w-full min-w-[560px] text-left text-[13px]" data-testid="job-stats">
          <thead className="text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">Rodzaj</th>{statuses.map((s) => <th key={s} className="px-2 py-2 font-medium">{s}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {h.jobs.length ? h.jobs.map((j) => <tr key={j.kind}><td className="px-5 py-2">{j.kind}</td>{statuses.map((s) => <td key={s} className="px-2 py-2 tabular-nums">{(j as Record<string, number | string>)[s] ?? 0}</td>)}</tr>) : <tr><td colSpan={6} className="px-5 py-3 text-ink-3">Brak zadań.</td></tr>}
          </tbody>
        </table>
      </Card>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Zadania nieudane (24 h)" />
          <ul className="divide-y divide-line text-[12.5px]" data-testid="failed-jobs">
            {h.failedJobs.length ? h.failedJobs.map((j) => <li key={j.id} className="px-5 py-2">{j.kind} · {j.code ?? "bez kodu"} · próby {j.attempts} · {j.office} · {dt(j.at)}</li>) : <li className="px-5 py-3 text-ink-3">Brak.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Zadania zawieszone (działają ponad 15 min)" description="Worker przejmuje je ponownie po wygaśnięciu blokady." />
          <ul className="divide-y divide-line text-[12.5px]" data-testid="stuck-jobs">
            {h.stuckJobs.length ? h.stuckJobs.map((j) => <li key={j.id} className="px-5 py-2">{j.kind} · {j.office} · od {dt(j.since)}</li>) : <li className="px-5 py-3 text-ink-3">Brak.</li>}
          </ul>
          {h.sources.length > 0 && <p className="border-t border-line px-5 py-2 text-[12.5px]">Źródła CRM z błędem: {h.sources.map((s) => `${s.kind} (${s.office})`).join(", ")}</p>}
        </Card>
      </div>
    </div>
  );
}
