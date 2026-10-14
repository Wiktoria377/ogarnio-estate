import type { GenerationJobRow, Json } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";

export interface JobRun {
  job: GenerationJobRow;
  ctx: WorkspaceContext;
  /** Reports 0–100 progress (shown in the UI). */
  progress(value: number): Promise<void>;
}

export type JobHandler = (run: JobRun) => Promise<Json>;

/**
 * Failure with a user-facing Polish message. `retryable` failures are retried
 * automatically with backoff (up to max_attempts); others fail immediately.
 */
export class JobFailure extends Error {
  constructor(
    message: string,
    public readonly code: string = "job_failed",
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "JobFailure";
  }
}

export const JOB_STATUS_LABELS = {
  queued: "W kolejce",
  running: "W trakcie",
  succeeded: "Gotowe",
  failed: "Błąd",
  canceled: "Anulowane",
} as const;

/** Thrown when a job must wait for another one; it is requeued without consuming an attempt. */
export class JobDeferred extends Error {
  constructor(public readonly delayMs = 3000) {
    super("deferred");
    this.name = "JobDeferred";
  }
}
