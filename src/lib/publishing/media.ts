import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { graphicDesignSchema } from "@/core/graphics/design";
import { renderSlideRaster } from "@/core/graphics/render";
import { loadBrandKit } from "@/lib/ai";
import { loadRenderInput } from "@/lib/graphics";
import { loadCurrentBody } from "@/lib/content";
import { signPayload, verifyPayload } from "@/lib/crypto";
import { AppError, dbError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicationMedia, PublicationMediaSpec, PublicationRow } from "@/lib/supabase/database.types";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { WorkspaceContext } from "@/lib/session";
import type { MediaFacts } from "@/core/publishing/platforms";
import { publicMediaBase } from "@/lib/social/config";
import type { MediaFile } from "@/lib/social/types";

/**
 * Freezes the media of a publication at approval time: graphics are rendered
 * from the approved version, photos converted to JPEG (Instagram accepts JPEG
 * only), videos reference the rendered MP4. What was approved is exactly what
 * gets published.
 */
const MEDIA_TTL_SECONDS = 72 * 3600;

async function jpeg(input: Buffer) {
  const img = sharp(input, { limitInputPixels: 60_000_000 }).rotate().flatten({ background: "#ffffff" });
  const meta = await img.metadata();
  const data = await img.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return { data, width: meta.autoOrient?.width ?? meta.width ?? null, height: meta.autoOrient?.height ?? meta.height ?? null };
}

export async function prepareMedia(ctx: WorkspaceContext, pub: PublicationRow, spec: PublicationMediaSpec[]): Promise<PublicationMedia[]> {
  const storage = getStorage(ctx.supabase);
  const admin = createAdminClient();
  const out: PublicationMedia[] = [];
  const graphics = new Map<string, Awaited<ReturnType<typeof loadRenderInput>>>();
  for (const s of spec) {
    if (s.source === "graphic") {
      let input = graphics.get(s.ref);
      if (!input) {
        const { item, body } = await loadCurrentBody<unknown>(ctx, s.ref);
        if (item.kind !== "graphic") throw new AppError("Wybrany materiał nie jest grafiką.", "bad_media");
        input = await loadRenderInput(ctx, graphicDesignSchema.parse(body), await loadBrandKit(ctx));
        graphics.set(s.ref, input);
      }
      const { data } = await renderSlideRaster(input, s.slide ?? 0, "jpg");
      const meta = await sharp(data).metadata();
      const key = `${ctx.workspace.id}/publish/${pub.id}/${randomUUID()}.jpg`;
      await storage.put(key, data, "image/jpeg");
      out.push({ storage_path: key, mime: "image/jpeg", width: meta.width ?? null, height: meta.height ?? null, size_bytes: data.length });
    } else if (s.source === "photo") {
      const { data: ph } = await ctx.supabase.from("property_photos").select("storage_path").eq("id", s.ref).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (!ph) throw new AppError("Nie znaleziono zdjęcia oferty.", "bad_media", 404);
      const j = await jpeg(await storage.get(ph.storage_path));
      const key = `${ctx.workspace.id}/publish/${pub.id}/${randomUUID()}.jpg`;
      await storage.put(key, j.data, "image/jpeg");
      out.push({ storage_path: key, mime: "image/jpeg", width: j.width, height: j.height, size_bytes: j.data.length });
    } else {
      const { data: file } = await ctx.supabase
        .from("rendered_files")
        .select("storage_path, size_bytes, meta, version")
        .eq("content_item_id", s.ref)
        .eq("workspace_id", ctx.workspace.id)
        .eq("kind", "video_mp4")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!file) throw new AppError("Film nie został jeszcze wyrenderowany. Wyrenderuj MP4 w Video Studio.", "bad_media", 409);
      const m = (file.meta ?? {}) as { width?: number; height?: number; durationMs?: number };
      out.push({ storage_path: file.storage_path, mime: "video/mp4", width: m.width ?? null, height: m.height ?? null, size_bytes: file.size_bytes, duration_ms: m.durationMs ?? null });
      continue;
    }
    const last = out.at(-1)!;
    const { error } = await admin.from("publication_files").insert({ workspace_id: ctx.workspace.id, publication_id: pub.id, storage_path: last.storage_path, mime_type: last.mime, size_bytes: last.size_bytes });
    if (error) {
      await storage.remove([last.storage_path]).catch(() => undefined);
      throw dbError(error, "Brak miejsca w planie na przygotowanie plików publikacji.");
    }
  }
  return out;
}

/** Facts for validation BEFORE rendering (from the selection). */
export async function mediaFacts(ctx: WorkspaceContext, spec: PublicationMediaSpec[]): Promise<MediaFacts[]> {
  const facts: MediaFacts[] = [];
  const formats = new Map<string, { w: number; h: number }>();
  for (const s of spec) {
    if (s.source === "graphic") {
      let f = formats.get(s.ref);
      if (!f) {
        const { body } = await loadCurrentBody<unknown>(ctx, s.ref);
        const d = graphicDesignSchema.parse(body);
        const { FORMATS } = await import("@/core/graphics/design");
        f = { w: FORMATS[d.format].w, h: FORMATS[d.format].h };
        formats.set(s.ref, f);
      }
      facts.push({ kind: "image", width: f.w, height: f.h });
    } else if (s.source === "photo") {
      const { data } = await ctx.supabase.from("property_photos").select("width, height").eq("id", s.ref).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (!data) throw new AppError("Nie znaleziono zdjęcia oferty.", "bad_media", 404);
      facts.push({ kind: "image", width: data.width, height: data.height });
    } else {
      const { data } = await ctx.supabase.from("rendered_files").select("meta").eq("content_item_id", s.ref).eq("workspace_id", ctx.workspace.id).eq("kind", "video_mp4").order("version", { ascending: false }).limit(1).maybeSingle();
      if (!data) throw new AppError("Film nie został jeszcze wyrenderowany. Wyrenderuj MP4 w Video Studio.", "bad_media", 409);
      const m = (data.meta ?? {}) as { width?: number; height?: number; durationMs?: number };
      facts.push({ kind: "video", width: m.width ?? null, height: m.height ?? null, durationMs: m.durationMs ?? null });
    }
  }
  return facts;
}

/** Signed, expiring public URLs for platforms that download media (Meta). */
export function mediaFiles(pub: PublicationRow, admin: ServerSupabase): MediaFile[] {
  const media = (pub.media ?? []) as unknown as PublicationMedia[];
  const storage = getStorage(admin);
  return media.map((m, i) => {
    const token = signPayload({ k: m.storage_path, w: pub.workspace_id, p: pub.id }, MEDIA_TTL_SECONDS);
    const ext = m.mime === "video/mp4" ? "mp4" : "jpg";
    return { ...m, url: `${publicMediaBase()}/api/public-media/${token}/${i + 1}.${ext}`, read: () => storage.get(m.storage_path) };
  });
}

export function readMediaToken(token: string): { k: string; w: string; p: string } | null {
  const data = verifyPayload<{ k: string; w: string; p: string }>(token);
  if (!data || typeof data.k !== "string" || typeof data.w !== "string" || typeof data.p !== "string") return null;
  return data;
}
