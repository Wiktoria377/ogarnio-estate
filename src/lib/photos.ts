import "server-only";
import sharp from "sharp";
import type { PropertyPhotoRow } from "@/lib/supabase/database.types";
import { getStorage } from "@/lib/storage";
import type { WorkspaceContext } from "@/lib/session";

export type RankedPhoto = Pick<PropertyPhotoRow, "id" | "position" | "width" | "height" | "is_visualization" | "caption" | "storage_path"> & {
  score: number;
  sharpness: number;
  brightness: number;
  landscape: boolean;
};

/**
 * Technical quality of a photo for automatic selection: sharpness (variance of a
 * Laplacian on a small greyscale copy), exposure (mean brightness close to
 * mid-tones) and resolution. Real photos rank above visualizations, and the
 * office's own order (cover first) remains the strongest signal.
 */
async function measure(data: Buffer) {
  const img = sharp(data).rotate().resize(320, 320, { fit: "inside" }).greyscale();
  const [{ channels: [lum] }, edges] = await Promise.all([
    img.clone().stats(),
    img.clone().convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 }).stats(),
  ]);
  return { brightness: lum!.mean / 255, sharpness: Math.min(1, edges.channels[0]!.stdev / 40) };
}

export async function rankPropertyPhotos(ctx: WorkspaceContext, propertyId: string): Promise<RankedPhoto[]> {
  const { data } = await ctx.supabase
    .from("property_photos")
    .select("id, position, width, height, is_visualization, caption, storage_path")
    .eq("property_id", propertyId)
    .eq("workspace_id", ctx.workspace.id)
    .order("position");
  const photos = data ?? [];
  const storage = getStorage(ctx.supabase);
  const ranked = await Promise.all(
    photos.map(async (p) => {
      let m = { brightness: 0.5, sharpness: 0.5 };
      try {
        m = await measure(await storage.get(p.storage_path));
      } catch {
        /* unreadable file: neutral score, renderer will warn */
      }
      const exposure = 1 - Math.min(1, Math.abs(m.brightness - 0.55) * 2.2);
      const resolution = Math.min(1, (p.width * p.height) / (1600 * 1067));
      const orderBonus = Math.max(0, 1 - p.position / Math.max(6, photos.length)) * 0.6 + (p.position === 0 ? 0.5 : 0);
      const score = orderBonus + m.sharpness * 0.6 + exposure * 0.4 + resolution * 0.3 - (p.is_visualization ? 0.4 : 0);
      return { ...p, ...m, score, landscape: p.width >= p.height };
    }),
  );
  return ranked;
}

/** Picks n distinct photos: the cover (best of the first ones), then the rest by score. */
export function pickPhotos(ranked: RankedPhoto[], n: number): string[] {
  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  return sorted.slice(0, n).map((p) => p.id);
}
