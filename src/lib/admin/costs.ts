import "server-only";
import { aiCost, budgetState, renderCost, type AiUsage, type BudgetState, type Rate } from "@/core/admin/costs";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlatformBudgetRow } from "@/lib/supabase/database.types";

export async function loadRates(): Promise<Rate[]> {
  const { data } = await createAdminClient().from("cost_rates").select("kind, model, amount");
  return (data ?? []).map((r) => ({ kind: r.kind, model: r.model, amount: Number(r.amount) }));
}

export async function aiUsage(from?: string, to?: string): Promise<AiUsage[]> {
  const { data, error } = await createAdminClient().rpc("ai_usage_month", { p_from: from ?? null, p_to: to ?? null });
  if (error) throw new AppError("Nie udało się odczytać zużycia AI.", "usage_read", 500);
  return (data ?? []).map((r) => ({ ...r, calls: Number(r.calls), errors: Number(r.errors), input_tokens: Number(r.input_tokens), output_tokens: Number(r.output_tokens) }));
}

export async function renderUsage(from?: string, to?: string) {
  const { data, error } = await createAdminClient().rpc("render_seconds", { p_from: from ?? null, p_to: to ?? null });
  if (error) throw new AppError("Nie udało się odczytać renderów.", "usage_read", 500);
  return (data ?? []).map((r) => ({ workspace_id: r.workspace_id, renders: Number(r.renders), failed: Number(r.failed), seconds: Number(r.seconds) }));
}

export async function loadBudgets(): Promise<PlatformBudgetRow[]> {
  const { data } = await createAdminClient().from("platform_budgets").select("*");
  return (data ?? []).map((b) => ({ ...b, monthly_limit: Number(b.monthly_limit) }));
}

export async function budgetStates(): Promise<Record<"ai" | "video_render", (BudgetState & { enabled: boolean; currency: string; alertPct: number }) | null>> {
  const [budgets, rates, ai, renders] = await Promise.all([loadBudgets(), loadRates(), aiUsage(), renderUsage()]);
  const spent = {
    ai: aiCost(ai, rates),
    video_render: renderCost(renders.reduce((s, r) => s + r.seconds, 0), rates),
  };
  const out: Record<"ai" | "video_render", (BudgetState & { enabled: boolean; currency: string; alertPct: number }) | null> = { ai: null, video_render: null };
  for (const b of budgets) out[b.category] = { ...budgetState(b.monthly_limit, b.alert_pct, spent[b.category]), enabled: b.enabled, currency: b.currency, alertPct: b.alert_pct };
  return out;
}

const g = globalThis as typeof globalThis & { __oeBudget?: { at: number; states: Awaited<ReturnType<typeof budgetStates>> }; __oeBudgetAlerted?: Set<string> };
export function resetBudgetCache() {
  g.__oeBudget = undefined;
}

const MESSAGES = {
  ai: "Generowanie AI jest chwilowo wstrzymane: osiągnięto miesięczny budżet bezpieczeństwa platformy. Zespół Ogarnio został powiadomiony. Spróbuj ponownie później.",
  video_render: "Renderowanie wideo jest chwilowo wstrzymane: osiągnięto miesięczny budżet bezpieczeństwa platformy. Zespół Ogarnio został powiadomiony. Spróbuj ponownie później.",
};

/**
 * Monthly safety budget for paid infrastructure, checked before each paid
 * operation (state cached for 30 s). Without a budget row the check is off;
 * usage without a rate is not priced, so budgets need rates to be effective
 * (the admin panel warns about that).
 */
export async function assertBudget(category: "ai" | "video_render") {
  if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY) return;
  if (!g.__oeBudget || Date.now() - g.__oeBudget.at > 30_000) g.__oeBudget = { at: Date.now(), states: await budgetStates() };
  const s = g.__oeBudget.states[category];
  if (!s?.enabled || s.level !== "exceeded") return;
  g.__oeBudgetAlerted ??= new Set();
  const key = `${category}:${new Date().toISOString().slice(0, 7)}`;
  if (!g.__oeBudgetAlerted.has(key)) {
    g.__oeBudgetAlerted.add(key);
    await logError("budget", new AppError(`Przekroczono miesięczny budżet ${category}: ${s.spent.amount.toFixed(2)} / ${s.limit} ${s.currency}`, "platform_budget"));
  }
  throw new AppError(MESSAGES[category], "platform_budget", 503);
}
