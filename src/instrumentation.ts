/** Starts the in-process background job worker on the Node.js server runtime. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await import("@/lib/observability");
  if ((process.env.JOB_WORKER ?? "inline") !== "inline") return;
  // Build-time page data collection must not start a worker.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startInlineWorker } = await import("@/lib/jobs/worker");
  startInlineWorker();
}
