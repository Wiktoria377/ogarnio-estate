"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RocketLaunch } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { AUTOPILOT_PLATFORMS, AUTOPILOT_PLATFORM_IDS, PILLARS, PILLAR_IDS, type AutopilotPlatform, type Pillar } from "@/core/autopilot/plan";
import { BUSINESS_GOALS, type BusinessGoal } from "@/core/strategy/director";
import { planMarketing } from "@/app/(app)/autopilot/actions";

export interface AutopilotProperty {
  id: string;
  title: string;
  detail: string;
  photos: number;
}

const chip = "flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[13px] text-ink-2 has-checked:border-accent has-checked:bg-accent-soft";

export function AutopilotForm({ properties, strategies, startDate, quotaLeft }: { properties: AutopilotProperty[]; strategies: { id: string; title: string }[]; startDate: string; quotaLeft: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [start0, setStart] = useState(startDate);
  const [days, setDays] = useState("30");
  const [count, setCount] = useState("12");
  const [platforms, setPlatforms] = useState<AutopilotPlatform[]>(["instagram", "facebook"]);
  const [selected, setSelected] = useState<string[]>([]);
  const [pillars, setPillars] = useState<Pillar[]>(["offers", "education", "trust"]);
  const [goals, setGoals] = useState<BusinessGoal[]>(["sell_listings"]);
  const [video, setVideo] = useState(true);
  const [ads, setAds] = useState(false);
  const [limit, setLimit] = useState("12");
  const [strategy, setStrategy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void, max = 99) => set(list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await planMarketing({
        startDate: start0, days: Number(days), count: Number(count), platforms, propertyIds: selected, pillars, goals, includeVideo: video, includeAds: ads,
        aiLimit: Math.min(Number(limit || 0), Number(count)), strategyId: strategy || null,
      });
      if (!r.ok) {
        setError(r.error);
        return void toast.error(r.error);
      }
      toast.success(r.message ?? "Gotowe.");
      router.push(`/autopilot/${r.data.id}`);
    });
  };

  return (
    <Card className="p-0">
      <CardHeader title="Przygotuj mój marketing na najbliższy miesiąc" description="Autopilot układa plan publikacji z uzasadnieniem, a potem przygotowuje materiały w limicie kosztów AI. Wszystko trafia do kolejki akceptacji: nic nie jest publikowane ani opłacane automatycznie." />
      <form onSubmit={submit} className="grid gap-4 border-t border-line p-5 md:grid-cols-2" data-testid="autopilot-form">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Początek" htmlFor="ap-start">
            <Input id="ap-start" type="date" value={start0} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Liczba dni" htmlFor="ap-days">
            <Input id="ap-days" type="number" min={7} max={31} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Liczba publikacji" htmlFor="ap-count">
            <Input id="ap-count" type="number" min={1} max={40} value={count} onChange={(e) => setCount(e.target.value)} />
          </Field>
          <Field label="Limit generowań AI" htmlFor="ap-limit" hint={quotaLeft !== null ? `W tym miesiącu zostało ${quotaLeft}` : undefined}>
            <Input id="ap-limit" type="number" min={0} max={40} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Platformy</legend>
          <div className="flex flex-wrap gap-2">
            {AUTOPILOT_PLATFORM_IDS.map((p) => <label key={p} className={chip}><input type="checkbox" checked={platforms.includes(p)} onChange={() => toggle(platforms, p, setPlatforms)} />{AUTOPILOT_PLATFORMS[p].label}</label>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Cele <span className="font-normal text-ink-4">(do 3)</span></legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BUSINESS_GOALS) as BusinessGoal[]).map((g) => <label key={g} className={chip}><input type="checkbox" checked={goals.includes(g)} onChange={() => toggle(goals, g, setGoals, 3)} />{BUSINESS_GOALS[g].label}</label>)}
          </div>
        </fieldset>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Filary treści</legend>
          <div className="flex flex-wrap gap-2">
            {PILLAR_IDS.map((p) => <label key={p} className={chip}><input type="checkbox" checked={pillars.includes(p)} onChange={() => toggle(pillars, p, setPillars)} />{PILLARS[p].label}</label>)}
          </div>
        </fieldset>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Nieruchomości <span className="font-normal text-ink-4">(do 10)</span></legend>
          {properties.length === 0 ? (
            <p className="text-[13px] text-ink-3">Brak aktywnych ofert. Wyłącz filar „Oferty biura” albo dodaj ofertę.</p>
          ) : (
            <ul className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {properties.map((p) => (
                <li key={p.id}>
                  <label className="flex items-start gap-2 rounded-md border border-line px-2.5 py-2 text-[13px] has-checked:border-accent has-checked:bg-accent-soft" data-testid="autopilot-property">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(selected, p.id, setSelected, 10)} className="mt-0.5" />
                    <span className="min-w-0"><span className="block truncate font-medium text-ink">{p.title}</span><span className="block truncate text-[12px] text-ink-3">{p.detail} · {p.photos} zdj.</span></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <Field label="Oprzyj na strategii" htmlFor="ap-strategy" optional hint="Materiały z zaakceptowanej strategii trafią do planu jako pierwsze.">
          <NativeSelect id="ap-strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="">Bez strategii</option>
            {strategies.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </NativeSelect>
        </Field>
        <div className="flex flex-col gap-2 pt-6 text-[13px] text-ink-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} /> Scenariusze wideo (Reels, TikTok)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={ads} onChange={(e) => setAds(e.target.checked)} /> Propozycje reklam (tylko teksty, bez uruchamiania)</label>
        </div>
        {error && <p className="text-[13px] text-danger md:col-span-2" role="alert">{error}</p>}
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" loading={pending} disabled={!platforms.length || !pillars.length || !goals.length}><RocketLaunch weight="fill" />Przygotuj mój marketing</Button>
          <p className="text-[12px] text-ink-3">Plan nie zużywa generowań. Materiały: 1 generowanie na pozycję, w ustawionym limicie.</p>
        </div>
      </form>
    </Card>
  );
}
