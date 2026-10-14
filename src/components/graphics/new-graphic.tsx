"use client";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, House, Sparkle, Trash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FORMATS, TEMPLATES, TEMPLATE_CATEGORIES, type FormatId, type TemplateCategory, type TemplateId } from "@/core/graphics/design";
import { createGraphic, deleteDesignTemplate } from "@/app/(app)/graphics/actions";
import { cn } from "@/lib/utils";
import { recommendCompositions } from "@/core/creative/composition";
import type { BrandStyle } from "@/core/brand/model";
import type { PropertyComposition } from "@/lib/creative/composition";

interface PropertyOption { id: string; title: string; subtitle: string; cover: string | null }
interface SavedOption { id: string; name: string; format: FormatId; template: TemplateId }

const previewFormat = (f: FormatId) => (f === "carousel" ? "portrait" : f === "stories" ? "story" : f);

export function NewGraphic({ properties, saved: initialSaved, initialProperty, initialFormat, preferredTemplate = null, composition = {}, brandStyle = "modern_minimal" }: { properties: PropertyOption[]; saved: SavedOption[]; initialProperty: string | null; initialFormat: FormatId; preferredTemplate?: TemplateId | null; composition?: Record<string, PropertyComposition>; brandStyle?: BrandStyle }) {
  const [propertyId, setPropertyId] = useState<string | null>(initialProperty);
  const [format, setFormat] = useState<FormatId>(initialFormat);
  // Composition advice from the property's photos and character, the format and the brand style.
  const recommended = useMemo(() => {
    const c = propertyId ? composition[propertyId] : undefined;
    const tags = c?.tags ?? [];
    return recommendCompositions({ format, photos: c?.photos ?? [], textLength: 60, message: !propertyId ? "brand" : tags.includes("premium") ? "premium" : "sales", propertyTags: tags, brandStyle })[0]!;
  }, [propertyId, format, composition, brandStyle]);
  const [template, setTemplate] = useState<TemplateId>(preferredTemplate ?? recommended.template);
  const [saved, setSaved] = useState(initialSaved);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ratio = FORMATS[format].h / FORMATS[format].w;
  const chosenSaved = saved.find((x) => x.id === savedId) ?? null;
  const pickFormat = (f: FormatId) => {
    setFormat(f);
    if (chosenSaved && chosenSaved.format !== f) setSavedId(null);
  };

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-[14px] font-semibold">1. Nieruchomość</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          <button type="button" onClick={() => setPropertyId(null)} aria-pressed={!propertyId} className={cn("flex w-52 shrink-0 items-center gap-3 rounded-lg border bg-surface p-2.5 text-left", !propertyId ? "border-accent ring-3 ring-accent/15" : "border-line")}>
            <span className="flex size-11 items-center justify-center rounded-md bg-sunken"><Sparkle size={18} className="text-ink-3" /></span>
            <span className="text-[13px] font-medium">Grafika wizerunkowa (bez oferty)</span>
          </button>
          {properties.map((p) => (
            <button key={p.id} type="button" onClick={() => setPropertyId(p.id)} aria-pressed={propertyId === p.id} className={cn("flex w-60 shrink-0 items-center gap-3 rounded-lg border bg-surface p-2.5 text-left", propertyId === p.id ? "border-accent ring-3 ring-accent/15" : "border-line hover:border-line-strong")}>
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sunken">{p.cover ? <img src={p.cover} alt="" className="size-full object-cover" /> : <House size={16} className="text-ink-4" />}</span>
              <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{p.title}</span><span className="block truncate text-[12px] text-ink-3">{p.subtitle}</span></span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-[14px] font-semibold">2. Format</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(FORMATS) as FormatId[]).map((f) => (
            <button key={f} type="button" onClick={() => pickFormat(f)} aria-pressed={format === f} className={cn("flex items-center gap-3 rounded-lg border bg-surface p-3.5 text-left", format === f ? "border-accent ring-3 ring-accent/15" : "border-line hover:border-line-strong")}>
              <span className="flex h-10 w-10 items-center justify-center"><span className="rounded-[3px] border-2 border-ink-3" style={{ width: 28 * (FORMATS[f].w / FORMATS[f].h > 0.9 ? 1 : FORMATS[f].w / FORMATS[f].h), height: 28 }} /></span>
              <span><span className="block text-[13.5px] font-medium">{FORMATS[f].label}</span><span className="block text-[12px] text-ink-3">{FORMATS[f].size}</span></span>
            </button>
          ))}
        </div>
      </section>
      {saved.length > 0 && (
        <section>
          <h2 className="mb-1 text-[14px] font-semibold">3. Szablony Twojego biura</h2>
          <p className="mb-3 text-[12.5px] text-ink-3">Zapisany wygląd i układ. Teksty i zdjęcia zostaną wzięte z wybranej oferty.</p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {saved.map((t) => (
              <div key={t.id} className="group relative">
                <button type="button" onClick={() => { setSavedId(t.id); setFormat(t.format); setTemplate(t.template); }} aria-pressed={savedId === t.id} className="block w-full text-left">
                  <span className={cn("relative block overflow-hidden rounded-lg border bg-sunken transition-all", savedId === t.id ? "border-accent ring-3 ring-accent/20" : "border-line group-hover:border-line-strong")} style={{ aspectRatio: `1 / ${FORMATS[t.format].h / FORMATS[t.format].w}` }}>
                    <img key={`${t.id}-${propertyId}`} src={`/api/graphics/preview?template=${t.template}&format=${previewFormat(t.format)}&saved=${t.id}${propertyId ? `&property=${propertyId}` : ""}`} alt={`Podgląd szablonu ${t.name}`} loading="lazy" className="size-full object-cover" />
                    {savedId === t.id && <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-accent text-white"><Check size={13} weight="bold" /></span>}
                  </span>
                  <span className="mt-2 block truncate text-[13px] font-medium">{t.name}</span>
                  <span className="block text-[12px] text-ink-3">{FORMATS[t.format].label} · {TEMPLATES[t.template].label}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Usuń szablon ${t.name}`}
                  onClick={async () => {
                    if (!confirm(`Usunąć szablon „${t.name}”? Grafiki już utworzone zostaną bez zmian.`)) return;
                    const r = await deleteDesignTemplate(t.id);
                    if (!r.ok) return toast.error(r.error);
                    setSaved((cur) => cur.filter((x) => x.id !== t.id));
                    if (savedId === t.id) setSavedId(null);
                    toast.success(r.message ?? "Usunięto");
                  }}
                  className="absolute top-2 left-2 hidden size-7 items-center justify-center rounded-full bg-surface/95 text-ink-3 shadow-sm group-hover:flex hover:text-danger"
                >
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="mb-1 text-[14px] font-semibold">{saved.length ? "4" : "3"}. Szablon premium</h2>
        <p className="mb-3 text-[12.5px] text-ink-3">12 kompozycji w 6 stylach. Każda używa kolorów, fontów i logo Twojej marki.</p>
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-accent/20 bg-accent-soft/40 px-3 py-2 text-[12.5px] text-ink-2" data-testid="composition-advice">
          <span><span className="font-medium text-ink">Rekomendowana kompozycja: {TEMPLATES[recommended.template].label}</span>{recommended.reasons.length ? ` (${recommended.reasons.slice(0, 3).join(", ")})` : ""}</span>
          {template !== recommended.template && <Button size="sm" variant="soft" onClick={() => { setTemplate(recommended.template); setSavedId(null); }}>Zastosuj</Button>}
        </div>
        <div className="flex flex-col gap-6">
          {(Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]).map((cat) => (
            <div key={cat}>
              <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{TEMPLATE_CATEGORIES[cat]}</h3>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {(Object.keys(TEMPLATES) as TemplateId[]).filter((t) => TEMPLATES[t].category === cat).map((t) => {
                  const on = !savedId && template === t;
                  return (
                    <button key={t} type="button" onClick={() => { setTemplate(t); setSavedId(null); }} aria-pressed={on} className="group text-left">
                      <span className={cn("relative block overflow-hidden rounded-lg border bg-sunken transition-all", on ? "border-accent ring-3 ring-accent/20" : "border-line group-hover:border-line-strong")} style={{ aspectRatio: `1 / ${ratio}` }}>
                        <img key={`${t}-${format}-${propertyId}`} src={`/api/graphics/preview?template=${t}&format=${previewFormat(format)}${propertyId ? `&property=${propertyId}` : ""}`} alt={`Podgląd szablonu ${TEMPLATES[t].label}`} loading="lazy" className="size-full object-cover" />
                        {on && <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-accent text-white"><Check size={13} weight="bold" /></span>}
                      </span>
                      <span className="mt-2 block text-[13px] font-medium">
                        {TEMPLATES[t].label}
                        {t === recommended.template && <span className="ml-1.5 rounded bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-success" data-testid="recommended-template">Rekomendowany</span>}
                        {t === preferredTemplate && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink" data-testid="preferred-template">Preferowany</span>}
                      </span>
                      <span className="block text-[12px] leading-snug text-ink-3">{TEMPLATES[t].description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
      <Card className="sticky bottom-4 flex items-center justify-between gap-4 p-3 pl-5 shadow-md">
        <span className="text-[13px] text-ink-3">{FORMATS[format].label} · {chosenSaved ? chosenSaved.name : TEMPLATES[template].label}{propertyId ? ` · ${properties.find((p) => p.id === propertyId)?.title}` : ""}</span>
        <Button size="lg" loading={pending} onClick={() => start(async () => { const r = await createGraphic({ propertyId, format, template, savedTemplateId: savedId }); if (r && !r.ok) toast.error(r.error); })}>Utwórz i edytuj</Button>
      </Card>
    </div>
  );
}
