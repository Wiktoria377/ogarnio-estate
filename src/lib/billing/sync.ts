import "server-only";
import type Stripe from "stripe";
import { logError } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionStatus } from "@/lib/supabase/database.types";

/**
 * Applies verified Stripe events to the database. Idempotent: every event id is
 * stored in billing_events and processed once; out-of-order deliveries are
 * ignored by comparing the event time with provider_synced_at.
 */
type Admin = ReturnType<typeof createAdminClient>;

const STATUS: Record<string, SubscriptionStatus> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "unpaid",
  incomplete: "incomplete",
  incomplete_expired: "incomplete_expired",
  paused: "paused",
};

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.finalized",
  "invoice.updated",
  "invoice.voided",
  "invoice.marked_uncollectible",
]);

export type SyncOutcome = "processed" | "duplicate" | "ignored" | "stale";

const iso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);
const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

async function workspaceFor(admin: Admin, opts: { metadata?: Stripe.Metadata | null; customer?: string | null; subscription?: string | null; reference?: string | null }): Promise<string | null> {
  const candidate = opts.reference || opts.metadata?.workspace_id || null;
  if (candidate && /^[0-9a-f-]{36}$/i.test(candidate)) {
    const { data } = await admin.from("workspace_subscriptions").select("workspace_id, provider_customer_id").eq("workspace_id", candidate).maybeSingle();
    // A workspace id in metadata only counts if the customer matches (or none is linked yet).
    if (data && (!data.provider_customer_id || !opts.customer || data.provider_customer_id === opts.customer)) return data.workspace_id;
  }
  if (opts.subscription) {
    const { data } = await admin.from("workspace_subscriptions").select("workspace_id").eq("provider_subscription_id", opts.subscription).maybeSingle();
    if (data) return data.workspace_id;
  }
  if (opts.customer) {
    const { data } = await admin.from("workspace_subscriptions").select("workspace_id").eq("provider_customer_id", opts.customer).maybeSingle();
    if (data) return data.workspace_id;
  }
  return null;
}

async function planForPrice(admin: Admin, priceId: string | null): Promise<string | null> {
  if (!priceId) return null;
  const { data } = await admin.from("plans").select("id").eq("stripe_price_id", priceId).maybeSingle();
  return data?.id ?? null;
}

async function applySubscription(admin: Admin, event: Stripe.Event, sub: Stripe.Subscription): Promise<SyncOutcome> {
  const customer = idOf(sub.customer);
  const ws = await workspaceFor(admin, { metadata: sub.metadata, customer, subscription: sub.id });
  if (!ws) throw new Error(`no workspace for subscription ${sub.id}`);
  const { data: current } = await admin.from("workspace_subscriptions").select("provider_synced_at, provider_subscription_id, status").eq("workspace_id", ws).single();
  const eventAt = new Date(event.created * 1000);
  if (current?.provider_synced_at && new Date(current.provider_synced_at) > eventAt) return "stale";
  // The end of an old, replaced subscription must not cancel the current one.
  if (current?.provider_subscription_id && current.provider_subscription_id !== sub.id && ["active", "trialing", "past_due"].includes(current.status) && (sub.status === "canceled" || event.type === "customer.subscription.deleted")) return "ignored";
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const plan = await planForPrice(admin, priceId);
  if (!plan) throw new Error(`price ${priceId ?? "?"} is not mapped to any plan (plans.stripe_price_id)`);
  const status = event.type === "customer.subscription.deleted" ? "canceled" : STATUS[sub.status] ?? "incomplete";
  // Since API 2025-03-31 the billing period lives on subscription items.
  const periodEnd = (item as { current_period_end?: number } | undefined)?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end ?? null;
  const { error } = await admin
    .from("workspace_subscriptions")
    .update({
      plan,
      status,
      provider: "stripe",
      provider_customer_id: customer,
      provider_subscription_id: sub.id,
      provider_price_id: priceId,
      current_period_end: iso(periodEnd),
      trial_ends_at: sub.trial_end ? iso(sub.trial_end) : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      canceled_at: iso(sub.canceled_at),
      trial_used: true,
      provider_synced_at: eventAt.toISOString(),
    })
    .eq("workspace_id", ws);
  if (error) throw new Error(`subscription update failed: ${error.message}`);
  await admin.from("billing_events").update({ workspace_id: ws }).eq("id", event.id);
  return "processed";
}

async function applyInvoice(admin: Admin, event: Stripe.Event, inv: Stripe.Invoice): Promise<SyncOutcome> {
  if (!inv.id) return "ignored";
  const customer = idOf(inv.customer);
  const subId = idOf(inv.parent?.subscription_details?.subscription ?? null);
  const ws = await workspaceFor(admin, { metadata: inv.parent?.subscription_details?.metadata ?? inv.metadata, customer, subscription: subId });
  if (!ws) throw new Error(`no workspace for invoice ${inv.id}`);
  const status = (["draft", "open", "paid", "uncollectible", "void"] as const).find((s) => s === inv.status) ?? "open";
  const line = inv.lines?.data?.[0];
  const { error } = await admin.from("billing_invoices").upsert(
    {
      id: inv.id,
      workspace_id: ws,
      number: inv.number ?? null,
      status,
      amount_due: inv.amount_due ?? 0,
      amount_paid: inv.amount_paid ?? 0,
      currency: (inv.currency ?? "pln").toUpperCase(),
      hosted_invoice_url: inv.hosted_invoice_url?.startsWith("https://") ? inv.hosted_invoice_url : null,
      invoice_pdf: inv.invoice_pdf?.startsWith("https://") ? inv.invoice_pdf : null,
      period_start: iso(line?.period?.start),
      period_end: iso(line?.period?.end),
      created_at: iso(inv.created) ?? new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`invoice upsert failed: ${error.message}`);
  if (event.type === "invoice.payment_failed") await logError("billing", new Error(`payment failed for invoice ${inv.id}`), { workspaceId: ws });
  await admin.from("billing_events").update({ workspace_id: ws }).eq("id", event.id);
  return "processed";
}

async function applyCheckout(admin: Admin, event: Stripe.Event, session: Stripe.Checkout.Session): Promise<SyncOutcome> {
  if (session.mode !== "subscription") return "ignored";
  const customer = idOf(session.customer);
  const ws = await workspaceFor(admin, { reference: session.client_reference_id, metadata: session.metadata, customer });
  if (!ws) throw new Error(`no workspace for checkout ${session.id}`);
  // Links customer and subscription only. Access changes come exclusively from
  // customer.subscription.* events, never from the checkout or the success page.
  const { error } = await admin
    .from("workspace_subscriptions")
    .update({ provider: "stripe", provider_customer_id: customer, provider_subscription_id: idOf(session.subscription) })
    .eq("workspace_id", ws)
    .is("provider_subscription_id", null);
  if (error) throw new Error(`checkout link failed: ${error.message}`);
  await admin.from("billing_events").update({ workspace_id: ws }).eq("id", event.id);
  return "processed";
}

export async function processStripeEvent(event: Stripe.Event): Promise<SyncOutcome> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("billing_events").select("status").eq("id", event.id).maybeSingle();
  if (existing && (existing.status === "processed" || existing.status === "ignored")) return "duplicate";
  if (!existing) {
    const { error } = await admin.from("billing_events").insert({ id: event.id, type: event.type, stripe_created: new Date(event.created * 1000).toISOString() });
    // A parallel delivery of the same event won the insert: let that one finish.
    if (error?.code === "23505") return "duplicate";
    if (error) throw new Error(`billing_events insert failed: ${error.message}`);
  }
  if (!HANDLED.has(event.type)) {
    await admin.from("billing_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("id", event.id);
    return "ignored";
  }
  try {
    let outcome: SyncOutcome;
    const obj = event.data.object as unknown;
    if (event.type === "checkout.session.completed") outcome = await applyCheckout(admin, event, obj as Stripe.Checkout.Session);
    else if (event.type.startsWith("customer.subscription.")) outcome = await applySubscription(admin, event, obj as Stripe.Subscription);
    else outcome = await applyInvoice(admin, event, obj as Stripe.Invoice);
    await admin.from("billing_events").update({ status: outcome === "processed" ? "processed" : "ignored", processed_at: new Date().toISOString(), error: outcome === "stale" ? "stale event (newer state already applied)" : null }).eq("id", event.id);
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("billing_events").update({ status: "failed", error: message.slice(0, 500) }).eq("id", event.id);
    await logError("billing_webhook", error, { context: { event: event.id, type: event.type } });
    throw error;
  }
}
