"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { saveProperty } from "@/app/(app)/properties/actions";
import { COMMON_FEATURES, MARKETS, PROPERTY_STATUSES, PROPERTY_TYPES, TRANSACTIONS } from "@/verticals/real-estate/labels";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { PropertyFormValues } from "@/verticals/real-estate/form-values";

const AMENITY_SUGGESTIONS = ["Szkoła w okolicy", "Przedszkole w okolicy", "Sklepy w okolicy", "Park w okolicy", "Przystanek komunikacji", "Stacja metra w okolicy", "Plac zabaw", "Ścieżka rowerowa"];

function TagInput({ id, values, onChange, suggestions, placeholder }: { id: string; values: string[]; onChange: (v: string[]) => void; suggestions: string[]; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = (v: string) => {
    const t = v.trim().slice(0, 80);
    if (t && !values.includes(t) && values.length < 40) onChange([...values, t]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-surface pr-1 pl-2.5 text-[12.5px] text-ink">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-full p-0.5 text-ink-3 hover:bg-sunken hover:text-ink" aria-label={`Usuń ${v}`}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={() => add(draft)} disabled={!draft.trim()}>
          <Plus /> Dodaj
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.filter((s) => !values.includes(s)).slice(0, 14).map((s) => (
          <button key={s} type="button" onClick={() => add(s)} className="h-6.5 rounded-full bg-sunken px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent-ink">
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PropertyForm({ id, initial, agents, canAssign = true, onboarding = false }: { id: string | null; initial: PropertyFormValues; agents: { id: string; name: string }[]; canAssign?: boolean; onboarding?: boolean }) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof PropertyFormValues>(k: K, val: PropertyFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const num = (s: string) => {
    const n = Number(s.replace(/\s/g, "").replace(",", "."));
    return s.trim() && Number.isFinite(n) ? n : null;
  };
  const area = num(v.area_m2);
  const price = num(v.price);
  const ppm = area && price ? price / area : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await saveProperty(id, v, { onboarding });
      if (res && !res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        const first = Object.keys(res.fieldErrors ?? {})[0];
        if (first) document.getElementById(first)?.focus();
      }
    });
  }

  const text = (k: keyof PropertyFormValues, label: string, o: { optional?: boolean; hint?: string; inputMode?: "decimal" | "numeric"; placeholder?: string } = {}) => (
    <Field label={label} htmlFor={k} optional={o.optional} hint={o.hint} error={errors[k]}>
      <Input id={k} value={v[k] as string} onChange={(e) => set(k, e.target.value as never)} inputMode={o.inputMode} placeholder={o.placeholder} aria-invalid={!!errors[k]} />
    </Field>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader title="Podstawowe informacje" description="Generator używa wyłącznie danych, które tu wpiszesz. Puste pola są pomijane, nie zgadywane." />
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("title", "Nazwa oferty", { hint: "Wewnętrzna nazwa, np. „3 pokoje z balkonem, Mokotów”. Może trafić do nagłówków." })}</div>
          <Field label="Typ" htmlFor="property_type">
            <NativeSelect id="property_type" value={v.property_type} onChange={(e) => set("property_type", e.target.value)}>
              {Object.entries(PROPERTY_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Transakcja" htmlFor="transaction_type">
            <div className="grid h-9 grid-cols-2 gap-0.5 rounded-md bg-sunken p-0.5" role="radiogroup">
              {Object.entries(TRANSACTIONS).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={v.transaction_type === k} onClick={() => set("transaction_type", k)} className={cn("rounded-[5px] text-[13px] font-medium transition-colors", v.transaction_type === k ? "bg-surface text-ink shadow-xs" : "text-ink-3 hover:text-ink")}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Rynek" htmlFor="market" optional>
            <NativeSelect id="market" value={v.market} onChange={(e) => set("market", e.target.value)}>
              <option value="">Nie podano</option>
              {Object.entries(MARKETS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Status" htmlFor="status">
            <NativeSelect id="status" value={v.status} onChange={(e) => set("status", e.target.value)}>
              {Object.entries(PROPERTY_STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </NativeSelect>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Lokalizacja" />
        <CardBody className="grid gap-5 sm:grid-cols-3">
          {text("city", "Miasto", { optional: true })}
          {text("district", "Dzielnica", { optional: true })}
          {text("street", "Ulica", { optional: true })}
          <label className="flex items-center gap-3 text-[13.5px] text-ink-2 sm:col-span-3">
            <Switch checked={v.show_street} onCheckedChange={(c) => set("show_street", c)} />
            Pokazuj ulicę w materiałach (domyślnie ukryta ze względów bezpieczeństwa właściciela)
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Parametry i cena" />
        <CardBody className="grid gap-5 sm:grid-cols-3">
          {text("area_m2", "Powierzchnia (m²)", { optional: true, inputMode: "decimal", placeholder: "np. 54,5" })}
          {text("rooms", "Liczba pokoi", { optional: true, inputMode: "numeric" })}
          {text("year_built", "Rok budowy", { optional: true, inputMode: "numeric" })}
          {text("floor", "Piętro", { optional: true, inputMode: "numeric", hint: "0 = parter" })}
          {text("total_floors", "Liczba pięter budynku", { optional: true, inputMode: "numeric" })}
          <div />
          {text("price", v.transaction_type === "rent" ? "Czynsz najmu (miesięcznie)" : "Cena", { optional: true, inputMode: "decimal" })}
          <Field label="Waluta" htmlFor="currency">
            <NativeSelect id="currency" value={v.currency} onChange={(e) => set("currency", e.target.value)}>
              {["PLN", "EUR", "USD"].map((c) => <option key={c}>{c}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Cena za m²" htmlFor="ppm" hint="Liczona automatycznie">
            <Input id="ppm" readOnly value={ppm ? `${formatNumber(Math.round(ppm), 0)} ${v.currency === "PLN" ? "zł" : v.currency}/m²` : "—"} className="bg-sunken text-ink-2" tabIndex={-1} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Opis i cechy" description="Wpisz fakty. Generator zamieni je na korzyści, ale niczego nie dopisze." />
        <CardBody className="grid gap-6">
          <Field label="Opis od biura" htmlFor="description" optional error={errors.description} hint="Notatki o stanie, układzie, widoku, otoczeniu. Maks. 8000 znaków.">
            <Textarea id="description" rows={6} value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={8000} />
          </Field>
          <Field label="Cechy nieruchomości" htmlFor="features" optional>
            <TagInput id="features" values={v.features} onChange={(x) => set("features", x)} suggestions={COMMON_FEATURES} placeholder="Wpisz cechę i naciśnij Enter" />
          </Field>
          <Field label="Udogodnienia w okolicy" htmlFor="amenities" optional hint="Tylko to, co wiesz na pewno. Bez odległości, jeśli ich nie zmierzono.">
            <TagInput id="amenities" values={v.amenities} onChange={(x) => set("amenities", x)} suggestions={AMENITY_SUGGESTIONS} placeholder="np. Park w okolicy" />
          </Field>
          <Field label="Agent prowadzący" htmlFor="agent_id" optional error={errors.agent_id}>
            <NativeSelect id="agent_id" value={v.agent_id} disabled={!canAssign} title={canAssign ? undefined : "Agenta prowadzącego przypisuje właściciel lub administrator."} onChange={(e) => set("agent_id", e.target.value)}>
              <option value="">Nie przypisano</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </NativeSelect>
          </Field>
        </CardBody>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface/95 p-2 pl-4 shadow-md backdrop-blur-sm">
          {Object.keys(errors).length > 0 && <span className="text-[13px] text-danger">Popraw {Object.keys(errors).length} {Object.keys(errors).length === 1 ? "pole" : "pola"}</span>}
          <Button type="submit" size="lg" loading={pending}>
            {id ? "Zapisz zmiany" : "Zapisz i dodaj zdjęcia"}
          </Button>
        </div>
      </div>
    </form>
  );
}
