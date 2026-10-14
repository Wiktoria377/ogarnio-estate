/**
 * Analytics and leads against the local stack and the social CONTRACT MOCK
 * (tests/mocks/social-api.mjs on :4010, SOCIAL_API_MOCK=1). Tests OUR pipeline:
 * public offer page, tracked links, bot filtering, lead form with GDPR consent,
 * role-based lead visibility (RLS), metric snapshots ("Brak danych" instead of
 * 0), AI insight number check and the PDF report. Real Meta/LinkedIn statistics
 * need approved apps and live accounts (blocked, see docs/TEST_REPORT.md).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret } from "@/lib/crypto";
import { buildReport, createTrackedLink, resolveClick, setPublicPage, submitLead, updateLead } from "@/lib/analytics/service";
import { generateInsights } from "@/lib/analytics/insights";
import { renderReportPdf } from "@/lib/analytics/report-pdf";
import { refreshMetrics } from "@/lib/social/metrics";
import type { WorkspaceContext } from "@/lib/session";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { WorkspaceRow } from "@/lib/supabase/database.types";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MOCK = process.env.SOCIAL_API_MOCK_URL ?? "http://127.0.0.1:4010";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const users: string[] = [];
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function user(tag: string) {
  const email = `ana-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Analytics-Test-2026", email_confirm: true, user_metadata: { full_name: `Test ${tag}` } });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL_, ANON, opts);
  await sb.auth.signInWithPassword({ email, password: "Analytics-Test-2026" });
  return { id: data.user.id, email, sb };
}
async function ctxFor(u: { id: string; email: string; sb: SupabaseClient }, ws: string, role: WorkspaceContext["role"]): Promise<WorkspaceContext> {
  const { data } = await admin.from("workspaces").select("*").eq("id", ws).single();
  return { supabase: u.sb as unknown as ServerSupabase, userId: u.id, userEmail: u.email, userName: "Test", workspace: data as WorkspaceRow, role, memberships: [{ workspace: data as WorkspaceRow, role }] } as WorkspaceContext;
}
const rnd = () => Math.floor(Math.random() * 250);
const randomIp = () => `10.${rnd()}.${rnd()}.${rnd()}`;
const req = (ua: string | null = BROWSER, ip = randomIp()) => new Request("http://localhost:3000/x", { headers: { ...(ua ? { "user-agent": ua } : {}), "x-forwarded-for": ip, referer: "https://m.facebook.com/" } });

let owner: Awaited<ReturnType<typeof user>>, agent: Awaited<ReturnType<typeof user>>, agent2: Awaited<ReturnType<typeof user>>, marketing: Awaited<ReturnType<typeof user>>, outsider: Awaited<ReturnType<typeof user>>;
let ws: string;
let ctx: WorkspaceContext;
let propId: string, otherPropId: string, publicSlug: string;
let linkSlug: string;

beforeAll(async () => {
  await fetch(`${MOCK}/__reset`, { method: "POST" });
  type U = Awaited<ReturnType<typeof user>>;
  [owner, agent, agent2, marketing, outsider] = (await Promise.all(["owner", "agent", "agent2", "mkt", "out"].map(user))) as [U, U, U, U, U];
  ws = (await owner.sb.rpc("create_workspace", { p_name: "Biuro Analityki" })).data as string;
  await admin.from("workspace_subscriptions").update({ limit_overrides: { max_social_accounts: 10, max_users: 10 } }).eq("workspace_id", ws);
  const members = await admin.from("workspace_members").insert([
    { workspace_id: ws, user_id: agent.id, role: "agent", status: "active" },
    { workspace_id: ws, user_id: agent2.id, role: "agent", status: "active" },
    { workspace_id: ws, user_id: marketing.id, role: "marketing", status: "active" },
  ]);
  if (members.error) throw members.error;
  await outsider.sb.rpc("create_workspace", { p_name: "Obce biuro analityki" });
  ctx = await ctxFor(owner, ws, "owner");
  propId = (await admin.from("properties").insert({ workspace_id: ws, title: "Mieszkanie przy Plantach", property_type: "apartment", transaction_type: "sale", city: "Kraków", price: 799000, area_m2: 52, agent_id: agent.id, created_by: owner.id }).select("id").single()).data!.id;
  otherPropId = (await admin.from("properties").insert({ workspace_id: ws, title: "Dom w Wieliczce", property_type: "house", transaction_type: "sale", agent_id: agent2.id, created_by: owner.id }).select("id").single()).data!.id;
});

afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("public offer page and tracked links", () => {
  it("only the assigned agent or managers can publish the page", async () => {
    await expect(setPublicPage(await ctxFor(agent2, ws, "agent"), propId, true)).rejects.toThrow(/agent prowadzący/);
    publicSlug = (await setPublicPage(await ctxFor(agent, ws, "agent"), propId, true))!;
    expect(publicSlug).toMatch(/^mieszkanie-przy-plantach-[0-9a-f]{6}$/);
  });
  it("offer-page links need an enabled page; external links need https", async () => {
    await expect(createTrackedLink(ctx, { label: "Dom", target: "offer_page", propertyId: otherPropId, source: "facebook", medium: "social", campaign: "x" })).rejects.toThrow(/włącz publiczną stronę/);
    await expect(createTrackedLink(ctx, { label: "Zew", target: "external", url: "http://example.com", source: "facebook", medium: "social", campaign: "x" })).rejects.toThrow(/https/);
    const viewer = await ctxFor(marketing, ws, "viewer");
    await expect(createTrackedLink(viewer, { label: "V", target: "external", url: "https://example.com", source: "a", medium: "b", campaign: "c" })).rejects.toThrow(/rola/);
    const l = await createTrackedLink(ctx, { label: "Post FB jesień", target: "offer_page", propertyId: propId, channel: "facebook", source: "Facebook", medium: "social", campaign: "Jesień 2026" });
    expect(l.utm_campaign).toBe("jesien_2026");
    expect(l.shortUrl).toMatch(/\/l\/[A-Za-z0-9]{10}$/);
    linkSlug = l.slug;
  });
  it("click redirects with UTM; bots are recorded but flagged", async () => {
    const target = new URL((await resolveClick(linkSlug, req()))!);
    expect(target.pathname).toBe(`/o/${publicSlug}`);
    expect(target.searchParams.get("utm_source")).toBe("facebook");
    expect(target.searchParams.get("l")).toBe(linkSlug);
    await resolveClick(linkSlug, req());
    await resolveClick(linkSlug, req("facebookexternalhit/1.1"));
    await resolveClick(linkSlug, req(null));
    const { data } = await admin.from("web_events").select("is_bot, visitor_hash").eq("workspace_id", ws).eq("kind", "click");
    expect(data!.filter((e) => e.is_bot)).toHaveLength(2);
    expect(data!.every((e) => /^[0-9a-f]{32,64}$/.test(e.visitor_hash))).toBe(true);
    expect(await resolveClick("nieistnieje1", req())).toBeNull();
  });
});

describe("lead form with GDPR consent", () => {
  it("requires consent and a contact", async () => {
    await expect(submitLead(publicSlug, { name: "Anna", email: "anna@example.com" }, req())).rejects.toThrow(/Zgoda/);
    await expect(submitLead(publicSlug, { name: "Anna", consent: true }, req())).rejects.toThrow(/e-mail lub telefon/);
    await expect(submitLead(publicSlug, { name: "Anna", email: "zly", consent: true }, req())).rejects.toThrow(/e-mail/);
  });
  it("honeypot drops spam silently", async () => {
    expect(await submitLead(publicSlug, { name: "Bot", email: "b@example.com", consent: true, website: "http://spam" }, req())).toBe(false);
    expect((await admin.from("leads").select("id").eq("workspace_id", ws)).data).toHaveLength(0);
  });
  it("stores consent proof, UTM from the link and assigns the offer's agent", async () => {
    expect(await submitLead(publicSlug, { name: "Anna Nowak", email: "anna@example.com", phone: "600 100 200", message: "Czy można obejrzeć w sobotę?", consent: true, link: linkSlug, utm: { utm_source: "podmienione" } }, req())).toBe(true);
    const { data: lead } = await admin.from("leads").select("*").eq("workspace_id", ws).single();
    expect(lead!.consent_contact).toBe(true);
    expect(lead!.consent_version).toBe("2026-10-v1");
    expect(lead!.consent_text).toContain("Administratorem danych jest Biuro Analityki");
    expect(lead!.utm).toMatchObject({ utm_source: "facebook", utm_campaign: "jesien_2026" });
    expect(lead!.channel).toBe("facebook");
    expect(lead!.assigned_to).toBe(agent.id);
    expect((await admin.from("lead_events").select("kind").eq("lead_id", lead!.id)).data!.map((e) => e.kind)).toEqual(["created"]);
  });
  it("rate-limits one visitor and rejects disabled pages", async () => {
    const ip = randomIp();
    const same = () => req(BROWSER, ip);
    for (let i = 0; i < 5; i++) await submitLead(publicSlug, { name: `Osoba ${i}`, phone: "600 000 00" + i, consent: true }, same());
    await expect(submitLead(publicSlug, { name: "Szósta", phone: "600000099", consent: true }, same())).rejects.toThrow(/kilka zapytań/);
    await setPublicPage(ctx, propId, false);
    await expect(submitLead(publicSlug, { name: "Po wyłączeniu", phone: "600000098", consent: true }, req())).rejects.toThrow(/nie przyjmuje/);
    expect(await resolveClick(linkSlug, req())).toMatch(/\/o\/niedostepna$/);
    await setPublicPage(ctx, propId, true);
  });
  it("clients cannot write leads or events directly", async () => {
    const anon = createClient(URL_, ANON, opts);
    expect((await anon.from("leads").insert({ workspace_id: ws, name: "X", phone: "600000000", consent_contact: true, consent_text: "x", consent_version: "x" })).error).not.toBeNull();
    expect((await owner.sb.from("web_events").insert({ workspace_id: ws, kind: "click", visitor_hash: "x" })).error).not.toBeNull();
    expect((await owner.sb.from("leads").update({ status: "won" }).eq("workspace_id", ws).select("id")).data ?? []).toHaveLength(0);
  });
});

describe("lead visibility by role (RLS) and handling", () => {
  it("managers and marketing see all, agents only their own, outsiders nothing", async () => {
    await admin.from("leads").insert({ workspace_id: ws, property_id: otherPropId, name: "Klient domu", phone: "601000000", consent_contact: true, consent_text: "t", consent_version: "2026-10-v1", assigned_to: agent2.id });
    const count = async (sb: SupabaseClient) => (await sb.from("leads").select("id").eq("workspace_id", ws)).data?.length ?? 0;
    expect(await count(owner.sb)).toBe(7);
    expect(await count(marketing.sb)).toBe(7);
    expect(await count(agent.sb)).toBe(6);
    expect(await count(agent2.sb)).toBe(1);
    expect(await count(outsider.sb)).toBe(0);
  });
  it("agent updates status and notes; reassignment is for managers", async () => {
    const { data: lead } = await admin.from("leads").select("id").eq("workspace_id", ws).eq("name", "Anna Nowak").single();
    const a = await ctxFor(agent, ws, "agent");
    await updateLead(a, lead!.id, { status: "contacted", note: "Umówiona prezentacja" });
    await expect(updateLead(a, lead!.id, { assignedTo: agent2.id })).rejects.toThrow(/Przypisanie/);
    await expect(updateLead(await ctxFor(agent2, ws, "agent"), lead!.id, { status: "won" })).rejects.toThrow(/Nie znaleziono/);
    await expect(updateLead(ctx, lead!.id, { assignedTo: outsider.id })).rejects.toThrow(/nie może prowadzić/);
    await updateLead(ctx, lead!.id, { assignedTo: agent2.id });
    const { data: after } = await admin.from("leads").select("status, notes, assigned_to").eq("id", lead!.id).single();
    expect(after).toMatchObject({ status: "contacted", assigned_to: agent2.id });
    expect(after!.notes).toContain("Umówiona prezentacja");
    expect((await admin.from("lead_events").select("kind").eq("lead_id", lead!.id).order("id")).data!.map((e) => e.kind)).toEqual(["created", "status", "note", "assigned"]);
  });
});

describe("post statistics from the (mocked) official APIs", () => {
  let fbPub: string, liPub: string;
  async function connection(platform: string, external_id: string, token: string) {
    const { data } = await admin.from("social_connections").insert({ workspace_id: ws, platform: platform as never, external_id, name: `${platform} (symulator)`, status: "connected", capabilities: [], connected_by: owner.id }).select("id").single();
    await admin.from("social_credentials").insert({ connection_id: data!.id, workspace_id: ws, access_token_enc: encryptSecret(token) });
    return data!.id;
  }
  async function published(conn: string, external_id: string) {
    const at = new Date(Date.now() - 3600_000).toISOString();
    const { data, error } = await admin.from("publications").insert({ workspace_id: ws, connection_id: conn, format: "photo", caption: "Nowa oferta przy Plantach", scheduled_at: at, state: "published", approved_at: at, approved_by: owner.id, published_at: at, external_id }).select("id").single();
    if (error) throw error;
    return data!.id;
  }
  it("stores snapshots; LinkedIn member profile has no data, not zeros", async () => {
    const fb = await connection("facebook_page", "5550001", "MOCK_PAGE_TOKEN_5550001");
    const li = await connection("linkedin_member", "urn:li:person:mockMember123", "MOCK_LI_TOKEN");
    fbPub = await published(fb, "5550001_9001");
    liPub = await published(li, "urn:li:share:7001");
    await fetch(`${MOCK}/__seed`, { method: "POST", body: JSON.stringify({ fbPosts: ["5550001_9001"] }) });
    expect(await refreshMetrics(fbPub)).toMatchObject({ ok: true });
    expect((await refreshMetrics(liPub)).ok).toBe(true);
    const { data: snap } = await admin.from("publication_metrics").select("source, metrics, unavailable").eq("publication_id", fbPub).single();
    expect(snap!.source).toBe("mock");
    const m = snap!.metrics as Record<string, number | null>;
    expect(m.views).toBeGreaterThan(0);
    expect(m.saves).toBeNull();
    const { data: liSnap } = await admin.from("publication_metrics").select("metrics, note").eq("publication_id", liPub).single();
    expect(Object.keys(liSnap!.metrics as object)).toHaveLength(0);
    expect(liSnap!.note).toMatch(/LinkedIn/);
    const report = await buildReport(ctx, new Date(Date.now() - 30 * 86400_000), new Date(Date.now() + 60_000));
    expect(report.mock).toBe(true);
    expect(report.publications).toHaveLength(2);
    expect(report.totals.views).toMatchObject({ covered: 1, total: 2, value: m.views });
    expect(report.totals.saves).toEqual({ value: null, covered: 0, total: 2 });
    expect(report.clicks).toBe(2);
    expect(report.leads).toBe(7);
    expect(report.byChannel.find((c) => c.channel === "Facebook")).toMatchObject({ publications: 1, clicks: 2 });
    expect(report.leadsByStatus).toMatchObject({ contacted: 1, new: 6 });
  });
  it("expired token marks the account for reconnection", async () => {
    await fetch(`${MOCK}/__control`, { method: "POST", body: JSON.stringify({ fail: "token_expired", times: 1 }) });
    const r = await refreshMetrics(fbPub);
    expect(r.ok).toBe(false);
    const { data: pub } = await admin.from("publications").select("connection_id, metrics_checked_at").eq("id", fbPub).single();
    expect(pub!.metrics_checked_at).not.toBeNull();
    expect((await admin.from("social_connections").select("status").eq("id", pub!.connection_id).single()).data!.status).toBe("reauth_required");
  });
  it("AI insights are saved, labelled as offline test content, and the PDF renders", async () => {
    const report = await buildReport(ctx, new Date(Date.now() - 30 * 86400_000), new Date(Date.now() + 60_000));
    await expect(generateInsights(await ctxFor(marketing, ws, "viewer"), report)).rejects.toThrow(/Wnioski AI generuje/);
    const r = await generateInsights(ctx, report);
    expect(r.dropped).toEqual([]);
    expect(r.insights.observations.length).toBeGreaterThan(0);
    const { data: saved } = await marketing.sb.from("analytics_insights").select("model, version").eq("id", r.id).single();
    expect(saved!.model).toBe("offline-test-provider");
    expect((await outsider.sb.from("analytics_insights").select("id").eq("workspace_id", ws)).data).toHaveLength(0);
    const pdf = await renderReportPdf({ report, office: "Biuro Analityki", accent: "#6d4aff", insights: { insights: r.insights, model: "offline-test-provider", createdAt: new Date().toISOString(), periodFrom: report.from, periodTo: report.to } });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
  });
  it("empty offices get no AI call", async () => {
    const own = (await outsider.sb.from("workspaces").select("id").limit(1).single()).data!.id;
    const octx = await ctxFor(outsider, own, "owner");
    const empty = await buildReport(octx, new Date(Date.now() - 30 * 86400_000), new Date());
    expect(empty.totals.views.value).toBeNull();
    await expect(generateInsights(octx, empty)).rejects.toThrow(/nie ma jeszcze danych/);
  });
});
