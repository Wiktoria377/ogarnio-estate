import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { FileImport, SourceActions, SourceForm } from "@/components/import/import-sources";
import { CRM_ADAPTERS } from "@/lib/import/crm";
import { SOURCE_LABELS } from "@/lib/import/service";
import { encryptionConfigured } from "@/lib/crypto";
import { workerAvailable } from "@/lib/jobs/worker";
import { pagePerm } from "@/lib/session";
import { formatRelative } from "@/lib/utils";

export const metadata = { title: "Import ofert" };

const BATCH_STATUS = {
  preview: { label: "Podgląd – czeka na decyzję", tone: "warning" },
  importing: { label: "Importowanie", tone: "accent" },
  completed: { label: "Zakończony", tone: "success" },
  failed: { label: "Błąd", tone: "danger" },
  discarded: { label: "Odrzucony", tone: "muted" },
} as const;

export default async function ImportPage() {
  const ctx = await pagePerm("import.run");
  const ws = ctx.workspace.id;
  const [{ data: sources }, { data: batches }] = await Promise.all([
    ctx.supabase.from("property_sources").select("*").eq("workspace_id", ws).order("created_at"),
    ctx.supabase.from("import_batches").select("id, label, kind, status, total_rows, created_count, updated_count, skipped_count, error_count, created_at, finished_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(20),
  ]);
  const remote = (sources ?? []).filter((s) => s.kind !== "csv");
  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow={<Link href="/properties" className="hover:text-ink">Nieruchomości</Link>} title="Import ofert" description="Zaimportuj oferty z pliku CSV/XML/JSON, feedu z Twojego CRM albo przez oficjalne API ASARI i EstiCRM. Każdy import najpierw pokazuje podgląd: mapowanie pól, błędy, duplikaty i zmiany. Nic nie trafia do ofert bez Twojej decyzji." />
      {!workerAvailable() && <p className="mb-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-[13px] text-warning">Zadania w tle są wyłączone na serwerze: synchronizacja feedów/CRM i pobieranie zdjęć nie zadziała (wymaga SUPABASE_SERVICE_ROLE_KEY i workera). Import z pliku działa.</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Plik z CRM</h2>
          <p className="mt-1 text-[13px] text-ink-3">CSV (średnik, przecinek lub tabulator; UTF-8 lub Windows-1250), XML lub JSON. Do 5000 ofert i 10 MB.</p>
          <FileImport />
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Feed lub API CRM</h2>
          <p className="mt-1 text-[13px] text-ink-3">Autoryzowany adres eksportu XML/JSON albo dane dostępowe do oficjalnego API. Dane logowania są szyfrowane i nigdy nie trafiają do przeglądarki.</p>
          {!encryptionConfigured() && <p className="mt-2 text-[12.5px] text-warning">Wymaga konfiguracji: TOKEN_ENCRYPTION_KEY na serwerze (źródła z hasłem/tokenem).</p>}
          <SourceForm adapters={Object.values(CRM_ADAPTERS).map((a) => ({ kind: a.kind, label: a.label, accountLabel: a.accountLabel, tokenLabel: a.tokenLabel, docsUrl: a.docsUrl }))} />
        </Card>
      </div>

      {remote.length > 0 && (
        <Card className="mt-5 p-0">
          <h2 className="border-b border-line px-5 py-3 text-[14px] font-semibold">Źródła ofert</h2>
          <ul className="divide-y divide-line">
            {remote.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3" data-testid="import-source">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{s.name} <span className="font-normal text-ink-3">· {SOURCE_LABELS[s.kind]}</span></p>
                  <p className="text-[12px] text-ink-3">
                    {s.last_sync_at ? `Ostatni import ${formatRelative(s.last_sync_at)}` : "Jeszcze nie synchronizowano"}
                    {(s.kind === "asari" || s.kind === "esticrm") && " · mapowanie pól z dokumentacji, do weryfikacji przy pierwszym imporcie"}
                  </p>
                  {s.last_error && <p className="text-[12px] text-danger" data-testid="source-error">{s.last_error}</p>}
                </div>
                {s.status === "error" && <Badge tone="danger">Błąd</Badge>}
                <SourceActions id={s.id} name={s.name} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-5 p-0">
        <h2 className="border-b border-line px-5 py-3 text-[14px] font-semibold">Historia importów</h2>
        {batches?.length ? (
          <ul className="divide-y divide-line">
            {batches.map((b) => {
              const st = BATCH_STATUS[b.status];
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3" data-testid="import-batch">
                  <div className="min-w-0 flex-1">
                    <Link href={`/import/${b.id}`} className="text-[13.5px] font-medium hover:underline">{b.label}</Link>
                    <p className="text-[12px] text-ink-3">
                      {formatRelative(b.created_at)} · wierszy: {b.total_rows}
                      {b.status === "completed" && ` · utworzono ${b.created_count}, zaktualizowano ${b.updated_count}, pominięto ${b.skipped_count}, błędy ${b.error_count}`}
                    </p>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <a href={`/api/import/${b.id}/report`} className="text-[12.5px] text-accent-ink hover:underline">Raport CSV</a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-4 text-[13px] text-ink-3">Brak importów.</p>
        )}
      </Card>
    </div>
  );
}
