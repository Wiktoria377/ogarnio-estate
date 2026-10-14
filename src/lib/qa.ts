import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { graphicDesignSchema, slotsFor, type GraphicDesign } from "@/core/graphics/design";
import { svgToPng } from "@/core/graphics/render";
import { renderSlideSvg } from "@/core/graphics/templates";
import { factCheckTexts, ruleContext } from "@/core/marketing-engine/pipeline";
import { runRuleChecks } from "@/core/marketing-engine/quality/rules";
import type { TextBody } from "@/core/marketing-engine/request";
import { graphicQa, type SlideQaInput } from "@/core/qa/graphic";
import { textQa } from "@/core/qa/text";
import { buildReport, type QaCheck, type QaReport } from "@/core/qa/types";
import { videoQa, type ProbeResult } from "@/core/qa/video";
import { videoDesignSchema } from "@/core/video/model";
import { loadBrandKit } from "@/lib/ai";
import { buildTaskInput, loadCurrentBody } from "@/lib/content";
import { AppError } from "@/lib/errors";
import { loadRenderInput } from "@/lib/graphics";
import { logError } from "@/lib/observability";
import type { WorkspaceContext } from "@/lib/session";
import { getStorage } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { propertyFactSheet } from "@/verticals/real-estate/property";

const run = promisify(execFile);
const SHORT = new Set(["post", "ad", "carousel", "short_copy", "video_script"]);
/** Raster width used for pixel measurements (half of 1080: enough for contrast). */
const QA_RASTER_WIDTH = 540;

/** Top-level MP4 atoms: is `moov` before `mdat`? */
export function mp4Faststart(buf: Buffer): boolean | null {
  let off = 0;
  let moov = -1;
  let mdat = -1;
  while (off + 8 <= buf.length) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (size === 1 && off + 16 <= buf.length) size = Number(buf.readBigUInt64BE(off + 8));
    if (type === "moov" && moov < 0) moov = off;
    if (type === "mdat" && mdat < 0) mdat = off;
    if (size < 8) break;
    off += size;
  }
  return moov < 0 || mdat < 0 ? null : moov < mdat;
}

export async function probeMp4(buf: Buffer): Promise<ProbeResult> {
  const dir = await mkdtemp(path.join(tmpdir(), "qa-"));
  try {
    const file = path.join(dir, "video.mp4");
    await writeFile(file, buf);
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { timeout: 20_000, maxBuffer: 2_000_000 });
    const j = JSON.parse(stdout) as { streams?: { codec_type: string; codec_name?: string; pix_fmt?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }[]; format?: { duration?: string } };
    const v = j.streams?.find((s) => s.codec_type === "video");
    const a = j.streams?.find((s) => s.codec_type === "audio");
    const rate = (v?.avg_frame_rate && v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : v?.r_frame_rate) ?? "0/1";
    const [n, d] = rate.split("/").map(Number);
    return {
      codec: v?.codec_name ?? null, pixFmt: v?.pix_fmt ?? null, width: v?.width ?? 0, height: v?.height ?? 0,
      fps: d ? n! / d : 0, durationSec: Number(j.format?.duration ?? 0), audioCodec: a?.codec_name ?? null,
      faststart: mp4Faststart(buf), sizeBytes: buf.length,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function textChecks(ctx: WorkspaceContext, body: TextBody): Promise<QaCheck[]> {
  const brand = await loadBrandKit(ctx);
  const input = await buildTaskInput(ctx, body.request, brand);
  const sel = body.variants.find((v) => v.id === body.selected) ?? body.variants[0];
  if (!sel) throw new AppError("Materiał nie ma treści do sprawdzenia.", "empty", 422);
  const findings = runRuleChecks(sel.variant, ruleContext(input, brand));
  const location = input.facts?.facts.find((f) => f.key === "location")?.value ?? "";
  return textQa({
    variant: sel.variant, goal: body.request.goal, ctaType: body.request.ctaType, ruleFindings: findings,
    factWords: location.split(/[,·]/).map((s) => s.trim()).filter((s) => s.length >= 3), shortForm: SHORT.has(input.def.outputKind),
  });
}

async function graphicChecks(ctx: WorkspaceContext, design: GraphicDesign): Promise<QaCheck[]> {
  const brand = await loadBrandKit(ctx);
  const input = await loadRenderInput(ctx, design, brand);
  const slides: SlideQaInput[] = [];
  for (let i = 0; i < design.slides.length; i++) {
    const r = await renderSlideSvg(input, i);
    const raw = await sharp(svgToPng(r.svg, QA_RASTER_WIDTH)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    slides.push({ index: i, layout: r.layout, warnings: r.warnings, raster: { width: raw.info.width, height: raw.info.height, data: raw.data }, width: r.width, height: r.height, photoIds: design.slides[i]!.photoIds });
  }
  const ids = [...new Set(design.slides.flatMap((s) => s.photoIds))];
  const { data: ph } = ids.length ? await ctx.supabase.from("property_photos").select("id, width, height").eq("workspace_id", ctx.workspace.id).in("id", ids) : { data: [] };
  let property = null;
  if (design.propertyId) property = (await ctx.supabase.from("properties").select("*").eq("id", design.propertyId).eq("workspace_id", ctx.workspace.id).maybeSingle()).data;
  // Only the creative (AI/user) slots and the caption: fact slots come from the record.
  const texts = design.slides.flatMap((s, i) => slotsFor(s.kind).filter((x) => x.source === "ai").map((x) => ({ key: `s${i}_${x.key}`, content: s.texts[x.key] ?? "" }))).filter((t) => t.content.trim());
  if (design.caption?.trim()) texts.push({ key: "caption", content: design.caption });
  const factWarnings = texts.length ? factCheckTexts(texts, { facts: property ? propertyFactSheet(property) : null, brand, platform: "instagram", goal: "sales", userTexts: [] }) : [];
  return graphicQa({ design, brand, slides, photos: new Map((ph ?? []).map((p) => [p.id, { width: p.width, height: p.height }])), factWarnings });
}

async function videoChecks(ctx: WorkspaceContext, itemId: string, raw: unknown, currentVersion: number): Promise<QaCheck[]> {
  const design = videoDesignSchema.parse(raw);
  const ids = [...new Set(design.scenes.map((s) => s.photoId))];
  const { data: ph } = await ctx.supabase.from("property_photos").select("id, width, height").eq("workspace_id", ctx.workspace.id).in("id", ids);
  let musicDurationMs: number | null = null;
  if (design.musicAssetId) musicDurationMs = (await ctx.supabase.from("media_assets").select("duration_ms").eq("id", design.musicAssetId).eq("workspace_id", ctx.workspace.id).maybeSingle()).data?.duration_ms ?? null;
  const { data: file } = await ctx.supabase.from("rendered_files").select("storage_path, version").eq("content_item_id", itemId).eq("workspace_id", ctx.workspace.id).eq("kind", "video_mp4").order("version", { ascending: false }).limit(1).maybeSingle();
  let probe: ProbeResult | null = null;
  if (file) {
    try {
      probe = await probeMp4(await getStorage(ctx.supabase).get(file.storage_path));
    } catch (error) {
      logError("qa-probe", error, { workspaceId: ctx.workspace.id });
    }
  }
  return videoQa({ design, photos: new Map((ph ?? []).map((p) => [p.id, { width: p.width, height: p.height }])), musicDurationMs, probe, renderedVersion: file?.version ?? null, currentVersion });
}

/**
 * Runs QA on the current version of one material of this office and stores the
 * report (server-side write; the database refuses client writes to it).
 */
export async function runQa(ctx: WorkspaceContext, itemId: string): Promise<QaReport> {
  const { item, body } = await loadCurrentBody<unknown>(ctx, itemId);
  let checks: QaCheck[];
  if (item.kind === "text") checks = await textChecks(ctx, body as TextBody);
  else if (item.kind === "graphic") checks = await graphicChecks(ctx, graphicDesignSchema.parse(body));
  else if (item.kind === "video") checks = await videoChecks(ctx, item.id, body, item.current_version);
  else throw new AppError("Kontrola jakości obejmuje teksty, grafiki i filmy.", "bad_kind", 422);
  const report = buildReport(item.kind, checks);
  const { error } = await createAdminClient().from("content_items").update({ qa: report as unknown as Json, qa_version: item.current_version, qa_at: report.checkedAt }).eq("id", item.id).eq("workspace_id", ctx.workspace.id);
  if (error) logError("qa-save", error, { workspaceId: ctx.workspace.id });
  return report;
}
