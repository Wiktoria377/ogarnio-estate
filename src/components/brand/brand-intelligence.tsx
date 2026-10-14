"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FilePdf, Globe, Trash } from "@phosphor-icons/react/dist/ssr";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { addBrandTextReference, deleteBrandReference, startBrandAnalysis } from "@/app/(app)/brand/intelligence/actions";

export interface AnalysisItem {
  id: string;
  url: string;
  status: "queued" | "running" | "succeeded" | "failed";
  createdAt: string;
  error: string | null;
  versionId: string | null;
  versionStatus: string | null;
  pagesRead: number | null;
}

export interface ReferenceItem {
  id: string;
  kind: "pdf" | "post" | "description";
  title: string;
  chars: number;
  note: string | null;
  url: string | null;
}

const STATUS: Record<AnalysisItem["status"], { label: string; tone: BadgeTone }> = {
  queued: { label: "W kolejce", tone: "muted" },
  running: { label: "Analiza w toku", tone: "accent" },
  succeeded: { label: "Gotowe", tone: "success" },
  failed: { label: "Nie udało się", tone: "danger" },
};

const VERSION: Record<string, string> = { draft: "Propozycja czeka na decyzję", approved: "Zatwierdzona", superseded: "Zatwierdzona (później zmieniona)", discarded: "Odrzucona" };

const KIND_LABEL = { pdf: "PDF", post: "Post", description: "Opis oferty" } as const;

export function BrandIntelligence({ editable, consentText, analyses, references, defaultUrl }: { editable: boolean; consentText: string; analyses: AnalysisItem[]; references: ReferenceItem[]; defaultUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState(defaultUrl);
  const [consent, setConsent] = useState(false);
  const [useRefs, setUseRefs] = useState(true);
  const [ref, setRef] = useState({ kind: "post" as "post" | "description", title: "", text: "" });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfTitle, setPdfTitle] = useState("");
  const active = analyses.some((a) => a.status === "queued" || a.status === "running");

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [active, router]);

  const analyse = () =>
    start(async () => {
      const r = await startBrandAnalysis({ url, consent: consent as true, useReferences: useRefs });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      setConsent(false);
      router.refresh();
    });

  const addText = () =>
    start(async () => {
      const r = await addBrandTextReference(ref);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      setRef({ ...ref, title: "", text: "" });
      router.refresh();
    });

  const uploadPdf = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return void toast.error("Wybierz plik PDF.");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", pdfTitle);
      const res = await fetch("/api/brand/references", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string; note?: string | null };
      if (!res.ok) return void toast.error(body.error ?? "Nie udało się dodać pliku.");
      toast.success(body.note ? `Dodano plik. ${body.note}` : "Dodano plik PDF.");
      if (fileRef.current) fileRef.current.value = "";
      setPdfTitle("");
      router.refresh();
    } finally {
      setUploading(false);
    }
  };

  const remove = (id: string) =>
    start(async () => {
      const r = await deleteBrandReference(id);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <Card className="p-5">
          <CardHeader title="Analiza strony internetowej" description="Ogarnio odczyta publiczną stronę biura i przygotuje propozycję profilu marki. Niczego nie zmieni, dopóki jej nie zatwierdzisz." className="mb-4 border-0 p-0" />
          <fieldset disabled={!editable || pending || active} className="flex flex-col gap-3">
            <Field label="Adres strony biura" htmlFor="bi-url">
              <Input id="bi-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://twoje-biuro.pl" inputMode="url" />
            </Field>
            <label className="flex items-start gap-2 text-[13px] leading-snug text-ink-2">
              <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="brand-consent" />
              <span>{consentText}</span>
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={useRefs} onChange={(e) => setUseRefs(e.target.checked)} />
              Uwzględnij materiały referencyjne ({references.filter((r) => r.chars > 0).length})
            </label>
            <div>
              <Button onClick={analyse} loading={pending} disabled={!consent || url.trim().length < 4}>
                <Globe /> Poznaj moją markę
              </Button>
            </div>
            {!editable && <p className="text-[12.5px] text-ink-3">Analizę może uruchomić właściciel lub administrator biura.</p>}
          </fieldset>
        </Card>

        <Card className="p-5">
          <CardHeader title="Analizy" description="Każda analiza tworzy osobną propozycję. Obowiązujący profil zmienia się dopiero po zatwierdzeniu." className="mb-4 border-0 p-0" />
          {analyses.length === 0 ? (
            <p className="text-[13px] text-ink-3">Nie uruchomiono jeszcze żadnej analizy.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line" data-testid="analyses">
              {analyses.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="analysis-row">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium">{a.url}</div>
                    <div className="text-[12px] text-ink-3">
                      {new Date(a.createdAt).toLocaleString("pl-PL")}
                      {a.pagesRead !== null && ` · odczytane podstrony: ${a.pagesRead}`}
                      {a.versionStatus && ` · ${VERSION[a.versionStatus] ?? a.versionStatus}`}
                    </div>
                    {a.error && <div className="mt-1 text-[12.5px] text-danger">{a.error}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS[a.status].tone} dot={a.status === "running" || a.status === "queued"} data-testid="analysis-status">
                      {STATUS[a.status].label}
                    </Badge>
                    {a.versionId && (
                      <Button asChild size="sm" variant={a.versionStatus === "draft" ? "primary" : "secondary"}>
                        <Link href={`/brand/versions/${a.versionId}`}>{a.versionStatus === "draft" ? "Przejrzyj propozycję" : "Zobacz"}</Link>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <CardHeader title="Materiały referencyjne" description="Przykładowe posty, opisy ofert i dokumenty PDF pomagają rozpoznać ton biura. Treść jest traktowana wyłącznie jako przykład stylu." className="mb-4 border-0 p-0" />
        {editable && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <Field label="Rodzaj" htmlFor="ref-kind">
                <NativeSelect id="ref-kind" value={ref.kind} onChange={(e) => setRef({ ...ref, kind: e.target.value as "post" | "description" })}>
                  <option value="post">Post</option>
                  <option value="description">Opis oferty</option>
                </NativeSelect>
              </Field>
              <Field label="Tytuł" htmlFor="ref-title">
                <Input id="ref-title" value={ref.title} onChange={(e) => setRef({ ...ref, title: e.target.value })} maxLength={160} />
              </Field>
            </div>
            <Field label="Treść" htmlFor="ref-text">
              <Textarea id="ref-text" rows={5} value={ref.text} onChange={(e) => setRef({ ...ref, text: e.target.value })} maxLength={20000} />
            </Field>
            <div>
              <Button variant="secondary" onClick={addText} loading={pending} disabled={!ref.title.trim() || ref.text.trim().length < 20}>
                Dodaj materiał
              </Button>
            </div>
            <div className="mt-2 flex flex-col gap-2 rounded-md border border-dashed border-line p-3">
              <div className="text-[13px] font-medium">Dokument PDF (do 15 MB)</div>
              <Input value={pdfTitle} onChange={(e) => setPdfTitle(e.target.value)} placeholder="Tytuł (opcjonalnie)" aria-label="Tytuł dokumentu PDF" maxLength={160} />
              <input ref={fileRef} type="file" accept="application/pdf" aria-label="Plik PDF" className="text-[13px]" />
              <div>
                <Button variant="secondary" size="sm" onClick={uploadPdf} loading={uploading}>
                  <FilePdf /> Dodaj PDF
                </Button>
              </div>
            </div>
          </div>
        )}
        <ul className="mt-4 flex flex-col divide-y divide-line" data-testid="references">
          {references.length === 0 && <li className="py-2 text-[13px] text-ink-3">Brak materiałów.</li>}
          {references.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2.5" data-testid="reference-row">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13.5px] font-medium">
                  <Badge tone="outline">{KIND_LABEL[r.kind]}</Badge>
                  {r.url ? <a href={r.url} className="truncate hover:underline">{r.title}</a> : <span className="truncate">{r.title}</span>}
                </div>
                <div className="text-[12px] text-ink-3">{r.chars > 0 ? `${r.chars.toLocaleString("pl-PL")} znaków tekstu` : "Brak tekstu"}</div>
                {r.note && <div className="text-[12px] text-warning">{r.note}</div>}
              </div>
              {editable && (
                <Button variant="danger-ghost" size="icon-sm" aria-label={`Usuń ${r.title}`} onClick={() => remove(r.id)} disabled={pending}>
                  <Trash />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
