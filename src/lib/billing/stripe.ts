import "server-only";
import Stripe from "stripe";
import { AppError } from "@/lib/errors";

/**
 * Stripe Billing (Checkout, Customer Portal, webhooks). Requires on the server:
 *   STRIPE_SECRET_KEY        sk_test_… (test mode) or sk_live_…
 *   STRIPE_WEBHOOK_SECRET    whsec_… of the endpoint /api/billing/webhook
 * and plans.stripe_price_id set for each sellable plan (admin panel).
 * Card data never touches this server: payment happens on Stripe's pages.
 */
export const STRIPE_API_VERSION = "2026-09-30.endive" as const;

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
}

export function stripeMode(): "test" | "live" | "unconfigured" {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!stripeConfigured()) return "unconfigured";
  return key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "live" : "test";
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new AppError("Płatności nie są jeszcze skonfigurowane (brak klucza Stripe na serwerze). Skontaktuj się z administratorem Ogarnio.", "billing_unconfigured", 503);
  client ??= new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "Ogarnio Estate" } });
  return client;
}

/** Verifies the Stripe-Signature header over the RAW body (never a re-serialised JSON). */
export function verifyWebhook(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new AppError("Webhook Stripe nie jest skonfigurowany.", "billing_unconfigured", 503);
  if (!signature) throw new AppError("Brak podpisu Stripe.", "bad_signature", 400);
  try {
    // Static helper: works without the secret key (no API call is made).
    return Stripe.webhooks.constructEvent(rawBody, signature, secret, 300);
  } catch {
    throw new AppError("Nieprawidłowy podpis webhooka.", "bad_signature", 400);
  }
}

export type { Stripe };
