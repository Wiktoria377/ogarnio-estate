import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PHOTO_ANALYSIS_VERSION, proposeCrop, type PhotoReport } from "@/core/creative/photos";
import { apiError, assertSameOrigin } from "@/lib/api";
import { analyzePhotoBuffer } from "@/lib/creative/photos";
import { AppError } from "@/lib/errors";
import { authorize } from "@/lib/session";
import { getStorage } from "@/lib/storage";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Smart crop proposal for one photo in one layout box: centred on the salient
 * area found by image analysis, at zoom 1 (nothing is generated or retouched).
 * The result is only data for the design; the original photo stays untouched
 * and the user can restore the original framing at any time.
 */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await authorize("editor");
    const p = z.object({ photoId: z.uuid(), w: z.number().min(10).max(4000), h: z.number().min(10).max(4000) }).safeParse(await req.json().catch(() => null));
    if (!p.success) throw new AppError("Nieprawidłowe dane.", "bad_request");
    const { data: photo } = await ctx.supabase.from("property_photos").select("id, storage_path, analysis").eq("id", p.data.photoId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!photo) throw new AppError("Nie znaleziono zdjęcia.", "not_found", 404);
    let report = photo.analysis as unknown as PhotoReport | null;
    if (report?.version !== PHOTO_ANALYSIS_VERSION) {
      report = await analyzePhotoBuffer(await getStorage(ctx.supabase).get(photo.storage_path));
      await ctx.supabase.from("property_photos").update({ analysis: report as unknown as Json, analyzed_at: new Date().toISOString() }).eq("id", photo.id);
    }
    const crop = proposeCrop(report, { w: p.data.w, h: p.data.h });
    return NextResponse.json({ ...crop, basedOn: report.focus ? "attention" : "center" });
  } catch (error) {
    return apiError(error);
  }
}
