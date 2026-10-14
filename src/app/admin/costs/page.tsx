import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { bytes } from "@/components/admin/stat";
import { BudgetForm, RateDelete, RateForm } from "@/components/admin/admin-forms";
import { formatCost, formatMoney } from "@/core/admin/costs";
import { adminPage } from "@/lib/admin/access";
import { aiUsage, budgetStates, loadBudgets } from "@/lib/admin/costs";
import { costCurrency, overview } from "@/lib/admin/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

export default async function AdminCosts() {
  const admin = await adminPage();
  const [o, budgets, states, ai, { data: rates }] = await Promise.all([overview(), loadBudgets(), budgetStates(), aiUsage(), createAdminClient().from("cost_rates").select("*").order("kind")]);
  const cur = costCurrency();
  const env = serverEnv();
  const models = [...new Set([env.AI_MODEL, env.AI_REVIEW_MODEL, ...ai.map((r) => r.model)].filter((m) => m && m !== "?" && m !== "offline-test-provider"))];
  const writable = admin.role === "admin";
  const missing = [...new Set(ai.filter((r) => r.input_tokens + r.output_tokens > 0 && r.model !== "offline-test-provider" && r.model !== "?").map((r) => r.model))].filter((m) => !(rates ?? []).some((x) => x.kind === "ai_input_mtok" && (x.model === m || x.model === "*" || m.startsWith(x.model))));
  return (
    <div>
      <PageHeader title="Koszty i budżety" description={`Szacunki według stawek poniżej, waluta ${cur} (COST_CURRENCY). Aplikacja nie zna faktur dostawców: stawki wpisuje administrator na podstawie cennika i faktur. Zużycie bez stawki jest pokazywane jako „nieznane”, nie jako zero.`} />
      {missing.length > 0 && <p className="mb-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-[13px] text-warning" data-testid="missing-rates">Brak stawek dla modeli: {missing.join(", ")}. Koszt i budżet AI nie obejmują tych wywołań.</p>}
      <Card>
        <CardHeader title="Budżety bezpieczeństwa (miesięczne)" description="Po przekroczeniu limitu płatne operacje danej kategorii są wstrzymywane dla całej platformy, a zdarzenie trafia do błędów (obszar budget). Bez wiersza budżetu blokady nie ma." />
        <CardBody className="flex flex-col gap-4">
          {(["ai", "video_render"] as const).map((c) => {
            const b = budgets.find((x) => x.category === c);
            const s = states[c];
            return (
              <div key={c} className="flex flex-col gap-1">
                {writable ? <BudgetForm category={c} label={c === "ai" ? "AI (modele językowe)" : "Renderowanie wideo"} limit={b?.monthly_limit ?? null} alertPct={b?.alert_pct ?? 80} enabled={b?.enabled ?? true} currency={cur} /> : <p className="text-[13px]">{c}: {b ? formatMoney(b.monthly_limit, b.currency) : "nie ustawiono"}</p>}
                <p className="text-[12px] text-ink-3" data-testid={`budget-state-${c}`}>Wydano w tym miesiącu: {s ? `${formatCost(s.spent, cur)} (${String(s.pct).replace(".", ",")}% limitu)${s.level === "exceeded" ? ", przekroczony" : s.level === "alert" ? ", próg ostrzeżenia" : ""}` : formatCost(c === "ai" ? o.ai.cost : o.renders.cost, cur)}</p>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Stawki" />
        <CardBody>
          {writable && <RateForm currency={cur} models={models} />}
          <table className="mt-4 w-full text-left text-[13px]">
            <thead className="text-[12px] text-ink-3"><tr><th className="py-2 font-medium">Rodzaj</th><th className="py-2 font-medium">Model</th><th className="py-2 font-medium">Stawka</th><th className="py-2 font-medium">Źródło</th><th /></tr></thead>
            <tbody className="divide-y divide-line">
              {(rates ?? []).map((r) => <tr key={r.id} data-testid="rate-row"><td className="py-2">{r.kind}</td><td className="py-2">{r.model}</td><td className="py-2 tabular-nums">{Number(r.amount)} {r.currency}</td><td className="py-2 text-ink-3">{r.note ?? "–"}</td><td className="py-2 text-right">{writable && <RateDelete id={r.id} />}</td></tr>)}
              {!rates?.length && <tr><td colSpan={5} className="py-3 text-ink-3">Brak stawek. Koszty pokazują się jako „nieznane”.</td></tr>}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="overflow-x-auto">
          <CardHeader title="Koszt na plan" description="Przychód według cennika (aktywne subskrypcje) i szacowany koszt biur na tym planie." />
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">Plan</th><th className="px-2 py-2 font-medium">Biura (płacące)</th><th className="px-2 py-2 font-medium">Przychód / mies.</th><th className="px-2 py-2 font-medium">Koszt</th></tr></thead>
            <tbody className="divide-y divide-line">{o.byPlan.map((p) => <tr key={p.plan} data-testid="plan-cost"><td className="px-5 py-2">{p.name}</td><td className="px-2 py-2 tabular-nums">{p.offices} ({p.paying})</td><td className="px-2 py-2">{formatMoney(p.revenueMinor / 100, o.planCurrency)}</td><td className="px-2 py-2">{formatCost(p.cost, cur)}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card className="overflow-x-auto">
          <CardHeader title="Najdroższe biura w tym miesiącu" />
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">Biuro</th><th className="px-2 py-2 font-medium">AI</th><th className="px-2 py-2 font-medium">Wideo</th><th className="px-2 py-2 font-medium">Pliki</th><th className="px-2 py-2 font-medium">Razem</th></tr></thead>
            <tbody className="divide-y divide-line">{[...o.rows].sort((a, b) => b.cost.total.amount - a.cost.total.amount || b.tokens - a.tokens).slice(0, 15).map((r) => <tr key={r.id} data-testid="office-cost"><td className="px-5 py-2">{r.name}</td><td className="px-2 py-2">{formatCost(r.cost.ai, cur)}</td><td className="px-2 py-2">{formatCost(r.cost.render, cur)}</td><td className="px-2 py-2">{bytes(r.storageBytes)}</td><td className="px-2 py-2">{formatCost(r.cost.total, cur)}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
