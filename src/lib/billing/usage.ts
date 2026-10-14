import "server-only";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { accessMessage, usageError } from "@/lib/billing/messages";
export { accessMessage, usageError };
import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkspaceContext } from "@/lib/session";

export type UsageMetric = "text_generation" | "graphic_export" | "video_render" | "publication" | "ai_insight";

export interface UsageSummary {
  planId: string;
  planName: string;
  status: string;
  access: "full" | "read_only";
  accessReason: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  text: { used: number; limit: number };
  exports: { used: number; limit: number };
  renders: { used: number; limit: number };
  users: { used: number; limit: number };
  properties: { used: number; limit: number };
  social: { used: number; limit: number };
  storage: { usedMb: number; limitMb: number };
  maxParallelJobs: number;
}

export async function getUsageSummary(ctx: WorkspaceContext): Promise<UsageSummary> {
  const { data, error } = await ctx.supabase.rpc("usage_summary", { p_ws: ctx.workspace.id });
  const r = data?.[0];
  if (error || !r) throw new AppError("Nie udało się odczytać planu i limitów.", "usage_summary", 500);
  return {
    planId: r.plan_id,
    planName: r.plan_name,
    status: r.status,
    access: r.access === "full" ? "full" : "read_only",
    accessReason: r.access_reason,
    trialEndsAt: r.trial_ends_at,
    currentPeriodEnd: r.current_period_end,
    cancelAtPeriodEnd: r.cancel_at_period_end,
    text: { used: r.text_used, limit: r.text_limit },
    exports: { used: r.exports_used, limit: r.exports_limit },
    renders: { used: r.renders_used, limit: r.renders_limit },
    users: { used: r.users_used, limit: r.users_limit },
    properties: { used: r.properties_used, limit: r.properties_limit },
    social: { used: r.social_used, limit: r.social_limit },
    storage: { usedMb: Number(r.storage_used_mb), limitMb: r.storage_limit_mb },
    maxParallelJobs: r.max_parallel_jobs,
  };
}

/**
 * Reserves usage in the ledger before a paid operation (atomic, idempotent per
 * key). Throws a user-facing AppError when the plan is inactive or the limit is
 * reached. Returns the key so a failed operation can be refunded.
 */
export async function consumeUsage(
  ctx: WorkspaceContext,
  metric: UsageMetric,
  opts: { quantity?: number; key?: string; refType?: string; refId?: string } = {},
): Promise<string> {
  const key = opts.key ?? `${metric}:${randomUUID()}`;
  // Workers run as the service role; the function then trusts the server.
  const { error } = await ctx.supabase.rpc("consume_usage", {
    p_ws: ctx.workspace.id,
    p_metric: metric,
    p_quantity: opts.quantity ?? 1,
    p_key: key,
    p_ref_type: opts.refType ?? null,
    p_ref_id: opts.refId ?? null,
  });
  if (error) {
    let reason: string | null = null;
    if (error.message.includes("subscription_inactive")) {
      const { data } = await createAdminClient().rpc("usage_summary", { p_ws: ctx.workspace.id });
      reason = data?.[0]?.access_reason ?? null;
    }
    throw usageError(error.message, reason) ?? new AppError("Nie udało się sprawdzić limitu planu.", "usage_check", 500);
  }
  return key;
}

/** Gives back a reservation when the paid operation failed (once per key). */
export async function refundUsage(workspaceId: string, key: string, note?: string) {
  const { error } = await createAdminClient().rpc("refund_usage", { p_ws: workspaceId, p_key: key, p_note: note ?? null });
  if (error) console.error("[usage] refund failed", key, error.message);
}

/** Throws when the office is read-only (trial over, canceled, unpaid). For actions that cost nothing but need a plan, e.g. publishing. */
export async function assertActivePlan(ctx: WorkspaceContext) {
  const s = await getUsageSummary(ctx);
  if (s.access !== "full") throw new AppError(accessMessage(s.accessReason), "subscription_inactive", 402);
  return s;
}

/** "2026-10" in Europe/Warsaw: monthly idempotency keys (e.g. one charge per export per month). */
export function monthKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
}
