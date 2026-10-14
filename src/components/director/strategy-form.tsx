"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { BUSINESS_GOALS, STRATEGY_CHANNELS, STRATEGY_PERIODS, type BusinessGoal } from "@/core/strategy/director";
import { PLATFORMS } from "@/core/marketing-engine/taxonomy";
import { proposeStrategy } from "@/app/(app)/director/actions";

export interface PropertyOption {
  id: string;
  title: string;
  detail: string;
}

export function StrategyForm({ properties, audiences, defaultChannels }: { properties: PropertyOption[]; audiences: { id: string; label: string }[]; defaultChannels: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [goal, setGoal] = useState<BusinessGoal>("sell_listings");
  const [period, setPeriod] = useState("30");
  const [audience, setAudience] = useState(audiences[0]?.id ?? "brand");
  const [selected, setSelected] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>(defaultChannels.length ? defaultChannels : ["instagram", "facebook"]);
  const [budget, setBudget] = useState("0");
  const [perWeek, setPerWeek] = useState("3");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], v: string, set: (x: string[]) => void, max = 99) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await proposeStrategy({ goal, periodDays: Number(period), audience, propertyIds: selected, channels, adBudget: Number(budget || 0), postsPerWeek: Number(perWeek), notes });
      if (!r.ok) {
        setError(r.error);
        return void toast.error(r.error);
      }
      toast.success(r.message ?? "Gotowe.");
      router.push(`/director/${r.data.id}`);
    });
  };

  return (
    <Card className="p-0">
      <CardHeader title="Zaproponuj mi strategię" description="Strategia powstaje z danych Twojego biura: ofert, materiałów, publikacji, zapytań i ruchu. Dane, wnioski, hipotezy i rekomendacje są pokazane osobno. Nic nie jest publikowane ani uruchamiane automatycznie." />
      <form onSubmit={submit} className="grid gap-4 border-t border-line p-5 md:grid-cols-2" data-testid="strategy-form">
        <Field label="Cel biznesowy" htmlFor="st-goal">
          <NativeSelect id="st-goal" value={goal} onChange={(e) => setGoal(e.target.value as BusinessGoal)}>
            {Object.entries(BUSINESS_GOALS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Okres kampanii" htmlFor="st-period">
          <NativeSelect id="st-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {Object.entries(STRATEGY_PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Grupa odbiorców" htmlFor="st-audience">
          <NativeSelect id="st-audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
            {audiences.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Publikacje tygodniowo" htmlFor="st-freq">
            <Input id="st-freq" type="number" min={1} max={14} value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />
          </Field>
          <Field label="Budżet reklamowy (zł/mies.)" htmlFor="st-budget" hint="0 = tylko działania organiczne">
            <Input id="st-budget" type="number" min={0} step={100} value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
        </div>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Dostępne kanały</legend>
          <div className="flex flex-wrap gap-2">
            {STRATEGY_CHANNELS.map((c) => (
              <label key={c} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[13px] text-ink-2 has-checked:border-accent has-checked:bg-accent-soft">
                <input type="checkbox" checked={channels.includes(c)} onChange={() => toggle(channels, c, setChannels)} />
                {PLATFORMS[c].label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Promowane nieruchomości <span className="font-normal text-ink-4">(do 10, opcjonalnie)</span></legend>
          {properties.length === 0 ? (
            <p className="text-[13px] text-ink-3">Brak aktywnych ofert. Strategia będzie dotyczyć marki biura.</p>
          ) : (
            <ul className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {properties.map((p) => (
                <li key={p.id}>
                  <label className="flex items-start gap-2 rounded-md border border-line px-2.5 py-2 text-[13px] has-checked:border-accent has-checked:bg-accent-soft" data-testid="strategy-property">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(selected, p.id, setSelected, 10)} className="mt-0.5" />
                    <span className="min-w-0"><span className="block truncate font-medium text-ink">{p.title}</span><span className="block truncate text-[12px] text-ink-3">{p.detail}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <Field label="Dodatkowe informacje" htmlFor="st-notes" optional className="md:col-span-2" hint="Np. sezonowość, nowa inwestycja, ograniczenia. Traktowane jako dane, nie polecenia.">
          <Textarea id="st-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="text-[13px] text-danger md:col-span-2" role="alert">{error}</p>}
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" loading={pending} disabled={channels.length === 0}><Sparkle weight="fill" />Zaproponuj mi strategię</Button>
          <p className="text-[12px] text-ink-3">Zużywa 1 generowanie AI z limitu planu.</p>
        </div>
      </form>
    </Card>
  );
}
