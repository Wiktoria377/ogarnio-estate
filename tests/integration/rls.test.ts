/**
 * Tenant isolation against a real Supabase (local stack or a test project):
 * RLS must stop user B from reading or writing anything in user A's workspace.
 * Runs with `npm run test:rls`; needs NEXT_PUBLIC_SUPABASE_URL, the anon key and
 * the service role key (only used to create and delete the two test users).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = "Izolacja-Testowa-2026";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(URL, SERVICE, opts);
const users: string[] = [];

async function user(tag: string): Promise<{ id: string; sb: SupabaseClient }> {
  const email = `rls-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: tag } });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL, ANON, opts);
  const { error: e2 } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw e2;
  return { id: data.user.id, sb };
}

let A: { id: string; sb: SupabaseClient };
let B: { id: string; sb: SupabaseClient };
let wsA: string;
let wsB: string;
let propA: string;
let itemA: string;

beforeAll(async () => {
  [A, B] = await Promise.all([user("a"), user("b")]);
  wsA = (await A.sb.rpc("create_workspace", { p_name: "Biuro A" })).data as string;
  wsB = (await B.sb.rpc("create_workspace", { p_name: "Biuro B" })).data as string;
  const p = await A.sb.from("properties").insert({ workspace_id: wsA, title: "Tajna oferta A", property_type: "apartment", transaction_type: "sale", created_by: A.id }).select("id").single();
  if (p.error) throw p.error;
  propA = p.data.id;
  const i = await A.sb.from("content_items").insert({ workspace_id: wsA, kind: "text", content_type: "faq", title: "Materiał A", created_by: A.id, updated_by: A.id, current_version: 0 }).select("id").single();
  if (i.error) throw i.error;
  itemA = i.data.id;
  const v = await A.sb.rpc("add_content_version", { p_item: itemA, p_body: { x: 1 }, p_source: "manual" });
  if (v.error) throw v.error;
});

afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  for (const ws of [wsA, wsB]) if (ws) await admin.from("workspaces").delete().eq("id", ws);
});

describe("RLS tenant isolation", () => {
  it("owner sees own data", async () => {
    expect((await A.sb.from("properties").select("id").eq("id", propA)).data).toHaveLength(1);
    expect((await A.sb.from("content_versions").select("id").eq("item_id", itemA)).data).toHaveLength(1);
  });

  it.each(["workspaces", "workspace_members", "brand_profiles", "properties", "content_items", "content_versions", "workspace_subscriptions", "ai_usage_events", "property_photos", "brand_assets"])("B cannot read A's %s", async (table) => {
    const { data, error } = await B.sb.from(table).select("*").eq(table === "workspaces" ? "id" : "workspace_id", wsA);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("B cannot insert into A's workspace", async () => {
    const p = await B.sb.from("properties").insert({ workspace_id: wsA, title: "Wstrzyknięta", property_type: "apartment", transaction_type: "sale", created_by: B.id });
    expect(p.error).not.toBeNull();
    const c = await B.sb.from("content_items").insert({ workspace_id: wsA, kind: "text", content_type: "faq", title: "X", created_by: B.id, updated_by: B.id, current_version: 0 });
    expect(c.error).not.toBeNull();
    const u = await B.sb.from("ai_usage_events").insert({ workspace_id: wsA, user_id: B.id, operation: "generate", status: "ok" });
    expect(u.error).not.toBeNull();
  });

  it("B cannot join A's workspace or change roles", async () => {
    const m = await B.sb.from("workspace_members").insert({ workspace_id: wsA, user_id: B.id, role: "owner" });
    expect(m.error).not.toBeNull();
    const up = await B.sb.from("workspace_members").update({ role: "owner" }).eq("workspace_id", wsA).select();
    expect(up.data ?? []).toEqual([]);
  });

  it("B cannot update or delete A's rows", async () => {
    const up = await B.sb.from("properties").update({ title: "Zmienione" }).eq("id", propA).select();
    expect(up.data ?? []).toEqual([]);
    const del = await B.sb.from("content_items").delete().eq("id", itemA).select();
    expect(del.data ?? []).toEqual([]);
    expect((await A.sb.from("properties").select("title").eq("id", propA).single()).data?.title).toBe("Tajna oferta A");
  });

  it("B cannot use A's workspace in RPCs", async () => {
    const v = await B.sb.rpc("add_content_version", { p_item: itemA, p_body: { hack: true }, p_source: "manual" });
    expect(v.error).not.toBeNull();
    const q = await B.sb.rpc("ai_quota_status", { p_ws: wsA });
    expect(q.data?.[0]?.monthly_limit ?? 0).toBe(0);
    // reorder runs with the caller's rights: RLS turns B's call into a no-op.
    const ph = await A.sb.from("property_photos").insert([0, 1].map((i) => ({ workspace_id: wsA, property_id: propA, storage_path: `${wsA}/photos/${propA}/${crypto.randomUUID()}.jpg`, mime_type: "image/jpeg", size_bytes: 10, width: 10, height: 10, position: i, created_by: A.id }))).select("id, position").order("position");
    if (ph.error) throw ph.error;
    await B.sb.rpc("reorder_property_photos", { p_property: propA, p_ids: ph.data.map((x) => x.id).reverse() });
    const after = await A.sb.from("property_photos").select("id, position").eq("property_id", propA).order("position");
    expect(after.data?.map((x) => x.id)).toEqual(ph.data.map((x) => x.id));
  });

  it("users cannot rewrite subscriptions or version history", async () => {
    const s = await A.sb.from("workspace_subscriptions").update({ status: "active", plan: "agency" }).eq("workspace_id", wsA).select();
    expect(s.data ?? []).toEqual([]);
    const h = await A.sb.from("content_versions").update({ body: {} }).eq("item_id", itemA).select();
    expect(h.data ?? []).toEqual([]);
    const d = await A.sb.from("ai_usage_events").delete().eq("workspace_id", wsA).select();
    expect(d.data ?? []).toEqual([]);
  });

  it("anonymous client sees nothing", async () => {
    const anon = createClient(URL, ANON, opts);
    expect((await anon.from("properties").select("id")).data ?? []).toEqual([]);
    expect((await anon.rpc("create_workspace", { p_name: "Anon" })).error).not.toBeNull();
  });
});

describe("RLS tenant isolation: ETAP 2 tables", () => {
  let campA: string;
  let entryA: string;
  let audioA: string;

  beforeAll(async () => {
    const c = await A.sb.from("campaigns").insert({ workspace_id: wsA, property_id: propA, name: "Kampania A", goal: "new_listing", audience: "Rodziny", style: "brand", platforms: ["instagram"], deliverables: ["ig_post"], created_by: A.id, updated_by: A.id }).select("id").single();
    if (c.error) throw c.error;
    campA = c.data.id;
    const e = await A.sb.from("schedule_entries").insert({ workspace_id: wsA, title: "Wpis A", channel: "instagram", scheduled_at: new Date().toISOString(), created_by: A.id, updated_by: A.id }).select("id").single();
    if (e.error) throw e.error;
    entryA = e.data.id;
    const m = await A.sb.from("media_assets").insert({ workspace_id: wsA, kind: "audio", storage_path: `${wsA}/audio/${crypto.randomUUID()}.mp3`, mime_type: "audio/mpeg", size_bytes: 100, label: "Utwór A", rights_confirmed_at: new Date().toISOString(), created_by: A.id }).select("id").single();
    if (m.error) throw m.error;
    audioA = m.data.id;
    const t = await A.sb.from("design_templates").insert({ workspace_id: wsA, name: "Szablon A", base_template: "noir", format: "square", design: {}, created_by: A.id });
    if (t.error) throw t.error;
    // Export history is written by the server only (service role).
    const x = await admin.from("export_events").insert({ workspace_id: wsA, content_item_id: itemA, user_id: A.id, format: "png" });
    if (x.error) throw x.error;
  });

  it("B sees none of A's campaigns, jobs, renders, music, plans, templates or exports", async () => {
    for (const table of ["campaigns", "campaign_assets", "generation_jobs", "rendered_files", "media_assets", "schedule_plans", "schedule_entries", "design_templates", "export_events"] as const) {
      const r = await B.sb.from(table).select("*").eq("workspace_id", wsA);
      expect(r.data ?? [], table).toEqual([]);
    }
    expect((await A.sb.from("campaigns").select("id").eq("id", campA)).data).toHaveLength(1);
  });

  it("B cannot write into A's workspace or change A's rows", async () => {
    const ins = await B.sb.from("schedule_entries").insert({ workspace_id: wsA, title: "Wtrącony", channel: "instagram", scheduled_at: new Date().toISOString(), created_by: B.id, updated_by: B.id });
    expect(ins.error).not.toBeNull();
    const job = await B.sb.from("generation_jobs").insert({ workspace_id: wsA, kind: "video_render", label: "x", created_by: B.id });
    expect(job.error).not.toBeNull();
    const camp = await B.sb.from("campaigns").insert({ workspace_id: wsA, name: "Obca", goal: "buyers", audience: "x", style: "brand", platforms: ["instagram"], deliverables: ["ig_post"], created_by: B.id, updated_by: B.id });
    expect(camp.error).not.toBeNull();
    const up = await B.sb.from("schedule_entries").update({ status: "published" }).eq("id", entryA).select();
    expect(up.data ?? []).toEqual([]);
    const del = await B.sb.from("media_assets").delete().eq("id", audioA).select();
    expect(del.data ?? []).toEqual([]);
    const cu = await B.sb.from("campaigns").update({ name: "Przejęta" }).eq("id", campA).select();
    expect(cu.data ?? []).toEqual([]);
  });

  it("members cannot write render results or fake jobs' state", async () => {
    const r = await A.sb.from("rendered_files").insert({ workspace_id: wsA, content_item_id: itemA, version: 1, kind: "video_mp4", storage_path: `${wsA}/renders/${itemA}/${crypto.randomUUID()}.mp4`, mime_type: "video/mp4", size_bytes: 10 });
    expect(r.error).not.toBeNull();
    // Due later, so the running app worker cannot claim it during the test.
    const j = await A.sb.from("generation_jobs").insert({ workspace_id: wsA, kind: "video_render", label: "Render", content_item_id: itemA, created_by: A.id, run_after: new Date(Date.now() + 3_600_000).toISOString() }).select("id").single();
    if (j.error) throw j.error;
    const done = await A.sb.from("generation_jobs").update({ status: "succeeded", progress: 100 }).eq("id", j.data.id).select();
    expect(done.data ?? []).toEqual([]);
    expect((await B.sb.rpc("retry_generation_job", { p_job: j.data.id })).error).not.toBeNull();
    expect((await B.sb.rpc("cancel_generation_job", { p_job: j.data.id })).error).not.toBeNull();
    expect((await A.sb.rpc("cancel_generation_job", { p_job: j.data.id })).error).toBeNull();
    const ex = await A.sb.from("export_events").delete().eq("workspace_id", wsA).select();
    expect(ex.data ?? []).toEqual([]);
  });

  it("render quota is not readable across offices", async () => {
    const q = await B.sb.rpc("render_quota_status", { p_ws: wsA });
    expect(q.data?.[0]?.monthly_limit ?? 0).toBe(0);
  });
});
