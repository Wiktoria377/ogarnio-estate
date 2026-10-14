import "server-only";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { safeFetch } from "@/lib/net/safe-fetch";
import { getStorage } from "@/lib/storage";
import { MAX_UPLOAD_BYTES, processUpload } from "@/lib/storage/images";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { fetchSourceRecords, loadSource, stageRecords, SOURCE_LABELS } from "@/lib/import/service";
import { JobFailure, type JobRun } from "../types";

const MAX_PHOTOS = 40;

/** Feed/CRM download → preview batch. Nothing is written to offers here. */
export async function runImportFetch({ job, ctx, progress }: JobRun): Promise<Json> {
  const sourceId = String((job.payload as { sourceId?: string }).sourceId ?? "");
  const source = await loadSource(ctx, sourceId).catch(() => {
    throw new JobFailure("Źródło ofert zostało usunięte.", "not_found");
  });
  const admin = createAdminClient();
  try {
    await progress(5);
    const table = await fetchSourceRecords(source, progress);
    await progress(92);
    const when = new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" });
    const batchId = await stageRecords(ctx, source, { label: `${source.name} (${SOURCE_LABELS[source.kind]}), ${when}`, headers: table.headers, records: table.records });
    await admin.from("property_sources").update({ status: "active", last_error: null }).eq("id", source.id);
    return { batchId, records: table.records.length, path: table.path };
  } catch (e) {
    const message = e instanceof AppError ? e.message : "Nie udało się pobrać ofert ze źródła.";
    await admin.from("property_sources").update({ status: "error", last_error: message.slice(0, 1000) }).eq("id", source.id);
    if (e instanceof AppError) throw new JobFailure(e.message, e.code, e.status === 429 || e.status >= 502);
    throw e;
  }
}

/**
 * Photos referenced by imported offers: downloaded through the SSRF-safe fetch,
 * re-encoded (metadata stripped) like regular uploads, stored with source_url.
 * On a confirmed photo change, only photos that came from the source and are
 * no longer listed are removed; photos added by hand are never touched.
 */
export async function runImportPhotos({ job, ctx, progress }: JobRun): Promise<Json> {
  const work = ((job.payload as { work?: { propertyId: string; urls: string[]; replace: boolean }[] }).work ?? []).slice(0, 5000);
  const admin = createAdminClient();
  const storage = getStorage(ctx.supabase);
  const failures: { propertyId: string; url: string; error: string }[] = [];
  let added = 0;
  let removed = 0;
  for (const [i, w] of work.entries()) {
    const { data: prop } = await admin.from("properties").select("id").eq("id", w.propertyId).eq("workspace_id", job.workspace_id).maybeSingle();
    if (!prop) continue;
    const { data: photos } = await admin.from("property_photos").select("id, storage_path, source_url, position").eq("property_id", w.propertyId).order("position");
    const have = new Set((photos ?? []).map((p) => p.source_url).filter(Boolean));
    if (w.replace) {
      const gone = (photos ?? []).filter((p) => p.source_url && !w.urls.includes(p.source_url));
      if (gone.length) {
        await admin.from("property_photos").delete().in("id", gone.map((p) => p.id));
        await storage.remove(gone.map((p) => p.storage_path)).catch(() => {});
        removed += gone.length;
      }
    }
    let count = (photos ?? []).length - (w.replace ? (photos ?? []).filter((p) => p.source_url && !w.urls.includes(p.source_url)).length : 0);
    let position = Math.max(-1, ...(photos ?? []).map((p) => p.position)) + 1;
    for (const url of w.urls) {
      if (have.has(url)) continue;
      if (count >= MAX_PHOTOS) {
        failures.push({ propertyId: w.propertyId, url, error: `Limit ${MAX_PHOTOS} zdjęć na ofertę.` });
        continue;
      }
      try {
        const res = await safeFetch(url, { timeoutMs: 20_000, maxBytes: MAX_UPLOAD_BYTES, accept: ["image/"] });
        if (res.status !== 200) throw new AppError(`Serwer zdjęć zwrócił HTTP ${res.status}.`, "photo_http");
        const img = await processUpload(new File([new Uint8Array(res.body)], "photo"), "photo");
        const key = `${job.workspace_id}/photos/${w.propertyId}/${randomUUID()}.${img.ext}`;
        await storage.put(key, img.data, img.mime);
        const { error } = await admin.from("property_photos").insert({ workspace_id: job.workspace_id, property_id: w.propertyId, storage_path: key, mime_type: img.mime, size_bytes: img.data.length, width: img.width, height: img.height, position: position++, source_url: url, created_by: job.created_by });
        if (error) {
          await storage.remove([key]).catch(() => {});
          throw new AppError(/plan_limit:storage/.test(error.message) ? "Brak miejsca w planie na kolejne zdjęcia." : "Nie udało się zapisać zdjęcia.", "photo_db");
        }
        added++;
        count++;
      } catch (e) {
        failures.push({ propertyId: w.propertyId, url: url.slice(0, 300), error: e instanceof AppError ? e.message : "Nie udało się pobrać zdjęcia." });
      }
    }
    await progress(((i + 1) / work.length) * 100);
  }
  return { added, removed, failed: failures.length, failures: failures.slice(0, 200) };
}
