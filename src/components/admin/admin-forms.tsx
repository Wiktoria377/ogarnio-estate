"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { deleteRateAction, grantTrialAction, setBudgetAction, setRateAction, updatePlanAction } from "@/app/admin/actions";
import type { ActionResult } from "@/lib/errors";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(fn: () => Promise<ActionResult<T>>, after?: (r: T) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Zapisano.");
      after?.(r.data);
      router.refresh();
    });
  return { pending, run };
}

export function TrialForm({ workspaceId, plans, current }: { workspaceId: string; plans: { id: string; name: string }[]; current: string }) {
  const { pending, run } = useRun();
  const [days, setDays] = useState("14");
  const [plan, setPlan] = useState(plans.some((p) => p.id === current) ? current : "trial");
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Liczba dni" htmlFor="trial-days"><Input id="trial-days" type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Field label="Plan w okresie próbnym" htmlFor="trial-plan"><NativeSelect id="trial-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field>
      </div>
      <Field label="Powód" htmlFor="trial-reason"><Textarea id="trial-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="np. prośba klienta z 12.10, wdrożenie z opiekunem" /></Field>
      <div><Button size="sm" loading={pending} onClick={() => run(() => grantTrialAction({ workspaceId, days: Number(days), plan, reason }), () => setReason(""))}>Przyznaj okres próbny</Button></div>
    </div>
  );
}

type PlanInput = { id: string; name: string; price_minor: number; is_public: boolean; is_active: boolean; trial_days: number; max_users: number; max_properties: number; monthly_text_generations: number; monthly_graphic_exports: number; monthly_video_renders: number; storage_mb: number; max_social_accounts: number; max_parallel_jobs: number; stripe_price_id: string | null };
const NUM_FIELDS: [keyof PlanInput, string][] = [
  ["price_minor", "Cena (grosze)"],
  ["trial_days", "Dni próbne"],
  ["max_users", "Osoby"],
  ["max_properties", "Oferty"],
  ["monthly_text_generations", "Generowania AI / mies."],
  ["monthly_graphic_exports", "Eksporty grafik / mies."],
  ["monthly_video_renders", "Filmy / mies."],
  ["storage_mb", "Miejsce (MB)"],
  ["max_social_accounts", "Konta social"],
  ["max_parallel_jobs", "Zadania równoległe"],
];

export function PlanForm({ plan, readOnly }: { plan: PlanInput; readOnly: boolean }) {
  const { pending, run } = useRun();
  const [f, setF] = useState({ ...plan, stripe_price_id: plan.stripe_price_id ?? "" });
  const [reason, setReason] = useState("");
  const id = (k: string) => `plan-${plan.id}-${k}`;
  return (
    <div className="flex flex-col gap-3" data-testid={`plan-form-${plan.id}`}>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Nazwa" htmlFor={id("name")}><Input id={id("name")} value={f.name} disabled={readOnly} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        {NUM_FIELDS.map(([k, label]) => (
          <Field key={k} label={label} htmlFor={id(k)}><Input id={id(k)} type="number" min={0} value={String(f[k])} disabled={readOnly} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} /></Field>
        ))}
        <Field label="Stripe price id" htmlFor={id("stripe")}><Input id={id("stripe")} value={f.stripe_price_id} disabled={readOnly} onChange={(e) => setF({ ...f, stripe_price_id: e.target.value })} placeholder="price_…" /></Field>
      </div>
      <div className="flex flex-wrap gap-4 text-[13px]">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_active} disabled={readOnly} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Aktywny (można wybrać)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_public} disabled={readOnly || plan.id === "trial"} onChange={(e) => setF({ ...f, is_public: e.target.checked })} /> Widoczny w cenniku</label>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-72 flex-1"><Field label="Powód zmiany" htmlFor={id("reason")}><Input id={id("reason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field></div>
          <Button size="sm" loading={pending} onClick={() => run(() => updatePlanAction({ ...f, reason }), () => setReason(""))}>Zapisz plan</Button>
        </div>
      )}
    </div>
  );
}

const KIND_LABEL = { ai_input_mtok: "AI: wejście, za 1 mln tokenów", ai_output_mtok: "AI: wyjście, za 1 mln tokenów", video_render_minute: "Renderowanie: za minutę", storage_gb_month: "Pliki: za GB miesięcznie" } as const;

export function RateForm({ currency, models }: { currency: string; models: string[] }) {
  const { pending, run } = useRun();
  const [kind, setKind] = useState<keyof typeof KIND_LABEL>("ai_input_mtok");
  const [model, setModel] = useState(models[0] ?? "*");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const ai = kind.startsWith("ai_");
  return (
    <div className="grid gap-3 md:grid-cols-5" data-testid="rate-form">
      <Field label="Rodzaj" htmlFor="rate-kind"><NativeSelect id="rate-kind" value={kind} onChange={(e) => setKind(e.target.value as keyof typeof KIND_LABEL)}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></Field>
      <Field label="Model" htmlFor="rate-model" hint={ai ? "Identyfikator modelu albo * dla pozostałych" : "Nie dotyczy"}><Input id="rate-model" value={ai ? model : "*"} disabled={!ai} onChange={(e) => setModel(e.target.value)} list="rate-models" /></Field>
      <datalist id="rate-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
      <Field label={`Stawka (${currency})`} htmlFor="rate-amount"><Input id="rate-amount" type="number" min={0} step="0.0001" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Źródło stawki" htmlFor="rate-note" optional><Input id="rate-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="np. cennik dostawcy z 10.2026" /></Field>
      <div className="flex items-end"><Button size="sm" loading={pending} disabled={amount === ""} onClick={() => run(() => setRateAction({ kind, model: ai ? model : "*", amount: Number(amount), note }), () => setAmount(""))}>Zapisz stawkę</Button></div>
    </div>
  );
}

export function RateDelete({ id }: { id: string }) {
  const { pending, run } = useRun();
  return <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => deleteRateAction(id))}>Usuń</Button>;
}

export function BudgetForm({ category, label, limit, alertPct, enabled, currency }: { category: "ai" | "video_render"; label: string; limit: number | null; alertPct: number; enabled: boolean; currency: string }) {
  const { pending, run } = useRun();
  const [l, setL] = useState(limit == null ? "" : String(limit));
  const [a, setA] = useState(String(alertPct));
  const [on, setOn] = useState(enabled);
  return (
    <div className="flex flex-wrap items-end gap-3" data-testid={`budget-${category}`}>
      <span className="w-40 text-[13px] font-medium">{label}</span>
      <Field label={`Limit miesięczny (${currency})`} htmlFor={`b-${category}`}><Input id={`b-${category}`} type="number" min={0} value={l} onChange={(e) => setL(e.target.value)} /></Field>
      <Field label="Ostrzeżenie od (%)" htmlFor={`ba-${category}`}><Input id={`ba-${category}`} type="number" min={1} max={100} value={a} onChange={(e) => setA(e.target.value)} /></Field>
      <label className="flex h-9 items-center gap-2 text-[13px]"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Blokuj po przekroczeniu</label>
      <Button size="sm" loading={pending} disabled={l === ""} onClick={() => run(() => setBudgetAction({ category, monthlyLimit: Number(l), alertPct: Number(a), enabled: on }))}>Zapisz budżet</Button>
    </div>
  );
}
