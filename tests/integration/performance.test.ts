/**
 * Performance and completeness on a large office: 400 active offers, 2400
 * photos, 1500 materials, 1200 confirmed publications with statistics, 3000
 * clicks and 1500 inquiries. Server reads must count every row (Supabase
 * returns at most 1000 rows per request; the local stack is configured the
 * same way) and finish within a time budget.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildAutopilotPlan } from "@/core/autopilot/plan";
import { autopilotInputSchema } from "@/core/autopilot/plan";
import { buildReport } from "@/lib/analytics/service";
import { createAutopilotRun } from "@/lib/autopilot/service";
import { collectRecoData, loadRecommendations } from "@/lib/recommendations/service";
import { collectStrategyStats } from "@/lib/strategy/service";
import type { WorkspaceContext } from "@/lib/session";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { WorkspaceRow } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);
const users: string[] = [];
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const N = { props: 400, photosEach: 6, content: 1500, pubs: 1200, clicks: 3000, leads: 1500 };

async function user(tag: string) {
  const email = `perf-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Perf-Test-2026", email_confirm: true, user_metadata: { full_name: `Test ${tag}` } });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, opts);
  await sb.auth.signInWithPassword({ email, password: "Perf-Test-2026" });
  return { id: data.user.id, email, sb };
}
async function ctxFor(u: { id: string; email: string; sb: SupabaseClient }, ws: string): Promise<WorkspaceContext> {
  const { data } = await admin.from("workspaces").select("*").eq("id", ws).single();
  return { supabase: u.sb as unknown as ServerSupabase, userId: u.id, userEmail: u.email, userName: "Test", workspace: data as WorkspaceRow, role: "owner", memberships: [{ workspace: data as WorkspaceRow, role: "owner" }] } as WorkspaceContext;
}
async function insert(table: string, rows: Record<string, unknown>[], select = false): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const q = admin.from(table).insert(rows.slice(i, i + 500));
    const { data, error } = select ? await q.select("id") : await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (select) ids.push(...((data ?? []) as { id: string }[]).map((r) => r.id));
  }
  return ids;
}
async function timed<T>(f: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t = performance.now();
  const value = await f();
  return { value, ms: Math.round(performance.now() - t) };
}
const timings: Record<string, number> = {};

let ctx: WorkspaceContext;
let ws: string;
let props: string[];

beforeAll(async () => {
  const owner = await user("owner");
  ws = (await owner.sb.rpc("create_workspace", { p_name: "Duże biuro" })).data as string;
  await admin.from("workspace_subscriptions").update({ limit_overrides: { max_properties: 1000 } }).eq("workspace_id", ws);
  ctx = await ctxFor(owner, ws);
  props = await insert("properties", Array.from({ length: N.props }, (_, i) => ({ workspace_id: ws, created_by: owner.id, status: "active", title: `Oferta ${i + 1}`, property_type: "apartment", transaction_type: "sale", price: 500_000 + i * 1000, area_m2: 50, rooms: 2, city: "Gdańsk", district: null, description: null, created_at: ago(10 + (i % 100)) })), true);
  await insert("property_photos", props.flatMap((p, i) => Array.from({ length: N.photosEach }, (_, k) => ({ workspace_id: ws, property_id: p, storage_path: `${ws}/photos/${p}/${k}.jpg`, mime_type: "image/jpeg", size_bytes: 1000, width: 1600, height: 1200, position: k, created_by: owner.id, analysis: null, caption: null, created_at: ago(i % 50) }))));
  const content = await insert("content_items", Array.from({ length: N.content }, (_, i) => ({ workspace_id: ws, property_id: i < 1200 ? props[i % N.props] : null, kind: "text", content_type: i < 1200 ? "property_sales_post" : "educational_post", title: `Materiał ${i}`, status: "ready", created_by: owner.id, updated_by: owner.id, params: {}, current_version: 0, platform: null, created_at: ago(i % 80) })), true);
  const conn = (await admin.from("social_connections").insert({ workspace_id: ws, platform: "facebook_page", external_id: `perf-${Date.now()}`, name: "Strona", status: "connected", capabilities: [], connected_by: owner.id }).select("id").single()).data!.id;
  const pubs = await insert("publications", Array.from({ length: N.pubs }, (_, i) => {
    const at = ago(1 + (i % 85));
    return { workspace_id: ws, connection_id: conn, content_item_id: content[i], format: "photo", caption: "x", scheduled_at: at, state: "published", approved_at: at, approved_by: owner.id, published_at: at, external_id: `p${i}`, idempotency_key: `perf-${ws}-${i}`, link_url: null, campaign_id: null, schedule_entry_id: null, content_version: null, media_spec: {}, media: [] };
  }), true);
  await insert("publication_metrics", pubs.map((id, i) => ({ workspace_id: ws, publication_id: id, source: "meta", metrics: { views: 1000 + i, interactions: 40 + (i % 20) }, unavailable: [], note: null, fetched_at: ago(0) })));
  await insert("web_events", Array.from({ length: N.clicks }, (_, i) => ({ workspace_id: ws, kind: "click", property_id: props[i % N.props], link_id: null, visitor_hash: `v${i}`, is_bot: false, referrer_host: null, created_at: ago(i % 25) })));
  await insert("leads", Array.from({ length: N.leads }, (_, i) => ({ workspace_id: ws, property_id: props[i % N.props], name: `Klient ${i}`, email: `k${i}@example.com`, phone: null, message: null, consent_contact: true, consent_text: "zgoda", consent_version: "v1", status: "new", channel: "facebook", link_id: null, campaign_id: null, utm: {}, visitor_hash: null, assigned_to: null, notes: null, created_at: ago(i % 60) })));
}, 300_000);

afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  console.info("[performance]", JSON.stringify(timings));
});

describe("large office: every row counted, within budget", () => {
  it("recommendations read all records (beyond 1000 rows) in under 5 s", async () => {
    const { value: d, ms } = await timed(() => collectRecoData(ctx));
    timings.recoData = ms;
    expect(d.properties).toHaveLength(N.props);
    expect(d.properties.reduce((a, p) => a + p.photos, 0)).toBe(N.props * N.photosEach);
    expect(d.properties.reduce((a, p) => a + p.materials, 0)).toBe(1200);
    expect(d.publications).toHaveLength(N.pubs);
    expect(d.publications.filter((p) => p.views !== null)).toHaveLength(N.pubs);
    expect(d.leadsInWindow).toBe(N.leads);
    expect(d.properties.reduce((a, p) => a + p.clicks30, 0)).toBe(N.clicks);
    expect(ms).toBeLessThan(5000);
    const { value: view, ms: ms2 } = await timed(() => loadRecommendations(ctx));
    timings.recommendations = ms2;
    expect(view.items.length).toBeGreaterThan(0);
    expect(ms2).toBeLessThan(5000);
  });

  it("strategy data count all inquiries, clicks and photos in under 5 s", async () => {
    const { value: { stats }, ms } = await timed(() => collectStrategyStats(ctx, props.slice(0, 10)));
    timings.strategyStats = ms;
    expect(stats.properties.active).toBe(N.props);
    expect(stats.properties.withoutPhotos).toBe(0);
    expect(stats.leads.inWindow).toBe(N.leads);
    expect(stats.traffic.clicks).toBe(N.clicks);
    expect(stats.publications.published).toBe(N.pubs);
    expect(stats.metrics.withStats).toBe(N.pubs);
    expect(ms).toBeLessThan(5000);
  });

  it("analytics report counts all clicks and inquiries in under 5 s", async () => {
    const { value: r, ms } = await timed(() => buildReport(ctx, new Date(Date.now() - 90 * 86_400_000), new Date(Date.now() + 60_000)));
    timings.analyticsReport = ms;
    expect(r.clicks).toBe(N.clicks);
    expect(r.leads).toBe(N.leads);
    expect(r.publications).toHaveLength(N.pubs);
    expect(ms).toBeLessThan(5000);
  });

  it("autopilot: a 40-item plan in milliseconds, a saved run in under 3 s", async () => {
    const input = autopilotInputSchema.parse({ startDate: "2026-11-01", days: 31, count: 40, platforms: ["instagram", "facebook", "linkedin", "tiktok"], propertyIds: props.slice(0, 10), pillars: ["offers", "education", "owners", "trust", "brand"], goals: ["sell_listings", "leads"], includeAds: true, aiLimit: 0 });
    const t = performance.now();
    for (let i = 0; i < 100; i++) buildAutopilotPlan(input, props.slice(0, 10).map((id) => ({ id, title: "Oferta", photos: 6 })));
    timings.autopilotPlanX100 = Math.round(performance.now() - t);
    expect(timings.autopilotPlanX100).toBeLessThan(1000);
    const { value, ms } = await timed(() => createAutopilotRun(ctx, input));
    timings.autopilotRun = ms;
    const { count } = await admin.from("autopilot_items").select("id", { count: "exact", head: true }).eq("run_id", value.id);
    expect(count).toBe(40);
    expect(ms).toBeLessThan(3000);
  });
});
