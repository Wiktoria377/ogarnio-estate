/**
 * Property import pipeline against the local stack and the CRM CONTRACT MOCK
 * (tests/mocks/crm-api.mjs on :4020, must be running; the app's worker must be
 * running for the photo job). These test OUR pipeline (mapping, validation,
 * duplicates, diffs, confirmation, stale materials, SSRF guard, secrets), not
 * live ASARI/EstiCRM accounts – those need real credentials (blocked, see
 * docs/TEST_REPORT.md).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readCsv } from "@/core/import/csv";
import { approvePublication } from "@/lib/publishing/service";
import { analyzeBatch, batchReportCsv, createSource, ensureCsvSource, fetchSourceRecords, loadBatch, runImport, setRowChoices, stageRecords } from "@/lib/import/service";
import { safeFetch } from "@/lib/net/safe-fetch";
import type { WorkspaceContext } from "@/lib/session";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { ImportRowRow, WorkspaceRow } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRM = "http://127.0.0.1:4020";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const users: string[] = [];

async function user(tag: string) {
  const email = `imp-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Import-Test-2026", email_confirm: true, user_metadata: { full_name: `Test ${tag}` } });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL, ANON, opts);
  await sb.auth.signInWithPassword({ email, password: "Import-Test-2026" });
  return { id: data.user.id, email, sb };
}
async function ctxFor(u: { id: string; email: string; sb: SupabaseClient }, ws: string, role: WorkspaceContext["role"]): Promise<WorkspaceContext> {
  const { data } = await admin.from("workspaces").select("*").eq("id", ws).single();
  return { supabase: u.sb as unknown as ServerSupabase, userId: u.id, userEmail: u.email, userName: "Test", workspace: data as WorkspaceRow, role, memberships: [{ workspace: data as WorkspaceRow, role }] } as WorkspaceContext;
}
const rows = async (batchId: string) => ((await admin.from("import_rows").select("*").eq("batch_id", batchId).order("row_number")).data ?? []) as ImportRowRow[];
const csvTable = (text: string) => {
  const t = readCsv(new TextEncoder().encode(text));
  return { headers: t.headers, records: t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [h, r[i] ?? ""]))) };
};

const CSV1 = `Nr oferty;Tytuł;Rodzaj;Transakcja;Miasto;Dzielnica;Metraż;Pokoje;Piętro;Cena;Status
K-1;Mieszkanie przy parku;mieszkanie;sprzedaż;Kraków;Podgórze;48,2;2;3/5;"789 000 zł";aktywna
K-2;Dom na Woli Justowskiej;dom;sprzedaż;Kraków;Zwierzyniec;180;6;;2 450 000;aktywna
K-3;Zły metraż;mieszkanie;wynajem;Kraków;;dużo;2;;3500;aktywna
K-1;Duplikat w pliku;mieszkanie;sprzedaż;Kraków;Podgórze;48,2;2;;789000;aktywna
K-4;Lokal przy rynku;lokal użytkowy;wynajem;Kraków;Stare Miasto;95;;0;12 000;rezerwacja
`;

let owner: Awaited<ReturnType<typeof user>>;
let agent: Awaited<ReturnType<typeof user>>;
let outsider: Awaited<ReturnType<typeof user>>;
let ws: string;
let ctx: WorkspaceContext;

beforeAll(async () => {
  await fetch(`${CRM}/__reset`, { method: "POST" });
  owner = await user("owner");
  agent = await user("agent");
  outsider = await user("outsider");
  ws = (await owner.sb.rpc("create_workspace", { p_name: "Biuro Importu" })).data as string;
  await admin.from("workspace_subscriptions").update({ limit_overrides: { max_properties: 100 } }).eq("workspace_id", ws);
  await admin.from("workspace_members").insert({ workspace_id: ws, user_id: agent.id, role: "agent", status: "active" });
  await outsider.sb.rpc("create_workspace", { p_name: "Obce biuro importu" });
  ctx = await ctxFor(owner, ws, "owner");
});

afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("CSV import: preview, validation, duplicates, report", () => {
  let batchId: string;
  it("stages and analyses rows without touching offers", async () => {
    const source = await ensureCsvSource(ctx);
    batchId = await stageRecords(ctx, source, { label: "oferty.csv", ...csvTable(CSV1) });
    const r = await rows(batchId);
    expect(r.map((x) => x.action)).toEqual(["create", "create", "invalid", "skip", "create"]);
    expect(r[2]!.selected).toBe(false);
    expect(JSON.stringify(r[2]!.issues)).toContain("„dużo”");
    expect(JSON.stringify(r[3]!.issues)).toContain("Duplikat wiersza 1");
    const { count } = await admin.from("properties").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    expect(count).toBe(0);
  });

  it("refuses to select an invalid row; agents cannot import; other offices cannot see the batch", async () => {
    const r = await rows(batchId);
    await expect(setRowChoices(ctx, batchId, [{ id: r[2]!.id, selected: true }])).rejects.toThrow(/błędami/);
    await expect(runImport(await ctxFor(agent, ws, "agent"), batchId, { pausePublications: true, photoRights: false })).rejects.toThrow(/właściciel lub administrator/);
    const { data: os } = await outsider.sb.from("import_rows").select("id").eq("batch_id", batchId);
    expect(os).toEqual([]);
    const foreign = await ctxFor(outsider, (await admin.from("workspace_members").select("workspace_id").eq("user_id", outsider.id).single()).data!.workspace_id, "owner");
    await expect(loadBatch(foreign, batchId)).rejects.toThrow(/Nie znaleziono/);
    // Staging tables are written only by the server.
    const { error } = await owner.sb.from("import_rows").update({ selected: true, action: "create" }).eq("id", r[2]!.id);
    const after = (await admin.from("import_rows").select("action").eq("id", r[2]!.id).single()).data!;
    expect(error !== null || after.action === "invalid").toBe(true);
    expect(after.action).toBe("invalid");
  });

  it("imports only selected rows and writes a report", async () => {
    const r = await rows(batchId);
    await setRowChoices(ctx, batchId, [{ id: r[4]!.id, selected: false }]);
    const res = await runImport(ctx, batchId, { pausePublications: true, photoRights: false });
    expect(res).toMatchObject({ created: 2, updated: 0, failed: 0 });
    const { data: props } = await admin.from("properties").select("title, external_ref, price, floor, total_floors, source_id").eq("workspace_id", ws).order("external_ref");
    expect(props).toEqual([
      expect.objectContaining({ external_ref: "K-1", price: 789000, floor: 3, total_floors: 5 }),
      expect.objectContaining({ external_ref: "K-2", price: 2450000 }),
    ]);
    await expect(runImport(ctx, batchId, { pausePublications: true, photoRights: false })).rejects.toThrow(/już wykonywany|zakończony/);
    const report = await batchReportCsv(ctx, batchId);
    expect(report.startsWith("﻿Wiersz;")).toBe(true);
    expect(report).toContain("„dużo”");
    expect(report).toMatch(/K-4;Lokal przy rynku;nowa oferta;pominięto/);
  });
});

describe("sync: changes need confirmation, price change marks materials outdated", () => {
  it("detects a price change, applies it only on import, flags materials and pauses scheduled posts", async () => {
    const { data: k1 } = await admin.from("properties").select("id").eq("workspace_id", ws).eq("external_ref", "K-1").single();
    const { data: item } = await admin.from("content_items").insert({ workspace_id: ws, property_id: k1!.id, kind: "text", content_type: "property_sales_post", title: "Post K-1", current_version: 1, created_by: owner.id }).select("id").single();
    const { data: conn } = await admin.from("social_connections").insert({ workspace_id: ws, platform: "facebook_page", external_id: `fb-${Date.now()}`, name: "Strona testowa", status: "connected", connected_by: owner.id }).select("id").single();
    const { data: pub } = await admin.from("publications").insert({ workspace_id: ws, connection_id: conn!.id, content_item_id: item!.id, content_version: 1, format: "text", caption: "Mieszkanie za 789 000 zł", scheduled_at: new Date(Date.now() + 86400_000).toISOString(), state: "scheduled", approved_by: owner.id, approved_at: new Date().toISOString(), approved_hash: "x", created_by: owner.id }).select("id").single();

    const changed = CSV1.replace('"789 000 zł"', '"749 000 zł"');
    const batchId = await stageRecords(ctx, await ensureCsvSource(ctx), { label: "oferty-2.csv", ...csvTable(changed) });
    const r = await rows(batchId);
    expect(r[0]!.action).toBe("update");
    expect((r[0]!.normalized as { changes: { field: string; before: number; after: number }[] }).changes).toEqual([{ field: "price", before: 789000, after: 749000 }]);
    expect(r[1]!.action).toBe("unchanged");
    // Nothing changed yet (preview only).
    expect((await admin.from("properties").select("price").eq("id", k1!.id).single()).data!.price).toBe(789000);

    await setRowChoices(ctx, batchId, [{ id: r[4]!.id, selected: false }]);
    const res = await runImport(ctx, batchId, { pausePublications: true, photoRights: false });
    expect(res).toMatchObject({ created: 0, updated: 1, materials: 1, paused: 1 });
    expect((await admin.from("properties").select("price").eq("id", k1!.id).single()).data!.price).toBe(749000);
    const it2 = (await admin.from("content_items").select("stale_reason").eq("id", item!.id).single()).data!;
    const reason = it2.stale_reason!.replace(/\s/g, " ");
    expect(reason).toContain("789 000");
    expect(reason).toContain("749 000");
    const p2 = (await admin.from("publications").select("state, approved_at, error_code").eq("id", pub!.id).single()).data!;
    expect(p2).toMatchObject({ state: "pending_approval", approved_at: null, error_code: "price_changed" });
    // Re-approval is blocked until someone checks or edits the material.
    await expect(approvePublication(ctx, pub!.id)).rejects.toThrow(/nieaktualny/);
    const { data: hist } = await admin.from("property_changes").select("status, price_changed").eq("property_id", k1!.id);
    expect(hist).toEqual([{ status: "applied", price_changed: true }]);
  });

  it("a look-alike offer without the CRM number is never merged silently", async () => {
    await admin.from("properties").insert({ workspace_id: ws, title: "Ręcznie dodana", property_type: "apartment", transaction_type: "sale", city: "Gdańsk", street: "Długa", area_m2: 60, rooms: 3, created_by: owner.id });
    const batchId = await stageRecords(ctx, await ensureCsvSource(ctx), { label: "gdansk.csv", ...csvTable("Nr;Rodzaj;Transakcja;Miasto;Ulica;Metraż;Pokoje;Cena\nG-1;mieszkanie;sprzedaż;gdańsk;DŁUGA;60;3;900000\n") });
    const [row] = await rows(batchId);
    expect(row).toMatchObject({ action: "skip", match_kind: "fingerprint", selected: false });
    await setRowChoices(ctx, batchId, [{ id: row!.id, selected: true, action: "update" }]);
    const res = await runImport(ctx, batchId, { pausePublications: false, photoRights: false });
    expect(res.updated).toBe(1);
    const { data } = await admin.from("properties").select("external_ref, price").eq("workspace_id", ws).eq("title", "Ręcznie dodana").single();
    expect(data).toEqual({ external_ref: "G-1", price: 900000 });
  });
});

describe("feeds and CRM adapters (contract mock)", () => {
  it("authorized XML feed: Basic auth, record path detection, Polish values", async () => {
    const bad = await createSource(ctx, { kind: "feed_xml", name: "Feed zły", url: `${CRM}/feeds/oferty.xml`, authType: "basic", authValue: "biuro:zle" });
    await expect(fetchSourceRecords(bad, async () => {})).rejects.toThrow(/odmówił dostępu/);
    const src = await createSource(ctx, { kind: "feed_xml", name: "Feed XML", url: `${CRM}/feeds/oferty.xml`, authType: "basic", authValue: "biuro:tajne" });
    const { data: secret } = await admin.from("property_source_secrets").select("secret_enc").eq("source_id", src.id).single();
    expect(secret!.secret_enc).not.toContain("tajne");
    const { data: leaked } = await owner.sb.from("property_source_secrets").select("*");
    expect(leaked ?? []).toEqual([]);
    const table = await fetchSourceRecords(src, async () => {});
    expect(table.path).toBe("eksport.oferty.oferta");
    const batchId = await stageRecords(ctx, src, { label: "feed", ...table });
    const r = await rows(batchId);
    expect(r).toHaveLength(3);
    const a = r.map((x) => (x.normalized as { data: { property_type: string; transaction_type: string; area_m2: number; description: string } }).data);
    expect(a[0]).toMatchObject({ property_type: "apartment", transaction_type: "sale", area_m2: 54.5, description: "Jasne mieszkanie z balkonem." });
    expect(a[2]).toMatchObject({ transaction_type: "rent" });
    expect(r[0]!.photo_urls).toEqual([`${CRM}/img/house-1.jpg`, `${CRM}/img/house-2.jpg`]);
  });

  it("ASARI Site API: preset mapping, then photos downloaded in the background", async () => {
    const src = await createSource(ctx, { kind: "asari", name: "ASARI", account: "user-77", token: "asari-token-123" });
    const table = await fetchSourceRecords(src, async () => {});
    expect(table.records).toHaveLength(3);
    const batchId = await stageRecords(ctx, src, { label: "asari", ...table });
    const r = await rows(batchId);
    const d = (x: ImportRowRow) => (x.normalized as { data: Record<string, unknown> }).data;
    expect(d(r[0]!)).toMatchObject({ title: "Mieszkanie z balkonem, Jeżyce", property_type: "apartment", city: "Poznań", district: "Jeżyce", area_m2: 54.5, rooms: 3, price: 649000 });
    expect(d(r[1]!)).toMatchObject({ property_type: "house" });
    expect(d(r[2]!)).toMatchObject({ transaction_type: "rent", floor: 0 });
    await expect(runImport(ctx, batchId, { pausePublications: true, photoRights: false })).rejects.toThrow(/prawo używać zdjęć/);
    const res = await runImport(ctx, batchId, { pausePublications: true, photoRights: true });
    expect(res).toMatchObject({ created: 3, photosQueued: true });
    const { data: p } = await admin.from("properties").select("id").eq("workspace_id", ws).eq("source_id", src.id).eq("external_ref", "A-101").single();
    const end = Date.now() + 45_000;
    let photos: { source_url: string | null }[] = [];
    while (Date.now() < end) {
      photos = (await admin.from("property_photos").select("source_url").eq("property_id", p!.id)).data ?? [];
      if (photos.length >= 2) break;
      await new Promise((x) => setTimeout(x, 1000));
    }
    expect(photos.map((x) => x.source_url).sort()).toEqual([`${CRM}/img/house-1.jpg`, `${CRM}/img/house-2.jpg`]);
  });

  it("ASARI rejects wrong credentials; EstiCRM lists offers", async () => {
    const bad = await createSource(ctx, { kind: "asari", name: "ASARI zły", account: "user-77", token: "wrong-token-1" });
    await expect(fetchSourceRecords(bad, async () => {})).rejects.toThrow(/odrzucił dane dostępowe/);
    const esti = await createSource(ctx, { kind: "esticrm", name: "Esti", account: "1234", token: "esti-token-abc" });
    const table = await fetchSourceRecords(esti, async () => {});
    const batchId = await stageRecords(ctx, esti, { label: "esti", ...table });
    const r = await rows(batchId);
    // A-103 has no street in either CRM: same city/area/rooms as the ASARI import → flagged, not duplicated.
    expect(r.map((x) => x.action)).toEqual(["create", "create", "skip"]);
    expect(r[2]!.match_kind).toBe("fingerprint");
    expect((r[1]!.normalized as { data: { property_type: string } }).data.property_type).toBe("house");
  });
});

describe("SSRF guard on real sockets", () => {
  it.each([
    [`${CRM}/redirect?to=${encodeURIComponent("http://169.254.169.254/latest/meta-data/")}`, /zablokowane|zastrzeżone/],
    [`${CRM}/redirect?to=${encodeURIComponent("http://localhost:4020/feeds/oferty.json")}`, /lokalne/],
    [`${CRM}/redirect?to=${encodeURIComponent("http://127.0.0.1:4010/__state")}`, /prywatne|Niedozwolony port/],
    ["http://10.0.0.5/feed.xml", /prywatne/],
    ["http://[::ffff:127.0.0.1]:4020/feeds/oferty.json", /prywatne|Niedozwolony port/],
  ])("blocks %s", async (url, msg) => {
    await expect(safeFetch(url)).rejects.toThrow(msg);
  });
  it("caps the body size", async () => {
    await expect(safeFetch(`${CRM}/big`, { maxBytes: 2 * 1048576 })).rejects.toThrow(/za duży/);
  });
  it("does not accept private feed URLs as sources", async () => {
    await expect(createSource(ctx, { kind: "feed_json", name: "Wewnętrzny", url: "http://192.168.1.10/oferty.json" })).rejects.toThrow(/prywatne/);
    await expect(analyzeBatch(ctx, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(/Nie znaleziono/);
  });
});
