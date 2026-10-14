import "server-only";
import sharp from "sharp";
import { assessPhoto, PHOTO_ANALYSIS_VERSION, type PhotoMeasurements, type PhotoReport } from "@/core/creative/photos";
import { getStorage } from "@/lib/storage";
import { logError } from "@/lib/observability";
import type { Json } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/** Pixels → measurements. Works on a small copy; the stored photo is never changed. */
export async function measurePhoto(data: Buffer): Promise<PhotoMeasurements> {
  const base = sharp(data).rotate();
  const meta = await base.metadata();
  const oriented = (meta.orientation ?? 1) >= 5;
  const width = (oriented ? meta.height : meta.width) ?? 0;
  const height = (oriented ? meta.width : meta.height) ?? 0;
  const small = base.clone().resize(320, 320, { fit: "inside" });
  const grey = small.clone().greyscale();
  const [lum, edges, tiny, att] = await Promise.all([
    grey.clone().stats(),
    grey.clone().convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 }).stats(),
    small.clone().resize(24, 24, { fit: "fill" }).removeAlpha().raw().toBuffer(),
    small.clone().resize(64, 64, { fit: "cover", position: "attention" }).toBuffer({ resolveWithObject: true }),
  ]);
  // Dominant colours: coarse 4-level buckets per channel on a 24×24 copy.
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < tiny.length; i += 3) {
    const [r, g, b] = [tiny[i]!, tiny[i + 1]!, tiny[i + 2]!];
    const k = `${r >> 6}${g >> 6}${b >> 6}`;
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(k, e);
  }
  const colors = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 4).map((e) => hex(e.r / e.n, e.g / e.n, e.b / e.n));
  // Salient point: sharp's attention strategy reports it in the resized (cover) image.
  const info = att.info as { width: number; height: number; attentionX?: number; attentionY?: number; cropOffsetLeft?: number; cropOffsetTop?: number };
  const sm = await small.clone().toBuffer({ resolveWithObject: true });
  const scale = 64 / Math.min(sm.info.width, sm.info.height);
  const sw = sm.info.width * scale;
  const sh = sm.info.height * scale;
  const focus = info.attentionX !== undefined && info.attentionY !== undefined
    ? { x: Math.min(1, Math.max(0, info.attentionX / sw)), y: Math.min(1, Math.max(0, info.attentionY / sh)) }
    : null;
  return {
    width, height,
    brightness: lum.channels[0]!.mean / 255,
    contrast: Math.min(1, lum.channels[0]!.stdev / 128),
    sharpness: Math.min(1, edges.channels[0]!.stdev / 40),
    colors,
    focus: focus ? { x: Math.round(focus.x * 1000) / 1000, y: Math.round(focus.y * 1000) / 1000 } : null,
  };
}

export async function analyzePhotoBuffer(data: Buffer): Promise<PhotoReport> {
  return assessPhoto(await measurePhoto(data));
}

/** Analyses the photos of one property (only those without a current analysis unless `all`). */
export async function analyzePropertyPhotos(ctx: WorkspaceContext, propertyId: string, all = false): Promise<{ analyzed: number; failed: number }> {
  const { data } = await ctx.supabase.from("property_photos").select("id, storage_path, analysis").eq("workspace_id", ctx.workspace.id).eq("property_id", propertyId).order("position").limit(40);
  const storage = getStorage(ctx.supabase);
  let analyzed = 0;
  let failed = 0;
  for (const p of data ?? []) {
    const current = (p.analysis as { version?: string } | null)?.version === PHOTO_ANALYSIS_VERSION;
    if (current && !all) continue;
    try {
      const report = await analyzePhotoBuffer(await storage.get(p.storage_path));
      const { error } = await ctx.supabase.from("property_photos").update({ analysis: report as unknown as Json, analyzed_at: new Date().toISOString() }).eq("id", p.id).eq("workspace_id", ctx.workspace.id);
      if (error) throw error;
      analyzed++;
    } catch (error) {
      failed++;
      logError("photo-analysis", error, { workspaceId: ctx.workspace.id });
    }
  }
  return { analyzed, failed };
}

/** Stored reports for a set of photos (only this workspace's). */
export async function photoReports(ctx: WorkspaceContext, ids: string[]): Promise<Map<string, PhotoReport>> {
  if (!ids.length) return new Map();
  const { data } = await ctx.supabase.from("property_photos").select("id, analysis").eq("workspace_id", ctx.workspace.id).in("id", ids);
  return new Map((data ?? []).filter((p) => (p.analysis as { version?: string } | null)?.version === PHOTO_ANALYSIS_VERSION).map((p) => [p.id, p.analysis as unknown as PhotoReport]));
}
