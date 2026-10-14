/** Sales page backend (contact form, consent-only visit stats) and the data retention job. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { recordSiteEvent, submitContact } from "@/lib/site/service";
import { retentionTick } from "@/lib/retention";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36";
const rnd = () => Math.floor(Math.random() * 250);
const req = (ua: string = UA, ip = `10.${rnd()}.${rnd()}.${rnd()}`) => new Request("http://localhost:3000/", { headers: { "user-agent": ua, "x-forwarded-for": ip } });
const tag = `ret-${Date.now()}`;
const users: string[] = [];
let ws: string;

beforeAll(async () => {
  const { data } = await admin.auth.admin.createUser({ email: `${tag}@example.com`, password: "Retention-2026", email_confirm: true });
  users.push(data.user!.id);
  const sb = createClient(URL_, ANON, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: `${tag}@example.com`, password: "Retention-2026" });
  ws = (await sb.rpc("create_workspace", { p_name: "Biuro Retencji" })).data as string;
});
afterAll(async () => {
  await admin.from("contact_messages").delete().like("email", `${tag}%`);
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("contact form", () => {
  it("validates, requires consent, drops honeypot spam, rate-limits", async () => {
    const ok = { name: "Ewa Kowalska", email: `${tag}@example.com`, message: "Prosimy o prezentację aplikacji.", consent: true };
    await expect(submitContact({ ...ok, consent: false }, req())).rejects.toThrow(/Zgoda/);
    await expect(submitContact({ ...ok, email: "nie-email" }, req())).rejects.toThrow(/e-mail/);
    await expect(submitContact({ ...ok, message: "krótko" }, req())).rejects.toThrow(/min. 10/);
    expect(await submitContact({ ...ok, website: "spam" }, req())).toBe(false);
    const ip = `10.${rnd()}.${rnd()}.${rnd()}`;
    for (let i = 0; i < 3; i++) expect(await submitContact(ok, req(UA, ip))).toBe(true);
    await expect(submitContact(ok, req(UA, ip))).rejects.toThrow(/kilka wiadomości/);
    const { data } = await admin.from("contact_messages").select("consent_version, consent_text, visitor_hash").like("email", `${tag}%`);
    expect(data).toHaveLength(3);
    expect(data![0]!.consent_version).toBe("2026-10-site-v1");
    expect(data![0]!.visitor_hash).toMatch(/^[0-9a-f]{32}$/);
  });
  it("is not readable or writable by clients", async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    expect((await anon.from("contact_messages").select("id").limit(1)).data ?? []).toHaveLength(0);
    expect((await anon.from("site_events").insert({ path: "/", visitor_hash: "x" })).error).not.toBeNull();
  });
});

describe("visit statistics only with consent", () => {
  it("stores nothing without consent or for bots", async () => {
    const before = (await admin.from("site_events").select("id", { count: "exact", head: true })).count ?? 0;
    expect(await recordSiteEvent({ path: "/" }, req(), false)).toBe(false);
    expect(await recordSiteEvent({ path: "/" }, req("Googlebot/2.1"), true)).toBe(false);
    expect(await recordSiteEvent({ path: "/", referrer: "https://www.google.com/search?q=x", utm_source: "Newsletter Październik" }, req(), true)).toBe(true);
    await expect(recordSiteEvent({ path: "javascript:alert(1)" }, req(), true)).rejects.toThrow();
    const { data, count } = await admin.from("site_events").select("referrer_host, utm_source", { count: "exact" }).order("id", { ascending: false }).limit(1);
    expect(count).toBe(before + 1);
    expect(data![0]).toEqual({ referrer_host: "www.google.com", utm_source: "newsletter_pa_dziernik" });
  });
});

describe("retention job", () => {
  it("deletes data past the policy and keeps recent data and the admin audit log", async () => {
    const old = (months: number) => new Date(Date.now() - months * 30.5 * 86400_000).toISOString();
    const lead = (updated: string) => ({ workspace_id: ws, name: "Klient", phone: "600000000", consent_contact: true, consent_text: "t", consent_version: "v", created_at: updated, updated_at: updated });
    const { data: leads } = await admin.from("leads").insert([lead(old(25)), lead(old(23))]).select("id, updated_at");
    await admin.from("web_events").insert([{ workspace_id: ws, kind: "click", visitor_hash: tag, created_at: old(14) }, { workspace_id: ws, kind: "click", visitor_hash: tag, created_at: old(12) }]);
    await admin.from("app_errors").insert([{ area: tag, message: "stary", created_at: old(4) }, { area: tag, message: "nowy", created_at: new Date().toISOString() }]);
    await admin.from("admin_audit_log").insert({ action: "retention_probe", reason: tag, created_at: old(60) });
    const r = (await retentionTick(true)) as Record<string, number>;
    expect(r.leads).toBeGreaterThanOrEqual(1);
    const kept = (await admin.from("leads").select("id").in("id", leads!.map((l) => l.id))).data!;
    expect(kept.map((l) => l.id)).toEqual([leads![1]!.id]);
    expect((await admin.from("web_events").select("id").eq("visitor_hash", tag)).data).toHaveLength(1);
    expect((await admin.from("app_errors").select("message").eq("area", tag)).data!.map((e) => e.message)).toEqual(["nowy"]);
    expect((await admin.from("admin_audit_log").select("id").eq("reason", tag)).data).toHaveLength(1);
    expect(await retentionTick()).toBeNull(); // throttled
  });
});
