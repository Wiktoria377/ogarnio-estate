/**
 * Publishing pipeline against the local stack, the running app's worker and the
 * CONTRACT MOCK of Meta/LinkedIn APIs (tests/mocks/social-api.mjs, must be
 * running; the app runs with SOCIAL_API_MOCK=1). These are integration tests
 * of OUR code paths (approval, queue, duplicate protection, error mapping,
 * external ids), not proof that Meta/LinkedIn accept the posts: that needs real
 * accounts and approved apps (see docs/SOCIAL_SETUP.md, marked as blocked in
 * the test report).
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret } from "@/lib/crypto";
import { approvePublication, cancelPublication, composePublications, editPublication } from "@/lib/publishing/service";
import { getStorage } from "@/lib/storage";
import type { WorkspaceContext } from "@/lib/session";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { PublicationRow, WorkspaceRow } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MOCK = process.env.SOCIAL_API_MOCK_URL ?? "http://127.0.0.1:4010";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const users: string[] = [];

async function user(tag: string) {
  const email = `pub-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Publish-Test-2026", email_confirm: true, user_metadata: { full_name: `Test ${tag}` } });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL, ANON, opts);
  await sb.auth.signInWithPassword({ email, password: "Publish-Test-2026" });
  return { id: data.user.id, email, sb };
}

async function ctxFor(u: { id: string; email: string; sb: SupabaseClient }, ws: string, role: WorkspaceContext["role"]): Promise<WorkspaceContext> {
  const { data } = await admin.from("workspaces").select("*").eq("id", ws).single();
  return { supabase: u.sb as unknown as ServerSupabase, userId: u.id, userEmail: u.email, userName: "Test", workspace: data as WorkspaceRow, role, memberships: [{ workspace: data as WorkspaceRow, role }] } as WorkspaceContext;
}

const control = (fail: string | null, times = 1) => fetch(`${MOCK}/__control`, { method: "POST", body: JSON.stringify({ fail, times }) });
const mockState = async () => (await (await fetch(`${MOCK}/__state`)).json()) as { fbPosts: { id: string; message: string }[]; igMedia: { id: string; caption: string }[]; liPosts: { id: string; commentary: string; images: number }[]; fetched: { url: string; status: number; type?: string }[] };

async function pub(id: string) {
  return (await admin.from("publications").select("*").eq("id", id).single()).data as PublicationRow;
}

/** Waits for the app's background worker (it polls every few seconds). */
async function until(id: string, pred: (p: PublicationRow) => boolean, ms = 40_000) {
  const end = Date.now() + ms;
  let p = await pub(id);
  while (!pred(p) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 700));
    p = await pub(id);
  }
  return p;
}

/** Makes an approved publication due now (instead of waiting for its slot). */
const dueNow = (id: string) => admin.from("publications").update({ scheduled_at: new Date().toISOString(), next_attempt_at: null }).eq("id", id);
const soon = () => new Date(Date.now() + 3 * 60_000).toISOString();

let owner: Awaited<ReturnType<typeof user>>;
let outsider: Awaited<ReturnType<typeof user>>;
let ws: string;
let ctx: WorkspaceContext;
let fb: string, ig: string, li: string, liNoToken: string;
let photoIds: string[] = [];

async function connection(platform: string, external_id: string, name: string, token: string | null, parent: string | null = null) {
  const { data, error } = await admin.from("social_connections").insert({ workspace_id: ws, platform: platform as never, external_id, name, status: "connected", capabilities: [], connected_by: owner.id, parent_id: parent }).select("id").single();
  if (error) throw error;
  if (token) await admin.from("social_credentials").insert({ connection_id: data.id, workspace_id: ws, access_token_enc: encryptSecret(token) });
  return data.id;
}

beforeAll(async () => {
  await fetch(`${MOCK}/__reset`, { method: "POST" });
  owner = await user("owner");
  outsider = await user("outsider");
  ws = (await owner.sb.rpc("create_workspace", { p_name: "Biuro Publikacji" })).data as string;
  // A trial plan allows 2 social accounts; this office needs 4 for the test.
  await admin.from("workspace_subscriptions").update({ limit_overrides: { max_social_accounts: 10 } }).eq("workspace_id", ws);
  await outsider.sb.rpc("create_workspace", { p_name: "Obce biuro" });
  ctx = await ctxFor(owner, ws, "owner");
  fb = await connection("facebook_page", "5550001", "Biuro Testowe (symulator)", "MOCK_PAGE_TOKEN_5550001");
  ig = await connection("instagram", "17841400000000001", "@biuro.testowe.symulator", "MOCK_PAGE_TOKEN_5550001", fb);
  li = await connection("linkedin_member", "urn:li:person:mockMember123", "Jan Testowy (symulator)", "MOCK_LI_TOKEN");
  liNoToken = await connection("linkedin_member", "urn:li:person:other", "Bez tokenu", null);
  // Property with two real JPEG photos in local storage (4:5 and 3:2).
  const prop = await admin.from("properties").insert({ workspace_id: ws, title: "Mieszkanie testowe", property_type: "apartment", transaction_type: "sale", created_by: owner.id }).select("id").single();
  const storage = getStorage(admin as unknown as ServerSupabase);
  for (const f of ["tests/fixtures/house-1.jpg", "tests/fixtures/house-2.jpg"]) {
    const key = `${ws}/photos/${prop.data!.id}/${randomUUID()}.jpg`;
    const buf = readFileSync(f);
    await storage.put(key, buf, "image/jpeg");
    const sharp = (await import("sharp")).default;
    const m = await sharp(buf).metadata();
    const ph = await admin.from("property_photos").insert({ workspace_id: ws, property_id: prop.data!.id, storage_path: key, mime_type: "image/jpeg", size_bytes: buf.length, width: m.width, height: m.height, position: photoIds.length, created_by: owner.id }).select("id").single();
    photoIds.push(ph.data!.id);
  }
});

afterAll(async () => {
  await control(null, 0);
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("approval gate and permissions", () => {
  it("an unapproved publication is never published, even when due", async () => {
    const { ids } = await composePublications(ctx, { connectionIds: [fb], title: "Bez akceptacji", caption: `Czeka na akceptację ${Date.now()}`, scheduledAt: soon(), submit: "request" });
    await admin.from("publications").update({ scheduled_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", ids[0]!);
    await new Promise((r) => setTimeout(r, 7000));
    expect((await pub(ids[0]!)).state).toBe("pending_approval");
  });

  it("agent can request but not approve; marketing can approve", async () => {
    const agentCtx = { ...ctx, role: "agent" } as WorkspaceContext;
    await expect(composePublications(agentCtx, { connectionIds: [fb], title: "Agent", caption: "Post agenta", scheduledAt: soon(), submit: "approve" })).rejects.toThrow(/zatwierdza/);
    const { ids } = await composePublications(agentCtx, { connectionIds: [fb], title: "Agent", caption: "Post agenta", scheduledAt: soon(), submit: "request" });
    await expect(approvePublication(agentCtx, ids[0]!)).rejects.toThrow(/zatwierdza/);
    await approvePublication({ ...ctx, role: "marketing" } as WorkspaceContext, ids[0]!);
    expect((await pub(ids[0]!)).state).toBe("scheduled");
    await cancelPublication(ctx, ids[0]!);
  });

  it("platform rules: Instagram rejects text-only posts, wrong aspect ratio and too long captions before queueing", async () => {
    await expect(composePublications(ctx, { connectionIds: [ig], title: "Tekst", caption: "Sam tekst", scheduledAt: soon(), formats: { [ig]: "photo" } })).rejects.toThrow(/wymaga 1 pliku/);
    await expect(composePublications(ctx, { connectionIds: [ig], title: "Długi", caption: "x".repeat(2300), media: [{ source: "photo", ref: photoIds[0]! }], scheduledAt: soon() })).rejects.toThrow(/limit to 2200/);
    const wide = await admin.from("property_photos").insert({ workspace_id: ws, property_id: (await admin.from("property_photos").select("property_id").eq("id", photoIds[0]!).single()).data!.property_id, storage_path: `${ws}/photos/x/${randomUUID()}.jpg`, mime_type: "image/jpeg", size_bytes: 10, width: 3000, height: 1000, position: 9 }).select("id").single();
    await expect(composePublications(ctx, { connectionIds: [ig], title: "Panorama", caption: "Panorama", media: [{ source: "photo", ref: wide.data!.id }], scheduledAt: soon() })).rejects.toThrow(/proporcje/);
  });

  it("editing the content after approval sends it back to draft; moving the time keeps the approval", async () => {
    const { ids } = await composePublications(ctx, { connectionIds: [fb], title: "Edycja", caption: "Pierwsza wersja", scheduledAt: soon(), submit: "approve" });
    await editPublication(ctx, ids[0]!, { scheduledAt: new Date(Date.now() + 10 * 60_000).toISOString() });
    expect((await pub(ids[0]!)).state).toBe("scheduled");
    await editPublication(ctx, ids[0]!, { caption: "Druga wersja" });
    const p = await pub(ids[0]!);
    expect(p.state).toBe("draft");
    expect(p.approved_at).toBeNull();
    await cancelPublication(ctx, ids[0]!);
  });

  it("tampering with approved content in the database stops the publication", async () => {
    const { ids } = await composePublications(ctx, { connectionIds: [fb], title: "Manipulacja", caption: "Zatwierdzony tekst", scheduledAt: soon(), submit: "approve" });
    await admin.from("publications").update({ caption: "Podmieniony tekst", scheduled_at: new Date().toISOString() }).eq("id", ids[0]!);
    const p = await until(ids[0]!, (x) => x.state === "action_required");
    expect(p.error_code).toBe("not_approved");
    expect((await mockState()).fbPosts.some((x) => x.message === "Podmieniony tekst")).toBe(false);
  });
});

describe("publishing through the API contract mock", () => {
  it("runs at the scheduled time: not before, then published soon after", async () => {
    const caption = `Publikacja o godzinie ${Date.now()}`;
    const { ids } = await composePublications(ctx, { connectionIds: [fb], title: "FB o czasie", caption, scheduledAt: soon(), submit: "approve" });
    const at = new Date(Date.now() + 20_000);
    await admin.from("publications").update({ scheduled_at: at.toISOString(), next_attempt_at: null }).eq("id", ids[0]!);
    // The worker polls every few seconds: well before the slot nothing may be sent.
    await new Promise((r) => setTimeout(r, 12_000));
    expect((await pub(ids[0]!)).state).toBe("scheduled");
    expect((await mockState()).fbPosts.filter((x) => x.message === caption)).toHaveLength(0);
    const p = await until(ids[0]!, (x) => x.state === "published", 60_000);
    expect(p.state).toBe("published");
    const sent = new Date(p.published_at!).getTime();
    expect(sent).toBeGreaterThanOrEqual(at.getTime());
    expect(sent - at.getTime()).toBeLessThan(30_000);
  }, 90_000);

  it("Facebook text post: published only with the platform id, never twice", async () => {
    const caption = `Nowa oferta na Mokotowie ${Date.now()}`;
    const { ids, entryId } = await composePublications(ctx, { connectionIds: [fb], title: "FB tekst", caption, scheduledAt: soon(), submit: "approve" });
    await dueNow(ids[0]!);
    const p = await until(ids[0]!, (x) => x.state === "published");
    expect(p.state).toBe("published");
    expect(p.external_id).toMatch(/^5550001_\d+$/);
    expect(p.external_url).toContain("mock.social.invalid");
    await new Promise((r) => setTimeout(r, 5000));
    expect((await mockState()).fbPosts.filter((x) => x.message === caption)).toHaveLength(1);
    expect((await admin.from("schedule_entries").select("status, external_url").eq("id", entryId).single()).data!.status).toBe("published");
  });

  it("Instagram carousel: signed JPEG links are downloaded by the platform, container → publish", async () => {
    const caption = `Karuzela ${Date.now()} #mieszkanie`;
    const { ids } = await composePublications(ctx, { connectionIds: [ig], title: "IG karuzela", caption, media: photoIds.map((ref) => ({ source: "photo" as const, ref })), scheduledAt: soon(), submit: "approve" });
    const before = await pub(ids[0]!);
    expect(before.format).toBe("carousel");
    expect((before.media as unknown[]).length).toBe(2);
    await dueNow(ids[0]!);
    const p = await until(ids[0]!, (x) => ["published", "failed", "action_required"].includes(x.state));
    expect(p.error_message).toBeNull();
    expect(p.state).toBe("published");
    const st = await mockState();
    expect(st.igMedia.filter((m) => m.caption === caption)).toHaveLength(1);
    expect(st.fetched.filter((f) => f.url.includes("/api/public-media/") && f.status === 200 && f.type === "image/jpeg").length).toBeGreaterThanOrEqual(2);
  });

  it("public media links are signed: a tampered token is rejected", async () => {
    const st = await mockState();
    const url = st.fetched.find((f) => f.url.includes("/api/public-media/"))!.url;
    const bad = url.replace(/\/api\/public-media\/([^/]+)\//, (_m, t: string) => `/api/public-media/${t.slice(0, -2)}xx/`);
    expect((await fetch(bad)).status).toBe(404);
  });

  it("LinkedIn multi-image post: images uploaded, post URN stored", async () => {
    const caption = `LinkedIn (test) ${Date.now()}: nowa oferta!`;
    const { ids } = await composePublications(ctx, { connectionIds: [li], title: "LI", caption, media: photoIds.map((ref) => ({ source: "photo" as const, ref })), scheduledAt: soon(), submit: "approve" });
    await dueNow(ids[0]!);
    const p = await until(ids[0]!, (x) => ["published", "failed", "action_required"].includes(x.state));
    expect(p.state).toBe("published");
    expect(p.external_id).toMatch(/^urn:li:share:/);
    const post = (await mockState()).liPosts.find((x) => x.id === p.external_id)!;
    expect(post.images).toBe(2);
    expect(post.commentary).toContain("\\(test\\)");
  });

  it("lost response after the post was created: verified on the platform, no duplicate", async () => {
    const caption = `Niepewny wynik ${Date.now()}`;
    const { ids } = await composePublications(ctx, { connectionIds: [fb], title: "Timeout", caption, scheduledAt: soon(), submit: "approve" });
    await control("timeout_after_create", 1);
    await dueNow(ids[0]!);
    const u = await until(ids[0]!, (x) => x.uncertain);
    expect(u.state).toBe("queued");
    await admin.from("publications").update({ next_attempt_at: new Date().toISOString() }).eq("id", ids[0]!);
    const p = await until(ids[0]!, (x) => x.state === "published");
    expect(p.state).toBe("published");
    expect((await mockState()).fbPosts.filter((x) => x.message === caption)).toHaveLength(1);
    const { data: log } = await admin.from("publication_attempts").select("action, outcome").eq("publication_id", ids[0]!);
    expect(log!.some((l) => l.outcome === "uncertain")).toBe(true);
    expect(log!.some((l) => l.action === "verify_uncertain" && l.outcome === "found")).toBe(true);
  });

  it("rate limit: retried later automatically", async () => {
    const caption = `Limit zapytań ${Date.now()}`;
    const { ids } = await composePublications(ctx, { connectionIds: [fb], title: "Rate", caption, scheduledAt: soon(), submit: "approve" });
    await control("rate_limited", 1);
    await dueNow(ids[0]!);
    const q = await until(ids[0]!, (x) => x.error_code === "rate_limited");
    expect(q.state).toBe("queued");
    expect(Date.parse(q.next_attempt_at!)).toBeGreaterThan(Date.now());
    await admin.from("publications").update({ next_attempt_at: new Date().toISOString() }).eq("id", ids[0]!);
    expect((await until(ids[0]!, (x) => x.state === "published")).state).toBe("published");
  });

  it("expired token: user action required, account flagged for re-authorization", async () => {
    const { ids } = await composePublications(ctx, { connectionIds: [li], title: "Token", caption: `Token ${Date.now()}`, scheduledAt: soon(), submit: "approve" });
    await control("token_expired", 3);
    await dueNow(ids[0]!);
    const p = await until(ids[0]!, (x) => x.state === "action_required");
    await control(null, 0);
    expect(p.error_code).toBe("token_expired");
    expect((await admin.from("social_connections").select("status").eq("id", li).single()).data!.status).toBe("reauth_required");
    await admin.from("social_connections").update({ status: "connected", last_error: null }).eq("id", li);
  });

  it("rejected media: failed with a readable reason, not retried", async () => {
    const { ids } = await composePublications(ctx, { connectionIds: [ig], title: "Odrzucone", caption: `Odrzucone ${Date.now()}`, media: [{ source: "photo", ref: photoIds[0]! }], scheduledAt: soon(), submit: "approve" });
    await control("reject_media", 1);
    await dueNow(ids[0]!);
    const p = await until(ids[0]!, (x) => ["failed", "published", "action_required"].includes(x.state));
    expect(p.state).toBe("failed");
    expect(p.error_message).toMatch(/odrzuciła plik/);
    expect(p.external_id).toBeNull();
  });

  it("account without stored credentials: action required, nothing sent", async () => {
    const { ids } = await composePublications(ctx, { connectionIds: [liNoToken], title: "Bez tokenu", caption: "Bez tokenu", scheduledAt: soon(), submit: "approve" });
    await dueNow(ids[0]!);
    const p = await until(ids[0]!, (x) => x.state === "action_required");
    expect(p.error_code).toBe("token_expired");
  });
});

describe("tenancy and secrets", () => {
  it("tokens are never readable by users; other offices see nothing", async () => {
    const own = await owner.sb.from("social_credentials").select("*");
    expect(own.data ?? []).toHaveLength(0);
    expect((await owner.sb.from("oauth_grants").select("*")).data ?? []).toHaveLength(0);
    expect((await outsider.sb.from("publications").select("id").eq("workspace_id", ws)).data).toHaveLength(0);
    expect((await outsider.sb.from("social_connections").select("id").eq("workspace_id", ws)).data).toHaveLength(0);
    const { data: raw } = await admin.from("social_credentials").select("access_token_enc").eq("connection_id", fb).single();
    expect(raw!.access_token_enc.startsWith("v1:")).toBe(true);
    expect(raw!.access_token_enc).not.toContain("MOCK_PAGE_TOKEN");
  });

  it("users cannot write publications or connections directly (server-only writes)", async () => {
    const ins = await owner.sb.from("publications").insert({ workspace_id: ws, connection_id: fb, format: "text", scheduled_at: new Date().toISOString(), state: "scheduled", approved_at: new Date().toISOString() });
    expect(ins.error).not.toBeNull();
    const up = await owner.sb.from("social_connections").update({ status: "connected" }).eq("id", liNoToken).select("id");
    expect(up.data ?? []).toHaveLength(0);
  });

  it("claim is atomic: parallel claims never return the same publication", async () => {
    const { ids } = await composePublications(ctx, { connectionIds: [fb], title: "Claim", caption: `Claim ${Date.now()}`, scheduledAt: soon(), submit: "approve" });
    // Park it far in the future for the app worker, then claim twice in parallel ourselves.
    await admin.from("publications").update({ scheduled_at: new Date(Date.now() - 1000).toISOString() }).eq("id", ids[0]!);
    const [a, b] = await Promise.all([admin.rpc("claim_publications", { p_worker: "t1", p_limit: 50 }), admin.rpc("claim_publications", { p_worker: "t2", p_limit: 50 })]);
    const all = [...(a.data ?? []), ...(b.data ?? [])].map((x: { id: string }) => x.id);
    expect(new Set(all).size).toBe(all.length);
    await admin.from("publications").update({ state: "canceled", locked_at: null, locked_by: null }).in("id", all);
  });
});
