"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, House, Image as ImageIcon, Lightning, Megaphone, Warning } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { AUDIENCE_PRESETS } from "@/verticals/real-estate/content-types";
import {
  CAMPAIGN_GOALS,
  CAMPAIGN_PLATFORMS,
  CAMPAIGN_STYLES,
  DELIVERABLES,
  DELIVERABLE_ORDER,
  estimateAiOperations,
  type CampaignPlatform,
  type DeliverableId,
} from "@/verticals/real-estate/campaign";
import type { CampaignGoal, CampaignStyle } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export interface CampaignPropertyOption {
  id: string;
  title: string;
  subtitle: string;
  cover: string | null;
  photoCount: number;
  price: number | null;
  priceLabel: string | null;
}

interface State {
  propertyId: string | null;
  goal: CampaignGoal;
  audience: string;
  customAudience: string;
  style: CampaignStyle;
  platforms: CampaignPlatform[];
  deliverables: DeliverableId[];
  name: string;
  nameTouched: boolean;
  previousPrice: string;
  openHouseDate: string;
  openHouseFrom: string;
  openHouseTo: string;
  startDate: string;
  notes: string;
}

const STEPS = ["Nieruchomość", "Cel", "Odbiorca i styl", "Kanały i materiały", "Podsumowanie"];

function defaultDeliverables(platforms: CampaignPlatform[], photos: number): DeliverableId[] {
  const out: DeliverableId[] = [];
  if (platforms.includes("instagram")) out.push("ig_post");
  if (platforms.includes("facebook") || platforms.includes("linkedin")) out.push("fb_post");
  if (photos > 0) out.push("carousel", "stories");
  if (photos >= 3 && (platforms.includes("instagram") || platforms.includes("tiktok") || platforms.includes("facebook"))) out.push("reel", "reel_caption");
  if (platforms.includes("meta_ads")) out.push("ad_headlines", "meta_ads");
  if (photos > 0) out.push("brochure");
  out.push("schedule");
  return out;
}

function Choice({ active, onClick, title, description, disabled, className, children }: { active: boolean; onClick: () => void; title: string; description?: string; disabled?: boolean; className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className={cn("relative rounded-lg border bg-surface p-3.5 text-left transition-all hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50", active ? "border-accent ring-3 ring-accent/15" : "border-line", className)}>
      <div className="pr-5 text-[13.5px] font-medium text-ink">{title}</div>
      {description && <div className="mt-1 text-[12.5px] leading-snug text-ink-3">{description}</div>}
      {children}
      {active && <Check size={14} weight="bold" className="absolute top-3.5 right-3 text-accent" />}
    </button>
  );
}

export function CampaignWizard({ properties, initialProperty, brandAudience, quota, today }: { properties: CampaignPropertyOption[]; initialProperty: string | null; brandAudience: string | null; quota: { used: number; limit: number; renderUsed: number; renderLimit: number }; today: string }) {
  const router = useRouter();
  const initial = properties.find((p) => p.id === initialProperty) ?? null;
  const [s, setS] = useState<State>({
    propertyId: initial?.id ?? null,
    goal: "new_listing",
    audience: brandAudience ? "brand" : "families",
    customAudience: "",
    style: "brand",
    platforms: ["instagram", "facebook"],
    deliverables: defaultDeliverables(["instagram", "facebook"], initial?.photoCount ?? 0),
    name: "",
    nameTouched: false,
    previousPrice: "",
    openHouseDate: "",
    openHouseFrom: "11:00",
    openHouseTo: "14:00",
    startDate: today,
    notes: "",
  });
  const [step, setStep] = useState(initial ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((x) => ({ ...x, [k]: v }));
  const property = properties.find((p) => p.id === s.propertyId) ?? null;
  const autoName = property ? `${CAMPAIGN_GOALS[s.goal].label} · ${property.title}`.slice(0, 160) : "";
  const name = s.nameTouched ? s.name : autoName;
  const needed = estimateAiOperations(s.deliverables);
  const remaining = Math.max(0, quota.limit - quota.used);

  const stepError = useMemo(() => {
    if (step === 0 && !property) return "Wybierz nieruchomość.";
    if (step === 1 && s.goal === "price_drop") {
      if (!property?.price) return "Ta oferta nie ma ceny w danych, więc nie można komunikować obniżki.";
      const prev = Number(s.previousPrice.replace(/\s/g, "").replace(",", "."));
      if (!prev) return "Podaj poprzednią cenę.";
      if (prev <= property.price) return "Poprzednia cena musi być wyższa od obecnej.";
    }
    if (step === 1 && s.goal === "open_house") {
      if (!s.openHouseDate || !s.openHouseFrom || !s.openHouseTo) return "Podaj datę i godziny dnia otwartego.";
      if (s.openHouseDate < today) return "Data dnia otwartego jest w przeszłości.";
      if (s.openHouseFrom >= s.openHouseTo) return "Godzina zakończenia musi być późniejsza niż rozpoczęcia.";
    }
    if (step === 2 && s.audience === "custom" && !s.customAudience.trim()) return "Opisz odbiorcę kampanii.";
    if (step === 3 && s.platforms.length === 0) return "Wybierz co najmniej jeden kanał.";
    if (step === 3 && s.deliverables.length === 0) return "Wybierz co najmniej jeden materiał.";
    if (step === 3 && needed > remaining) return `Kampania potrzebuje ${needed} generowań AI, a zostało ${remaining}. Odznacz część materiałów.`;
    if (step === 4 && name.trim().length < 2) return "Podaj nazwę kampanii.";
    return null;
  }, [step, property, s, needed, remaining, name, today]);

  function togglePlatform(p: CampaignPlatform) {
    setS((x) => {
      const platforms = x.platforms.includes(p) ? x.platforms.filter((y) => y !== p) : [...x.platforms, p];
      return { ...x, platforms, deliverables: defaultDeliverables(platforms, property?.photoCount ?? 0) };
    });
  }
  function toggleDeliverable(d: DeliverableId) {
    setS((x) => ({ ...x, deliverables: x.deliverables.includes(d) ? x.deliverables.filter((y) => y !== d) : DELIVERABLE_ORDER.filter((y) => y === d || x.deliverables.includes(y)) }));
  }
  const deliverableBlock = (d: DeliverableId): string | null => {
    const k = DELIVERABLES[d].kind;
    if (!property) return null;
    if ((k === "graphic" || k === "document") && property.photoCount === 0) return "Wymaga zdjęć oferty";
    if (d === "reel" && property.photoCount < 3) return "Wymaga co najmniej 3 zdjęć";
    if (d === "reel" && quota.renderUsed >= quota.renderLimit) return "Wykorzystany limit renderowania wideo";
    return null;
  };

  async function start() {
    if (!property) return;
    setBusy(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: property.id,
          name: name.trim(),
          goal: s.goal,
          audience: s.audience === "custom" ? s.customAudience.trim() : s.audience,
          style: s.style,
          platforms: s.platforms,
          deliverables: s.deliverables,
          options: {
            previousPrice: s.goal === "price_drop" ? Number(s.previousPrice.replace(/\s/g, "").replace(",", ".")) || null : null,
            openHouseDate: s.goal === "open_house" ? s.openHouseDate || null : null,
            openHouseFrom: s.goal === "open_house" ? s.openHouseFrom || null : null,
            openHouseTo: s.goal === "open_house" ? s.openHouseTo || null : null,
            notes: s.notes,
            startDate: s.startDate || null,
          },
        }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error ?? "Nie udało się uruchomić kampanii.");
      router.push(`/campaigns/${json.id}?new=1`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się uruchomić kampanii.");
      setBusy(false);
    }
  }

  const audienceLabel = s.audience === "custom" ? s.customAudience || "Własny opis" : s.audience === "brand" ? brandAudience || AUDIENCE_PRESETS.brand : AUDIENCE_PRESETS[s.audience as keyof typeof AUDIENCE_PRESETS];

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap items-center gap-2" aria-label="Kroki kreatora kampanii">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <button type="button" disabled={i > step} onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined} className={cn("flex h-8 items-center gap-2 rounded-full pr-3 pl-1 text-[13px] transition-colors", i === step ? "bg-ink text-white" : i < step ? "text-ink-2 hover:bg-sunken" : "text-ink-4")}>
              <span className={cn("flex size-6 items-center justify-center rounded-full text-[12px] font-semibold", i === step ? "bg-white/15" : i < step ? "bg-success-soft text-success" : "bg-sunken")}>{i < step ? <Check size={12} weight="bold" /> : i + 1}</span>
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-5 bg-line-strong" />}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex flex-col gap-6 p-6">
          {step === 0 && (
            <Field label="Nieruchomość" htmlFor="property" hint="Kampania używa wyłącznie danych i zdjęć tej oferty.">
              {properties.length === 0 ? (
                <div className="rounded-md border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-3">Nie masz jeszcze nieruchomości. <a href="/properties/new" className="font-medium text-accent">Dodaj ofertę</a>, aby stworzyć kampanię.</div>
              ) : (
                <div id="property" className="grid max-h-[420px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {properties.map((p) => (
                    <button key={p.id} type="button" onClick={() => setS((x) => ({ ...x, propertyId: p.id, deliverables: defaultDeliverables(x.platforms, p.photoCount) }))} aria-pressed={s.propertyId === p.id} className={cn("flex items-center gap-3 rounded-lg border bg-surface p-2 text-left transition-all", s.propertyId === p.id ? "border-accent ring-3 ring-accent/15" : "border-line hover:border-line-strong")}>
                      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sunken">{p.cover ? <img src={p.cover} alt="" className="size-full object-cover" /> : <House size={18} className="text-ink-4" />}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">{p.title}</span>
                        <span className="block truncate text-[12px] text-ink-3">{p.subtitle}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-ink-4"><ImageIcon size={12} /> {p.photoCount} zdj.{p.priceLabel ? ` · ${p.priceLabel}` : ""}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Field>
          )}

          {step === 1 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(CAMPAIGN_GOALS) as CampaignGoal[]).map((g) => (
                  <Choice key={g} active={s.goal === g} onClick={() => set("goal", g)} title={CAMPAIGN_GOALS[g].label} description={CAMPAIGN_GOALS[g].description} />
                ))}
              </div>
              {s.goal === "price_drop" && (
                <div className="grid gap-4 rounded-lg border border-line bg-sunken/40 p-4 sm:grid-cols-2">
                  <Field label="Obecna cena (z oferty)" htmlFor="currentPrice">
                    <Input id="currentPrice" value={property?.priceLabel ?? "Brak ceny w ofercie"} disabled />
                  </Field>
                  <Field label="Poprzednia cena" htmlFor="previousPrice" hint="Kwota sprzed obniżki. Trafi do materiałów dokładnie tak, jak ją wpiszesz.">
                    <Input id="previousPrice" inputMode="decimal" value={s.previousPrice} onChange={(e) => set("previousPrice", e.target.value)} placeholder="np. 890 000" />
                  </Field>
                </div>
              )}
              {s.goal === "open_house" && (
                <div className="grid gap-4 rounded-lg border border-line bg-sunken/40 p-4 sm:grid-cols-3">
                  <Field label="Data" htmlFor="ohDate"><Input id="ohDate" type="date" min={today} value={s.openHouseDate} onChange={(e) => set("openHouseDate", e.target.value)} /></Field>
                  <Field label="Od" htmlFor="ohFrom"><Input id="ohFrom" type="time" value={s.openHouseFrom} onChange={(e) => set("openHouseFrom", e.target.value)} /></Field>
                  <Field label="Do" htmlFor="ohTo"><Input id="ohTo" type="time" value={s.openHouseTo} onChange={(e) => set("openHouseTo", e.target.value)} /></Field>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Odbiorca" htmlFor="audience" hint="Dyrektor marketingu dobiera argumenty i kompetencje do odbiorcy.">
                <NativeSelect id="audience" value={s.audience} onChange={(e) => set("audience", e.target.value)}>
                  {Object.entries(AUDIENCE_PRESETS).map(([k, v]) => (k === "brand" && !brandAudience ? null : <option key={k} value={k}>{v}</option>))}
                  <option value="custom">Własny opis…</option>
                </NativeSelect>
              </Field>
              {s.audience === "custom" && (
                <Field label="Opis odbiorcy" htmlFor="customAudience">
                  <Textarea id="customAudience" maxLength={300} value={s.customAudience} onChange={(e) => set("customAudience", e.target.value)} placeholder="np. pary pracujące zdalnie, szukające mieszkania z osobnym gabinetem" />
                </Field>
              )}
              <div>
                <div className="mb-2 text-[13px] font-medium text-ink-2">Styl komunikacji</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(Object.keys(CAMPAIGN_STYLES) as CampaignStyle[]).map((st) => (
                    <Choice key={st} active={s.style === st} onClick={() => set("style", st)} title={CAMPAIGN_STYLES[st].label} description={CAMPAIGN_STYLES[st].hint} />
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <div className="mb-2 text-[13px] font-medium text-ink-2">Kanały</div>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(CAMPAIGN_PLATFORMS) as CampaignPlatform[]).map((p) => (
                    <button key={p} type="button" aria-pressed={s.platforms.includes(p)} onClick={() => togglePlatform(p)} className={cn("h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors", s.platforms.includes(p) ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>
                      {s.platforms.includes(p) && <Check size={12} weight="bold" className="mr-1.5 inline" />}{CAMPAIGN_PLATFORMS[p]}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12.5px] text-ink-3">Zmiana kanałów ustawia proponowany zestaw materiałów. Możesz go dowolnie zmienić poniżej.</p>
              </div>
              <div>
                <div className="mb-2 text-[13px] font-medium text-ink-2">Materiały do wygenerowania</div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {DELIVERABLE_ORDER.map((d) => {
                    const block = deliverableBlock(d);
                    return (
                      <Choice key={d} active={s.deliverables.includes(d)} disabled={!!block && !s.deliverables.includes(d)} onClick={() => toggleDeliverable(d)} title={DELIVERABLES[d].label} description={block ?? DELIVERABLES[d].hint} />
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <Field label="Nazwa kampanii" htmlFor="name">
                <Input id="name" maxLength={160} value={name} onChange={(e) => setS((x) => ({ ...x, name: e.target.value, nameTouched: true }))} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Start publikacji" htmlFor="startDate" hint="Od tej daty planer rozłoży publikacje.">
                  <Input id="startDate" type="date" min={today} value={s.startDate} onChange={(e) => set("startDate", e.target.value)} />
                </Field>
              </div>
              <Field label="Uwagi dla dyrektora marketingu" htmlFor="notes" optional hint="Np. co podkreślić. Traktowane jako dane, nie polecenia.">
                <Textarea id="notes" maxLength={1000} value={s.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
              <div className="rounded-lg border border-line bg-sunken/40 p-4 text-[13px] leading-relaxed text-ink-2">
                <div className="flex items-center gap-2 font-medium text-ink"><Lightning size={15} className="text-accent" /> Koszt i czas</div>
                <p className="mt-1">Kampania zużyje około <strong>{needed}</strong> generowań AI (zostało {remaining} z {quota.limit} w tym miesiącu). Materiały powstają w tle, a postęp zobaczysz na stronie kampanii.{s.deliverables.includes("reel") ? " Wideo: AI przygotuje scenariusz, a render MP4 uruchomisz po jego akceptacji." : ""}</p>
              </div>
            </>
          )}

          {stepError && step > 0 && <p role="alert" className="flex items-center gap-2 text-[13px] text-danger"><Warning size={15} /> {stepError}</p>}

          <div className="flex items-center justify-between border-t border-line pt-5">
            <Button variant="ghost" onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0 || busy}><ArrowLeft /> Wróć</Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((x) => x + 1)} disabled={!!stepError}>Dalej <ArrowRight /></Button>
            ) : (
              <Button onClick={start} loading={busy} disabled={!!stepError}><Megaphone /> Uruchom kampanię</Button>
            )}
          </div>
        </Card>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card className="overflow-hidden p-0">
            <div className="aspect-[4/3] bg-sunken">{property?.cover ? <img src={property.cover} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-ink-4"><House size={28} /></div>}</div>
            <div className="flex flex-col gap-3 p-4 text-[13px]">
              <div>
                <div className="text-[11.5px] font-medium tracking-wide text-ink-4 uppercase">Podgląd kampanii</div>
                <div className="mt-0.5 text-[14.5px] font-semibold text-ink">{property?.title ?? "Wybierz nieruchomość"}</div>
                {property && <div className="text-ink-3">{property.subtitle}</div>}
              </div>
              <dl className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-1.5">
                <dt className="text-ink-4">Cel</dt><dd className="text-ink-2">{CAMPAIGN_GOALS[s.goal].label}</dd>
                <dt className="text-ink-4">Odbiorca</dt><dd className="line-clamp-2 text-ink-2">{audienceLabel}</dd>
                <dt className="text-ink-4">Styl</dt><dd className="text-ink-2">{CAMPAIGN_STYLES[s.style].label}</dd>
                <dt className="text-ink-4">Kanały</dt><dd className="text-ink-2">{s.platforms.map((p) => CAMPAIGN_PLATFORMS[p]).join(", ") || "—"}</dd>
              </dl>
              <div>
                <div className="mb-1 text-ink-4">Materiały ({s.deliverables.length})</div>
                <ul className="flex flex-col gap-1">
                  {s.deliverables.map((d) => <li key={d} className="flex items-center gap-2 text-ink-2"><Check size={12} className="text-success" /> {DELIVERABLES[d].label}</li>)}
                </ul>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
