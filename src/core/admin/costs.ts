/**
 * Cost ESTIMATES from usage and rates set by the platform administrator.
 * Real amounts are on the providers' invoices (Anthropic, hosting, storage);
 * we never invent a rate: a model or kind without a rate stays "unknown" and
 * is reported separately instead of being counted as zero.
 */
export type CostKind = "ai_input_mtok" | "ai_output_mtok" | "video_render_minute" | "storage_gb_month";
export interface Rate {
  kind: CostKind;
  model: string;
  amount: number;
}
export interface AiUsage {
  workspace_id: string;
  operation: string;
  model: string;
  calls: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
}
export interface Cost {
  /** Sum of everything that had a rate. */
  amount: number;
  /** True when some usage could not be priced (missing rate). */
  partial: boolean;
  unpricedTokens: number;
}

/** The offline test provider runs locally and costs nothing. */
export const FREE_MODELS = new Set(["offline-test-provider", "?"]);

export function rateFor(rates: Rate[], kind: CostKind, model = "*"): number | null {
  const exact = rates.find((r) => r.kind === kind && r.model === model);
  if (exact) return Number(exact.amount);
  // Prefix match lets one rate cover dated model ids (e.g. "claude-opus-5-5" for "claude-opus-5-5-20261001").
  const prefix = rates.filter((r) => r.kind === kind && r.model !== "*" && model.startsWith(r.model)).sort((a, b) => b.model.length - a.model.length)[0];
  if (prefix) return Number(prefix.amount);
  const any = rates.find((r) => r.kind === kind && r.model === "*");
  return any ? Number(any.amount) : null;
}

export const ZERO: Cost = { amount: 0, partial: false, unpricedTokens: 0 };
export function addCost(a: Cost, b: Cost): Cost {
  return { amount: a.amount + b.amount, partial: a.partial || b.partial, unpricedTokens: a.unpricedTokens + b.unpricedTokens };
}

export function aiCost(rows: Pick<AiUsage, "model" | "input_tokens" | "output_tokens">[], rates: Rate[]): Cost {
  let c = ZERO;
  for (const r of rows) {
    if (FREE_MODELS.has(r.model) || r.input_tokens + r.output_tokens === 0) continue;
    const i = rateFor(rates, "ai_input_mtok", r.model);
    const o = rateFor(rates, "ai_output_mtok", r.model);
    let amount = 0;
    let unpriced = 0;
    if (i == null) unpriced += r.input_tokens;
    else amount += (r.input_tokens / 1e6) * i;
    if (o == null) unpriced += r.output_tokens;
    else amount += (r.output_tokens / 1e6) * o;
    c = addCost(c, { amount, partial: unpriced > 0, unpricedTokens: unpriced });
  }
  return c;
}

export function renderCost(seconds: number, rates: Rate[]): Cost {
  if (seconds <= 0) return ZERO;
  const r = rateFor(rates, "video_render_minute");
  return r == null ? { amount: 0, partial: true, unpricedTokens: 0 } : { amount: (seconds / 60) * r, partial: false, unpricedTokens: 0 };
}

export function storageCost(bytes: number, rates: Rate[]): Cost {
  if (bytes <= 0) return ZERO;
  const r = rateFor(rates, "storage_gb_month");
  return r == null ? { amount: 0, partial: true, unpricedTokens: 0 } : { amount: (bytes / 1024 ** 3) * r, partial: false, unpricedTokens: 0 };
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency, minimumFractionDigits: amount > 0 && amount < 1 ? 4 : 2, maximumFractionDigits: amount > 0 && amount < 1 ? 4 : 2 }).format(amount);
}
export function formatCost(c: Cost, currency: string): string {
  return `${formatMoney(c.amount, currency)}${c.partial ? " + nieznane (brak stawki)" : ""}`;
}

/** Monthly recurring revenue from plan list prices (no discounts, taxes or proration). */
export function mrrMinor(subs: { status: string; plan: string; provider: string | null }[], plans: { id: string; price_minor: number; billing_interval: "month" | "year" }[]): number {
  const byId = new Map(plans.map((p) => [p.id, p]));
  let sum = 0;
  for (const s of subs) {
    if (s.status !== "active" && s.status !== "past_due") continue;
    const p = byId.get(s.plan);
    if (!p) continue;
    sum += p.billing_interval === "year" ? Math.round(p.price_minor / 12) : p.price_minor;
  }
  return sum;
}

export type BudgetState = { limit: number; spent: Cost; pct: number; level: "ok" | "alert" | "exceeded" };
export function budgetState(limit: number, alertPct: number, spent: Cost): BudgetState {
  const pct = limit > 0 ? Math.round((spent.amount / limit) * 1000) / 10 : spent.amount > 0 ? 100 : 0;
  return { limit, spent, pct, level: spent.amount >= limit ? "exceeded" : pct >= alertPct ? "alert" : "ok" };
}
