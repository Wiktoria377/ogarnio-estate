"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, House, MagnifyingGlass, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { Button, Spinner } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { CONTENT_GROUPS, type ContentTypeDef } from "@/core/marketing-engine/content-types";
import { CTA_TYPES, GOALS, LENGTHS, PLATFORMS, TONE_OVERRIDES, type ContentGroup, type CtaType, type Goal, type Length, type Platform, type ToneOverride } from "@/core/marketing-engine/taxonomy";
import { AUDIENCE_PRESETS, REAL_ESTATE_CONTENT_TYPES } from "@/verticals/real-estate/content-types";
import { cn } from "@/lib/utils";

interface PropertyOption {
  id: string;
  title: string;
  subtitle: string;
  cover: string | null;
}

interface State {
  contentType: string | null;
  propertyId: string | null;
  platform: Platform;
  goal: Goal;
  audience: string;
  customAudience: string;
  topic: string;
  marketData: string;
  tone: ToneOverride;
  length: Length;
  ctaType: CtaType;
  variants: number;
  sequenceCount: number | undefined;
  extraInstructions: string;
}

const STEPS = ["Rodzaj treści", "Kontekst", "Styl i forma", "Podsumowanie"];
const PHASES = ["Dobieram kompetencje do zadania…", "Piszę warianty…", "Sprawdzam fakty, CTA i zgodność z marką…", "Zapisuję w bibliotece…"];

function defaultsFor(def: ContentTypeDef, prev: State): State {
  return {
    ...prev,
    contentType: def.id,
    platform: def.platforms.includes(prev.platform) ? prev.platform : def.defaultPlatform,
    goal: def.defaultGoal,
    ctaType: def.defaultCta,
    length: def.defaultLength,
    sequenceCount: def.sequence ? Math.min(def.sequence.max, Math.max(def.sequence.min, def.sequence.prefix === "slide_" ? 6 : def.sequence.min)) : undefined,
    propertyId: def.property === "none" ? null : prev.propertyId,
  };
}

function Choice({ active, onClick, title, description, className }: { active: boolean; onClick: () => void; title: string; description?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("relative rounded-lg border bg-surface p-3.5 text-left transition-all hover:border-line-strong", active ? "border-accent ring-3 ring-accent/15" : "border-line", className)}>
      <div className="pr-5 text-[13.5px] font-medium text-ink">{title}</div>
      {description && <div className="mt-1 text-[12.5px] leading-snug text-ink-3">{description}</div>}
      {active && <Check size={14} weight="bold" className="absolute top-3.5 right-3 text-accent" />}
    </button>
  );
}

export function StudioWizard({ properties, initialType, initialProperty, brandAudience, initialPlatform = null, initialTopic = "" }: { properties: PropertyOption[]; initialType: string | null; initialProperty: string | null; brandAudience: string | null; initialPlatform?: Platform | null; initialTopic?: string }) {
  const router = useRouter();
  const initialDef = REAL_ESTATE_CONTENT_TYPES.find((d) => d.id === initialType) ?? null;
  const base: State = {
    contentType: null, propertyId: initialProperty, platform: initialPlatform ?? "instagram", goal: "sales", audience: brandAudience ? "brand" : "families", customAudience: "",
    topic: initialTopic, marketData: "", tone: "brand", length: "medium", ctaType: "message", variants: 2, sequenceCount: undefined, extraInstructions: "",
  };
  const [s, setS] = useState<State>(initialDef ? defaultsFor(initialDef, base) : base);
  const [step, setStep] = useState(initialDef ? 1 : 0);
  const [group, setGroup] = useState<ContentGroup>(initialDef?.group ?? (initialProperty ? "property" : "property"));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const def = REAL_ESTATE_CONTENT_TYPES.find((d) => d.id === s.contentType) ?? null;
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((x) => ({ ...x, [k]: v }));

  const types = useMemo(() => {
    const q = query.trim().toLowerCase();
    return REAL_ESTATE_CONTENT_TYPES.filter((d) => (q ? `${d.label} ${d.description}`.toLowerCase().includes(q) : d.group === group));
  }, [group, query]);

  const property = properties.find((p) => p.id === s.propertyId) ?? null;
  const contextError = def?.property === "required" && !s.propertyId ? "Wybierz nieruchomość: ten materiał opisuje konkretną ofertę." : def?.property === "none" && !s.topic.trim() ? "Wpisz temat lub kontekst materiału." : null;

  async function generate() {
    if (!def) return;
    setBusy(true);
    setPhase(0);
    const timer = setInterval(() => setPhase((p) => Math.min(p + 1, PHASES.length - 2)), 6000);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: def.id, propertyId: s.propertyId, platform: s.platform, goal: s.goal,
          audience: s.audience === "custom" ? s.customAudience : s.audience, topic: s.topic, marketData: s.marketData,
          tone: s.tone, length: s.length, ctaType: s.ctaType, variants: s.variants, sequenceCount: s.sequenceCount, extraInstructions: s.extraInstructions,
        }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error ?? "Nie udało się wygenerować treści.");
      setPhase(PHASES.length - 1);
      router.push(`/studio/${json.id}?new=1`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się wygenerować treści.");
      setBusy(false);
    } finally {
      clearInterval(timer);
    }
  }

  if (busy) {
    return (
      <Card className="mx-auto flex max-w-xl flex-col items-center px-8 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent"><Spinner className="size-5" /></span>
        <h2 className="mt-5 text-[17px] font-semibold">Przygotowuję {def?.label.toLowerCase()}</h2>
        <ol className="mt-5 flex flex-col gap-2 text-left text-[13.5px]">
          {PHASES.map((p, i) => (
            <li key={p} className={cn("flex items-center gap-2.5 transition-colors", i < phase ? "text-ink-3" : i === phase ? "text-ink" : "text-ink-4")}>
              {i < phase ? <Check size={14} className="text-success" /> : i === phase ? <Spinner className="size-3.5" /> : <span className="size-3.5 rounded-full border border-line-strong" />}
              {p}
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[12.5px] text-ink-4">Każdy wariant przechodzi kontrolę faktów i jakości przed zapisaniem.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap items-center gap-2" aria-label="Kroki kreatora">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              disabled={i > step || (i > 0 && !def)}
              onClick={() => setStep(i)}
              className={cn("flex h-8 items-center gap-2 rounded-full pr-3 pl-1 text-[13px] transition-colors", i === step ? "bg-ink text-white" : i < step ? "text-ink-2 hover:bg-sunken" : "text-ink-4")}
              aria-current={i === step ? "step" : undefined}
            >
              <span className={cn("flex size-6 items-center justify-center rounded-full text-[12px] font-semibold", i === step ? "bg-white/15" : i < step ? "bg-success-soft text-success" : "bg-sunken")}>{i < step ? <Check size={12} weight="bold" /> : i + 1}</span>
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-5 bg-line-strong" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5" role="tablist">
              {(Object.keys(CONTENT_GROUPS) as ContentGroup[]).map((g, i) => (
                <button key={g} role="tab" aria-selected={!query && group === g} onClick={() => { setGroup(g); setQuery(""); }} className={cn("h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors", !query && group === g ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>
                  <span className="mr-1.5 opacity-50">{"ABCD"[i]}</span>{CONTENT_GROUPS[g].label}
                </button>
              ))}
            </div>
            <div className="relative lg:w-72">
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Szukaj w 40 rodzajach treści" className="pl-9" aria-label="Szukaj rodzaju treści" />
            </div>
          </div>
          {!query && <p className="-mt-2 text-[13px] text-ink-3">{CONTENT_GROUPS[group].description}</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {types.map((d) => (
              <Choice key={d.id} active={s.contentType === d.id} title={d.label} description={d.description} onClick={() => { setS((x) => defaultsFor(d, x)); setStep(1); }} />
            ))}
            {types.length === 0 && <p className="text-[13.5px] text-ink-3">Brak wyników dla „{query}”.</p>}
          </div>
        </div>
      )}

      {step === 1 && def && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="flex flex-col gap-6 p-6">
            {def.property !== "none" && (
              <Field label={def.property === "required" ? "Nieruchomość" : "Nieruchomość (opcjonalnie)"} htmlFor="propertyId" hint={def.property === "optional" ? "Jeśli wybierzesz ofertę, tekst może się do niej odnosić." : "Dane i opis oferty to jedyne fakty, których użyje generator."}>
                {properties.length === 0 ? (
                  <div className="rounded-md border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-3">Nie masz jeszcze nieruchomości. <a href="/properties/new" className="font-medium text-accent">Dodaj ofertę</a>, aby generować materiały sprzedażowe.</div>
                ) : (
                  <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {def.property === "optional" && <Choice active={!s.propertyId} onClick={() => set("propertyId", null)} title="Bez nieruchomości" description="Materiał ogólny" />}
                    {properties.map((p) => (
                      <button key={p.id} type="button" onClick={() => set("propertyId", p.id)} aria-pressed={s.propertyId === p.id} className={cn("flex items-center gap-3 rounded-lg border bg-surface p-2 text-left transition-all", s.propertyId === p.id ? "border-accent ring-3 ring-accent/15" : "border-line hover:border-line-strong")}>
                        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sunken">{p.cover ? <img src={p.cover} alt="" className="size-full object-cover" /> : <House size={18} className="text-ink-4" />}</span>
                        <span className="min-w-0"><span className="block truncate text-[13.5px] font-medium">{p.title}</span><span className="block truncate text-[12px] text-ink-3">{p.subtitle}</span></span>
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Platforma" htmlFor="platform">
                <NativeSelect id="platform" value={s.platform} onChange={(e) => set("platform", e.target.value as Platform)}>
                  {def.platforms.map((p) => <option key={p} value={p}>{PLATFORMS[p].label}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Cel" htmlFor="goal">
                <NativeSelect id="goal" value={s.goal} onChange={(e) => set("goal", e.target.value as Goal)}>
                  {Object.entries(GOALS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Odbiorca" htmlFor="audience" className="sm:col-span-2">
                <NativeSelect id="audience" value={s.audience} onChange={(e) => set("audience", e.target.value)}>
                  {Object.entries(AUDIENCE_PRESETS).filter(([k]) => k !== "brand" || brandAudience).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  <option value="custom">Własny opis odbiorcy…</option>
                </NativeSelect>
                {s.audience === "custom" && <Input className="mt-2" value={s.customAudience} onChange={(e) => set("customAudience", e.target.value)} placeholder="np. Pary 30+ pracujące w centrum, szukające 3 pokoi" maxLength={300} aria-label="Własny opis odbiorcy" />}
              </Field>
            </div>
            <Field label={def.property === "none" ? "Temat i kontekst" : "Temat lub akcent (opcjonalnie)"} htmlFor="topic" hint={def.property === "none" ? "O czym ma być materiał. Podaj konkrety, które znasz." : "Np. „podkreśl balkon i ciszę od podwórza”."}>
              <Textarea id="topic" rows={3} value={s.topic} onChange={(e) => set("topic", e.target.value)} maxLength={2000} />
            </Field>
            {def.marketData && (
              <Field label="Dane rynkowe (opcjonalnie)" htmlFor="marketData" hint="Wklej dane ze źródłem (np. raport NBP, dane własne biura). Bez danych generator nie poda żadnych liczb ani trendów.">
                <Textarea id="marketData" rows={4} value={s.marketData} onChange={(e) => set("marketData", e.target.value)} maxLength={4000} placeholder="Źródło: … · Okres: … · Wartości: …" />
              </Field>
            )}
          </Card>
          <SummaryAside def={def} property={property} />
        </div>
      )}

      {step === 2 && def && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="flex flex-col gap-6 p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Ton" htmlFor="tone" hint="Zmiana tonu działa w granicach stylu marki.">
                <NativeSelect id="tone" value={s.tone} onChange={(e) => set("tone", e.target.value as ToneOverride)}>
                  {Object.entries(TONE_OVERRIDES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Rodzaj CTA" htmlFor="ctaType">
                <NativeSelect id="ctaType" value={s.ctaType} onChange={(e) => set("ctaType", e.target.value as CtaType)}>
                  {Object.entries(CTA_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </NativeSelect>
              </Field>
            </div>
            <Field label="Długość" htmlFor="length-medium">
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(LENGTHS) as Length[]).map((l) => <Choice key={l} active={s.length === l} onClick={() => set("length", l)} title={LENGTHS[l].label} description={LENGTHS[l].hint} />)}
              </div>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Liczba wariantów" htmlFor="variants" hint="Kolejne warianty dodasz później bez utraty obecnych.">
                <div className="grid h-9 grid-cols-3 gap-0.5 rounded-md bg-sunken p-0.5">
                  {[1, 2, 3].map((n) => (
                    <button key={n} type="button" onClick={() => set("variants", n)} aria-pressed={s.variants === n} className={cn("rounded-[5px] text-[13px] font-medium", s.variants === n ? "bg-surface shadow-xs" : "text-ink-3")}>{n}</button>
                  ))}
                </div>
              </Field>
              {def.sequence && (
                <Field label={`Liczba elementów (${def.sequence.label.toLowerCase()})`} htmlFor="sequenceCount" hint={`Od ${def.sequence.min} do ${def.sequence.max}.`}>
                  <Input id="sequenceCount" type="number" min={def.sequence.min} max={def.sequence.max} value={s.sequenceCount ?? def.sequence.min} onChange={(e) => set("sequenceCount", Math.min(def.sequence!.max, Math.max(def.sequence!.min, Number(e.target.value) || def.sequence!.min)))} />
                </Field>
              )}
            </div>
            <Field label="Dodatkowe wskazówki (opcjonalnie)" htmlFor="extra" hint="Np. „bez wspominania o kredycie”, „zakończ pytaniem”.">
              <Textarea id="extra" rows={3} value={s.extraInstructions} onChange={(e) => set("extraInstructions", e.target.value)} maxLength={1500} />
            </Field>
          </Card>
          <SummaryAside def={def} property={property} />
        </div>
      )}

      {step === 3 && def && (
        <Card className="max-w-3xl p-6">
          <h2 className="text-[16px] font-semibold">Sprawdź ustawienia</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-3 text-[13.5px] sm:grid-cols-2">
            {[
              ["Rodzaj treści", def.label],
              ["Nieruchomość", property?.title ?? "Bez nieruchomości"],
              ["Platforma", PLATFORMS[s.platform].label],
              ["Cel", GOALS[s.goal]],
              ["Odbiorca", s.audience === "custom" ? s.customAudience || "—" : AUDIENCE_PRESETS[s.audience as keyof typeof AUDIENCE_PRESETS]],
              ["Ton", TONE_OVERRIDES[s.tone]],
              ["Długość", LENGTHS[s.length].label],
              ["CTA", CTA_TYPES[s.ctaType]],
              ["Warianty", String(s.variants)],
              ...(def.sequence ? [[def.sequence.label, String(s.sequenceCount)]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-line pb-2"><dt className="text-ink-3">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
          {s.topic && <p className="mt-4 rounded-md bg-sunken p-3 text-[13px] text-ink-2"><span className="font-medium">Temat:</span> {s.topic}</p>}
          <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">Generator użyje marki biura i automatycznie dobranych kompetencji. Fakty pochodzą wyłącznie z danych oferty i tego, co wpisałeś. Po wygenerowaniu zobaczysz raport jakości każdego wariantu.</p>
        </Card>
      )}

      {step > 0 && def && (
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft /> Wstecz</Button>
          <div className="flex items-center gap-3">
            {step === 1 && contextError && <span className="hidden text-[13px] text-ink-3 sm:inline">{contextError}</span>}
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !!contextError}>Dalej <ArrowRight /></Button>
            ) : (
              <Button size="lg" onClick={generate}><Sparkle weight="fill" /> Generuj {s.variants === 1 ? "wariant" : `${s.variants} warianty`}</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryAside({ def, property }: { def: ContentTypeDef; property: PropertyOption | null }) {
  return (
    <aside className="flex flex-col gap-3 lg:sticky lg:top-8 lg:self-start">
      <Card className="p-4">
        <div className="text-[12px] font-medium text-ink-3">{CONTENT_GROUPS[def.group].label}</div>
        <div className="mt-1 text-[15px] font-semibold">{def.label}</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{def.description}</p>
        <div className="mt-3 border-t border-line pt-3 text-[12px] text-ink-3">
          Struktura: {[...def.sections.map((x) => x.label), ...(def.sequence ? [`${def.sequence.label} ×${def.sequence.min}–${def.sequence.max}`] : []), ...(def.tailSections ?? []).map((x) => x.label)].join(" · ")}
        </div>
      </Card>
      {property && (
        <Card className="flex items-center gap-3 p-3">
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sunken">{property.cover ? <img src={property.cover} alt="" className="size-full object-cover" /> : <House size={16} className="text-ink-4" />}</span>
          <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{property.title}</span><span className="block truncate text-[12px] text-ink-3">{property.subtitle}</span></span>
        </Card>
      )}
    </aside>
  );
}
