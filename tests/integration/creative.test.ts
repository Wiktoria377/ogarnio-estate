/**
 * Creative Engine 2.0 against the local stack: technical analysis of real
 * pixels stored for a property, composition data from those reports, and five
 * creative variants (offline provider) with brand identity, facts, cost per
 * process, roles and office isolation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { analyzePropertyPhotos, photoReports } from "@/lib/creative/photos";
import { loadCompositionData } from "@/lib/creative/composition";
import { createCreativeVariants } from "@/lib/creative/variants";
import { addVersion, loadCurrentBody } from "@/lib/content";
import { defaultSlides, graphicDesignSchema, type GraphicDesign } from "@/core/graphics/design";
import { CREATIVE_DIRECTION_IDS } from "@/core/creative/composition";
import { getStorage } from "@/lib/storage";
import type { PhotoReport } from "@/core/creative/photos";
import type { WorkspaceContext } from "@/lib/session";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { WorkspaceRow } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);
const users: string[] = [];

async function user(tag: string) {
  const email = `creative-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Creative-Test-2026", email_confirm: true, user_metadata: { full_name: `Test ${tag}` } });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, opts);
  await sb.auth.signInWithPassword({ email, password: "Creative-Test-2026" });
  return { id: data.user.id, email, sb };
}
async function ctxFor(u: { id: string; email: string; sb: SupabaseClient }, ws: string, role: WorkspaceContext["role"]): Promise<WorkspaceContext> {
  const { data } = await admin.from("workspaces").select("*").eq("id", ws).single();
  return { supabase: u.sb as unknown as ServerSupabase, userId: u.id, userEmail: u.email, userName: "Test", workspace: data as WorkspaceRow, role, memberships: [{ workspace: data as WorkspaceRow, role }] } as WorkspaceContext;
}

/** A detailed, evenly lit "room": noise texture over a gradient, so edges and contrast are real pixels. */
async function roomPhoto(w: number, h: number, dark = false) {
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    const base = dark ? 25 : 90 + (x / w) * 90;
    const n = ((x * 7919 + y * 104729) % 97) - 48;
    const stripe = Math.floor(x / 40) % 2 ? 40 : -40;
    raw[i] = Math.max(0, Math.min(255, base + n + stripe));
    raw[i + 1] = Math.max(0, Math.min(255, base + n * 0.8 + stripe));
    raw[i + 2] = Math.max(0, Math.min(255, base * 0.9 + n * 0.6 + stripe));
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
}

let owner: Awaited<ReturnType<typeof user>>;
let viewer: Awaited<ReturnType<typeof user>>;
let outsider: Awaited<ReturnType<typeof user>>;
let ws: string;
let otherWs: string;
let ctx: WorkspaceContext;
let prop: string;
let graphic: string;
const photoIds: string[] = [];

beforeAll(async () => {
  owner = await user("owner");
  viewer = await user("viewer");
  outsider = await user("outsider");
  ws = (await owner.sb.rpc("create_workspace", { p_name: "Biuro Kreacji" })).data as string;
  otherWs = (await outsider.sb.rpc("create_workspace", { p_name: "Obce biuro kreacji" })).data as string;
  await admin.from("workspace_members").insert({ workspace_id: ws, user_id: viewer.id, role: "viewer", status: "active" });
  ctx = await ctxFor(owner, ws, "owner");
  prop = (await admin.from("properties").insert({ workspace_id: ws, created_by: owner.id, status: "active", title: "Apartament z tarasem", property_type: "apartment", transaction_type: "sale", price: 1_250_000, area_m2: 74, rooms: 3, city: "Gdańsk" }).select("id").single()).data!.id;

  const storage = getStorage(admin as unknown as ServerSupabase);
  const shots = [await roomPhoto(1800, 1200), await roomPhoto(1800, 1200), await roomPhoto(1200, 1800), await roomPhoto(640, 427, true)];
  for (const [i, buf] of shots.entries()) {
    const meta = await sharp(buf).metadata();
    const key = `${ws}/photos/${prop}/${randomUUID()}.jpg`;
    await storage.put(key, buf, "image/jpeg");
    const { data, error } = await admin.from("property_photos").insert({ workspace_id: ws, property_id: prop, storage_path: key, mime_type: "image/jpeg", size_bytes: buf.length, width: meta.width!, height: meta.height!, position: i, created_by: owner.id }).select("id").single();
    if (error) throw error;
    photoIds.push(data!.id);
  }

  // A source graphic with a brand-violating colour override and a manual crop on the cover photo.
  const base = graphicDesignSchema.parse({ format: "square", template: "editorial", propertyId: prop, slides: defaultSlides("square", photoIds) });
  const design: GraphicDesign = {
    ...base, colors: { primary: "#FF0000" },
    slides: base.slides.map((s, i) => (i === 0 ? { ...s, overrides: { photo0: { zoom: 1.2, fx: 0.3, fy: 0.6, color: "#00FF00" } } } as typeof s : s)),
  };
  graphic = (await owner.sb.from("content_items").insert({ workspace_id: ws, property_id: prop, kind: "graphic", content_type: "graphic_square", title: "Źródło", platform: "Instagram", params: { format: "square", template: "editorial" }, created_by: owner.id, updated_by: owner.id, current_version: 0 }).select("id").single()).data!.id;
  await addVersion(ctx, graphic, design, "manual");
});

afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("photo analysis on stored pixels", () => {
  it("analyses every photo of the property and flags the real defects", async () => {
    const r = await analyzePropertyPhotos(ctx, prop);
    expect(r).toEqual({ analyzed: 4, failed: 0 });
    const reports = await photoReports(ctx, photoIds);
    expect(reports.size).toBe(4);
    const good = reports.get(photoIds[0]!)!;
    expect(good.issues.filter((i) => i.severity !== "info")).toEqual([]);
    expect(good.orientation).toBe("landscape");
    expect(reports.get(photoIds[2]!)!.orientation).toBe("portrait");
    const bad = reports.get(photoIds[3]!)!;
    expect(bad.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["very_low_resolution", "dark"]));
    expect(bad.score).toBeLessThan(good.score);
  });

  it("does not re-analyse current reports unless asked", async () => {
    expect(await analyzePropertyPhotos(ctx, prop)).toEqual({ analyzed: 0, failed: 0 });
    expect((await analyzePropertyPhotos(ctx, prop, true)).analyzed).toBe(4);
  });

  it("composition data comes from those reports", async () => {
    const data = await loadCompositionData(ctx, [prop]);
    const photos = JSON.stringify(data);
    expect(photos).toContain("very_low_resolution");
  });

  it("another office sees no reports", async () => {
    const octx = await ctxFor(outsider, otherWs, "owner");
    expect((await photoReports(octx, photoIds)).size).toBe(0);
    const { data } = await outsider.sb.from("property_photos").select("analysis").in("id", photoIds);
    expect(data ?? []).toHaveLength(0);
  });
});

describe("five creative variants", () => {
  let setId: string;
  let items: { id: string; direction: string; template: string }[];

  it("creates five separate graphics with distinct layouts", async () => {
    const r = await createCreativeVariants(ctx, graphic);
    expect(r.failed).toEqual([]);
    expect(r.items.map((i) => i.direction)).toEqual(CREATIVE_DIRECTION_IDS);
    expect(new Set(r.items.map((i) => i.template)).size).toBe(5);
    setId = r.setId;
    items = r.items;
  });

  it("keeps the brand identity, the facts and the photo crop; never the colour override", async () => {
    const src = await loadCurrentBody<GraphicDesign>(ctx, graphic);
    for (const it of items) {
      const { item, body } = await loadCurrentBody<GraphicDesign>(ctx, it.id);
      expect(item.kind).toBe("graphic");
      expect((item.params as { variantOf: string; variantSet: string }).variantOf).toBe(graphic);
      expect((item.params as { variantSet: string }).variantSet).toBe(setId);
      expect(body.colors).toEqual({});
      expect(body.headingFont ?? null).toBeNull();
      expect(body.format).toBe("square");
      expect(body.propertyId).toBe(prop);
      const cover = body.slides[0]!;
      expect(cover.overrides?.photo0).toEqual({ zoom: 1.2, fx: 0.3, fy: 0.6 });
      // Fact texts (price, area…) are the source's, not rewritten by the model.
      const srcCover = src.body.slides[0]!;
      for (const [k, v] of Object.entries(srcCover.texts)) if (/price|area|rooms|location/.test(k)) expect(cover.texts[k]).toBe(v);
      expect(JSON.stringify(body.slides)).toMatch(/1[\s\u00a0\u202f]?250[\s\u00a0\u202f]?000/);
    }
  });

  it("each variant follows its direction (offline provider marks it)", async () => {
    for (const it of items) {
      const { body } = await loadCurrentBody<GraphicDesign>(ctx, it.id);
      expect(JSON.stringify(body.slides)).toMatch(/Minimalistyczna|Premium|Dynamiczna|Ekspercka|Sprzedażowa/);
    }
  });

  it("logs one AI call per variant under one process", async () => {
    const { data } = await admin.from("ai_usage_events").select("process_type, process_id").eq("process_id", setId);
    expect(data).toHaveLength(5);
    expect(new Set((data ?? []).map((d) => d.process_type))).toEqual(new Set(["creative_variants"]));
  });

  it("a viewer cannot create variants", async () => {
    const vctx = await ctxFor(viewer, ws, "viewer");
    await expect(createCreativeVariants(vctx, graphic)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("another office cannot use this graphic", async () => {
    const octx = await ctxFor(outsider, otherWs, "owner");
    await expect(createCreativeVariants(octx, graphic, ["premium"])).rejects.toBeTruthy();
    const { data } = await admin.from("content_items").select("id").eq("workspace_id", otherWs);
    expect(data ?? []).toHaveLength(0);
  });

  it("rejects unknown directions", async () => {
    await expect(createCreativeVariants(ctx, graphic, ["nonsense" as never])).rejects.toMatchObject({ code: "validation" });
  });
});
