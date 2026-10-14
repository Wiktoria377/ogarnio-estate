import "server-only";
import { AppError, registerErrorReporter } from "@/lib/errors";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Central error log (table app_errors, visible only in the OGARNIO admin panel).
 * Never throws; never stores secrets or client content: only an area, a code,
 * a short message and small technical context.
 */
export async function logError(area: string, error: unknown, ctx: { workspaceId?: string | null; userId?: string | null; context?: Record<string, unknown> } = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof AppError ? error.code : error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : null;
  console.error(`[${area}]`, code ?? "", message);
  try {
    if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY) return;
    await createAdminClient().from("app_errors").insert({
      area: area.slice(0, 60),
      code: code?.slice(0, 80) ?? null,
      message: redact(message).slice(0, 1000),
      workspace_id: ctx.workspaceId ?? null,
      user_id: ctx.userId ?? null,
      context: (ctx.context ?? {}) as Json,
    });
  } catch (e) {
    console.error("[app_errors] insert failed", e);
  }
}

/** Removes things that look like tokens or keys from log messages. */
export function redact(text: string): string {
  return text
    .replace(/(access_token|refresh_token|client_secret|code_verifier|token|key|secret)=([^&\s"]+)/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/\b(sk|rk|pk|whsec)_(live|test)_[A-Za-z0-9]+/g, "$1_$2_[redacted]")
    .replace(/EAA[A-Za-z0-9]{20,}/g, "[redacted-meta-token]");
}

/**
 * Fixed-window rate limit in Postgres (works across server instances).
 * Throws AppError 429 when exceeded. Fails open only if the DB call fails,
 * logging the problem (availability over strictness for non-billing limits).
 */
export async function rateLimit(key: string, max: number, windowSeconds: number, message = "Za dużo żądań. Odczekaj chwilę i spróbuj ponownie.") {
  if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY) return;
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", { p_key: key.slice(0, 200), p_window_seconds: windowSeconds, p_max: max });
  if (error) {
    await logError("rate_limit", error, { context: { key: key.split(":")[0] } });
    return;
  }
  if (data === false) throw new AppError(message, "rate_limited", 429);
}

/** Client IP as seen by the reverse proxy (only for rate limiting and hashed analytics). */
export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "0.0.0.0").trim();
}

registerErrorReporter((area, error) => void logError(area, error));
