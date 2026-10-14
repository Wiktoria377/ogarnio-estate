/**
 * Recommendations against the local stack, computed from an office's real
 * records (offers, photos, materials, confirmed publications, platform
 * statistics, inquiries). Decisions are stored by the server only and offices
 * never see each other's data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { numbersIn } from "@/core/analytics/insights";
import { collectRecoData, decideRecommendation, loadRecommendations } from "@/lib/recommendations/service";
import type { WorkspaceContext } from "@/lib/session";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { WorkspaceRow } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);
const users: string[] = [];

async function user(tag: string) {
  const email = `reco-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Reco-Test-2026", email_confirm: true, user_metadata: { full_name: `Test ${tag}` } });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, opts);
  await sb.auth.signInWithPassword({ email, password: "Reco-Test-2026" });
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
let house: string;
let studio: string;
let penthouse: string;
let foreign: string;
let weakPost: string;

beforeAll(async () => {
  owner = await user("owner");
  viewer = await user("viewer");
  outsider = await user("outsider");
  ws = (await owner.sb.rpc("create_workspace", { p_name: "Biuro Rekomendacji" })).data as string;
  otherWs = (await outsider.sb.rpc("create_workspace", { p_name: "Obce biuro rekomendacji" })).data as string;
  await admin.from("workspace_members").insert({ workspace_id: ws, user_id: viewer.id, role: "viewer", status: "active" });
  ctx = await ctxFor(owner, ws, "owner");

  const prop = async (w: string, by: string, title: string, days: number) => (await admin.from("properties").insert({ workspace_id: w, created_by: by, status: "active", title, property_type: "apartment", transaction_type: "sale", city: "Kraków", created_at: ago(days) }).select("id").single()).data!.id as string;
  house = await prop(ws, owner.id, "Dom pod lasem", 45);
  studio = await prop(ws, owner.id, "Kawalerka przy metrze", 60);
  penthouse = await prop(ws, owner.id, "Apartament z tarasem", 20);
  foreign = await prop(otherWs, outsider.id, "Obca oferta", 50);
  const photo = (p: string, i: number) => ({ workspace_id: ws, property_id: p, storage_path: `${ws}/photos/${p}/${i}.jpg`, mime_type: "image/jpeg", size_bytes: 1000, width: 1600, height: 1200, position: i, created_by: owner.id });
  await admin.from("property_photos").insert([...Array.from({ length: 6 }, (_, i) => photo(house, i)), photo(studio, 0), photo(studio, 1)]);

  const content = async (property_id: string | null, content_type: string, title: string) =>
    (await admin.from("content_items").insert({ workspace_id: ws, property_id, kind: "text", content_type, title, status: "ready", created_by: owner.id }).select("id").single()).data!.id as string;
  const studioPost = await content(studio, "property_sales_post", "Kawalerka: post sprzedażowy");
  await content(penthouse, "property_sales_post", "Apartament: post");
  const edu = await content(null, "educational_post", "Jak czytać księgę wieczystą");

  const conn = (await admin.from("social_connections").insert({ workspace_id: ws, platform: "facebook_page", external_id: `fb-${Date.now()}`, name: "Strona biura", status: "connected", capabilities: [], connected_by: owner.id }).select("id").single()).data!.id;
  const publish = async (content_item_id: string, days: number) =>
    (await admin.from("publications").insert({ workspace_id: ws, connection_id: conn, content_item_id, format: "photo", caption: "x", scheduled_at: ago(days), state: "published", approved_at: ago(days), approved_by: owner.id, published_at: ago(days), external_id: `ext-${days}-${Math.random()}` }).select("id").single()).data!.id as string;
  await publish(studioPost, 40);
  // Five posts with platform statistics, published in two adjacent weeks; one with far fewer interactions.
  const stats = [[1000, 60], [1000, 55], [1000, 50], [1000, 45], [1000, 4]] as const;
  for (const [i, [views, interactions]] of stats.entries()) {
    const item = i === 4 ? await content(null, "trust_post", "Dlaczego warto nam zaufać") : edu;
    if (i === 4) weakPost = item;
    const id = await publish(item, 20 + i);
    const { error } = await admin.from("publication_metrics").insert({ workspace_id: ws, publication_id: id, source: "meta", metrics: { views, interactions }, unavailable: [], fetched_at: ago(1) });
    if (error) throw error;
  }
});

afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("recommendations from the office's records", () => {
  it("collects this office's numbers only", async () => {
    const d = await collectRecoData(ctx);
    expect(d.properties.map((p) => p.id).sort()).toEqual([house, studio, penthouse].sort());
    expect(d.properties.find((p) => p.id === house)).toMatchObject({ photos: 6, materials: 0, publications: 0 });
    expect(d.properties.find((p) => p.id === studio)).toMatchObject({ photos: 2, materials: 1, publications: 1, lastPublicationDaysAgo: 40 });
    expect(d.publications).toHaveLength(6);
    expect(d.publications.filter((p) => p.views !== null)).toHaveLength(5);
    expect(d.lastPublicationDaysAgo).toBe(20);
    expect(d.weekly).toEqual([0, 0, 1, 4, 0, 1, 0, 0]);
    expect(d.education).toEqual({ educational_post: 1 });
    expect(d).toMatchObject({ connectedChannels: 1, trackedLinks: 0, plannedNext14: 0 });
  });

  it("produces recommendations with basis, data, actions and a metric", async () => {
    const view = await loadRecommendations(ctx);
    const by = (code: string, id?: string) => view.items.find((r) => r.code === code && (!id || r.subject?.id === id));
    expect(by("publication_gap")!.why).toContain("20 dni temu");
    expect(by("irregular_frequency")).toBeDefined();
    expect(by("unused_property", house)!.priority).toBe("high");
    expect(by("missing_carousel", house)).toBeDefined();
    expect(by("repromote_property", studio)!.why).toContain("40 dni temu");
    expect(by("unpublished_material", penthouse)).toBeDefined();
    expect(by("missing_photos", penthouse)).toBeDefined();
    const headline = by("headline_test")!;
    expect(headline.subject!.title).toBe("Dlaczego warto nam zaufać");
    expect(headline.actions[0]!.href).toBe(`/studio/${weakPost}`);
    expect(headline.why).toContain("0,4%");
    expect(by("missing_education")!.data[1]!.value).not.toContain("porady dla kupujących");
    expect(by("tracking_links")).toBeDefined();
    for (const r of view.items) {
      expect(r.actions.length).toBeGreaterThan(0);
      const shown = new Set(r.data.flatMap((x) => [...numbersIn(x.value), ...numbersIn(x.label)]));
      expect(numbersIn(r.why).filter((n) => !shown.has(n) && ![7, 8, 14, 30, 90].includes(n)), r.why).toEqual([]);
    }
    expect(view.items.some((r) => r.subject?.id === foreign)).toBe(false);
    expect(view.gaps.join(" ")).toContain("linków śledzących");
  });
});

describe("decisions", () => {
  it("„Nie teraz” hides one case for 30 days and can be undone", async () => {
    const key = `missing_carousel:${house}`;
    await decideRecommendation(ctx, key, "dismissed");
    const view = await loadRecommendations(ctx);
    expect(view.items.some((r) => r.key === key)).toBe(false);
    const hidden = view.hidden.find((h) => h.key === key)!;
    expect(hidden.status).toBe("dismissed");
    expect(new Date(hidden.until).getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
    // Other recommendations for the same offer are still shown.
    expect(view.items.some((r) => r.key === `unused_property:${house}`)).toBe(true);
    await decideRecommendation(ctx, key, "restore");
    expect((await loadRecommendations(ctx)).items.some((r) => r.key === key)).toBe(true);
  });

  it("„Zrobione” hides for 14 days; the recommendation returns when the data still show it", async () => {
    const key = "tracking_links";
    await decideRecommendation(ctx, key, "done");
    expect((await loadRecommendations(ctx)).items.some((r) => r.key === key)).toBe(false);
    const later = new Date(Date.now() + 15 * 86_400_000);
    expect((await loadRecommendations(ctx, later)).items.some((r) => r.key === key)).toBe(true);
  });

  it("a recommendation the office does not have cannot be stored", async () => {
    await expect(decideRecommendation(ctx, `missing_photos:${house}`, "dismissed")).rejects.toMatchObject({ code: "not_found" });
    await expect(decideRecommendation(ctx, "x'; drop table", "dismissed")).rejects.toMatchObject({ code: "validation" });
  });
});

describe("protection", () => {
  it("a viewer sees recommendations but cannot decide", async () => {
    const vctx = await ctxFor(viewer, ws, "viewer");
    expect((await loadRecommendations(vctx)).items.length).toBeGreaterThan(5);
    await expect(decideRecommendation(vctx, "tracking_links", "dismissed")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("the client cannot write decisions directly", async () => {
    const { error } = await owner.sb.from("recommendation_states").insert({ workspace_id: ws, key: "publication_gap", status: "dismissed", hidden_until: ago(-30), reco_version: "x" });
    expect(error).not.toBeNull();
    const { data } = await owner.sb.from("recommendation_states").update({ hidden_until: ago(-999) }).eq("workspace_id", ws).select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("another office gets only its own recommendations and cannot read these decisions", async () => {
    const octx = await ctxFor(outsider, otherWs, "owner");
    const view = await loadRecommendations(octx);
    expect(view.items.some((r) => r.subject?.id === foreign)).toBe(true);
    expect(view.items.some((r) => [house, studio, penthouse].includes(r.subject?.id ?? ""))).toBe(false);
    expect(view.items.map((r) => r.code)).toContain("connect_channels");
    const { data } = await outsider.sb.from("recommendation_states").select("id").eq("workspace_id", ws);
    expect(data).toHaveLength(0);
    await expect(decideRecommendation(octx, `unused_property:${house}`, "dismissed")).rejects.toMatchObject({ code: "not_found" });
  });
});
