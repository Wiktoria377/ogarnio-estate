"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowCounterClockwise, ArrowDown, ArrowLeft, ArrowUp, Check, DownloadSimple, Plus, Trash, Warning, X } from "@phosphor-icons/react/dist/ssr";
import { Button, Spinner } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ConfirmDelete } from "@/components/common/confirm-delete";
import { saveBrochure } from "@/app/(app)/brochures/actions";
import { deleteItem, restoreVersion, updateItemMeta } from "@/app/(app)/library/actions";
import { BROCHURE_VARIANTS, VARIANT_FIELDS, type BrochureDesign } from "@/core/brochures/model";
import { cn, formatRelative } from "@/lib/utils";
import { t } from "@/i18n/pl";

interface PropertyOption { id: string; title: string; subtitle: string; cover: string | null; photos: { id: string; url: string; isVisualization: boolean }[] }
interface Props {
  item: { id: string; title: string; status: "draft" | "review" | "ready"; updatedAt: string; version: number };
  design: BrochureDesign;
  properties: PropertyOption[];
  sources: Record<string, { description: string; highlights: string[] }>;
  versions: { version: number; operation: string | null; source: string; createdAt: string }[];
  editable: boolean;
}

/** Server-rendered preview of the unsaved brochure (same renderer as the download). */
function usePreview(design: BrochureDesign, title: string) {
  const [s, setS] = useState<{ pages: string[] | null; pdf: string | null; warnings: string[]; loading: boolean; error: string | null }>({ pages: null, pdf: null, warnings: [], loading: true, error: null });
  const payload = JSON.stringify({ design, title });
  useEffect(() => {
    const ctrl = new AbortController();
    setS((x) => ({ ...x, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/brochures/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, signal: ctrl.signal });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j) throw new Error(j?.error ?? "Nie udało się przygotować podglądu.");
        setS({ pages: j.pages, pdf: j.pdf, warnings: j.warnings, loading: false, error: null });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setS((x) => ({ ...x, loading: false, error: e instanceof Error ? e.message : "Błąd podglądu." }));
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [payload]);
  return s;
}

function ListEditor({ id, label, items, max, maxChars, placeholder, onChange, disabled }: { id: string; label: string; items: string[]; max: number; maxChars: number; placeholder: string; onChange: (v: string[]) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-medium text-ink">{label}</p>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input id={`${id}-${i}`} aria-label={`${label} ${i + 1}`} value={it} maxLength={maxChars} disabled={disabled} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} placeholder={placeholder} />
          <Button variant="ghost" size="icon" aria-label={`Usuń: ${label} ${i + 1}`} disabled={disabled} onClick={() => onChange(items.filter((_, j) => j !== i))}><X /></Button>
        </div>
      ))}
      {items.length < max && !disabled && <Button size="sm" variant="secondary" className="self-start" onClick={() => onChange([...items, ""])}><Plus /> Dodaj</Button>}
    </div>
  );
}

export function BrochureEditor({ item, design: initial, properties, sources, versions, editable }: Props) {
  const router = useRouter();
  const [design, setDesign] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [title, setTitle] = useState(item.title);
  const [status, setStatus] = useState(item.status);
  const [saving, startSave] = useTransition();
  const [downloading, setDownloading] = useState(false);
  const [addId, setAddId] = useState("");
  const dirty = JSON.stringify(design) !== saved;
  const preview = usePreview(design, title);
  const v = BROCHURE_VARIANTS[design.variant];
  const fields = VARIANT_FIELDS[design.variant];
  const byId = new Map(properties.map((p) => [p.id, p]));
  const first = byId.get(design.propertyIds[0]!);
  const set = (p: Partial<BrochureDesign>) => setDesign((d) => ({ ...d, ...p }));

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  async function save(): Promise<boolean> {
    const r = await saveBrochure(item.id, design);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    setSaved(JSON.stringify(design));
    return true;
  }

  async function download() {
    setDownloading(true);
    try {
      if (dirty && editable && !(await save())) return;
      const res = await fetch(`/api/brochures/${item.id}?download=1`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Nie udało się przygotować PDF.");
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "broszura.pdf";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await res.blob());
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      if (dirty) router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się pobrać PDF.");
    } finally {
      setDownloading(false);
    }
  }

  const photoSel = first ? (design.photoIds[first.id] ?? []) : [];
  function togglePhoto(id: string) {
    if (!first) return;
    const cur = photoSel.length ? photoSel : [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, 16);
    set({ photoIds: { ...design.photoIds, [first.id]: next } });
  }
  const moveProp = (i: number, dir: -1 | 1) => {
    const ids = [...design.propertyIds];
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    set({ propertyIds: ids });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <Link href="/brochures" className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft size={13} /> Broszury PDF</Link>
          <input
            value={title}
            disabled={!editable}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={async () => {
              if (title.trim() && title !== item.title) {
                const r = await updateItemMeta(item.id, { title });
                if (!r.ok) toast.error(r.error);
              }
            }}
            className="-mx-1 w-full rounded-md bg-transparent px-1 text-[24px] font-semibold text-ink outline-none hover:bg-sunken/70 focus:bg-surface focus:ring-3 focus:ring-accent/15"
            aria-label="Tytuł broszury"
            maxLength={200}
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
            <span>{v.label} · {v.page}</span>
            <span suppressHydrationWarning>· wersja {item.version}, {formatRelative(item.updatedAt)}</span>
            {dirty && <Badge tone="warning" dot>Niezapisane zmiany</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Status" value={status} disabled={!editable} className="w-40" onChange={async (e) => { const next = e.target.value as typeof status; setStatus(next); const r = await updateItemMeta(item.id, { status: next }); if (r.ok) toast.success(`Status: ${t.status[next]}`); else toast.error(r.error); }}>
            {(["draft", "review", "ready"] as const).map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
          </NativeSelect>
          <Button variant="secondary" loading={downloading} onClick={download}><DownloadSimple /> Pobierz PDF</Button>
          {editable && <Button onClick={() => startSave(async () => { if (await save()) { toast.success("Zapisano broszurę"); router.refresh(); } })} loading={saving} disabled={!dirty}><Check /> Zapisz</Button>}
          {editable && <ConfirmDelete title="Usunąć broszurę?" description="Usuniemy broszurę ze wszystkimi wersjami. Nieruchomości i zdjęcia zostaną." action={() => deleteItem(item.id)} onDone={() => router.push("/brochures")} trigger={<Button variant="ghost" size="icon" aria-label="Usuń broszurę"><Trash /></Button>} />}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex items-center justify-between text-[12.5px] text-ink-3">
            <span>Podgląd wydruku{preview.pages ? ` · ${preview.pages.length} ${preview.pages.length === 1 ? "strona" : preview.pages.length < 5 ? "strony" : "stron"}` : ""}</span>
            {preview.loading && <span className="flex items-center gap-1.5"><Spinner /> Odświeżam</span>}
          </div>
          {preview.warnings.length > 0 && (
            <div role="status" className="rounded-md border border-warning/20 bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
              <p className="flex items-center gap-1.5 font-medium"><Warning size={14} /> Do sprawdzenia</p>
              <ul className="mt-1 list-disc pl-5">{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          {preview.error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{preview.error}</p>}
          {preview.pages ? (
            <div className="flex max-h-[78vh] flex-col items-center gap-4 overflow-y-auto rounded-md bg-sunken p-4" data-testid="brochure-pages">
              {preview.pages.map((src, i) => <img key={i} src={src} alt={`Strona ${i + 1}`} className="w-full max-w-[640px] rounded-[2px] bg-white shadow-md" />)}
            </div>
          ) : preview.pdf ? (
            <iframe title="Podgląd PDF" src={preview.pdf} className="h-[78vh] w-full rounded-md border border-line" />
          ) : (
            <div className={cn("aspect-[210/297] w-full max-w-[640px] self-center rounded-md", preview.loading && "skeleton")} />
          )}
        </Card>

        <Card className="flex flex-col gap-5 p-4">
          <p className="rounded-md bg-sunken px-3 py-2 text-[12.5px] leading-snug text-ink-3">Parametry, ceny i lokalizacja są pobierane z kart nieruchomości przy każdym podglądzie i pobraniu. Zmienisz je w karcie oferty.</p>

          {design.variant === "catalog" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-medium text-ink">Oferty w katalogu ({design.propertyIds.length}/{v.max})</p>
              <ul className="flex flex-col gap-1.5">
                {design.propertyIds.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-[13px]">
                    <span className="w-5 text-center text-ink-4">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{byId.get(id)?.title ?? "Usunięta nieruchomość"}</span>
                    {editable && (<>
                      <Button variant="ghost" size="icon" aria-label="W górę" disabled={i === 0} onClick={() => moveProp(i, -1)}><ArrowUp /></Button>
                      <Button variant="ghost" size="icon" aria-label="W dół" disabled={i === design.propertyIds.length - 1} onClick={() => moveProp(i, 1)}><ArrowDown /></Button>
                      <Button variant="ghost" size="icon" aria-label="Usuń z katalogu" disabled={design.propertyIds.length <= v.min} onClick={() => set({ propertyIds: design.propertyIds.filter((x) => x !== id) })}><X /></Button>
                    </>)}
                  </li>
                ))}
              </ul>
              {editable && design.propertyIds.length < v.max && (
                <div className="flex gap-2">
                  <NativeSelect aria-label="Dodaj ofertę" value={addId} onChange={(e) => setAddId(e.target.value)}>
                    <option value="">Dodaj ofertę…</option>
                    {properties.filter((p) => !design.propertyIds.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </NativeSelect>
                  <Button variant="secondary" disabled={!addId} onClick={() => { set({ propertyIds: [...design.propertyIds, addId] }); setAddId(""); }}><Plus /> Dodaj</Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-ink-2">Nieruchomość: <Link href={`/properties/${design.propertyIds[0]}`} className="font-medium text-ink hover:text-accent-ink">{first?.title ?? "usunięta"}</Link></p>
          )}

          {fields.client && (
            <div>
              <Label htmlFor="b-client">Klient (dla kogo prezentacja)</Label>
              <Input id="b-client" className="mt-1.5" value={design.clientName} maxLength={80} disabled={!editable} onChange={(e) => set({ clientName: e.target.value })} placeholder="Np. Pani Anna Kowalska (opcjonalnie)" />
            </div>
          )}
          {fields.title && (
            <div>
              <Label htmlFor="b-title">{design.variant === "catalog" ? "Tytuł katalogu" : "Nagłówek"}</Label>
              <Input id="b-title" className="mt-1.5" value={design.title} maxLength={120} disabled={!editable} onChange={(e) => set({ title: e.target.value })} placeholder={design.variant === "catalog" ? "Np. Mieszkania na Mokotowie, jesień" : "Tytuł oferty"} />
            </div>
          )}
          {fields.subtitle && (
            <div>
              <Label htmlFor="b-subtitle">Podtytuł</Label>
              <Textarea id="b-subtitle" className="mt-1.5" rows={2} value={design.subtitle} maxLength={220} disabled={!editable} onChange={(e) => set({ subtitle: e.target.value })} placeholder="Krótka myśl przewodnia (opcjonalnie)" />
            </div>
          )}
          {fields.intro && first && (
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="b-intro">Opis</Label>
                {editable && sources[first.id]?.description && design.intro !== sources[first.id]!.description && <button type="button" className="text-[12px] text-ink-3 hover:text-accent" onClick={() => set({ intro: sources[first.id]!.description })}><ArrowCounterClockwise size={12} className="mr-1 inline" />Opis z oferty</button>}
              </div>
              <Textarea id="b-intro" className="mt-1.5" rows={7} value={design.intro} maxLength={4000} disabled={!editable} onChange={(e) => set({ intro: e.target.value })} placeholder="Opis nieruchomości. Pusty = opis z karty oferty." />
            </div>
          )}
          {fields.highlights && first && (
            <div className="flex flex-col gap-1">
              <ListEditor id="b-hl" label="Atuty" items={design.highlights} max={8} maxChars={110} placeholder="Np. balkon od strony podwórza" disabled={!editable} onChange={(highlights) => set({ highlights })} />
              {editable && <button type="button" className="self-start text-[12px] text-ink-3 hover:text-accent" onClick={() => set({ highlights: sources[first.id]?.highlights ?? [] })}>Wstaw cechy z karty oferty</button>}
            </div>
          )}
          {fields.nextSteps && <ListEditor id="b-steps" label="Kolejne kroki" items={design.nextSteps} max={5} maxChars={110} placeholder="Np. prezentacja na miejscu" disabled={!editable} onChange={(nextSteps) => set({ nextSteps })} />}

          {fields.photos && first && first.photos.length > 0 && (
            <div>
              <p className="mb-1 text-[13px] font-medium text-ink">Zdjęcia {photoSel.length ? `(${photoSel.length}, w kolejności wyboru)` : "(wszystkie, w kolejności z oferty)"}</p>
              <div className="grid grid-cols-5 gap-1.5">
                {first.photos.map((p) => {
                  const idx = photoSel.indexOf(p.id);
                  return (
                    <button key={p.id} type="button" disabled={!editable} onClick={() => togglePhoto(p.id)} aria-pressed={idx >= 0} aria-label="Zdjęcie do broszury" className={cn("relative aspect-square overflow-hidden rounded-md border-2", idx >= 0 ? "border-accent" : "border-transparent hover:border-line-strong")}>
                      <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />
                      {idx >= 0 && <span className="absolute top-0.5 right-0.5 flex size-4.5 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">{idx + 1}</span>}
                      {p.isVisualization && <span className="absolute bottom-0.5 left-0.5 rounded bg-ink/70 px-1 text-[9px] text-white">Wiz.</span>}
                    </button>
                  );
                })}
              </div>
              {photoSel.length > 0 && editable && <button type="button" className="mt-1.5 text-[12px] text-ink-3 hover:text-accent" onClick={() => set({ photoIds: { ...design.photoIds, [first.id]: [] } })}>Użyj wszystkich zdjęć</button>}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 border-t border-line pt-4">
            <p className="text-[13px] font-medium text-ink">Kontakt na broszurze</p>
            <Input aria-label="Imię i nazwisko agenta" value={design.agent.name} maxLength={80} disabled={!editable} onChange={(e) => set({ agent: { ...design.agent, name: e.target.value } })} placeholder="Imię i nazwisko agenta" />
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="Telefon" value={design.agent.phone} maxLength={40} disabled={!editable} onChange={(e) => set({ agent: { ...design.agent, phone: e.target.value } })} placeholder="Telefon (z Brand Studio)" />
              <Input aria-label="E-mail" value={design.agent.email} maxLength={120} disabled={!editable} onChange={(e) => set({ agent: { ...design.agent, email: e.target.value } })} placeholder="E-mail (z Brand Studio)" />
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <label className="flex items-center justify-between gap-3 text-[13px]"><span className="font-medium text-ink">Pokaż cenę</span><Switch checked={design.showPrice} disabled={!editable} onCheckedChange={(x) => set({ showPrice: x })} aria-label="Pokaż cenę" /></label>
            <label className="flex items-center justify-between gap-3 text-[13px]"><span><span className="block font-medium text-ink">Oznaczaj wizualizacje</span><span className="block text-[12px] text-ink-3">Zalecane, aby nie wprowadzać odbiorców w błąd.</span></span><Switch checked={design.labelVisualizations} disabled={!editable} onCheckedChange={(x) => set({ labelVisualizations: x })} aria-label="Oznaczaj wizualizacje" /></label>
            <div>
              <Label htmlFor="b-accent">Kolor akcentu</Label>
              <NativeSelect id="b-accent" className="mt-1.5" value={design.accent} disabled={!editable} onChange={(e) => set({ accent: e.target.value as BrochureDesign["accent"] })}>
                <option value="primary">Główny kolor marki</option>
                <option value="secondary">Kolor uzupełniający</option>
                <option value="accent">Kolor akcentu</option>
              </NativeSelect>
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-[13px] font-medium text-ink">Wersje</p>
            <ul className="flex flex-col divide-y divide-line">
              {versions.map((x) => (
                <li key={x.version} className="flex items-center justify-between gap-2 py-2 text-[12.5px]">
                  <span className="min-w-0"><span className="font-medium text-ink">Wersja {x.version}</span> <span className="text-ink-3" suppressHydrationWarning>· {x.operation ?? x.source} · {formatRelative(x.createdAt)}</span></span>
                  {editable && x.version !== item.version && <Button size="sm" variant="ghost" onClick={async () => { if (dirty && !confirm("Masz niezapisane zmiany. Przywrócenie wersji je porzuci. Kontynuować?")) return; const r = await restoreVersion(item.id, x.version); if (r.ok) { toast.success(r.message ?? "Przywrócono"); router.refresh(); } else toast.error(r.error); }}><ArrowCounterClockwise /> Przywróć</Button>}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
