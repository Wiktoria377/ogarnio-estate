import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ImportPanel, MappingEditor, RowList, type PreviewRow } from "@/components/import/import-preview";
import { IMPORT_FIELDS, IMPORT_FIELD_KEYS, type ColumnMapping, type Issue } from "@/core/import/model";
import type { RowAnalysis } from "@/lib/import/service";
import { pagePerm } from "@/lib/session";
import type { ImportRowAction } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";

export const metadata = { title: "Podgląd importu" };

const FILTERS = { all: "Wszystkie", create: "Nowe", update: "Zmiany", unchanged: "Bez zmian", skip: "Pominięte / duplikaty", invalid: "Z błędami" } as const;
const PAGE = 100;

export default async function ImportPreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; p?: string }> }) {
  const ctx = await pagePerm("import.run");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const filter = (sp.f && sp.f in FILTERS ? sp.f : "all") as keyof typeof FILTERS;
  const page = Math.max(0, Number(sp.p ?? 0) | 0);
  const { data: batch } = await ctx.supabase.from("import_batches").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!batch) notFound();

  let q = ctx.supabase.from("import_rows").select("id, row_number, normalized, issues, external_ref, photo_urls, match_property_id, match_kind, action, selected, result, result_message, property_id", { count: "exact" }).eq("batch_id", id).order("row_number");
  if (filter !== "all") q = q.eq("action", filter as ImportRowAction);
  const [{ data: rows, count }, { data: allActions }, { data: sample }, { data: me }] = await Promise.all([
    q.range(page * PAGE, page * PAGE + PAGE - 1),
    fetchAll((lo, hi) => ctx.supabase.from("import_rows").select("action, selected, photo_urls, normalized").eq("batch_id", id).order("id").range(lo, hi), 5000),
    ctx.supabase.from("import_rows").select("raw").eq("batch_id", id).order("row_number").limit(30),
    ctx.supabase.from("workspace_members").select("media_rights_ack_at").eq("workspace_id", ctx.workspace.id).eq("user_id", ctx.userId).maybeSingle(),
  ]);
  const counts = Object.fromEntries(Object.keys(FILTERS).map((k) => [k, 0])) as Record<keyof typeof FILTERS, number>;
  let selected = 0;
  let selectedPhotos = 0;
  let priceChanges = 0;
  for (const r of allActions ?? []) {
    counts.all++;
    counts[r.action as keyof typeof FILTERS]++;
    if (r.selected) {
      selected++;
      if (r.photo_urls.length) selectedPhotos++;
      if (r.action === "update" && ((r.normalized as unknown as RowAnalysis | null)?.changes ?? []).some((c) => c.field === "price")) priceChanges++;
    }
  }
  const samples: Record<string, string[]> = {};
  for (const h of batch.headers) samples[h] = (sample ?? []).map((s) => String((s.raw as Record<string, string>)[h] ?? "")).filter(Boolean).slice(0, 3);
  const view: PreviewRow[] = (rows ?? []).map((r) => {
    const a = r.normalized as unknown as RowAnalysis | null;
    return { id: r.id, row: r.row_number, title: a?.data?.title ?? null, ref: r.external_ref, city: a?.data?.city ?? null, price: a?.data?.price ?? null, currency: a?.data?.currency ?? "PLN", action: r.action, selected: r.selected, matchKind: r.match_kind, matchId: r.match_property_id, matchTitle: a?.matchTitle ?? null, changes: a?.changes ?? [], issues: (r.issues as unknown as Issue[]) ?? [], photos: r.photo_urls.length, result: r.result, resultMessage: r.result_message, propertyId: r.property_id };
  });
  const editable = batch.status === "preview";
  const pages = Math.ceil((count ?? 0) / PAGE);

  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow={<Link href="/import" className="hover:text-ink">Import ofert</Link>} title={batch.label} description={editable ? "Sprawdź mapowanie kolumn, błędy i wykryte zmiany. Zaznacz wiersze do importu. Zmiany istniejących ofert zostaną zastosowane dopiero po kliknięciu „Importuj zaznaczone”." : undefined} />
      {editable && (
        <MappingEditor
          batchId={batch.id}
          headers={batch.headers}
          samples={samples}
          mapping={batch.mapping as ColumnMapping}
          defaultTransaction={(batch.options as { defaultTransaction?: "sale" | "rent" }).defaultTransaction ?? "sale"}
          fields={IMPORT_FIELD_KEYS.map((k) => ({ key: k, label: IMPORT_FIELDS[k].label }))}
        />
      )}
      <ImportPanel
        batchId={batch.id}
        status={batch.status}
        counts={counts}
        selected={selected}
        priceChanges={priceChanges}
        needsPhotoRights={selectedPhotos > 0 && !me?.media_rights_ack_at}
        result={batch.status === "completed" ? { created: batch.created_count, updated: batch.updated_count, skipped: batch.skipped_count, failed: batch.error_count } : null}
      />
      <Card className="mt-5 p-0">
        <nav className="flex flex-wrap gap-1 border-b border-line px-4 py-2" aria-label="Filtr wierszy">
          {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => (
            <Link key={k} href={`/import/${batch.id}?f=${k}`} className={`rounded-md px-2.5 py-1 text-[12.5px] ${filter === k ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-3 hover:bg-sunken"}`} data-testid={`filter-${k}`}>
              {FILTERS[k]} ({counts[k]})
            </Link>
          ))}
        </nav>
        <RowList batchId={batch.id} rows={view} editable={editable} />
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[12.5px] text-ink-3">
            <span>Strona {page + 1} z {pages}</span>
            <span className="flex gap-3">
              {page > 0 && <Link href={`/import/${batch.id}?f=${filter}&p=${page - 1}`} className="text-accent-ink hover:underline">Poprzednia</Link>}
              {page + 1 < pages && <Link href={`/import/${batch.id}?f=${filter}&p=${page + 1}`} className="text-accent-ink hover:underline">Następna</Link>}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
