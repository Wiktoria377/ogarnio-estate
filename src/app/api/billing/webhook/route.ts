import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { verifyWebhook } from "@/lib/billing/stripe";
import { processStripeEvent } from "@/lib/billing/sync";
import { readBodyLimited } from "@/lib/http-body";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint. The signature is verified over the raw body; each
 * event is processed once (billing_events). Returns 2xx for duplicates and
 * ignored types so Stripe stops retrying, 5xx on processing errors so it retries.
 */
export async function POST(req: NextRequest) {
  let raw: string;
  try {
    raw = new TextDecoder().decode(await readBodyLimited(req, 1024 * 1024, "Zbyt duże zdarzenie."));
  } catch {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  let event;
  try {
    event = verifyWebhook(raw, req.headers.get("stripe-signature"));
  } catch (error) {
    const status = error instanceof AppError ? error.status : 400;
    return NextResponse.json({ error: error instanceof AppError ? error.code : "bad_request" }, { status });
  }
  try {
    const outcome = await processStripeEvent(event);
    return NextResponse.json({ received: true, outcome });
  } catch {
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
