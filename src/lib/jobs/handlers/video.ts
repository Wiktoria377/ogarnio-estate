import "server-only";
import { videoDesignSchema } from "@/core/video/model";
import { loadCurrentBody } from "@/lib/content";
import { AppError, dbError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import type { Json } from "@/lib/supabase/database.types";
import { renderKeys, renderReelFiles } from "@/lib/video";
import { consumeUsage } from "@/lib/billing/usage";
import type { GenerationJobRow } from "@/lib/supabase/database.types";
import { JobFailure, type JobRun } from "../types";
import { assertBudget } from "@/lib/admin/costs";

/** Ledger key of one render attempt series (a manual retry is a new render). */
export function renderUsageKey(job: Pick<GenerationJobRow, "id" | "manual_retries">) {
  return `render:job:${job.id}:${job.manual_retries}`;
}

/** Friendly message for render-process failures (the raw error goes to the server log). */
function renderFailure(raw: string): JobFailure {
  console.error("video render failed", raw.slice(0, 2000));
  if (/browser|chrome|headless/i.test(raw) && /(not found|ENOENT|could not|failed to launch|executable)/i.test(raw))
    return new JobFailure("Serwer renderujący nie ma przeglądarki do renderowania wideo (REMOTION_BROWSER_EXECUTABLE). Skontaktuj się z administratorem.", "render_browser", false);
  if (/ENOSPC|no space/i.test(raw)) return new JobFailure("Na serwerze renderującym zabrakło miejsca na dysku. Spróbuj ponownie później.", "render_disk", true);
  if (/SIGKILL|code null|timeout/i.test(raw)) return new JobFailure("Renderowanie trwało zbyt długo i zostało przerwane. Spróbuj ponownie.", "render_timeout", true);
  return new JobFailure("Nie udało się wyrenderować wideo. Spróbuj ponownie; jeśli błąd się powtórzy, zmień zdjęcia lub muzykę.", "render_failed", true);
}

/**
 * Renders the CURRENT version of a Reel (it must have an approved script) to
 * MP4 + poster, stores both and records them in rendered_files.
 */
export async function runVideoRender({ job, ctx, progress }: JobRun): Promise<Json> {
  if (!job.content_item_id) throw new JobFailure("Zadanie nie wskazuje wideo do wyrenderowania.", "bad_job");
  const { item, version, body } = await loadCurrentBody<unknown>(ctx, job.content_item_id);
  if (item.kind !== "video") throw new JobFailure("Ten materiał nie jest wideo.", "bad_kind");
  const parsed = videoDesignSchema.safeParse(body);
  if (!parsed.success) throw new JobFailure("Projekt wideo jest uszkodzony. Otwórz go w Video Studio i zapisz ponownie.", "bad_design");
  const design = parsed.data;
  if (!design.scriptApproved) throw new JobFailure("Scenariusz nie został zatwierdzony. Zatwierdź go w Video Studio przed renderowaniem.", "not_approved");
  // Platform-wide monthly safety budget for paid rendering (before charging the plan).
  try {
    await assertBudget("video_render");
  } catch (e) {
    throw new JobFailure(e instanceof Error ? e.message : String(e), "platform_budget", false);
  }
  // The plan's render limit is charged here, in the worker, so a job inserted
  // any other way cannot skip it. Same key on automatic retries = one charge.
  await consumeUsage(ctx, "video_render", { key: renderUsageKey(job), refType: "job", refId: job.id });
  await progress(5);

  let outcome;
  try {
    outcome = await renderReelFiles(ctx, design, (p) => progress(10 + p * 80));
  } catch (e) {
    if (e instanceof JobFailure) throw e;
    if (e instanceof AppError) throw e;
    throw renderFailure(e instanceof Error ? e.message : String(e));
  }
  await progress(92);

  const storage = getStorage(ctx.supabase);
  const keys = renderKeys(ctx.workspace.id, item.id);
  await storage.put(keys.mp4, outcome.mp4, "video/mp4");
  try {
    await storage.put(keys.poster, outcome.poster, "image/jpeg");
    const { data, error } = await ctx.supabase
      .from("rendered_files")
      .insert({
        workspace_id: ctx.workspace.id,
        content_item_id: item.id,
        version: version.version,
        kind: "video_mp4",
        storage_path: keys.mp4,
        mime_type: "video/mp4",
        size_bytes: outcome.mp4.length,
        meta: { poster: keys.poster, durationMs: outcome.durationMs, style: design.style, length: design.length, width: 1080, height: 1920, fps: 30 } as Json,
        job_id: job.id,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error || !data) throw dbError(error, "Nie udało się zapisać wyrenderowanego wideo.");
    return { renderedFileId: data.id, version: version.version, sizeBytes: outcome.mp4.length, durationMs: outcome.durationMs };
  } catch (e) {
    await storage.remove([keys.mp4, keys.poster]).catch(() => {});
    throw e;
  }
}
