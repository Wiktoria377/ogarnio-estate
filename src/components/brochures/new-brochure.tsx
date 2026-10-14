"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, House } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BROCHURE_VARIANTS, type BrochureVariant } from "@/core/brochures/model";
import { createBrochure } from "@/app/(app)/brochures/actions";
import { cn } from "@/lib/utils";

interface PropertyOption { id: string; title: string; subtitle: string; cover: string | null; photoCount: number }

/** Miniature page layout per variant, drawn with CSS (no fictional content). */
function VariantSketch({ v }: { v: BrochureVariant }) {
  const box = "rounded-[2px] bg-accent/25";
  const line = "h-1 rounded-full bg-ink/15";
  if (v === "presentation")
    return (
      <span className="flex aspect-[297/210] w-full gap-1.5 rounded-md border border-line bg-surface p-2">
        <span className="flex flex-1 flex-col justify-center gap-1"><span className={cn(line, "w-1/2 bg-accent/60")} /><span className={cn(line, "h-2 w-4/5 bg-ink/30")} /><span className={cn(line, "w-2/3")} /></span>
        <span className={cn(box, "flex-1")} />
      </span>
    );
  return (
    <span className="flex aspect-[210/297] w-full flex-col gap-1 rounded-md border border-line bg-surface p-2">
      {v === "card" && (<><span className={cn(box, "h-[38%]")} /><span className="flex gap-1"><span className={cn(box, "h-4 flex-1")} /><span className={cn(box, "h-4 flex-1")} /></span><span className={cn(line, "mt-1 h-1.5 w-3/4 bg-ink/30")} /><span className="flex flex-1 gap-1.5"><span className="flex flex-1 flex-col gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={line} />)}</span><span className="flex flex-1 flex-col gap-1">{[0, 1, 2].map((i) => <span key={i} className={line} />)}</span></span><span className="h-3 rounded-[2px] bg-accent/70" /></>)}
      {v === "premium" && (<><span className={cn(box, "relative flex-1 bg-ink/40")}><span className="absolute bottom-2 left-2 h-1.5 w-1/2 rounded-full bg-white/80" /></span><span className="text-center text-[9px] text-ink-4">+ opis · parametry · galeria · kontakt</span></>)}
      {v === "catalog" && (<>{[0, 1].map((i) => (<span key={i} className="flex flex-1 gap-1"><span className={cn(box, "w-[45%]")} /><span className="flex flex-1 flex-col gap-1 pt-1"><span className={cn(line, "w-full bg-ink/30")} /><span className={cn(line, "w-2/3 bg-accent/60")} /><span className={line} /></span></span>))}</>)}
    </span>
  );
}

export function NewBrochure({ properties, initialProperty, initialVariant }: { properties: PropertyOption[]; initialProperty: string | null; initialVariant: BrochureVariant }) {
  const [variant, setVariant] = useState<BrochureVariant>(initialVariant);
  const [selected, setSelected] = useState<string[]>(initialProperty ? [initialProperty] : properties[0] ? [properties[0].id] : []);
  const [pending, start] = useTransition();
  const v = BROCHURE_VARIANTS[variant];
  const multi = v.max > 1;

  function toggle(id: string) {
    if (!multi) return setSelected([id]);
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= v.max ? (toast.info(`Maksymalnie ${v.max} nieruchomości.`), cur) : [...cur, id]));
  }
  function pickVariant(next: BrochureVariant) {
    setVariant(next);
    if (BROCHURE_VARIANTS[next].max === 1) setSelected((cur) => cur.slice(0, 1));
  }
  const valid = selected.length >= v.min && selected.length <= v.max;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-[14px] font-semibold">1. Rodzaj broszury</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {(Object.keys(BROCHURE_VARIANTS) as BrochureVariant[]).map((k) => (
            <button key={k} type="button" onClick={() => pickVariant(k)} aria-pressed={variant === k} className={cn("flex flex-col gap-3 rounded-lg border bg-surface p-3 text-left transition-all", variant === k ? "border-accent ring-3 ring-accent/15" : "border-line hover:border-line-strong")}>
              <span className="mx-auto w-full max-w-36"><VariantSketch v={k} /></span>
              <span>
                <span className="flex items-center justify-between gap-2 text-[13.5px] font-medium">{BROCHURE_VARIANTS[k].label}{variant === k && <Check size={14} weight="bold" className="text-accent" />}</span>
                <span className="block text-[12px] text-ink-3">{BROCHURE_VARIANTS[k].page}</span>
                <span className="mt-1 block text-[12px] leading-snug text-ink-3">{BROCHURE_VARIANTS[k].description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-1 text-[14px] font-semibold">2. {multi ? `Nieruchomości (${selected.length} z ${v.min}–${v.max})` : "Nieruchomość"}</h2>
        {multi && <p className="mb-3 text-[12.5px] text-ink-3">Kolejność zaznaczania to kolejność w katalogu.</p>}
        {properties.length === 0 ? (
          <p className="rounded-md bg-sunken px-3 py-2 text-[13px] text-ink-3">Najpierw dodaj nieruchomość.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => {
              const idx = selected.indexOf(p.id);
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={idx >= 0} className={cn("flex items-center gap-3 rounded-lg border bg-surface p-2.5 text-left", idx >= 0 ? "border-accent ring-3 ring-accent/15" : "border-line hover:border-line-strong")}>
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sunken">{p.cover ? <img src={p.cover} alt="" className="size-full object-cover" /> : <House size={16} className="text-ink-4" />}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{p.title}</span><span className="block truncate text-[12px] text-ink-3">{p.subtitle || "Brak parametrów"} · {p.photoCount} zdj.</span></span>
                  {idx >= 0 && <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">{multi ? idx + 1 : <Check size={12} weight="bold" />}</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>
      <Card className="sticky bottom-4 flex items-center justify-between gap-4 p-3 pl-5 shadow-md">
        <span className="text-[13px] text-ink-3">{v.label}{!valid && multi ? ` · wybierz od ${v.min} do ${v.max} ofert` : ""}</span>
        <Button size="lg" disabled={!valid} loading={pending} onClick={() => start(async () => { const r = await createBrochure({ variant, propertyIds: selected }); if (r && !r.ok) toast.error(r.error); })}>Utwórz broszurę</Button>
      </Card>
    </div>
  );
}
