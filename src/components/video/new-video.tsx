"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, House, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/field";
import { PHOTO_SCENES, VIDEO_LENGTHS, VIDEO_STYLES, type VideoLength } from "@/core/video/model";
import type { ReelStyle } from "@/remotion/types";
import { createVideo } from "@/app/(app)/video/actions";
import { cn } from "@/lib/utils";

interface PropertyOption { id: string; title: string; subtitle: string; cover: string | null; photos: { id: string; url: string; isVisualization: boolean }[] }

/** Small looping CSS motion sample of each style (no content, just the movement). */
function StyleSample({ style }: { style: ReelStyle }) {
  const anim = { cinematic: "animate-[reel-zoom_6s_ease-in-out_infinite_alternate]", modern: "animate-[reel-pan_5s_ease-in-out_infinite_alternate]", energetic: "animate-[reel-pop_1.6s_ease-out_infinite]", minimal: "animate-[reel-pan_8s_linear_infinite_alternate]", editorial: "animate-[reel-rise_4s_ease-in-out_infinite_alternate]" }[style];
  return (
    <span className="relative block aspect-[9/16] w-14 shrink-0 overflow-hidden rounded-md bg-ink/80">
      <span className={cn("absolute inset-[-12%] bg-gradient-to-br from-accent/70 via-ink/40 to-ink/90", anim)} />
      <span className={cn("absolute right-2 bottom-3 left-2 h-1.5 rounded-full bg-white/85", style === "energetic" && "h-2.5 rounded-sm bg-accent")} />
      <span className="absolute bottom-6 left-2 h-1 w-1/2 rounded-full bg-white/60" />
    </span>
  );
}

export function NewVideo({ properties, initialProperty }: { properties: PropertyOption[]; initialProperty: string | null }) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState(initialProperty ?? properties.find((p) => p.photos.length)?.id ?? "");
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [style, setStyle] = useState<ReelStyle>("modern");
  const [length, setLength] = useState<VideoLength>(15);
  const [instructions, setInstructions] = useState("");
  const [pending, start] = useTransition();
  const property = properties.find((p) => p.id === propertyId);
  const n = PHOTO_SCENES[length];

  function pickProperty(id: string) {
    setPropertyId(id);
    setPhotoIds([]);
  }
  function togglePhoto(id: string) {
    setPhotoIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= n ? (toast.info(`Film ${length} s ma ${n} ${n === 1 ? "scenę" : n < 5 ? "sceny" : "scen"} ze zdjęciami.`), cur) : [...cur, id]));
  }
  function pickLength(l: VideoLength) {
    setLength(l);
    setPhotoIds((cur) => cur.slice(0, PHOTO_SCENES[l]));
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-[14px] font-semibold">1. Nieruchomość</h2>
        {properties.length === 0 ? (
          <p className="rounded-md bg-sunken px-3 py-2 text-[13px] text-ink-3">Najpierw dodaj nieruchomość ze zdjęciami.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => (
              <button key={p.id} type="button" disabled={!p.photos.length} onClick={() => pickProperty(p.id)} aria-pressed={propertyId === p.id} className={cn("flex items-center gap-3 rounded-lg border bg-surface p-2.5 text-left disabled:opacity-50", propertyId === p.id ? "border-accent ring-3 ring-accent/15" : "border-line hover:border-line-strong")}>
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sunken">{p.cover ? <img src={p.cover} alt="" className="size-full object-cover" /> : <House size={16} className="text-ink-4" />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{p.title}</span><span className="block truncate text-[12px] text-ink-3">{p.photos.length ? `${p.photos.length} zdj.` : "Brak zdjęć: dodaj je w karcie oferty"}{p.subtitle ? ` · ${p.subtitle}` : ""}</span></span>
                {propertyId === p.id && <Check size={14} weight="bold" className="text-accent" />}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-[14px] font-semibold">2. Długość</h2>
        <p className="mb-3 text-[12.5px] text-ink-3">Każdy film kończy się planszą z logo i wezwaniem do działania. Cena i parametry pojawiają się na osobnej planszy.</p>
        <div className="flex flex-wrap gap-2">
          {VIDEO_LENGTHS.map((l) => (
            <button key={l} type="button" onClick={() => pickLength(l)} aria-pressed={length === l} className={cn("rounded-lg border bg-surface px-4 py-2.5 text-left", length === l ? "border-accent ring-3 ring-accent/15" : "border-line hover:border-line-strong")}>
              <span className="block text-[15px] font-semibold">{l} s</span>
              <span className="block text-[12px] text-ink-3">{PHOTO_SCENES[l]} {PHOTO_SCENES[l] < 5 ? "sceny" : "scen"} ze zdjęciami</span>
            </button>
          ))}
        </div>
      </section>

      {property && (
        <section>
          <h2 className="mb-1 text-[14px] font-semibold">3. Zdjęcia ({photoIds.length}/{n})</h2>
          <p className="mb-3 text-[12.5px] text-ink-3">Kolejność zaznaczania to kolejność scen. Brakujące sceny uzupełnimy najlepszymi zdjęciami (ostrość, ekspozycja, prawdziwe zdjęcia przed wizualizacjami). Wideo powstaje tylko z Twoich zdjęć.</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {property.photos.map((p) => {
              const idx = photoIds.indexOf(p.id);
              return (
                <button key={p.id} type="button" onClick={() => togglePhoto(p.id)} aria-pressed={idx >= 0} aria-label={`Zdjęcie${idx >= 0 ? `, scena ${idx + 1}` : ""}`} className={cn("relative aspect-[3/4] overflow-hidden rounded-md border-2", idx >= 0 ? "border-accent" : "border-transparent hover:border-line-strong")}>
                  <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />
                  {idx >= 0 && <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">{idx + 1}</span>}
                  {p.isVisualization && <span className="absolute bottom-1 left-1 rounded bg-ink/70 px-1 text-[10px] text-white">Wizualizacja</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-[14px] font-semibold">4. Styl</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {(Object.keys(VIDEO_STYLES) as ReelStyle[]).map((k) => (
            <button key={k} type="button" onClick={() => setStyle(k)} aria-pressed={style === k} className={cn("flex gap-3 rounded-lg border bg-surface p-2.5 text-left", style === k ? "border-accent ring-3 ring-accent/15" : "border-line hover:border-line-strong")}>
              <StyleSample style={k} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13.5px] font-medium">{VIDEO_STYLES[k].label}{style === k && <Check size={13} weight="bold" className="text-accent" />}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{VIDEO_STYLES[k].description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-2xl">
        <Label htmlFor="v-instr">5. Wskazówki do scenariusza (opcjonalnie)</Label>
        <Textarea id="v-instr" className="mt-1.5" rows={3} maxLength={600} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Np. podkreśl ogród i ciszę okolicy; zwracaj się do rodzin z dziećmi." />
      </section>

      <Card className="sticky bottom-4 flex flex-wrap items-center justify-between gap-4 p-3 pl-5 shadow-md">
        <span className="text-[13px] text-ink-3">{VIDEO_STYLES[style].label} · {length} s · 1080×1920, 30 kl./s. Scenariusz trafi do Twojej akceptacji przed renderem.</span>
        <Button size="lg" disabled={!property} loading={pending} onClick={() => start(async () => {
          const r = await createVideo({ propertyId, style, length, photoIds, instructions });
          if (!r.ok) return void toast.error(r.error);
          router.push(`/video/${r.data.id}`);
        })}><Sparkle weight="fill" /> Napisz scenariusz</Button>
      </Card>
    </div>
  );
}
