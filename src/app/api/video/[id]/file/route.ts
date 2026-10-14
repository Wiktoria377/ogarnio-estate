import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { logExport } from "@/lib/exports";
import { fileResponse } from "@/lib/http-file";
import { authorize } from "@/lib/session";
import { getStorage } from "@/lib/storage";
import { slugify } from "@/lib/utils";

/**
 * A rendered MP4 of this video (?render=<id>, default: the newest). Streams with
 * byte ranges for the player; ?download=1 → attachment, logged in export history.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authorize("member");
    const { id } = await params;
    const renderId = req.nextUrl.searchParams.get("render");
    const { data: item } = await ctx.supabase.from("content_items").select("id, title").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!item) throw new AppError("Nie znaleziono wideo.", "not_found", 404);
    let q = ctx.supabase.from("rendered_files").select("id, storage_path, version, size_bytes").eq("content_item_id", id).eq("workspace_id", ctx.workspace.id).eq("kind", "video_mp4");
    if (renderId) q = q.eq("id", renderId);
    const { data: rows } = await q.order("created_at", { ascending: false }).limit(1);
    const file = rows?.[0];
    if (!file) throw new AppError("To wideo nie zostało jeszcze wyrenderowane.", "not_found", 404);
    const data = await getStorage(ctx.supabase).get(file.storage_path);
    const download = req.nextUrl.searchParams.get("download") === "1";
    if (download) await logExport(ctx, { itemId: item.id, format: "mp4", version: file.version, size: file.size_bytes });
    const name = `${slugify(item.title) || "reels"}-v${file.version}.mp4`;
    return fileResponse(req, data, "video/mp4", { "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`, "Content-Security-Policy": "default-src 'none'; media-src 'self'" });
  } catch (error) {
    return apiError(error);
  }
}
