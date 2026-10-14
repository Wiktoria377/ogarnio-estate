/**
 * Billing and limits against the local stack and the running app:
 * - Stripe webhooks: signature check, idempotency, ordering, access changes
 *   (events are signed locally with the test webhook secret from .env.local;
 *   this is a simulation of Stripe deliveries, NOT a payment test: real
 *   Checkout needs Stripe test-mode keys),
 * - usage ledger: atomic limit, idempotency keys, refunds, read-only access,
 * - count limits enforced by triggers.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const users: string[] = [];
const PRICE = `price_test${Date.now()}`;

async function user(tag: string): Promise<{ id: string; sb: SupabaseClient }> {
  const email = `billing-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Billing-Test-2026", email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const sb = createClient(URL, ANON, opts);
  await sb.auth.signInWithPassword({ email, password: "Billing-Test-2026" });
  return { id: data.user.id, sb };
}

function signed(event: Record<string, unknown>, secret = WHSEC) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return fetch(`${APP}/api/billing/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": header }, body: payload });
}

let evtN = 0;
function subEvent(type: string, ws: string, status: string, created: number, extra: Record<string, unknown> = {}) {
  evtN++;
  return {
    id: `evt_test${Date.now()}${evtN}`,
    object: "event",
    type,
    created,
    data: {
      object: {
        id: `sub_test${ws.slice(0, 8)}`,
        object: "subscription",
        customer: `cus_test${ws.slice(0, 8)}`,
        status,
        metadata: { workspace_id: ws },
        cancel_at_period_end: false,
        canceled_at: null,
        trial_end: null,
        items: { data: [{ price: { id: PRICE }, current_period_end: created + 30 * 86400 }] },
        ...extra,
      },
    },
  };
}

let A: { id: string; sb: SupabaseClient };
let ws: string;

beforeAll(async () => {
  expect(WHSEC, "STRIPE_WEBHOOK_SECRET must be set for the local test").toBeTruthy();
  A = await user("owner");
  ws = (await A.sb.rpc("create_workspace", { p_name: "Biuro płatności" })).data as string;
  const { error } = await admin.from("plans").update({ stripe_price_id: PRICE }).eq("id", "studio");
  if (error) throw error;
});

afterAll(async () => {
  await admin.from("plans").update({ stripe_price_id: null }).eq("id", "studio");
  if (ws) await admin.from("workspaces").delete().eq("id", ws);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

const summary = async () => (await A.sb.rpc("usage_summary", { p_ws: ws })).data![0];

describe("Stripe webhooks", () => {
  it("new office starts on a trial with full access", async () => {
    const s = await summary();
    expect(s.plan_id).toBe("trial");
    expect(s.status).toBe("trialing");
    expect(s.access).toBe("full");
  });

  it("rejects a missing or wrong signature", async () => {
    const e = subEvent("customer.subscription.created", ws, "active", Math.floor(Date.now() / 1000));
    const bad = await signed(e, "whsec_wrong_secret_0000000000");
    expect(bad.status).toBe(400);
    const none = await fetch(`${APP}/api/billing/webhook`, { method: "POST", body: JSON.stringify(e) });
    expect(none.status).toBe(400);
    expect((await summary()).status).toBe("trialing");
  });

  it("checkout completion alone does not grant access", async () => {
    const now = Math.floor(Date.now() / 1000);
    const res = await signed({ id: `evt_test${Date.now()}co`, object: "event", type: "checkout.session.completed", created: now, data: { object: { id: "cs_test1", object: "checkout.session", mode: "subscription", customer: `cus_test${ws.slice(0, 8)}`, subscription: `sub_test${ws.slice(0, 8)}`, client_reference_id: ws, metadata: { workspace_id: ws } } } });
    expect(res.status).toBe(200);
    const s = await summary();
    expect(s.plan_id).toBe("trial");
    expect(s.status).toBe("trialing");
  });

  it("subscription event activates the paid plan; duplicates are ignored", async () => {
    const e = subEvent("customer.subscription.created", ws, "active", Math.floor(Date.now() / 1000));
    const r1 = await signed(e);
    expect(r1.status).toBe(200);
    expect((await r1.json()).outcome).toBe("processed");
    const s = await summary();
    expect(s.plan_id).toBe("studio");
    expect(s.status).toBe("active");
    expect(s.text_limit).toBe(1200);
    const r2 = await signed(e);
    expect((await r2.json()).outcome).toBe("duplicate");
    const { count } = await admin.from("billing_events").select("id", { count: "exact", head: true }).eq("id", e.id);
    expect(count).toBe(1);
  });

  it("an older event delivered late does not overwrite newer state", async () => {
    const old = subEvent("customer.subscription.updated", ws, "past_due", Math.floor(Date.now() / 1000) - 3600);
    const r = await signed(old);
    expect((await r.json()).outcome).toBe("stale");
    expect((await summary()).status).toBe("active");
  });

  it("invoice events build the payment history (owner only)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const r = await signed({ id: `evt_test${Date.now()}inv`, object: "event", type: "invoice.paid", created: now + 1, data: { object: { id: `in_test${ws.slice(0, 8)}`, object: "invoice", customer: `cus_test${ws.slice(0, 8)}`, status: "paid", number: "TEST-0001", amount_due: 34900, amount_paid: 34900, currency: "pln", hosted_invoice_url: "https://invoice.stripe.com/i/test", invoice_pdf: null, created: now, lines: { data: [{ period: { start: now, end: now + 30 * 86400 } }] }, parent: { subscription_details: { subscription: `sub_test${ws.slice(0, 8)}`, metadata: { workspace_id: ws } } } } } });
    expect(r.status).toBe(200);
    const { data } = await A.sb.from("billing_invoices").select("number, amount_paid, status").eq("workspace_id", ws);
    expect(data).toEqual([{ number: "TEST-0001", amount_paid: 34900, status: "paid" }]);
  });

  it("cancellation makes the office read-only and paid operations are refused", async () => {
    const e = subEvent("customer.subscription.deleted", ws, "canceled", Math.floor(Date.now() / 1000) + 5, { canceled_at: Math.floor(Date.now() / 1000) });
    expect((await (await signed(e)).json()).outcome).toBe("processed");
    const s = await summary();
    expect(s.status).toBe("canceled");
    expect(s.access).toBe("read_only");
    const c = await A.sb.rpc("consume_usage", { p_ws: ws, p_metric: "text_generation", p_quantity: 1, p_key: "t:after-cancel" });
    expect(c.error?.message).toContain("subscription_inactive");
  });

  it("users cannot change their own subscription through the API", async () => {
    const r = await A.sb.from("workspace_subscriptions").update({ status: "active" }).eq("workspace_id", ws).select();
    expect(r.data ?? []).toEqual([]);
    expect((await summary()).status).toBe("canceled");
  });
});

describe("usage ledger and limits", () => {
  let B: { id: string; sb: SupabaseClient };
  let wsB: string;

  beforeAll(async () => {
    B = await user("limits");
    wsB = (await B.sb.rpc("create_workspace", { p_name: "Biuro limitów" })).data as string;
  });
  afterAll(async () => {
    if (wsB) await admin.from("workspaces").delete().eq("id", wsB);
  });

  it("reserves atomically and refuses beyond the plan limit (parallel requests)", async () => {
    await admin.from("workspace_subscriptions").update({ limit_overrides: { monthly_text_generations: 5 } }).eq("workspace_id", wsB);
    const calls = await Promise.all(Array.from({ length: 12 }, (_, i) => B.sb.rpc("consume_usage", { p_ws: wsB, p_metric: "text_generation", p_quantity: 1, p_key: `par:${i}` })));
    expect(calls.filter((c) => !c.error)).toHaveLength(5);
    expect(calls.filter((c) => c.error?.message.includes("usage_limit_reached"))).toHaveLength(7);
    const s = (await B.sb.rpc("usage_summary", { p_ws: wsB })).data![0];
    expect(s.text_used).toBe(5);
  });

  it("the same idempotency key is charged once; a refund frees the unit", async () => {
    await admin.from("workspace_subscriptions").update({ limit_overrides: { monthly_graphic_exports: 2 } }).eq("workspace_id", wsB);
    for (let i = 0; i < 3; i++) expect((await B.sb.rpc("consume_usage", { p_ws: wsB, p_metric: "graphic_export", p_quantity: 1, p_key: "export:same" })).error).toBeNull();
    expect((await B.sb.rpc("usage_summary", { p_ws: wsB })).data![0].exports_used).toBe(1);
    expect((await admin.rpc("refund_usage", { p_ws: wsB, p_key: "export:same" })).data).toBe(true);
    expect((await admin.rpc("refund_usage", { p_ws: wsB, p_key: "export:same" })).data).toBe(false);
    expect((await B.sb.rpc("usage_summary", { p_ws: wsB })).data![0].exports_used).toBe(0);
  });

  it("members cannot refund or write the ledger directly", async () => {
    expect((await B.sb.rpc("refund_usage", { p_ws: wsB, p_key: "par:0" })).error).not.toBeNull();
    expect((await B.sb.from("usage_ledger").insert({ workspace_id: wsB, metric: "text_generation", quantity: -100, idempotency_key: "hack" })).error).not.toBeNull();
  });

  it("another office cannot consume or read this office's usage", async () => {
    expect((await A.sb.rpc("consume_usage", { p_ws: wsB, p_metric: "text_generation", p_quantity: 1, p_key: "x" })).error).not.toBeNull();
    expect((await A.sb.rpc("usage_summary", { p_ws: wsB })).data ?? []).toEqual([]);
    expect((await A.sb.from("usage_ledger").select("id").eq("workspace_id", wsB)).data).toEqual([]);
  });

  it("property limit is enforced by the database", async () => {
    await admin.from("workspace_subscriptions").update({ limit_overrides: { max_properties: 2 } }).eq("workspace_id", wsB);
    const ins = (n: number) => B.sb.from("properties").insert({ workspace_id: wsB, title: `Oferta ${n}`, property_type: "apartment", transaction_type: "sale", created_by: B.id });
    expect((await ins(1)).error).toBeNull();
    expect((await ins(2)).error).toBeNull();
    const third = await ins(3);
    expect(third.error?.message).toContain("plan_limit:max_properties");
  });

  it("an expired trial is read-only", async () => {
    await admin.from("workspace_subscriptions").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("workspace_id", wsB);
    const s = (await B.sb.rpc("usage_summary", { p_ws: wsB })).data![0];
    expect(s.access).toBe("read_only");
    expect(s.access_reason).toBe("trial_expired");
    expect((await B.sb.rpc("consume_usage", { p_ws: wsB, p_metric: "video_render", p_quantity: 1, p_key: "r1" })).error?.message).toContain("subscription_inactive");
  });
});
