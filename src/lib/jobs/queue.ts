import "server-only";
import { AppError, dbError } from "@/lib/errors";
import type { GenerationJobRow, Json, JobKind } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import { kickWorker, workerAvailable } from "./worker";

export interface NewJob {
  kind: JobKind;
  label: string;
  campaignId?: string | null;
  contentItemId?: string | null;
  deliverable?: string | null;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
  instructionsVersion?: string | null;
  /** Earliest start (used to run asset jobs after the brief). */
  runAfter?: Date;
}

export const JOB_COLUMNS = "id, kind, deliverable, label, status, attempts, max_attempts, manual_retries, progress, error_message, error_code, result, campaign_id, content_item_id, created_at, started_at, finished_at, updated_at" as const;
export type JobView = Pick<GenerationJobRow, "id" | "kind" | "deliverable" | "label" | "status" | "attempts" | "max_attempts" | "manual_retries" | "progress" | "error_message" | "error_code" | "result" | "campaign_id" | "content_item_id" | "created_at" | "started_at" | "finished_at" | "updated_at">;

export function assertWorkerAvailable() {
  if (!workerAvailable()) {
    throw new AppError("Generowanie w tle nie jest skonfigurowane na serwerze (wymaga SUPABASE_SERVICE_ROLE_KEY i włączonego workera). Skontaktuj się z administratorem.", "worker_unavailable", 503);
  }
}

/** Inserts jobs as the signed-in user (RLS checks role and workspace), then wakes the worker. */
export async function enqueueJobs(ctx: WorkspaceContext, jobs: NewJob[]): Promise<JobView[]> {
  if (jobs.length === 0) return [];
  assertWorkerAvailable();
  const rows = jobs.map((j) => ({
    workspace_id: ctx.workspace.id,
    kind: j.kind,
    label: j.label.slice(0, 160),
    campaign_id: j.campaignId ?? null,
    content_item_id: j.contentItemId ?? null,
    deliverable: j.deliverable ?? null,
    payload: (j.payload ?? {}) as Json,
    dedupe_key: j.dedupeKey ?? null,
    instructions_version: j.instructionsVersion ?? null,
    run_after: (j.runAfter ?? new Date()).toISOString(),
    created_by: ctx.userId,
  }));
  const { data, error } = await ctx.supabase.from("generation_jobs").insert(rows).select(JOB_COLUMNS);
  if (error?.code === "23505") throw new AppError("To zadanie jest już w kolejce lub w trakcie.", "job_duplicate", 409);
  if (error || !data) throw dbError(error, "Nie udało się dodać zadania do kolejki.");
  kickWorker();
  return data;
}

export async function retryJob(ctx: WorkspaceContext, jobId: string) {
  const { error } = await ctx.supabase.rpc("retry_generation_job", { p_job: jobId });
  if (error) {
    if (error.message.includes("job_retry_limit")) throw new AppError("Wykorzystano limit ponowień tego zadania (5). Utwórz materiał od nowa.", "retry_limit", 409);
    if (error.message.includes("job_not_retryable")) throw new AppError("Można ponowić tylko zadanie zakończone błędem lub anulowane.", "not_retryable", 409);
    throw new AppError("Nie znaleziono zadania.", "not_found", 404);
  }
  kickWorker();
}

export async function cancelJob(ctx: WorkspaceContext, jobId: string) {
  const { error } = await ctx.supabase.rpc("cancel_generation_job", { p_job: jobId });
  if (error) {
    if (error.message.includes("job_not_cancelable")) throw new AppError("Można anulować tylko zadanie, które jeszcze się nie rozpoczęło.", "not_cancelable", 409);
    throw new AppError("Nie znaleziono zadania.", "not_found", 404);
  }
}

export async function getRenderQuota(ctx: WorkspaceContext): Promise<{ used: number; limit: number }> {
  const { data, error } = await ctx.supabase.rpc("render_quota_status", { p_ws: ctx.workspace.id });
  if (error) throw new AppError("Nie udało się sprawdzić limitu renderowania.", "quota_check", 500);
  return { used: data?.[0]?.used ?? 0, limit: data?.[0]?.monthly_limit ?? 0 };
}
