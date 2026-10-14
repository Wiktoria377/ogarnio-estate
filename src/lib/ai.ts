import "server-only";
import { loadMemoryContext } from "@/lib/brand-memory/service";
import { AnthropicProvider } from "@/core/ai/anthropic";
import { LlmError, type LlmCall, type LlmProvider, type LlmResult } from "@/core/ai/provider";
import { TestProvider } from "@/core/ai/test-provider";
import { toBrandKit } from "@/core/brand/kit";
import type { BrandKit } from "@/core/brand/model";
import type { EngineContext } from "@/core/marketing-engine/pipeline";
import { loadSkills } from "@/core/marketing-engine/skills/loader";
import { aiAvailability, serverEnv } from "@/lib/env";
import { assertBudget } from "@/lib/admin/costs";
import { AppError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/observability";
import { consumeUsage, getUsageSummary, refundUsage, accessMessage } from "@/lib/billing/usage";
import { loadBrand, type WorkspaceContext } from "@/lib/session";

/** Operations counted against the monthly plan quota (reviews/repairs are free). */
export const BILLABLE_OPERATIONS = ["generate", "refine", "graphic_copy", "campaign_brief", "video_script", "ai_insight", "brand_analysis", "strategy", "autopilot"] as const;
export type BillableOperation = (typeof BILLABLE_OPERATIONS)[number];

function baseProvider(): LlmProvider {
  const a = aiAvailability();
  if (a.mode === "anthropic") return new AnthropicProvider(serverEnv().ANTHROPIC_API_KEY!, { main: a.model, review: a.reviewModel });
  if (a.mode === "test") return new TestProvider();
  throw new LlmError("Generowanie AI nie jest skonfigurowane. Administrator musi ustawić ANTHROPIC_API_KEY na serwerze.", "not_configured");
}

/** Logs every model call (tokens, latency, errors) to the workspace usage log. */
class MeteredProvider implements LlmProvider {
  readonly name: string;
  constructor(
    private readonly inner: LlmProvider,
    private readonly ctx: WorkspaceContext,
  ) {
    this.name = inner.name;
  }
  async complete<T>(call: LlmCall<T>): Promise<LlmResult<T>> {
    const started = Date.now();
    // Billable calls reserve one unit in the usage ledger first (atomic, so
    // parallel requests cannot overshoot the plan); a failed call is refunded.
    // Platform safety budget for paid AI (the offline test provider is free).
    if (this.inner.name !== "test") {
      try {
        await assertBudget("ai");
      } catch (error) {
        await this.log(call, "rejected", { code: "platform_budget" });
        throw error;
      }
    }
    const billable = (BILLABLE_OPERATIONS as readonly string[]).includes(call.operation);
    const metric = call.operation === "ai_insight" ? "ai_insight" : "text_generation";
    const key = billable ? await consumeUsage(this.ctx, metric, { refType: "ai_call", refId: call.operation }) : null;
    try {
      const res = await this.inner.complete(call);
      await this.log(call, "ok", { model: res.model, input: res.usage.input, output: res.usage.output, latency: Date.now() - started });
      return res;
    } catch (error) {
      if (key) await refundUsage(this.ctx.workspace.id, key, "błąd wywołania AI");
      await this.log(call, "error", { code: error instanceof LlmError ? error.code : "unknown", latency: Date.now() - started });
      throw error;
    }
  }
  log(call: LlmCall<unknown>, status: "ok" | "error" | "rejected", d: UsageDetails) {
    return logUsage(this.ctx, call.operation, status, { ...d, process: call.process, promptVersion: call.promptVersion });
  }
}

type UsageDetails = { model?: string; input?: number; output?: number; code?: string; latency?: number; process?: { type: string; id: string }; promptVersion?: string };

async function logUsage(ctx: WorkspaceContext, operation: string, status: "ok" | "error" | "rejected", d: UsageDetails) {
    // Server-only write (service role): members cannot insert usage rows themselves.
    const { error } = await createAdminClient().from("ai_usage_events").insert({
      workspace_id: ctx.workspace.id,
      user_id: ctx.userId,
      operation,
      status,
      model: d.model ?? null,
      input_tokens: d.input ?? 0,
      output_tokens: d.output ?? 0,
      error_code: d.code ?? null,
      latency_ms: d.latency ?? null,
      process_type: d.process?.type ?? null,
      process_id: d.process?.id ?? null,
      prompt_version: d.promptVersion ?? null,
    });
    if (error) console.error("usage log failed", error.message);
}

export async function getQuota(ctx: WorkspaceContext): Promise<{ used: number; limit: number }> {
  const { data, error } = await ctx.supabase.rpc("ai_quota_status", { p_ws: ctx.workspace.id });
  if (error) throw new AppError("Nie udało się sprawdzić limitu generowań.", "quota_check", 500);
  const row = data?.[0];
  return { used: row?.used ?? 0, limit: row?.monthly_limit ?? 0 };
}

/**
 * Abuse protection before any paid call: per-user rate limit (sliding minute)
 * and the workspace's monthly plan quota. Rejections are logged too.
 */
export async function guardAiUsage(ctx: WorkspaceContext, operation: BillableOperation) {
  const env = serverEnv();
  // Atomic per-user counter (counted at request start, so parallel requests cannot slip through).
  try {
    await rateLimit(`ai:${ctx.userId}`, env.AI_USER_RATE_PER_MINUTE, 60, "Za dużo generowań w krótkim czasie. Odczekaj minutę i spróbuj ponownie.");
  } catch (error) {
    await logUsage(ctx, operation, "rejected", { code: "rate_limited" });
    throw error;
  }
  const s = await getUsageSummary(ctx);
  if (s.access !== "full") {
    await logUsage(ctx, operation, "rejected", { code: "subscription_inactive" });
    throw new AppError(accessMessage(s.accessReason), "subscription_inactive", 402);
  }
  if (s.text.used >= s.text.limit) {
    await logUsage(ctx, operation, "rejected", { code: "quota" });
    throw new AppError(`Wykorzystano miesięczny limit generowań AI w planie (${s.text.limit}). Limit odnowi się 1. dnia miesiąca lub po zmianie planu.`, "quota", 402);
  }
}

/**
 * Monthly quota only (background jobs). The per-minute rate limit protects
 * interactive endpoints; campaign jobs were already authorised and costed
 * when the user started the campaign.
 */
export async function guardAiQuota(ctx: WorkspaceContext, needed = 1) {
  const quota = await getQuota(ctx);
  if (quota.used + needed > quota.limit) {
    throw new AppError(`Wykorzystano miesięczny limit generowań (${quota.used}/${quota.limit}). Limit odnowi się na początku miesiąca lub po zmianie planu.`, "quota", 402);
  }
}

export async function loadBrandKit(ctx: WorkspaceContext): Promise<BrandKit> {
  const brand = await loadBrand(ctx);
  let logo: { storage_path: string } | null = null;
  if (brand.logo_asset_id) {
    const { data } = await ctx.supabase.from("brand_assets").select("storage_path").eq("id", brand.logo_asset_id).maybeSingle();
    logo = data;
  }
  const kit = toBrandKit(brand, logo);
  kit.memory = await loadMemoryContext(ctx, brand.memory_enabled).catch(() => null);
  return kit;
}

/** Builds the engine for one request: metered provider, skills, brand. */
export async function createEngine(ctx: WorkspaceContext, brand?: BrandKit): Promise<EngineContext> {
  return {
    provider: new MeteredProvider(baseProvider(), ctx),
    skills: loadSkills(),
    brand: brand ?? (await loadBrandKit(ctx)),
  };
}

/** Converts engine errors into user-facing ones. */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof AppError || error instanceof LlmError) return error.message;
  console.error("ai error", error);
  return "Nie udało się wygenerować treści. Spróbuj ponownie.";
}
