/**
 * Campaign Autopilot against the local stack: a monthly plan from the office's
 * data, materials prepared by the app's background worker within the AI limit,
 * the approval queue (accept, reject, restore, schedule) and its protections.
 * Requires the dev server running (its inline worker processes the jobs).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAutopilotRun, decideItem, generateRun, regenerateItem, scheduleItems } from "@/lib/autopilot/service";
import { getStorage } from "@/lib/storage";
import type { QaReport } from "@/core/qa/types";
import type { WorkspaceContext } from "@/lib/session";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { AutopilotItemRow, WorkspaceRow } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);
const users: string[] = [];

async function user(tag: string) {
  const email = `ap-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Autopilot-Test-2026", email_confirm: true, user_metadata: { full_name: `Test ${tag}` } });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, opts);
  await sb.auth.signInWithPassword({ email, password: "Autopilot-Test-2026" });
  return { id: data.user.id, email, sb };
}
async function ctxFor(u: { id: string; email: string; sb: SupabaseClient }, ws: string, role: WorkspaceContext["role"]): Promise<WorkspaceContext> {
  const { data } = await admin.from("workspaces").select("*").eq("id", ws).single();
  return { supabase: u.sb as unknown as ServerSupabase, userId: u.id, userEmail: u.email, userName: "Test", workspace: data as WorkspaceRow, role, memberships: [{ workspace: data as WorkspaceRow, role }] } as WorkspaceContext;
}
const items = async (runId: string) => ((await admin.from("autopilot_items").select("*").eq("run_id", runId).order("position")).data ?? []) as AutopilotItemRow[];

/** Waits for the app's background worker to finish every queued material. */
async function settled(runId: string, ms = 90_000) {
  const end = Date.now() + ms;
  let list = await items(runId);
  while (list.some((i) => i.status === "generating") && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 1000));
    list = await items(runId);
  }
  return list;
}

let owner: Awaited<ReturnType<typeof user>>;
let viewer: Awaited<ReturnType<typeof user>>;
let outsider: Awaited<ReturnType<typeof user>>;
let ws: string;
let otherWs: string;
let ctx: WorkspaceContext;
let prop: string;
let runId: string;

const input = () => ({
  startDate: "2026-11-02", days: 30, count: 6, platforms: ["instagram", "facebook", "tiktok"], propertyIds: [prop],
  pillars: ["offers", "education", "owners"], goals: ["sell_listings", "acquire_listings"], includeVideo: true, includeAds: true, aiLimit: 4, strategyId: null,
});

beforeAll(async () => {
  owner = await user("owner");
  viewer = await user("viewer");
  outsider = await user("outsider");
  ws = (await owner.sb.rpc("create_workspace", { p_name: "Biuro Autopilota" })).data as string;
  otherWs = (await outsider.sb.rpc("create_workspace", { p_name: "Obce biuro autopilota" })).data as string;
  await admin.from("workspace_members").insert({ workspace_id: ws, user_id: viewer.id, role: "viewer", status: "active" });
  ctx = await ctxFor(owner, ws, "owner");
  prop = (await admin.from("properties").insert({ workspace_id: ws, created_by: owner.id, status: "active", title: "Mieszkanie z ogrodem na Ursynowie", property_type: "apartment", transaction_type: "sale", price: 749_000, area_m2: 61, rooms: 3, city: "Warszawa", district: "Ursynów" }).select("id").single()).data!.id;
  // Real stored photos: carousels and promo graphics are built from them.
  const storage = getStorage(admin as unknown as ServerSupabase);
  for (let i = 0; i < 3; i++) {
    const noise = Buffer.alloc(1600 * 1200 * 3);
    for (let p = 0; p < noise.length; p++) noise[p] = (p * (7 + i) + (p >> 9)) & 255;
    const buf = await sharp(noise, { raw: { width: 1600, height: 1200, channels: 3 } }).jpeg().toBuffer();
    const key = `${ws}/photos/${prop}/${randomUUID()}.jpg`;
    await storage.put(key, buf, "image/jpeg");
    await admin.from("property_photos").insert({ workspace_id: ws, property_id: prop, storage_path: key, mime_type: "image/jpeg", size_bytes: buf.length, width: 1600, height: 1200, position: i, created_by: owner.id });
  }
});

afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("monthly plan", () => {
  it("creates a plan with a rationale from the office's data and a queue of proposals", async () => {
    runId = (await createAutopilotRun(ctx, input())).id;
    const { data: run } = await admin.from("autopilot_runs").select("*").eq("id", runId).single();
    expect(run).toMatchObject({ status: "planned", ai_limit: 4, ai_used: 0, plan_version: "autopilot-1.0.0" });
    const rationale = (run!.rationale as string[]).join(" ");
    expect(rationale).toContain("Aktywne oferty: 1");
    expect(rationale).toContain("kolejki akceptacji");
    const list = await items(runId);
    expect(list).toHaveLength(6);
    expect(list.every((i) => i.status === "proposed" && i.rationale.length > 20)).toBe(true);
    expect(list.filter((i) => i.kind === "ad_proposal")).toHaveLength(1); // one per chosen offer, at most 2
    expect(list.filter((i) => i.platform === "tiktok").every((i) => i.kind === "video_script")).toBe(true);
    expect(list.every((i) => i.planned_at >= "2026-11-01" && i.planned_at < "2026-12-03")).toBe(true);
  });

  it("an offer outside this office cannot be planned", async () => {
    const foreign = (await admin.from("properties").insert({ workspace_id: otherWs, created_by: outsider.id, status: "active", title: "Obca oferta", property_type: "house", transaction_type: "sale" }).select("id").single()).data!.id;
    await expect(createAutopilotRun(ctx, { ...input(), propertyIds: [foreign] })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("materials within the AI limit", () => {
  it("queues only as many as the limit allows, the worker prepares them with QA", async () => {
    expect(await generateRun(ctx, runId)).toEqual({ queued: 4, skipped: 2 });
    const list = await settled(runId);
    const ready = list.filter((i) => i.status === "ready");
    expect(ready, JSON.stringify(list.map((i) => [i.position, i.kind, i.status, i.error]))).toHaveLength(4);
    expect(list.filter((i) => i.status === "proposed")).toHaveLength(2);
    const { data: contents } = await admin.from("content_items").select("id, kind, qa, qa_version, current_version, params").in("id", ready.map((i) => i.content_item_id!));
    expect(contents).toHaveLength(4);
    for (const c of contents ?? []) {
      expect((c.qa as unknown as QaReport).checks.length).toBeGreaterThan(0);
      expect(c.qa_version).toBe(c.current_version);
      expect((c.params as { autopilotRun?: string }).autopilotRun).toBe(runId);
    }
    const { data: run } = await admin.from("autopilot_runs").select("status, ai_used").eq("id", runId).single();
    expect(run).toEqual({ status: "ready", ai_used: 4 });
  });

  it("AI cost is logged against this process", async () => {
    const { data } = await admin.from("ai_usage_events").select("process_type, process_id, workspace_id").eq("process_id", runId);
    expect((data ?? []).length).toBeGreaterThanOrEqual(4);
    expect(new Set((data ?? []).map((d) => d.process_type))).toEqual(new Set(["autopilot"]));
    expect(new Set((data ?? []).map((d) => d.workspace_id))).toEqual(new Set([ws]));
  });

  it("the limit stops further generation and regeneration", async () => {
    await expect(generateRun(ctx, runId)).rejects.toMatchObject({ code: "autopilot_limit" });
    const ready = (await items(runId)).find((i) => i.status === "ready")!;
    await expect(regenerateItem(ctx, ready.id)).rejects.toMatchObject({ code: "autopilot_limit" });
  });
  it("offers with photos become a carousel and a promo graphic built from the stored photos", async () => {
    const id = (await createAutopilotRun(ctx, { ...input(), count: 2, platforms: ["instagram", "facebook"], pillars: ["offers"], goals: ["sell_listings"], includeAds: false, aiLimit: 2 })).id;
    expect(await generateRun(ctx, id)).toEqual({ queued: 2, skipped: 0 });
    const list = await settled(id);
    expect(list.map((i) => i.status), JSON.stringify(list.map((i) => i.error))).toEqual(["ready", "ready"]);
    expect(new Set(list.map((i) => i.kind))).toEqual(new Set(["carousel", "promo_graphic"]));
    const { data: contents } = await admin.from("content_items").select("id, kind, current_version, qa").in("id", list.map((i) => i.content_item_id!));
    expect((contents ?? []).every((c) => c.kind === "graphic" && (c.qa as unknown as QaReport).kind === "graphic")).toBe(true);
    const { data: photos } = await admin.from("property_photos").select("id").eq("property_id", prop);
    const { data: versions } = await admin.from("content_versions").select("body").in("item_id", list.map((i) => i.content_item_id!));
    const used = (versions ?? []).flatMap((v) => (v.body as { slides: { photoIds: string[] }[] }).slides.flatMap((s) => s.photoIds));
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((u) => (photos ?? []).some((p) => p.id === u))).toBe(true);
  });
});

describe("approval queue", () => {
  it("a proposal without a material cannot be accepted; reject and restore work", async () => {
    const proposed = (await items(runId)).find((i) => i.status === "proposed")!;
    await expect(decideItem(ctx, proposed.id, "accept")).rejects.toMatchObject({ code: "bad_state" });
    expect(await decideItem(ctx, proposed.id, "reject")).toBe("rejected");
    expect(await decideItem(ctx, proposed.id, "restore")).toBe("proposed");
  });

  it("accepted materials go to the planner as ready, nothing is published; ads are never scheduled", async () => {
    const ready = (await items(runId)).filter((i) => i.status === "ready");
    const post = ready.find((i) => i.kind !== "ad_proposal")!;
    const ad = ready.find((i) => i.kind === "ad_proposal")!;
    expect(await decideItem(ctx, post.id, "accept")).toBe("accepted");
    expect(await decideItem(ctx, ad.id, "accept")).toBe("accepted");
    const r = await scheduleItems(ctx, [post.id, ad.id]);
    expect(r.scheduled).toBe(1);
    expect(r.skipped.join(" ")).toMatch(/reklamy nie są planowane/);
    const after = (await items(runId)).find((i) => i.id === post.id)!;
    expect(after.status).toBe("scheduled");
    const { data: entry } = await admin.from("schedule_entries").select("status, content_item_id, scheduled_at").eq("id", after.schedule_entry_id!).single();
    expect(entry).toMatchObject({ status: "ready", content_item_id: post.content_item_id });
    const { count } = await admin.from("publications").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    expect(count).toBe(0);
  });

  it("a rejected material can be accepted again", async () => {
    const ready = (await items(runId)).find((i) => i.status === "ready")!;
    expect(await decideItem(ctx, ready.id, "reject")).toBe("rejected");
    expect(await decideItem(ctx, ready.id, "accept")).toBe("accepted");
  });
});

describe("protection", () => {
  it("a viewer can read the plan but cannot plan or decide", async () => {
    const vctx = await ctxFor(viewer, ws, "viewer");
    const { data } = await viewer.sb.from("autopilot_items").select("id").eq("run_id", runId);
    expect(data).toHaveLength(6);
    await expect(createAutopilotRun(vctx, input())).rejects.toMatchObject({ code: "forbidden" });
    await expect(decideItem(vctx, data![0]!.id, "reject")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("the client cannot change statuses or limits directly", async () => {
    const before = await items(runId);
    const { data: upd } = await owner.sb.from("autopilot_items").update({ status: "scheduled" }).eq("run_id", runId).select("id");
    expect(upd ?? []).toHaveLength(0);
    const { data: lim } = await owner.sb.from("autopilot_runs").update({ ai_limit: 40, ai_used: 0 }).eq("id", runId).select("id");
    expect(lim ?? []).toHaveLength(0);
    const { error } = await owner.sb.from("autopilot_runs").insert({ workspace_id: ws, title: "x", input: {}, created_by: owner.id });
    expect(error).not.toBeNull();
    expect((await items(runId)).map((i) => i.status)).toEqual(before.map((i) => i.status));
  });

  it("another office sees nothing and cannot act on this plan", async () => {
    const octx = await ctxFor(outsider, otherWs, "owner");
    const { data } = await outsider.sb.from("autopilot_runs").select("id").eq("id", runId);
    expect(data).toHaveLength(0);
    const id = (await items(runId))[0]!.id;
    await expect(decideItem(octx, id, "reject")).rejects.toMatchObject({ code: "not_found" });
    expect(await generateRun(octx, runId)).toEqual({ queued: 0, skipped: 0 });
  });
});
