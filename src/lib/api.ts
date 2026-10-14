import "server-only";
import "@/lib/observability";
import { NextResponse } from "next/server";
import { AppError, reportUnexpected } from "@/lib/errors";
import { LlmError } from "@/core/ai/provider";

/** JSON error responses for route handlers, without leaking internals. */
export function apiError(error: unknown): NextResponse {
  if (error instanceof AppError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof LlmError) {
    const status = error.code === "not_configured" ? 503 : error.code === "rate_limited" ? 429 : error.code === "overloaded" ? 503 : 502;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  if (error && typeof error === "object" && "type" in error && String((error as { type: unknown }).type).startsWith("Stripe")) {
    reportUnexpected("stripe", error);
    return NextResponse.json({ error: "Operator płatności (Stripe) odrzucił żądanie lub nie odpowiada. Spróbuj ponownie za chwilę." }, { status: 502 });
  }
  reportUnexpected("api", error);
  return NextResponse.json({ error: "Coś poszło nie tak. Spróbuj ponownie za chwilę." }, { status: 500 });
}

/** Same-origin check for state-changing requests made with fetch (CSRF defence in depth). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AppError("Niedozwolone źródło żądania.", "bad_origin", 403);
    }
    if (host && originHost !== host) throw new AppError("Niedozwolone źródło żądania.", "bad_origin", 403);
    return;
  }
  // No Origin header (some older browsers on same-origin GET-like POSTs): require Fetch Metadata.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new AppError("Niedozwolone źródło żądania.", "bad_origin", 403);
  if (!site && req.method !== "GET" && req.method !== "HEAD") throw new AppError("Niedozwolone źródło żądania.", "bad_origin", 403);
}
