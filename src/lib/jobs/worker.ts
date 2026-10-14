import "server-only";
import { hostname } from "node:os";
import { LlmError } from "@/core/ai/provider";
import { AppError } from "@/lib/errors";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { GenerationJobRow, Json, JobKind, WorkspaceRole, WorkspaceRow } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import { refundUsage } from "@/lib/billing/usage";
import { JobDeferred, JobFailure, type JobHandler } from "./types";

/**
 * Background job worker. Jobs are claimed atomically in the database
 * (claim_generation_job: FOR UPDATE SKIP LOCKED, per-workspace parallelism),
 * so several server processes can run workers safely side by side.
 */
const WORKER_ID = `${hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
const POLL_MS = 2000;
const EDITOR_ROLES: WorkspaceRole[] = ["owner", "admin", "agent", "marketing"];

async function loadHandler(kind: JobKind): Promise<JobHandler> {
  switch (kind) {
    case "campaign_brief":
      return (await import("./handlers/campaign")).runCampaignBrief;
    case "campaign_asset":
      return (await import("./handlers/campaign")).runCampaignAsset;
    case "video_render":
      return (await import("./handlers/video")).runVideoRender;
    case "import_fetch":
      return (await import("./handlers/import")).runImportFetch;
    case "import_photos":
      return (await import("./handlers/import")).runImportPhotos;
    case "brand_analysis":
      return (await import("@/lib/brand-intel/analyze")).runBrandAnalysis;
    case "autopilot_item":
      return (await import("@/lib/autopilot/generate")).runAutopilotItem;
    default:
      throw new JobFailure("Nieznany rodzaj zadania.", "bad_kind");
  }
}

/** Builds the author's workspace context; the author must still be an editor there. */
async function workerContext(job: GenerationJobRow): Promise<WorkspaceContext> {
  if (!job.created_by) throw new JobFailure("Autor zadania nie istnieje już w systemie.", "no_author");
  const admin = createAdminClient();
  const { data: m } = await admin
    .from("workspace_members")
    .select("role, workspaces(*)")
    .eq("workspace_id", job.workspace_id)
    .eq("user_id", job.created_by)
    .eq("status", "active")
    .maybeSingle();
  if (!m || !m.workspaces || !EDITOR_ROLES.includes(m.role)) throw new JobFailure("Autor zadania nie ma już uprawnień do edycji w tym biurze.", "forbidden");
  const { data: u } = await admin.auth.admin.getUserById(job.created_by);
  const email = u.user?.email ?? "";
  const meta = (u.user?.user_metadata ?? {}) as { full_name?: string };
  const workspace = m.workspaces as unknown as WorkspaceRow;
  return {
    supabase: admin as unknown as ServerSupabase,
    userId: job.created_by,
    userEmail: email,
    userName: meta.full_name?.trim() || email.split("@")[0] || "",
    workspace,
    role: m.role,
    memberships: [{ workspace, role: m.role }],
    actor: "worker",
  };
}

function classify(error: unknown): JobFailure {
  if (error instanceof JobFailure) return error;
  if (error instanceof LlmError) {
    const retryable = ["rate_limited", "overloaded", "network", "invalid_output"].includes(error.code);
    return new JobFailure(error.message, `ai_${error.code}`, retryable);
  }
  if (error instanceof AppError) return new JobFailure(error.message, error.code, error.status >= 500);
  console.error("job error", error);
  return new JobFailure("Nieoczekiwany błąd podczas generowania. Spróbuj ponownie.", "unknown", true);
}

async function execute(job: GenerationJobRow) {
  const admin = createAdminClient();
  const update = (patch: Partial<GenerationJobRow>) => admin.from("generation_jobs").update(patch).eq("id", job.id).eq("workspace_id", job.workspace_id);
  try {
    const ctx = await workerContext(job);
    const handler = await loadHandler(job.kind);
    const result = await handler({
      job,
      ctx,
      progress: async (value) => {
        await update({ progress: Math.max(0, Math.min(100, Math.round(value))), locked_at: new Date().toISOString() });
      },
    });
    await update({ status: "succeeded", progress: 100, result: result as Json, finished_at: new Date().toISOString(), locked_at: null, locked_by: null, error_message: null, error_code: null });
  } catch (error) {
    if (error instanceof JobDeferred) {
      // Waiting for another job (e.g. the brief): requeue without using up an attempt.
      await update({ status: "queued", attempts: Math.max(0, job.attempts - 1), run_after: new Date(Date.now() + error.delayMs).toISOString(), locked_at: null, locked_by: null, progress: 0 });
      return;
    }
    const f = classify(error);
    const again = f.retryable && job.attempts < job.max_attempts;
    if (!again) await refundForJob(job, f.message);
    const backoffSeconds = 15 * 2 ** (job.attempts - 1);
    await update(
      again
        ? { status: "queued", run_after: new Date(Date.now() + backoffSeconds * 1000).toISOString(), error_message: `${f.message} Ponowna próba za chwilę.`.slice(0, 500), error_code: f.code, locked_at: null, locked_by: null }
        : { status: "failed", error_message: f.message.slice(0, 500), error_code: f.code, finished_at: new Date().toISOString(), locked_at: null, locked_by: null },
    );
  }
}

/** A job that finally failed gives back what it reserved in the usage ledger. */
async function refundForJob(job: GenerationJobRow, reason: string) {
  try {
    if (job.kind === "video_render") {
      const { renderUsageKey } = await import("./handlers/video");
      await refundUsage(job.workspace_id, renderUsageKey(job), reason.slice(0, 200));
    }
  } catch (e) {
    console.error("[jobs] refund failed", job.id, e);
  }
}

async function claim(): Promise<GenerationJobRow | null> {
  const { data, error } = await createAdminClient().rpc("claim_generation_job", { p_worker: WORKER_ID, p_stale_seconds: 900 });
  if (error) {
    console.error("job claim failed", error.message);
    return null;
  }
  return data?.[0] ?? null;
}

type WorkerState = { running: number; timer: NodeJS.Timeout | null; draining: boolean };
const g = globalThis as typeof globalThis & { __oeWorker?: WorkerState };

function state(): WorkerState {
  g.__oeWorker ??= { running: 0, timer: null, draining: false };
  return g.__oeWorker;
}

/** Claims and starts jobs until the local concurrency limit is reached. */
async function pump() {
  const s = state();
  // Scheduled social publications share the loop (own claim + duplicate protection).
  void import("@/lib/publishing/executor").then((m) => m.publishTick()).catch((e) => console.error("[publish] tick failed", e));
  // Post statistics from official APIs (throttled to once a minute inside).
  void import("@/lib/social/metrics").then((m) => m.metricsTick()).catch((e) => console.error("[metrics] tick failed", e));
  void import("@/lib/retention").then((m) => m.retentionTick()).catch((e) => console.error("[retention] tick failed", e));
  if (s.draining) return;
  s.draining = true;
  try {
    const max = serverEnv().JOB_WORKER_CONCURRENCY;
    while (s.running < max) {
      const job = await claim();
      if (!job) break;
      s.running++;
      void execute(job).finally(() => {
        s.running--;
        void pump();
      });
    }
  } finally {
    s.draining = false;
  }
}

/** Starts the in-process poll loop (idempotent; survives dev hot reloads). */
export function startInlineWorker() {
  const s = state();
  if (s.timer) return;
  const env = serverEnv();
  if (env.JOB_WORKER !== "inline" || !env.SUPABASE_SERVICE_ROLE_KEY) {
    if (env.JOB_WORKER === "inline") console.warn("[jobs] SUPABASE_SERVICE_ROLE_KEY missing: background jobs will not run.");
    return;
  }
  s.timer = setInterval(() => void pump(), POLL_MS);
  s.timer.unref?.();
  console.info(`[jobs] inline worker started (${WORKER_ID})`);
}

/** Wakes the worker right after jobs were enqueued (no-op when not inline). */
export function kickWorker() {
  if (state().timer) void pump();
}

/** For /api/jobs/tick (cron/serverless): processes jobs until idle or the time budget ends. */
export async function drainFor(ms: number): Promise<number> {
  const end = Date.now() + ms;
  let done = await (await import("@/lib/publishing/executor")).publishTick(0);
  await (await import("@/lib/social/metrics")).metricsTick().catch((e) => console.error("[metrics] tick failed", e));
  await (await import("@/lib/retention")).retentionTick().catch((e) => console.error("[retention] tick failed", e));
  while (Date.now() < end) {
    const job = await claim();
    if (!job) break;
    await execute(job);
    done++;
  }
  return done;
}

export function workerAvailable(): boolean {
  const env = serverEnv();
  return !!env.SUPABASE_SERVICE_ROLE_KEY && (env.JOB_WORKER === "inline" || !!env.JOB_TICK_SECRET);
}
