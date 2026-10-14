import "server-only";
import { z } from "zod";
import { ZERO, addCost, aiCost, mrrMinor, renderCost, storageCost, type Cost, type Rate } from "@/core/admin/costs";
import { serverEnv } from "@/lib/env";
import { AppError, dbError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminWorkspaceRow, CostRateKind, PlanRow } from "@/lib/supabase/database.types";
import { aiUsage, loadRates, renderUsage, resetBudgetCache } from "./costs";
import { logAdmin, type PlatformAdmin } from "./access";
import { fetchAll } from "@/lib/supabase/fetch-all";

export interface WorkspaceStats extends AdminWorkspaceRow {
  aiCalls: number;
  aiErrors: number;
  tokens: number;
  renders: number;
  renderSeconds: number;
  storageBytes: number;
  cost: { ai: Cost; render: Cost; storage: Cost; total: Cost };
}

export function costCurrency() {
  return serverEnv().COST_CURRENCY;
}

/** Per-office numbers for the current month (Europe/Warsaw). No content of materials. */
export async function workspaceStats(): Promise<{ rows: WorkspaceStats[]; rates: Rate[] }> {
  const admin = createAdminClient();
  const [{ data: ws, error }, ai, renders, { data: storage }, rates] = await Promise.all([admin.rpc("admin_workspaces"), aiUsage(), renderUsage(), admin.rpc("storage_by_workspace"), loadRates()]);
  if (error) throw dbError(error);
  const aiBy = new Map<string, typeof ai>();
  for (const r of ai) aiBy.set(r.workspace_id, [...(aiBy.get(r.workspace_id) ?? []), r]);
  const renderBy = new Map(renders.map((r) => [r.workspace_id, r]));
  const storageBy = new Map((storage ?? []).map((s) => [s.workspace_id, Number(s.bytes)]));
  const rows = (ws ?? []).map((w) => {
    const a = aiBy.get(w.id) ?? [];
    const r = renderBy.get(w.id);
    const bytes = storageBy.get(w.id) ?? 0;
    const cost = { ai: aiCost(a, rates), render: renderCost(r?.seconds ?? 0, rates), storage: storageCost(bytes, rates) };
    return {
      ...w,
      members: Number(w.members), properties: Number(w.properties), content_items: Number(w.content_items), exports: Number(w.exports), published: Number(w.published),
      aiCalls: a.reduce((s, x) => s + x.calls, 0),
      aiErrors: a.reduce((s, x) => s + x.errors, 0),
      tokens: a.reduce((s, x) => s + x.input_tokens + x.output_tokens, 0),
      renders: r?.renders ?? 0,
      renderSeconds: r?.seconds ?? 0,
      storageBytes: bytes,
      cost: { ...cost, total: addCost(addCost(cost.ai, cost.render), cost.storage) },
    };
  });
  return { rows: rows.sort((a, b) => b.created_at.localeCompare(a.created_at)), rates };
}

export async function overview() {
  const admin = createAdminClient();
  const [{ rows, rates }, { data: plans }, ai] = await Promise.all([workspaceStats(), admin.from("plans").select("*").order("sort"), aiUsage()]);
  const now = Date.now();
  const since30 = now - 30 * 86400_000;
  const statuses: Record<string, number> = {};
  for (const r of rows) statuses[r.status ?? "brak"] = (statuses[r.status ?? "brak"] ?? 0) + 1;
  const subs = rows.map((r) => ({ status: r.status ?? "", plan: r.plan ?? "", provider: r.provider }));
  const fresh = rows.filter((r) => new Date(r.created_at).getTime() >= since30);
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
  const activation = {
    created: fresh.length,
    onboarding: pct(fresh.filter((r) => r.onboarding_completed_at).length, fresh.length),
    property: pct(fresh.filter((r) => r.properties > 0).length, fresh.length),
    content: pct(fresh.filter((r) => r.content_items > 0).length, fresh.length),
    exported: pct(fresh.filter((r) => r.exports > 0 || r.published > 0).length, fresh.length),
  };
  const ops = new Map<string, { calls: number; errors: number; tokens: number; cost: Cost }>();
  for (const r of ai) {
    const o = ops.get(r.operation) ?? { calls: 0, errors: 0, tokens: 0, cost: ZERO };
    ops.set(r.operation, { calls: o.calls + r.calls, errors: o.errors + r.errors, tokens: o.tokens + r.input_tokens + r.output_tokens, cost: addCost(o.cost, aiCost([r], rates)) });
  }
  const byPlan = new Map<string, { offices: number; paying: number; revenueMinor: number; cost: Cost }>();
  const planById = new Map((plans ?? []).map((p) => [p.id, p]));
  for (const r of rows) {
    const key = r.plan ?? "brak";
    const b = byPlan.get(key) ?? { offices: 0, paying: 0, revenueMinor: 0, cost: ZERO };
    const paying = r.status === "active" || r.status === "past_due";
    const p = planById.get(key);
    byPlan.set(key, { offices: b.offices + 1, paying: b.paying + (paying ? 1 : 0), revenueMinor: b.revenueMinor + (paying && p ? (p.billing_interval === "year" ? Math.round(p.price_minor / 12) : p.price_minor) : 0), cost: addCost(b.cost, r.cost.total) });
  }
  const sum = (f: (r: WorkspaceStats) => number) => rows.reduce((s, r) => s + f(r), 0);
  return {
    offices: rows.length,
    statuses,
    activeSubscriptions: (statuses.active ?? 0) + (statuses.past_due ?? 0),
    trials: rows.filter((r) => r.status === "trialing" && r.trial_ends_at && new Date(r.trial_ends_at).getTime() > now).length,
    trialsEnding: rows.filter((r) => r.status === "trialing" && r.trial_ends_at && new Date(r.trial_ends_at).getTime() > now && new Date(r.trial_ends_at).getTime() < now + 7 * 86400_000).length,
    mrrMinor: mrrMinor(subs, plans ?? []),
    planCurrency: plans?.[0]?.currency ?? "PLN",
    activation,
    ai: { calls: sum((r) => r.aiCalls), errors: sum((r) => r.aiErrors), tokens: sum((r) => r.tokens), cost: rows.reduce((c, r) => addCost(c, r.cost.ai), ZERO) },
    renders: { count: sum((r) => r.renders), seconds: sum((r) => r.renderSeconds), cost: rows.reduce((c, r) => addCost(c, r.cost.render), ZERO) },
    storage: { bytes: sum((r) => r.storageBytes), cost: rows.reduce((c, r) => addCost(c, r.cost.storage), ZERO) },
    totalCost: rows.reduce((c, r) => addCost(c, r.cost.total), ZERO),
    byOperation: [...ops].map(([operation, v]) => ({ operation, ...v })).sort((a, b) => b.calls - a.calls),
    byPlan: [...byPlan].map(([plan, v]) => ({ plan, name: planById.get(plan)?.name ?? plan, ...v })),
    rows,
    rates,
  };
}

/** Integration errors and job health: codes, areas and counts only. */
export async function health() {
  const admin = createAdminClient();
  const day = new Date(Date.now() - 86400_000).toISOString();
  const week = new Date(Date.now() - 7 * 86400_000).toISOString();
  const stuck = new Date(Date.now() - 15 * 60_000).toISOString();
  const [errors, conns, sources, pubs, jobs, failedJobs, stuckJobs, names] = await Promise.all([
    fetchAll((lo, hi) => admin.from("app_errors").select("area, code, created_at, workspace_id").gte("created_at", week).order("created_at", { ascending: false }).order("id").range(lo, hi), 2000),
    admin.from("social_connections").select("platform, status, workspace_id").in("status", ["reauth_required", "limited", "error"]),
    admin.from("property_sources").select("kind, status, workspace_id, last_sync_at").eq("status", "error"),
    fetchAll((lo, hi) => admin.from("publications").select("state, error_code, workspace_id, updated_at").in("state", ["failed", "action_required"]).gte("updated_at", week).order("id").range(lo, hi), 1000),
    fetchAll((lo, hi) => admin.from("generation_jobs").select("kind, status").gte("created_at", week).order("id").range(lo, hi), 20000),
    admin.from("generation_jobs").select("id, kind, status, error_code, attempts, workspace_id, finished_at").eq("status", "failed").gte("finished_at", day).order("finished_at", { ascending: false }).limit(50),
    admin.from("generation_jobs").select("id, kind, status, workspace_id, locked_at, started_at").eq("status", "running").lt("locked_at", stuck).limit(50),
    admin.from("workspaces").select("id, name"),
  ]);
  const wsName = new Map((names.data ?? []).map((w) => [w.id, w.name]));
  const group = <T>(rows: T[], key: (r: T) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return [...m].map(([k, n]) => ({ key: k, count: n })).sort((a, b) => b.count - a.count);
  };
  const jobStatus = new Map<string, Record<string, number>>();
  for (const j of jobs.data ?? []) {
    const r = jobStatus.get(j.kind) ?? {};
    r[j.status] = (r[j.status] ?? 0) + 1;
    jobStatus.set(j.kind, r);
  }
  return {
    errorsByArea: group(errors.data ?? [], (e) => `${e.area} · ${e.code ?? "bez kodu"}`),
    errors24h: (errors.data ?? []).filter((e) => e.created_at >= day).length,
    connections: group(conns.data ?? [], (c) => `${c.platform} · ${c.status}`),
    sources: (sources.data ?? []).map((s) => ({ kind: s.kind, office: wsName.get(s.workspace_id) ?? "?", lastSync: s.last_sync_at })),
    publications: group(pubs.data ?? [], (p) => `${p.state} · ${p.error_code ?? "bez kodu"}`),
    jobs: [...jobStatus].map(([kind, s]) => ({ kind, ...s })),
    failedJobs: (failedJobs.data ?? []).map((j) => ({ id: j.id, kind: j.kind, code: j.error_code, attempts: j.attempts, office: wsName.get(j.workspace_id) ?? "?", at: j.finished_at })),
    stuckJobs: (stuckJobs.data ?? []).map((j) => ({ id: j.id, kind: j.kind, office: wsName.get(j.workspace_id) ?? "?", since: j.started_at ?? j.locked_at })),
  };
}

// ---- Actions (each one is audited; the audit write failing aborts the action) ----

export const trialSchema = z.object({
  workspaceId: z.uuid(),
  days: z.coerce.number().int().min(1, "Od 1 do 90 dni").max(90, "Od 1 do 90 dni"),
  plan: z.string().min(1).max(40),
  reason: z.string().trim().min(5, "Podaj powód (min. 5 znaków)").max(500),
});

export async function grantTrial(a: PlatformAdmin, input: z.input<typeof trialSchema>) {
  const parsed = trialSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane.", "validation", 422);
  const d = parsed.data;
  const db = createAdminClient();
  const [{ data: sub }, { data: plan }] = await Promise.all([
    db.from("workspace_subscriptions").select("*").eq("workspace_id", d.workspaceId).maybeSingle(),
    db.from("plans").select("id, is_active").eq("id", d.plan).maybeSingle(),
  ]);
  if (!sub) throw new AppError("Nie znaleziono subskrypcji biura.", "not_found", 404);
  if (!plan?.is_active) throw new AppError("Wybrany plan nie istnieje lub jest nieaktywny.", "validation", 422);
  // A live Stripe subscription is managed in Stripe; overwriting it here would desynchronise billing.
  if (sub.provider === "stripe" && ["active", "past_due", "incomplete"].includes(sub.status)) throw new AppError("Biuro ma aktywną subskrypcję Stripe. Okres próbny przyznaj w Stripe (trial na subskrypcji), synchronizacja przyjdzie webhookiem.", "stripe_managed", 409);
  const base = sub.status === "trialing" && sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date() ? new Date(sub.trial_ends_at) : new Date();
  const trialEnds = new Date(base.getTime() + d.days * 86400_000).toISOString();
  await logAdmin(a, "grant_trial", { targetType: "workspace", targetId: d.workspaceId, workspaceId: d.workspaceId, reason: d.reason, detail: { days: d.days, plan: d.plan, before: { status: sub.status, plan: sub.plan, trial_ends_at: sub.trial_ends_at }, trial_ends_at: trialEnds } });
  const { error } = await db.from("workspace_subscriptions").update({ status: "trialing", plan: d.plan, trial_ends_at: trialEnds, provider: sub.provider ?? "manual" }).eq("workspace_id", d.workspaceId);
  if (error) throw dbError(error);
  return trialEnds;
}

export const planSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  price_minor: z.coerce.number().int().min(0).max(100_000_00),
  is_public: z.boolean(),
  is_active: z.boolean(),
  trial_days: z.coerce.number().int().min(0).max(90),
  max_users: z.coerce.number().int().min(1).max(10_000),
  max_properties: z.coerce.number().int().min(1).max(1_000_000),
  monthly_text_generations: z.coerce.number().int().min(0).max(1_000_000),
  monthly_graphic_exports: z.coerce.number().int().min(0).max(1_000_000),
  monthly_video_renders: z.coerce.number().int().min(0).max(100_000),
  storage_mb: z.coerce.number().int().min(10).max(10_000_000),
  max_social_accounts: z.coerce.number().int().min(0).max(1000),
  max_parallel_jobs: z.coerce.number().int().min(1).max(50),
  stripe_price_id: z.string().trim().max(120).regex(/^(price_[A-Za-z0-9]+)?$/, "Identyfikator ceny Stripe ma postać price_…").optional().default(""),
  reason: z.string().trim().min(5, "Podaj powód zmiany (min. 5 znaków)").max(500),
});
const PLAN_FIELDS = ["name", "price_minor", "is_public", "is_active", "trial_days", "max_users", "max_properties", "monthly_text_generations", "monthly_graphic_exports", "monthly_video_renders", "storage_mb", "max_social_accounts", "max_parallel_jobs", "stripe_price_id"] as const;

export async function updatePlan(a: PlatformAdmin, input: z.input<typeof planSchema>) {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane planu.", "validation", 422);
  const d = parsed.data;
  const db = createAdminClient();
  const { data: before } = await db.from("plans").select("*").eq("id", d.id).maybeSingle();
  if (!before) throw new AppError("Nie znaleziono planu.", "not_found", 404);
  const next: Partial<PlanRow> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of PLAN_FIELDS) {
    const to = k === "stripe_price_id" ? d.stripe_price_id || null : d[k];
    if (before[k] !== to) {
      (next as Record<string, unknown>)[k] = to;
      changes[k] = { from: before[k], to };
    }
  }
  if (!Object.keys(changes).length) return 0;
  if (d.id === "trial" && next.is_public) throw new AppError("Plan próbny nie może być publiczny w cenniku.", "validation", 422);
  await logAdmin(a, "update_plan", { targetType: "plan", targetId: d.id, reason: d.reason, detail: { changes } });
  const { error } = await db.from("plans").update(next).eq("id", d.id);
  if (error) throw dbError(error);
  return Object.keys(changes).length;
}

export const rateSchema = z.object({
  kind: z.enum(["ai_input_mtok", "ai_output_mtok", "video_render_minute", "storage_gb_month"]),
  model: z.string().trim().min(1).max(80).regex(/^(\*|[a-z0-9][a-z0-9.\-]*)$/, "Model: identyfikator (np. claude-opus-5-5) albo * dla wszystkich").default("*"),
  amount: z.coerce.number().min(0).max(100_000),
  note: z.string().trim().max(300).optional().default(""),
});

export async function setRate(a: PlatformAdmin, input: z.input<typeof rateSchema>) {
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Nieprawidłowa stawka.", "validation", 422);
  const d = parsed.data;
  const model = d.kind.startsWith("ai_") ? d.model : "*";
  const db = createAdminClient();
  const { data: before } = await db.from("cost_rates").select("amount").eq("kind", d.kind).eq("model", model).maybeSingle();
  await logAdmin(a, "set_cost_rate", { targetType: "cost_rate", targetId: `${d.kind}:${model}`, detail: { from: before?.amount ?? null, to: d.amount, currency: costCurrency() } });
  const { error } = await db.from("cost_rates").upsert({ kind: d.kind as CostRateKind, model, amount: d.amount, currency: costCurrency(), note: d.note || null, updated_by: a.userId, updated_at: new Date().toISOString() }, { onConflict: "kind,model" });
  if (error) throw dbError(error);
  resetBudgetCache();
}

export async function deleteRate(a: PlatformAdmin, id: string) {
  const db = createAdminClient();
  const { data: r } = await db.from("cost_rates").select("kind, model, amount").eq("id", z.uuid().parse(id)).maybeSingle();
  if (!r) throw new AppError("Nie znaleziono stawki.", "not_found", 404);
  await logAdmin(a, "delete_cost_rate", { targetType: "cost_rate", targetId: `${r.kind}:${r.model}`, detail: { amount: r.amount } });
  await db.from("cost_rates").delete().eq("id", id);
  resetBudgetCache();
}

export const budgetSchema = z.object({
  category: z.enum(["ai", "video_render"]),
  monthlyLimit: z.coerce.number().min(0).max(10_000_000),
  alertPct: z.coerce.number().int().min(1).max(100).default(80),
  enabled: z.boolean(),
});

export async function setBudget(a: PlatformAdmin, input: z.input<typeof budgetSchema>) {
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Nieprawidłowy budżet.", "validation", 422);
  const d = parsed.data;
  const db = createAdminClient();
  const { data: before } = await db.from("platform_budgets").select("monthly_limit, enabled, alert_pct").eq("category", d.category).maybeSingle();
  await logAdmin(a, "set_budget", { targetType: "budget", targetId: d.category, detail: { before, after: { monthly_limit: d.monthlyLimit, enabled: d.enabled, alert_pct: d.alertPct }, currency: costCurrency() } });
  const { error } = await db.from("platform_budgets").upsert({ category: d.category, monthly_limit: d.monthlyLimit, alert_pct: d.alertPct, enabled: d.enabled, currency: costCurrency(), updated_by: a.userId, updated_at: new Date().toISOString() }, { onConflict: "category" });
  if (error) throw dbError(error);
  resetBudgetCache();
}
