import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { videoDesignSchema } from "@/core/video/model";
import { apiError } from "@/lib/api";
import { loadCurrentBody } from "@/lib/content";
import { AppError } from "@/lib/errors";
import { authorize } from "@/lib/session";
import { getStorage } from "@/lib/storage";

/** Poster of the newest MP4; before the first render, the first scene's photo (9:16 crop). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authorize("member");
    const { id } = await params;
    const { item, body } = await loadCurrentBody<unknown>(ctx, id);
    if (item.kind !== "video") throw new AppError("To nie jest wideo.", "bad_kind");
    const storage = getStorage(ctx.supabase);
    const { data: r } = await ctx.supabase.from("rendered_files").select("meta").eq("content_item_id", id).eq("workspace_id", ctx.workspace.id).eq("kind", "video_mp4").order("created_at", { ascending: false }).limit(1);
    const poster = (r?.[0]?.meta as { poster?: string } | null)?.poster;
    let jpg: Buffer | null = poster ? await storage.get(poster).catch(() => null) : null;
    if (!jpg) {
      const d = videoDesignSchema.safeParse(body);
      if (!d.success) throw new AppError("Brak kadru.", "not_found", 404);
      const { data: photo } = await ctx.supabase.from("property_photos").select("storage_path").eq("id", d.data.scenes[0]!.photoId).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (!photo) throw new AppError("Brak kadru.", "not_found", 404);
      jpg = await sharp(await storage.get(photo.storage_path)).rotate().resize(540, 960, { fit: "cover", position: "attention" }).jpeg({ quality: 80 }).toBuffer();
    }
    return new NextResponse(new Uint8Array(jpg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return apiError(error);
  }
}
