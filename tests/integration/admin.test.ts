/**
 * Platform admin: access isolation (service-role only tables), audited actions,
 * append-only audit log, cost estimates and the monthly safety budget.
 * Budgets and rates are platform-global: this file removes what it creates.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { assertBudget, budgetStates, resetBudgetCache } from "@/lib/admin/costs";
import { grantTrial, overview, setBudget, setRate, updatePlan, workspaceStats } from "@/lib/admin/service";
import type { PlatformAdmin } from "@/lib/admin/access";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const users: string[] = [];
const MODEL = `test-model-${Date.now()}`;

async function user(tag: string) {
  const email = `adm-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Admin-Test-2026", email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL_, ANON, opts);
  await sb.auth.signInWithPassword({ email, password: "Admin-Test-2026" });
  return { id: data.user.id, email, sb };
}

let pa: PlatformAdmin;
let owner: Awaited<ReturnType<typeof user>>;
let ws: string;
let savedBudgets: unknown[] = [];

beforeAll(async () => {
  const a = await user("platform");
  owner = await user("owner");
  await admin.from("platform_admins").insert({ user_id: a.id, role: "admin" });
  pa = { userId: a.id, email: a.email, role: "admin" };
  ws = (await owner.sb.rpc("create_workspace", { p_name: "Biuro Panelu" })).data as string;
  savedBudgets = (await admin.from("platform_budgets").select("*")).data ?? [];
  await admin.from("platform_budgets").delete().neq("category", "");
});

afterAll(async () => {
  await admin.from("cost_rates").delete().like("model", "test-model-%");
  await admin.from("platform_budgets").delete().neq("category", "");
  if (savedBudgets.length) await admin.from("platform_budgets").insert(savedBudgets as never);
  await admin.from("ai_usage_events").delete().eq("model", MODEL);
  resetBudgetCache();
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("isolation of admin tables", () => {
  it("office users cannot read or write admin data", async () => {
    for (const t of ["platform_admins", "admin_audit_log", "cost_rates", "platform_budgets"]) {
      const r = await owner.sb.from(t).select("*").limit(1);
      expect(r.data ?? []).toHaveLength(0);
    }
    expect((await owner.sb.from("platform_admins").insert({ user_id: owner.id, role: "admin" })).error).not.toBeNull();
    expect((await owner.sb.rpc("admin_workspaces")).error).not.toBeNull();
    expect((await owner.sb.rpc("ai_usage_month", {})).error).not.toBeNull();
    expect((await createClient(URL_, ANON, opts).rpc("storage_by_workspace")).error).not.toBeNull();
  });
});

describe("audited actions", () => {
  it("grants a trial with a reason and logs before/after", async () => {
    await expect(grantTrial(pa, { workspaceId: ws, days: 10, plan: "studio", reason: "x" })).rejects.toThrow(/powód/i);
    await expect(grantTrial(pa, { workspaceId: ws, days: 200, plan: "studio", reason: "Prośba klienta" })).rejects.toThrow();
    const { data: before } = await admin.from("workspace_subscriptions").select("trial_ends_at").eq("workspace_id", ws).single();
    const until = await grantTrial(pa, { workspaceId: ws, days: 10, plan: "studio", reason: "Prośba klienta, wdrożenie" });
    expect(new Date(until).getTime() - new Date(before!.trial_ends_at!).getTime()).toBeGreaterThan(9.9 * 86400_000);
    const { data: sub } = await admin.from("workspace_subscriptions").select("plan, status").eq("workspace_id", ws).single();
    expect(sub).toEqual({ plan: "studio", status: "trialing" });
    const { data: log } = await admin.from("admin_audit_log").select("*").eq("workspace_id", ws).eq("action", "grant_trial").single();
    expect(log!.actor).toBe(pa.userId);
    expect(log!.reason).toBe("Prośba klienta, wdrożenie");
    expect(log!.detail).toMatchObject({ days: 10, plan: "studio", before: { plan: "trial" } });
  });
  it("does not overwrite a live Stripe subscription", async () => {
    await admin.from("workspace_subscriptions").update({ provider: "stripe", status: "active", plan: "solo" }).eq("workspace_id", ws);
    await expect(grantTrial(pa, { workspaceId: ws, days: 5, plan: "solo", reason: "Test Stripe" })).rejects.toThrow(/Stripe/);
    await admin.from("workspace_subscriptions").update({ provider: "manual", status: "trialing", plan: "studio" }).eq("workspace_id", ws);
  });
  it("plan changes record a diff and need a reason", async () => {
    const { data: p } = await admin.from("plans").select("*").eq("id", "solo").single();
    const base = { ...p!, stripe_price_id: p!.stripe_price_id ?? "" };
    await expect(updatePlan(pa, { ...base, reason: "" })).rejects.toThrow(/powód/i);
    expect(await updatePlan(pa, { ...base, reason: "Bez zmian" })).toBe(0);
    expect(await updatePlan(pa, { ...base, monthly_video_renders: p!.monthly_video_renders + 1, reason: "Test podniesienia limitu" })).toBe(1);
    const { data: log } = await admin.from("admin_audit_log").select("detail").eq("action", "update_plan").eq("target_id", "solo").order("id", { ascending: false }).limit(1).single();
    expect(log!.detail).toEqual({ changes: { monthly_video_renders: { from: p!.monthly_video_renders, to: p!.monthly_video_renders + 1 } } });
    await updatePlan(pa, { ...base, reason: "Przywrócenie po teście" });
    await expect(updatePlan(pa, { ...base, stripe_price_id: "prod_123", reason: "Zły identyfikator" })).rejects.toThrow(/price_/);
    await expect(updatePlan(pa, { ...base, id: "trial", is_public: true, reason: "Próba publikacji" })).rejects.toThrow();
  });
  it("audit log is append-only even for the service role", async () => {
    const { data: row } = await admin.from("admin_audit_log").select("id").order("id", { ascending: false }).limit(1).single();
    expect((await admin.from("admin_audit_log").update({ reason: "zmienione" }).eq("id", row!.id)).error?.message).toMatch(/append-only/);
    expect((await admin.from("admin_audit_log").delete().eq("id", row!.id)).error?.message).toMatch(/append-only/);
  });
});

describe("costs and safety budget", () => {
  it("prices usage per office and blocks paid AI when the budget is exceeded", async () => {
    await admin.from("ai_usage_events").insert({ workspace_id: ws, user_id: owner.id, operation: "generate", status: "ok", model: MODEL, input_tokens: 1_000_000, output_tokens: 200_000 });
    let s = await workspaceStats();
    let row = s.rows.find((r) => r.id === ws)!;
    expect(row.cost.ai.partial).toBe(true);
    expect(row.cost.ai.unpricedTokens).toBe(1_200_000);
    expect(row.tokens).toBe(1_200_000);

    await setRate(pa, { kind: "ai_input_mtok", model: MODEL, amount: 3 });
    await setRate(pa, { kind: "ai_output_mtok", model: MODEL, amount: 15 });
    await expect(setRate(pa, { kind: "ai_input_mtok", model: "Zły Model!", amount: 1 })).rejects.toThrow(/Model/);
    s = await workspaceStats();
    row = s.rows.find((r) => r.id === ws)!;
    expect(row.cost.ai).toEqual({ amount: 3 + 3, partial: false, unpricedTokens: 0 });
    const o = await overview();
    expect(o.byOperation.find((x) => x.operation === "generate")!.cost.amount).toBeGreaterThanOrEqual(6);

    resetBudgetCache();
    await assertBudget("ai"); // no budget row: no block
    await setBudget(pa, { category: "ai", monthlyLimit: 1, alertPct: 80, enabled: true });
    expect((await budgetStates()).ai!.level).toBe("exceeded");
    await expect(assertBudget("ai")).rejects.toMatchObject({ code: "platform_budget" });
    await assertBudget("video_render"); // other category unaffected
    await setBudget(pa, { category: "ai", monthlyLimit: 1, alertPct: 80, enabled: false });
    await assertBudget("ai"); // disabled: monitoring only
    await setBudget(pa, { category: "ai", monthlyLimit: 1_000_000, alertPct: 80, enabled: true });
    await assertBudget("ai");
    const { data: logs } = await admin.from("admin_audit_log").select("action").eq("actor", pa.userId);
    expect(logs!.filter((l) => l.action === "set_budget")).toHaveLength(3);
    expect(logs!.filter((l) => l.action === "set_cost_rate")).toHaveLength(2);
    const { data: err } = await admin.from("app_errors").select("code").eq("area", "budget").order("id", { ascending: false }).limit(1);
    expect(err?.[0]?.code).toBe("platform_budget");
  });
});
