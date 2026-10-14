import { analyzePhotoBuffer } from "@/lib/creative/photos";
import type { PhotoReport } from "@/core/creative/photos";
import type { Json } from "@/lib/supabase/database.types";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/session";
import { canEditProperty } from "@/core/auth/permissions";
import { getStorage } from "@/lib/storage";
import { MAX_UPLOAD_BYTES, processUpload } from "@/lib/storage/images";
import { apiError, assertSameOrigin } from "@/lib/api";
import { readFormDataLimited } from "@/lib/http-body";
import { AppError, dbError } from "@/lib/errors";

const MAX_PHOTOS_PER_PROPERTY = 40;
const MAX_REFERENCES = 12;

const meta = z.object({
  purpose: z.enum(["logo", "reference", "photo"]),
  propertyId: z.uuid().optional(),
});

/**
 * Upload pipeline: size check → magic-byte sniffing → re-encode with metadata
 * stripped → tenant-scoped key → DB row. A failed DB insert removes the file.
 */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) throw new AppError("Plik jest za duży (maks. 10 MB).", "too_large", 413);
    // Authenticate before reading the body; the body is read with a streamed byte cap.
    await authorize("member");
    const form = await readFormDataLimited(req, MAX_UPLOAD_BYTES + 64 * 1024, "Plik jest za duży (maks. 10 MB).");
    const parsed = meta.safeParse({ purpose: form.get("purpose"), propertyId: form.get("propertyId") || undefined });
    if (!parsed.success) throw new AppError("Nieprawidłowe dane przesyłania.", "bad_request");
    const { purpose, propertyId } = parsed.data;
    const ctx = await authorize(purpose === "photo" ? "editor" : "admin");
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Nie wybrano pliku.", "no_file");
    // Media rights: each member confirms once per office that it may use the photos it uploads.
    const { data: me } = await ctx.supabase.from("workspace_members").select("media_rights_ack_at").eq("workspace_id", ctx.workspace.id).eq("user_id", ctx.userId).maybeSingle();
    if (!me?.media_rights_ack_at) {
      if (form.get("rights") !== "yes") throw new AppError("Potwierdź prawa do przesyłanych zdjęć.", "rights_required", 409);
      await ctx.supabase.rpc("acknowledge_media_rights", { p_ws: ctx.workspace.id });
    }
    const ws = ctx.workspace.id;
    const storage = getStorage(ctx.supabase);

    if (purpose === "photo") {
      if (!propertyId) throw new AppError("Brak nieruchomości.", "bad_request");
      const { data: prop } = await ctx.supabase.from("properties").select("id, agent_id, created_by").eq("id", propertyId).eq("workspace_id", ws).maybeSingle();
      if (!prop) throw new AppError("Nie znaleziono nieruchomości.", "not_found", 404);
      if (!canEditProperty(ctx.role, ctx.userId, prop)) throw new AppError("Zdjęcia tej oferty dodaje agent prowadzący, właściciel lub administrator.", "forbidden", 403);
      const { data: existing } = await ctx.supabase.from("property_photos").select("position").eq("property_id", propertyId).order("position", { ascending: false });
      if ((existing?.length ?? 0) >= MAX_PHOTOS_PER_PROPERTY) throw new AppError(`Limit ${MAX_PHOTOS_PER_PROPERTY} zdjęć na ofertę.`, "limit", 409);
      const img = await processUpload(file, "photo");
      const key = `${ws}/photos/${propertyId}/${randomUUID()}.${img.ext}`;
      await storage.put(key, img.data, img.mime);
      const { data, error } = await ctx.supabase
        .from("property_photos")
        .insert({ workspace_id: ws, property_id: propertyId, storage_path: key, mime_type: img.mime, size_bytes: img.data.length, width: img.width, height: img.height, position: (existing?.[0]?.position ?? -1) + 1, created_by: ctx.userId })
        .select("id, storage_path, width, height, position, is_visualization, caption")
        .single();
      if (error || !data) {
        await storage.remove([key]).catch(() => {});
        throw dbError(error, "Nie udało się zapisać zdjęcia.");
      }
      // Technical analysis right away (never blocks the upload; the photo itself is not changed).
      let analysis: PhotoReport | null = null;
      try {
        analysis = await analyzePhotoBuffer(img.data);
        await ctx.supabase.from("property_photos").update({ analysis: analysis as unknown as Json, analyzed_at: new Date().toISOString() }).eq("id", data.id);
      } catch {
        analysis = null;
      }
      return NextResponse.json({ photo: { ...data, analysis, url: `/api/files/${data.storage_path}` } });
    }

    if (purpose === "reference") {
      const { count } = await ctx.supabase.from("brand_assets").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("kind", "reference");
      if ((count ?? 0) >= MAX_REFERENCES) throw new AppError(`Możesz dodać maks. ${MAX_REFERENCES} grafik referencyjnych.`, "limit", 409);
    }
    const img = await processUpload(file, purpose);
    const key = `${ws}/brand/${randomUUID()}.${img.ext}`;
    await storage.put(key, img.data, img.mime);
    const label = typeof form.get("label") === "string" ? String(form.get("label")).slice(0, 120) || null : null;
    const { data, error } = await ctx.supabase
      .from("brand_assets")
      .insert({ workspace_id: ws, kind: purpose, storage_path: key, mime_type: img.mime, size_bytes: img.data.length, width: img.width, height: img.height, label, created_by: ctx.userId })
      .select("id, storage_path, kind, label, width, height")
      .single();
    if (error || !data) {
      await storage.remove([key]).catch(() => {});
      throw dbError(error, "Nie udało się zapisać pliku.");
    }
    if (purpose === "logo") {
      // The previous logo is kept as a variant: older profile versions still refer to it.
      const { error: upErr } = await ctx.supabase.from("brand_profiles").update({ logo_asset_id: data.id, updated_by: ctx.userId }).eq("workspace_id", ws);
      if (upErr) throw dbError(upErr);
      await ctx.supabase.rpc("record_brand_version", { p_ws: ws, p_source: "manual", p_note: "Nowe logo" });
    }
    return NextResponse.json({ asset: { ...data, url: `/api/files/${data.storage_path}` } });
  } catch (error) {
    return apiError(error);
  }
}
