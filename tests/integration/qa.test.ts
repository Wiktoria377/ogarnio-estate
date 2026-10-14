/**
 * Quality assurance against the local stack: a text, a graphic rendered with a
 * real stored photo, and a video with a real MP4 (made by ffmpeg) inspected by
 * ffprobe. Reports are stored by the server only; roles and office isolation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runQa } from "@/lib/qa";
import { addVersion } from "@/lib/content";
import { defaultSlides, graphicDesignSchema } from "@/core/graphics/design";
import { videoDesignSchema } from "@/core/video/model";
import { getStorage } from "@/lib/storage";
import type { QaReport } from "@/core/qa/types";
import type { WorkspaceContext } from "@/lib/session";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { WorkspaceRow } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);
const users: string[] = [];

async function user(tag: string) {
  const email = `qa-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Quality-Test-2026", email_confirm: true, user_metadata: { full_name: `Test ${tag}` } });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, opts);
  await sb.auth.signInWithPassword({ email, password: "Quality-Test-2026" });
  return { id: data.user.id, email, sb };
}
async function ctxFor(u: { id: string; email: string; sb: SupabaseClient }, ws: string, role: WorkspaceContext["role"]): Promise<WorkspaceContext> {
  const { data } = await admin.from("workspaces").select("*").eq("id", ws).single();
  return { supabase: u.sb as unknown as ServerSupabase, userId: u.id, userEmail: u.email, userName: "Test", workspace: data as WorkspaceRow, role, memberships: [{ workspace: data as WorkspaceRow, role }] } as WorkspaceContext;
}
const codes = (r: QaReport, sev?: string) => r.checks.filter((c) => !sev || c.severity === sev).map((c) => c.code);

let owner: Awaited<ReturnType<typeof user>>;
let viewer: Awaited<ReturnType<typeof user>>;
let outsider: Awaited<ReturnType<typeof user>>;
let ws: string;
let otherWs: string;
let ctx: WorkspaceContext;
let prop: string;
const photoIds: string[] = [];
let textId: string;
let graphicId: string;
let videoId: string;

async function item(kind: "text" | "graphic" | "video", body: Record<string, unknown>, content_type: string) {
  const id = (await owner.sb.from("content_items").insert({ workspace_id: ws, property_id: prop, kind, content_type, title: `QA ${kind}`, platform: "Instagram", params: {}, created_by: owner.id, updated_by: owner.id, current_version: 0 }).select("id").single()).data!.id as string;
  await addVersion(ctx, id, body, "manual");
  return id;
}

beforeAll(async () => {
  owner = await user("owner");
  viewer = await user("viewer");
  outsider = await user("outsider");
  ws = (await owner.sb.rpc("create_workspace", { p_name: "Biuro Jakości" })).data as string;
  otherWs = (await outsider.sb.rpc("create_workspace", { p_name: "Obce biuro jakości" })).data as string;
  await admin.from("workspace_members").insert({ workspace_id: ws, user_id: viewer.id, role: "viewer", status: "active" });
  ctx = await ctxFor(owner, ws, "owner");
  prop = (await admin.from("properties").insert({ workspace_id: ws, created_by: owner.id, status: "active", title: "Mieszkanie z balkonem na Mokotowie", property_type: "apartment", transaction_type: "sale", price: 899_000, area_m2: 54.5, rooms: 3, city: "Warszawa", district: "Mokotów" }).select("id").single()).data!.id;

  // Real photos: one large, one tiny (upscaled on a 1080 graphic and in a 1080×1920 video).
  const storage = getStorage(admin as unknown as ServerSupabase);
  for (const [w, h] of [[2400, 1600], [480, 320]] as const) {
    const buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 140, b: 160 } } }).jpeg().toBuffer();
    const key = `${ws}/photos/${prop}/${randomUUID()}.jpg`;
    await storage.put(key, buf, "image/jpeg");
    photoIds.push((await admin.from("property_photos").insert({ workspace_id: ws, property_id: prop, storage_path: key, mime_type: "image/jpeg", size_bytes: buf.length, width: w, height: h, position: photoIds.length, created_by: owner.id }).select("id").single()).data!.id);
  }

  textId = await item("text", {
    request: { contentType: "property_sales_post", platform: "instagram", goal: "leads", audience: "brand", topic: "", propertyId: prop, tone: "brand", length: "medium", ctaType: "viewing", variants: 1, extraInstructions: "", marketData: "" },
    variants: [{ id: "v1", origin: "manual", createdAt: new Date().toISOString(), quality: null, variant: { angle: "", headline: "NOWA OFERTA!!! MIESZKANIE 70 m²", hook: "Nowa oferta na Mokotowie.", sections: [{ key: "hook", label: "Hook", content: "Nowa oferta na Mokotowie." }, { key: "body", label: "Treść", content: "Mieszkanie ma 70 m² i gwarantowany wzrost wartości. Trzy pokoje i balkon." }], cta: "Zapraszamy do kontaktu", hashtags: [], notes: "" } }],
    selected: "v1", gaps: [],
  }, "property_sales_post");

  const g = graphicDesignSchema.parse({ format: "square", template: "corporate", propertyId: prop, slides: defaultSlides("square", [photoIds[1]!]).slice(0, 1).map((s) => ({ ...s, texts: { title: "Trzy pokoje z balkonem", details: "54,5 m² · 3 pokoje", price: "1 200 000 zł" } })) });
  graphicId = await item("graphic", { ...g, colors: { primary: "#FF0000" } }, "graphic_square");

  const v = videoDesignSchema.parse({ propertyId: prop, style: "modern", length: 10, hook: "Trzy pokoje na Mokotowie", scenes: [{ photoId: photoIds[0], headline: "Jasny salon", subline: "" }, { photoId: photoIds[1], headline: "Balkon", subline: "" }], cta: "Umów prezentację", scriptApproved: true });
  videoId = await item("video", v, "reel");
  // A real MP4 of the wrong size and length (as if exported badly), stored like a render.
  const dir = mkdtempSync(path.join(tmpdir(), "qa-it-"));
  const mp4 = path.join(dir, "v.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=25:duration=4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-y", mp4]);
  const data = readFileSync(mp4);
  rmSync(dir, { recursive: true, force: true });
  const key = `${ws}/renders/${randomUUID()}.mp4`;
  await storage.put(key, data, "video/mp4");
  const { error } = await admin.from("rendered_files").insert({ workspace_id: ws, content_item_id: videoId, version: 1, kind: "video_mp4", storage_path: key, mime_type: "video/mp4", size_bytes: data.length, meta: {}, created_by: owner.id });
  if (error) throw error;
});

afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("QA on real materials", () => {
  it("text: facts, promises, headline, CTA and goal", async () => {
    const r = await runQa(ctx, textId);
    expect(r.kind).toBe("text");
    expect(codes(r, "problem")).toEqual(expect.arrayContaining(["property_facts", "investment_promises"]));
    expect(codes(r)).toEqual(expect.arrayContaining(["caps", "generic", "goal_contact"]));
    expect(r.checks[0]!.severity).toBe("problem");
  });

  it("graphic: rendered pixels and layout, wrong price, off-brand colour, upscaled photo", async () => {
    const r = await runQa(ctx, graphicId);
    expect(r.kind).toBe("graphic");
    expect(codes(r)).toEqual(expect.arrayContaining(["colors", "upscaled"]));
    expect(r.checks.some((c) => c.area === "Kontrast")).toBe(true);
    expect(r.checks.some((c) => c.area === "Typografia")).toBe(true);
  });

  it("video: ffprobe on the stored MP4 finds size, frame rate and length errors", async () => {
    const r = await runQa(ctx, videoId);
    expect(r.kind).toBe("video");
    expect(codes(r)).toEqual(expect.arrayContaining(["size", "fps", "duration", "upscaled"]));
    expect(r.checks.find((c) => c.code === "size")!.measured).toBe("720×1280");
    expect(codes(r, "ok")).toEqual(expect.arrayContaining(["timeline_ok", "safe_ok"]));
  });

  it("the report is stored for the version it checked", async () => {
    const { data } = await admin.from("content_items").select("qa, qa_version, current_version").eq("id", videoId).single();
    expect((data!.qa as unknown as QaReport).kind).toBe("video");
    expect(data!.qa_version).toBe(data!.current_version);
  });
});

describe("protection", () => {
  it("a client cannot write or fake a report", async () => {
    const { error } = await owner.sb.from("content_items").update({ qa: { version: "qa-1.0.0", checks: [] } }).eq("id", textId);
    expect(error?.message).toMatch(/serwer/);
  });

  it("other edits of the material still work", async () => {
    const { error } = await owner.sb.from("content_items").update({ title: "QA tekst po zmianie" }).eq("id", textId);
    expect(error).toBeNull();
  });

  it("a viewer may check quality (read-only), another office cannot", async () => {
    const vctx = await ctxFor(viewer, ws, "viewer");
    expect((await runQa(vctx, textId)).kind).toBe("text");
    const octx = await ctxFor(outsider, otherWs, "owner");
    await expect(runQa(octx, textId)).rejects.toMatchObject({ code: "not_found" });
  });
});
