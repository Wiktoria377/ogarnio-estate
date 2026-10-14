"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, DownloadSimple, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/field";
import { DIFF_LABELS, formatChangeValue, type ColumnMapping, type FieldChange, type Issue } from "@/core/import/model";
import { chooseRows, discard, executeImport, remap, selectGroup } from "@/app/(app)/import/actions";

export function MappingEditor({ batchId, headers, samples, mapping, defaultTransaction, fields }: { batchId: string; headers: string[]; samples: Record<string, string[]>; mapping: ColumnMapping; defaultTransaction: "sale" | "rent"; fields: { key: string; label: string }[] }) {
  const router = useRouter();
  const [m, setM] = useState<ColumnMapping>(mapping);
  const [tx, setTx] = useState(defaultTransaction);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(true);
  const dirty = JSON.stringify(m) !== JSON.stringify(mapping) || tx !== defaultTransaction;
  const usedBy = (f: string) => headers.find((h) => m[h] === f);
  return (
    <Card className="mb-5 p-0">
      <button type="button" className="flex w-full items-center justify-between px-5 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="text-[14px] font-semibold">Mapowanie kolumn ({headers.filter((h) => m[h]).length} z {headers.length} użytych)</span>
        <span className="text-[12.5px] text-ink-3">{open ? "Zwiń" : "Rozwiń"}</span>
      </button>
      {open && (
        <div className="border-t border-line px-5 py-4">
          <div className="grid gap-x-6 gap-y-2.5 md:grid-cols-2">
            {headers.map((h) => (
              <div key={h} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium" title={h}>{h}</p>
                  <p className="truncate text-[11.5px] text-ink-4" title={samples[h]?.join(" | ")}>{samples[h]?.length ? samples[h]!.join(" | ") : "puste"}</p>
                </div>
                <NativeSelect aria-label={`Pole dla kolumny ${h}`} className="h-8 text-[13px]" value={m[h] ?? ""} onChange={(e) => setM((s) => ({ ...s, [h]: e.target.value as ColumnMapping[string] }))}>
                  <option value="">— pomiń —</option>
                  {fields.map((f) => {
                    const other = usedBy(f.key);
                    const multi = ["photos", "features", "amenities", "description"].includes(f.key);
                    return <option key={f.key} value={f.key} disabled={!!other && other !== h && !multi}>{f.label}{other && other !== h ? ` (${multi ? "+ " : ""}${other})` : ""}</option>;
                  })}
                </NativeSelect>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              Gdy brak rodzaju transakcji:
              <NativeSelect aria-label="Domyślna transakcja" className="h-8 w-36 text-[13px]" value={tx} onChange={(e) => setTx(e.target.value as "sale" | "rent")}>
                <option value="sale">sprzedaż</option>
                <option value="rent">wynajem</option>
              </NativeSelect>
            </label>
            <Button size="sm" disabled={!dirty} loading={pending} onClick={() => start(async () => {
              const r = await remap(batchId, m, tx);
              if (!r.ok) return void toast.error(r.error);
              toast.success(r.message ?? "Przeliczono.");
              router.refresh();
            })}>Zastosuj mapowanie</Button>
            {dirty && <span className="text-[12.5px] text-warning">Podgląd poniżej dotyczy poprzedniego mapowania.</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

export function ImportPanel({ batchId, status, counts, selected, priceChanges, needsPhotoRights, result }: {
  batchId: string;
  status: string;
  counts: { create: number; update: number; unchanged: number; skip: number; invalid: number };
  selected: number;
  priceChanges: number;
  needsPhotoRights: boolean;
  result: { created: number; updated: number; skipped: number; failed: number } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pause, setPause] = useState(true);
  const [rights, setRights] = useState(false);
  if (status !== "preview") {
    return (
      <Card className="p-5" data-testid="import-result">
        {result ? (
          <p className="text-[14px]">Import zakończony: utworzono <b>{result.created}</b>, zaktualizowano <b>{result.updated}</b>, pominięto <b>{result.skipped}</b>, błędy <b>{result.failed}</b>.</p>
        ) : (
          <p className="text-[14px]">Status importu: {status === "discarded" ? "odrzucony" : status === "importing" ? "w trakcie" : status}.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm"><a href={`/api/import/${batchId}/report`}><DownloadSimple /> Pobierz raport CSV</a></Button>
          <Button asChild variant="ghost" size="sm"><Link href="/properties">Przejdź do ofert <ArrowRight /></Link></Button>
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-5" data-testid="import-panel">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tone="accent">Nowe: {counts.create}</Badge>
        <Badge tone="warning">Zmiany: {counts.update}</Badge>
        <Badge tone="muted">Bez zmian: {counts.unchanged}</Badge>
        <Badge tone="neutral">Pominięte: {counts.skip}</Badge>
        <Badge tone="danger">Błędy: {counts.invalid}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
        {counts.create > 0 && <><Button size="sm" variant="ghost" onClick={() => start(async () => { await selectGroup(batchId, "create", true); router.refresh(); })}>Zaznacz wszystkie nowe</Button><Button size="sm" variant="ghost" onClick={() => start(async () => { await selectGroup(batchId, "create", false); router.refresh(); })}>Odznacz nowe</Button></>}
        {counts.update > 0 && <><Button size="sm" variant="ghost" onClick={() => start(async () => { await selectGroup(batchId, "update", true); router.refresh(); })}>Zaznacz wszystkie zmiany</Button><Button size="sm" variant="ghost" onClick={() => start(async () => { await selectGroup(batchId, "update", false); router.refresh(); })}>Odznacz zmiany</Button></>}
      </div>
      {priceChanges > 0 && (
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning" data-testid="price-warning">
          <p className="flex items-start gap-2"><Warning className="mt-0.5 shrink-0" /> Zmiana ceny w {priceChanges} {priceChanges === 1 ? "ofercie" : "ofertach"}. Materiały tych ofert (posty, grafiki, wideo, PDF) mogą zawierać starą cenę: po imporcie zostaną oznaczone jako nieaktualne. Treści nie zmieniamy automatycznie.</p>
          <label className="mt-2 flex items-center gap-2 text-ink-2">
            <input type="checkbox" checked={pause} onChange={(e) => setPause(e.target.checked)} /> Cofnij zaplanowane publikacje tych materiałów do ponownej akceptacji
          </label>
        </div>
      )}
      {needsPhotoRights && (
        <label className="mt-3 flex items-start gap-2 text-[13px] text-ink-2">
          <input type="checkbox" className="mt-0.5" checked={rights} onChange={(e) => setRights(e.target.checked)} /> Potwierdzam, że biuro ma prawo używać zdjęć z tego źródła (zostaną pobrane w tle).
        </label>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button loading={pending} disabled={!selected || (needsPhotoRights && !rights)} onClick={() => start(async () => {
          const r = await executeImport(batchId, { pausePublications: pause, photoRights: rights });
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? "Zaimportowano.");
          if (r.data.materials) toast.warning(`Oznaczono ${r.data.materials} materiałów jako nieaktualne${r.data.paused ? `, ${r.data.paused} publikacji wróciło do akceptacji` : ""}.`);
          router.refresh();
        })}>Importuj zaznaczone ({selected})</Button>
        <Button variant="ghost" onClick={() => start(async () => {
          if (!confirm("Odrzucić ten podgląd? Nic nie zostanie zaimportowane.")) return;
          const r = await discard(batchId);
          if (r.ok) router.push("/import");
          else toast.error(r.error);
        })}>Odrzuć</Button>
        <Button asChild variant="ghost"><a href={`/api/import/${batchId}/report`}><DownloadSimple /> Raport błędów</a></Button>
      </div>
    </Card>
  );
}

export interface PreviewRow {
  id: string;
  row: number;
  title: string | null;
  ref: string | null;
  city: string | null;
  price: number | null;
  currency: string;
  action: "create" | "update" | "skip" | "invalid" | "unchanged";
  selected: boolean;
  matchKind: "external_ref" | "fingerprint" | "file" | null;
  matchId: string | null;
  matchTitle: string | null;
  changes: FieldChange[];
  issues: Issue[];
  photos: number;
  result: string | null;
  resultMessage: string | null;
  propertyId: string | null;
}

const ACTION_LABEL = { create: "Nowa oferta", update: "Zmiany", skip: "Pominięty", invalid: "Błędy", unchanged: "Bez zmian" } as const;
const ACTION_TONE = { create: "accent", update: "warning", skip: "neutral", invalid: "danger", unchanged: "muted" } as const;
const RESULT_LABEL: Record<string, string> = { created: "Utworzono", updated: "Zaktualizowano", skipped: "Pominięto", failed: "Błąd", change_pending: "Czeka" };

export function RowList({ batchId, rows, editable }: { batchId: string; rows: PreviewRow[]; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Optimistic selection: the checkbox reflects the click at once; the server refresh confirms it.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const choose = (id: string, selected: boolean, action?: "create" | "update" | "skip") => {
    if (!action) setLocal((s) => ({ ...s, [id]: selected }));
    start(async () => {
      const r = await chooseRows(batchId, [{ id, selected, action }]);
      if (!r.ok) {
        toast.error(r.error);
        setLocal((s) => { const n = { ...s }; delete n[id]; return n; });
      }
      router.refresh();
    });
  };
  if (!rows.length) return <p className="px-5 py-4 text-[13px] text-ink-3">Brak wierszy w tym filtrze.</p>;
  return (
    <ul className="divide-y divide-line" aria-busy={pending}>
      {rows.map((r) => (
        <li key={r.id} className="flex gap-3 px-4 py-3" data-testid="import-row" data-action={r.action}>
          {editable && (
            <input type="checkbox" className="mt-1" aria-label={`Importuj wiersz ${r.row}`} checked={local[r.id] ?? r.selected} disabled={r.action === "invalid" || r.action === "unchanged" || r.action === "skip"} onChange={(e) => choose(r.id, e.target.checked)} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[12px] tabular-nums text-ink-4">#{r.row}</span>
              <span className="text-[13.5px] font-medium">{r.title ?? "—"}</span>
              {r.ref && <span className="text-[12px] text-ink-3">nr {r.ref}</span>}
              {r.city && <span className="text-[12px] text-ink-3">· {r.city}</span>}
              {r.price != null && <span className="text-[12px] text-ink-3">· {new Intl.NumberFormat("pl-PL").format(r.price)} {r.currency}</span>}
              {r.photos > 0 && <span className="text-[12px] text-ink-3">· zdjęć: {r.photos}</span>}
              <Badge tone={ACTION_TONE[r.action]} className="ml-auto" data-testid="row-action">{ACTION_LABEL[r.action]}</Badge>
              {r.result && <Badge tone={r.result === "failed" ? "danger" : r.result === "skipped" ? "muted" : "success"} data-testid="row-result">{RESULT_LABEL[r.result] ?? r.result}</Badge>}
            </div>
            {r.matchTitle && r.matchId && (
              <p className="mt-0.5 text-[12px] text-ink-3">{r.matchKind === "external_ref" ? "Istniejąca oferta:" : "Podobna oferta:"} <Link href={`/properties/${r.matchId}`} className="text-accent-ink hover:underline">{r.matchTitle}</Link></p>
            )}
            {r.changes.length > 0 && (
              <ul className="mt-1.5 grid gap-0.5 text-[12.5px]" data-testid="row-changes">
                {r.changes.map((c) => (
                  <li key={c.field} className={c.field === "price" ? "text-warning" : "text-ink-2"}>
                    <span className="font-medium">{DIFF_LABELS[c.field]}:</span> <span className="text-ink-3 line-through">{formatChangeValue(c.field, c.before)}</span> → {formatChangeValue(c.field, c.after)}
                  </li>
                ))}
              </ul>
            )}
            {r.issues.length > 0 && (
              <ul className="mt-1.5 grid gap-0.5 text-[12px]" data-testid="row-issues">
                {r.issues.map((i, n) => (
                  <li key={n} className={`flex items-start gap-1 ${i.level === "error" ? "text-danger" : "text-warning"}`}>
                    {i.level === "error" ? <WarningCircle className="mt-0.5 shrink-0" size={13} /> : <Warning className="mt-0.5 shrink-0" size={13} />} {i.message}
                  </li>
                ))}
              </ul>
            )}
            {r.resultMessage && <p className={`mt-1 text-[12px] ${r.result === "failed" ? "text-danger" : "text-ink-3"}`}>{r.resultMessage}</p>}
            {r.propertyId && r.result !== "failed" && <Link href={`/properties/${r.propertyId}`} className="mt-1 inline-block text-[12px] text-accent-ink hover:underline">Otwórz ofertę</Link>}
            {editable && r.matchKind === "fingerprint" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant={r.action === "update" ? "soft" : "secondary"} disabled={pending} onClick={() => choose(r.id, true, "update")}>Aktualizuj tamtą ofertę</Button>
                <Button size="sm" variant={r.action === "create" ? "soft" : "secondary"} disabled={pending} onClick={() => choose(r.id, true, "create")}>Utwórz nową</Button>
                <Button size="sm" variant={r.action === "skip" ? "soft" : "ghost"} disabled={pending} onClick={() => choose(r.id, false, "skip")}>Pomiń</Button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
