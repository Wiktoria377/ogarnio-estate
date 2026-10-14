/**
 * AI Marketing Director 2.0 against the local stack: data computed from the
 * office's own records, the full generate → check → save flow (offline
 * provider), cost per process, roles, write protection and office isolation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { collectStrategyStats, deleteStrategy, generateStrategy, processCost, setStrategyStatus } from "@/lib/strategy/service";
import { buildStrategyFacts } from "@/core/strategy/data";
import type { StrategyOutput } from "@/core/strategy/director";
import type { WorkspaceContext } from "@/lib/session";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { WorkspaceRow } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);
const users: string[] = [];

async function user(tag: string) {
  const email = `strat-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Strategy-Test-2026", email_confirm: true, user_metadata: { full_name: `Test ${tag}` } });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, opts);
  await sb.auth.signInWithPassword({ email, password: "Strategy-Test-2026" });
  return { id: data.user.id, email, sb };
}
async function ctxFor(u: { id: string; email: string; sb: SupabaseClient }, ws: string, role: WorkspaceContext["role"]): Promise<WorkspaceContext> {
  const { data } = await admin.from("workspaces").select("*").eq("id", ws).single();
  return { supabase: u.sb as unknown as ServerSupabase, userId: u.id, userEmail: u.email, userName: "Test", workspace: data as WorkspaceRow, role, memberships: [{ workspace: data as WorkspaceRow, role }] } as WorkspaceContext;
}

const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
let owner: Awaited<ReturnType<typeof user>>;
let viewer: Awaited<ReturnType<typeof user>>;
let outsider: Awaited<ReturnType<typeof user>>;
let ws: string;
let otherWs: string;
let ctx: WorkspaceContext;
let lux: string;
let flat: string;
let strategyId: string;

beforeAll(async () => {
  owner = await user("owner");
  viewer = await user("viewer");
  outsider = await user("outsider");
  ws = (await owner.sb.rpc("create_workspace", { p_name: "Biuro Strategii" })).data as string;
  otherWs = (await outsider.sb.rpc("create_workspace", { p_name: "Obce biuro strategii" })).data as string;
  await admin.from("workspace_members").insert({ workspace_id: ws, user_id: viewer.id, role: "viewer", status: "active" });
  ctx = await ctxFor(owner, ws, "owner");
  const ins = async (row: Record<string, unknown>) => (await admin.from("properties").insert({ workspace_id: ws, created_by: owner.id, status: "active", ...row }).select("id").single()).data!.id as string;
  lux = await ins({ title: "Luksusowy apartament z tarasem", property_type: "apartment", transaction_type: "sale", price: 3_200_000, area_m2: 110, rooms: 4, city: "Warszawa", created_at: ago(80) });
  flat = await ins({ title: "Kawalerka przy metrze", property_type: "apartment", transaction_type: "sale", price: 450_000, area_m2: 27, rooms: 1, city: "Warszawa", created_at: ago(10) });
  await ins({ title: "Dom pod Krakowem", property_type: "house", transaction_type: "sale", price: 1_100_000, area_m2: 160, rooms: 5, created_at: ago(30) });
  await ins({ title: "Mieszkanie na wynajem", property_type: "apartment", transaction_type: "rent", price: 3500, area_m2: 50, rooms: 2, created_at: ago(5) });
  await admin.from("properties").insert({ workspace_id: ws, created_by: owner.id, status: "sold", title: "Sprzedane", property_type: "apartment", transaction_type: "sale" });
  await admin.from("content_items").insert([
    { workspace_id: ws, property_id: flat, kind: "text", content_type: "property_sales_post", title: "Post", status: "ready", created_by: owner.id },
    { workspace_id: ws, property_id: flat, kind: "text", content_type: "property_sales_carousel", title: "Karuzela", status: "draft", created_by: owner.id },
    { workspace_id: ws, property_id: null, kind: "text", content_type: "educational_post", title: "Poradnik", status: "ready", created_by: owner.id },
  ]);
  const lead = { workspace_id: ws, name: "Jan", email: "jan@example.com", consent_contact: true, consent_text: "zgoda", consent_version: "v1", status: "new", property_id: null as string | null, channel: null as string | null };
  // (bulk inserts send every column, so defaults are spelled out)
  await admin.from("leads").insert([{ ...lead, property_id: flat, channel: "facebook" }, { ...lead, property_id: flat, channel: "facebook" }, { ...lead, channel: "instagram" }, { ...lead, status: "spam" }]);
  await admin.from("web_events").insert([
    ...Array.from({ length: 5 }, (_, i) => ({ workspace_id: ws, kind: "click", property_id: flat, visitor_hash: `v${i}`, is_bot: false })),
    { workspace_id: ws, kind: "click", property_id: null, visitor_hash: "bot", is_bot: true },
    { workspace_id: ws, kind: "page_view", property_id: lux, visitor_hash: "p1", is_bot: false },
  ]);
  // Another office's data must never leak into this office's numbers.
  await admin.from("properties").insert({ workspace_id: otherWs, created_by: outsider.id, status: "active", title: "Obca oferta", property_type: "house", transaction_type: "sale" });
});

afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("data computed from the office's records", () => {
  it("counts offers, materials, enquiries and traffic of this office only", async () => {
    const { stats, properties } = await collectStrategyStats(ctx, [lux, flat]);
    expect(stats.properties).toMatchObject({ active: 4, sale: 3, rent: 1, withoutMaterials: 3, withoutPhotos: 4, listedOver60Days: 1 });
    expect(stats.content).toMatchObject({ inWindow: 3, carousels: 1, expert: 1, ready: 2 });
    expect(stats.leads.inWindow).toBe(3);
    expect(stats.leads.byChannel).toEqual({ facebook: 2, instagram: 1 });
    expect(stats.traffic).toEqual({ clicks: 5, pageViews: 1 });
    expect(stats.publications.published).toBe(0);
    expect(stats.publications.lastDaysAgo).toBeNull();
    expect(stats.metrics.views).toBeNull();
    const f = stats.selected.find((s) => s.id === flat)!;
    expect(f).toMatchObject({ materials: 2, leads: 2, clicks: 5 });
    expect(properties.find((p) => p.id === lux)!.tags).toContain("premium");
    expect(properties.find((p) => p.id === flat)!.tags).toContain("investors");
    const facts = buildStrategyFacts(stats);
    expect(facts.find((x) => x.key === "platform_views")!.value).toBe("Brak danych");
  });

  it("rejects offers of another office", async () => {
    const { data } = await admin.from("properties").select("id").eq("workspace_id", otherWs).single();
    await expect(collectStrategyStats(ctx, [data!.id])).rejects.toThrow(/aktywnymi ofertami Twojego biura/);
  });
});

describe("„Zaproponuj mi strategię”", () => {
  it("generates, verifies and saves a strategy with its data, version and process cost", async () => {
    const r = await generateStrategy(ctx, { goal: "sell_listings", periodDays: 30, audience: "families", propertyIds: [lux, flat], channels: ["instagram", "facebook"], adBudget: 0, postsPerWeek: 3 });
    strategyId = r.id;
    const { data: row } = await admin.from("marketing_strategies").select("*").eq("id", r.id).single();
    const out = row!.output as StrategyOutput;
    expect(row!.prompt_version).toBe("strategy-1.0.0");
    expect(row!.status).toBe("draft");
    expect((row!.data_snapshot as unknown[]).length).toBeGreaterThan(10);
    for (const k of ["diagnosis", "goals", "segments", "key_messages", "pillars", "campaign_ideas", "schedule", "formats", "ctas", "metrics", "materials"]) expect(out, k).toHaveProperty(k);
    expect(out.materials).toHaveLength(13);
    expect(out.materials.every((m) => !m.property_id || [lux, flat].includes(m.property_id))).toBe(true);
    expect(out.conclusions.every((c) => c.facts.length > 0)).toBe(true);
    expect(out.hypotheses.some((h) => h.text.includes("bez wskazania danych"))).toBe(true);
    expect((row!.skills as { id: string }[]).map((s) => s.id)).toContain("strategy.marketing-director");
    const { data: usage } = await admin.from("ai_usage_events").select("operation, process_type, process_id, prompt_version").eq("process_id", r.id);
    expect(usage).toEqual([{ operation: "strategy", process_type: "strategy", process_id: r.id, prompt_version: "strategy-1.0.0" }]);
    const cost = await processCost(ctx, r.id);
    expect(cost.calls).toBe(1);
  });

  it("validates choices", async () => {
    await expect(generateStrategy(ctx, { goal: "sell_listings", periodDays: 30, audience: "families", channels: [], postsPerWeek: 3 })).rejects.toThrow(/kanał/);
    await expect(generateStrategy(ctx, { goal: "x", periodDays: 30, audience: "families", channels: ["instagram"], postsPerWeek: 3 })).rejects.toThrow();
  });

  it("a viewer cannot generate or change strategies", async () => {
    const v = await ctxFor(viewer, ws, "viewer");
    await expect(generateStrategy(v, { goal: "leads", periodDays: 14, audience: "families", channels: ["instagram"], postsPerWeek: 2 })).rejects.toThrow(/właściciel, administrator/);
    const { data } = await viewer.sb.from("marketing_strategies").update({ status: "accepted" }).eq("id", strategyId).select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("clients cannot insert strategies or rewrite their content; status changes work", async () => {
    const ins = await owner.sb.from("marketing_strategies").insert({ id: crypto.randomUUID(), workspace_id: ws, title: "x", input: {}, output: {}, prompt_version: "x", model: "x" });
    expect(ins.error).not.toBeNull();
    const tamper = await owner.sb.from("marketing_strategies").update({ output: { fake: true } }).eq("id", strategyId);
    expect(tamper.error).not.toBeNull();
    await setStrategyStatus(ctx, strategyId, "accepted");
    expect((await admin.from("marketing_strategies").select("status, decided_by").eq("id", strategyId).single()).data).toEqual({ status: "accepted", decided_by: owner.id });
  });

  it("another office sees nothing and cannot delete", async () => {
    const { data } = await outsider.sb.from("marketing_strategies").select("id").eq("workspace_id", ws);
    expect(data ?? []).toHaveLength(0);
    const out = await ctxFor(outsider, otherWs, "owner");
    await expect(deleteStrategy(out, strategyId)).rejects.toThrow();
    const { data: usage } = await outsider.sb.from("ai_usage_events").select("id").eq("process_id", strategyId);
    expect(usage ?? []).toHaveLength(0);
  });

  it("the owner deletes a strategy", async () => {
    await deleteStrategy(ctx, strategyId);
    expect((await admin.from("marketing_strategies").select("id").eq("id", strategyId)).data).toHaveLength(0);
  });
});
