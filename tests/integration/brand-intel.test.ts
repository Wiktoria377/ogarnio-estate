/**
 * "Poznaj moją markę" against the local stack, the running app's worker and the
 * TEST WEBSITE of a fictional office (tests/mocks/brand-site.mjs on :4030, which
 * must be running; the app runs with SAFE_FETCH_ALLOW_HOSTS including it and
 * AI_TEST_PROVIDER=1, so tone/audience traits come from the deterministic test
 * provider, not from Claude). Colours, fonts, CTAs, logo and robots handling are
 * the real code path.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import PDFDocument from "pdfkit";
import { addPdfReference, addTextReference, approveDraft, discardDraft, restoreVersion, saveDraft, saveProfile, startAnalysis } from "@/lib/brand-intel/service";
import { rowToSnapshot } from "@/lib/brand-intel/load";
import type { WorkspaceContext } from "@/lib/session";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { BrandAnalysisRow, BrandProfileRow, BrandProfileVersionRow, WorkspaceRow } from "@/lib/supabase/database.types";
import type { ProfileSnapshot } from "@/core/brand/profile";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SITE = process.env.BRAND_SITE_URL ?? "http://127.0.0.1:4030";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const users: string[] = [];

async function user(tag: string) {
  const email = `brand-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Brand-Test-2026", email_confirm: true, user_metadata: { full_name: `Test ${tag}` } });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL, ANON, opts);
  await sb.auth.signInWithPassword({ email, password: "Brand-Test-2026" });
  return { id: data.user.id, email, sb };
}

async function ctxFor(u: { id: string; email: string; sb: SupabaseClient }, ws: string, role: WorkspaceContext["role"]): Promise<WorkspaceContext> {
  const { data } = await admin.from("workspaces").select("*").eq("id", ws).single();
  return { supabase: u.sb as unknown as ServerSupabase, userId: u.id, userEmail: u.email, userName: "Test", workspace: data as WorkspaceRow, role, memberships: [{ workspace: data as WorkspaceRow, role }] } as WorkspaceContext;
}

const brand = async (ws: string) => {
  const b = (await admin.from("brand_profiles").select("*").eq("workspace_id", ws).single()).data as BrandProfileRow;
  return { ...b, colors: b.colors as unknown as Record<string, string> };
};
const versions = async (ws: string) => ((await admin.from("brand_profile_versions").select("*").eq("workspace_id", ws).order("version")).data ?? []) as BrandProfileVersionRow[];
const hits = async () => (await (await fetch(`${SITE}/__hits`)).json()) as string[];

async function finished(id: string, ms = 60_000) {
  const end = Date.now() + ms;
  for (;;) {
    const a = (await admin.from("brand_analyses").select("*").eq("id", id).single()).data as BrandAnalysisRow;
    if (a.status === "succeeded" || a.status === "failed" || Date.now() > end) return a;
    await new Promise((r) => setTimeout(r, 700));
  }
}

function pdf(text: string) {
  return new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument();
    const parts: Buffer[] = [];
    doc.on("data", (c: Buffer) => parts.push(c));
    doc.on("end", () => resolve(Buffer.concat(parts)));
    doc.fontSize(14).text(text);
    doc.end();
  });
}

let owner: Awaited<ReturnType<typeof user>>;
let agent: Awaited<ReturnType<typeof user>>;
let outsider: Awaited<ReturnType<typeof user>>;
let ws: string;
let otherWs: string;
let ctx: WorkspaceContext;
let draftId: string;
let originalPrimary: string;

beforeAll(async () => {
  await fetch(`${SITE}/__reset`);
  owner = await user("owner");
  agent = await user("agent");
  outsider = await user("outsider");
  ws = (await owner.sb.rpc("create_workspace", { p_name: "Biuro Marki" })).data as string;
  otherWs = (await outsider.sb.rpc("create_workspace", { p_name: "Obce biuro marki" })).data as string;
  await admin.from("workspace_members").insert({ workspace_id: ws, user_id: agent.id, role: "agent", status: "active" });
  ctx = await ctxFor(owner, ws, "owner");
  originalPrimary = (await brand(ws)).colors.primary!;
});

afterAll(async () => {
  await fetch(`${SITE}/__reset`);
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("brand profile versions", () => {
  it("a new office starts with an approved version 1", async () => {
    const v = await versions(ws);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ version: 1, status: "approved", source: "initial" });
    expect((await brand(ws)).approved_version).toBe(1);
  });

  it("a manual profile edit records a new approved version and supersedes the old one", async () => {
    const snap = rowToSnapshot(await brand(ws));
    const v = await saveProfile(ctx, { ...snap, tagline: "Spokojnie o nieruchomościach", extended: { ...snap.extended, ctas: ["Zadzwoń"] } });
    expect(v).toBe(2);
    const all = await versions(ws);
    expect(all.map((x) => x.status)).toEqual(["superseded", "approved"]);
    expect((await brand(ws)).extended).toMatchObject({ ctas: ["Zadzwoń"] });
  });
});

describe("Poznaj moją markę: website analysis", () => {
  it("requires explicit consent", async () => {
    await expect(startAnalysis(ctx, { url: SITE, consent: false as unknown as true })).rejects.toThrow(/zgod/i);
  });

  it("refuses private network addresses that are not on the dev allowlist", async () => {
    await expect(startAnalysis(ctx, { url: "http://127.0.0.1:54322/", consent: true })).rejects.toThrow();
  });

  it("adds a text reference used by the analysis", async () => {
    await addTextReference(ctx, { kind: "post", title: "Post z Instagrama", text: "Nowa oferta w kamienicy na Jeżycach. Wysokie sufity, drewniane podłogi, spokojna okolica. Umów prezentację." });
    const { count } = await admin.from("brand_references").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    expect(count).toBe(1);
  });

  it("produces a draft profile from the site, honouring robots.txt and access limits", async () => {
    const id = await startAnalysis(ctx, { url: SITE, consent: true, useReferences: true });
    const a = await finished(id);
    expect(a.error_message).toBeNull();
    expect(a.status).toBe("succeeded");
    expect(a.consent_version).toBeTruthy();

    const h = await hits();
    expect(h[0]).toBe("/robots.txt");
    expect(h).not.toContain("/prywatne");
    expect(h).toContain("/static/styles.css");
    expect(h).toContain("/static/logo-kamienica.png");

    const pages = a.pages as { url: string; status: number | null; ok: boolean }[];
    const team = pages.find((p) => p.url.endsWith("/zespol-wewnetrzny"));
    if (team) expect(team).toMatchObject({ status: 403, ok: false });

    const v = (await admin.from("brand_profile_versions").select("*").eq("id", a.version_id!).single()).data as BrandProfileVersionRow;
    expect(v).toMatchObject({ status: "draft", source: "analysis", analysis_id: id });
    draftId = v.id;
    const s = v.snapshot as unknown as ProfileSnapshot;
    expect(s.colors.primary).toBe("#1E3A5F");
    expect([s.colors.secondary, s.colors.accent]).toContain("#C8A35B");
    expect(s.heading_font).toBe("cormorant-garamond");
    expect(s.extended.ctas).toContain("Umów prezentację");
    expect(s.contact_email).toBe("biuro@kamienica-test.example");
    expect(s.logo_asset_id).toBeTruthy();

    // The injected paragraph on the site is data, never an instruction.
    const json = JSON.stringify(s).toLowerCase();
    expect(json).not.toContain("#ff0000");
    expect(json).not.toContain("gwarantuje zysk");

    const conf = v.confidence as unknown as Record<"palette" | "typography" | "avoid", { score: number; source: string }>;
    expect(conf.palette.score).toBeGreaterThanOrEqual(0.75);
    // Heading font is bundled (exact match); Lato is not, so typography as a whole stays a proposal.
    expect(conf.typography.score).toBeLessThan(0.5);
    expect(conf.typography.source).toContain("Cormorant Garamond");
    expect((a.result as { fonts: { headingAvailable: boolean; bodyAvailable: boolean } }).fonts).toMatchObject({ headingAvailable: true, bodyAvailable: false });
    expect(s.extended.typography_notes).toContain("Lato");
    expect(conf.avoid.score).toBeLessThan(0.5);
    expect((a.result as { references: number }).references).toBe(1);

    // Nothing changes in the binding profile until the draft is approved.
    expect((await brand(ws)).colors.primary).toBe(originalPrimary);
  });

  it("a second analysis cannot start while one is running", async () => {
    const id = await startAnalysis(ctx, { url: SITE, consent: true });
    await expect(startAnalysis(ctx, { url: SITE, consent: true })).rejects.toThrow(/już trwa/);
    const a = await finished(id);
    expect(a.status).toBe("succeeded");
    await discardDraft(ctx, a.version_id!);
    expect((await admin.from("brand_profile_versions").select("status").eq("id", a.version_id!).single()).data?.status).toBe("discarded");
  });

  it("stops when robots.txt disallows the site", async () => {
    await fetch(`${SITE}/__reset`);
    await fetch(`${SITE}/__robots`, { method: "POST", body: JSON.stringify({ disallowAll: true }) });
    const id = await startAnalysis(ctx, { url: SITE, consent: true });
    const a = await finished(id);
    expect(a.status).toBe("failed");
    expect(a.error_code).toBe("robots_disallowed");
    expect(await hits()).toEqual(["/robots.txt"]);
    await fetch(`${SITE}/__reset`);
  });
});

describe("approving, editing and restoring", () => {
  it("a draft edit is saved and approval applies it to the binding profile", async () => {
    const v = (await admin.from("brand_profile_versions").select("snapshot").eq("id", draftId).single()).data!;
    const s = v.snapshot as unknown as ProfileSnapshot;
    await saveDraft(ctx, draftId, { ...s, extended: { ...s.extended, avoid_words: ["okazja"] } });
    const n = await approveDraft(ctx, draftId);
    const b = await brand(ws);
    expect(b.approved_version).toBe(n);
    expect(b.colors.primary).toBe("#1E3A5F");
    expect(b.heading_font).toBe("cormorant-garamond");
    expect(b.extended).toMatchObject({ avoid_words: ["okazja"] });
    // The logo proposed from the site becomes a real logo asset.
    const logo = (await admin.from("brand_assets").select("kind").eq("id", b.logo_asset_id!).single()).data;
    expect(logo?.kind).toBe("logo");
    const all = await versions(ws);
    expect(all.filter((x) => x.status === "approved")).toHaveLength(1);
    await expect(approveDraft(ctx, draftId)).rejects.toThrow();
  });

  it("restoring an older version creates a new version and keeps history", async () => {
    const before = (await versions(ws)).length;
    const n = await restoreVersion(ctx, 2);
    const b = await brand(ws);
    expect(b.colors.primary).toBe(originalPrimary);
    expect(b.tagline).toBe("Spokojnie o nieruchomościach");
    expect(b.approved_version).toBe(n);
    const all = await versions(ws);
    expect(all).toHaveLength(before + 1);
    expect(all.at(-1)).toMatchObject({ source: "restore", restored_from: 2, status: "approved" });
  });
});

describe("references", () => {
  it("extracts text from a PDF and rejects non-PDF files", async () => {
    const buf = await pdf("Kamienica Nieruchomosci. Spokojnie i rzetelnie sprzedajemy mieszkania w kamienicach. Pelna dokumentacja kazdej oferty.");
    const r = await addPdfReference(ctx, new File([new Uint8Array(buf)], "prezentacja.pdf", { type: "application/pdf" }), "Prezentacja firmy");
    expect(r.note).toBeNull();
    const row = (await admin.from("brand_references").select("*").eq("workspace_id", ws).eq("kind", "pdf").single()).data!;
    expect(row.text_content).toContain("rzetelnie");
    expect(row.storage_path).toMatch(new RegExp(`^${ws}/brand/refs/`));
    await expect(addPdfReference(ctx, new File([new TextEncoder().encode("<script>alert(1)</script>")], "x.pdf"), "Fałszywy")).rejects.toThrow(/PDF/);
  });
});

describe("isolation and roles", () => {
  it("another office cannot see or approve this office's versions, analyses or references", async () => {
    for (const t of ["brand_profile_versions", "brand_analyses", "brand_references"] as const) {
      const { data } = await outsider.sb.from(t).select("id").eq("workspace_id", ws);
      expect(data ?? []).toHaveLength(0);
    }
    const { data: d } = await admin.from("brand_profile_versions").select("id").eq("workspace_id", ws).limit(1).single();
    const { error } = await outsider.sb.rpc("approve_brand_version", { p_version: d!.id });
    expect(error).not.toBeNull();
    const outCtx = await ctxFor(outsider, otherWs, "owner");
    await expect(saveDraft(outCtx, draftId, {})).rejects.toThrow(/Nie znaleziono/);
  });

  it("an agent can read the profile history but cannot start analyses or record versions", async () => {
    const { data } = await agent.sb.from("brand_profile_versions").select("id").eq("workspace_id", ws);
    expect((data ?? []).length).toBeGreaterThan(1);
    const ins = await agent.sb.from("brand_analyses").insert({ workspace_id: ws, url: SITE, consent_text: "x", consent_version: "x", consented_by: agent.id });
    expect(ins.error).not.toBeNull();
    const rec = await agent.sb.rpc("record_brand_version", { p_ws: ws, p_source: "manual", p_note: "x" });
    expect(rec.error).not.toBeNull();
    const ref = await agent.sb.from("brand_references").insert({ workspace_id: ws, kind: "post", title: "x", text_content: "x" });
    expect(ref.error).not.toBeNull();
  });
});
