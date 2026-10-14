import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { authorizePerm } from "@/lib/session";
import { getStripe } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { rateLimit } from "@/lib/observability";

const schema = z.object({ planId: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/) });

/**
 * Starts Stripe Checkout (subscription mode) for the owner. The success page
 * only shows "payment is being confirmed": access changes when the signed
 * customer.subscription.* webhook arrives.
 */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await authorizePerm("billing.manage");
    await rateLimit(`checkout:${ctx.workspace.id}`, 10, 600);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError("Wybierz plan.", "bad_request");
    const admin = createAdminClient();
    const { data: plan } = await admin.from("plans").select("*").eq("id", parsed.data.planId).eq("is_active", true).eq("is_public", true).maybeSingle();
    if (!plan) throw new AppError("Ten plan nie jest dostępny.", "not_found", 404);
    if (!plan.stripe_price_id) throw new AppError("Ten plan nie ma jeszcze ceny w Stripe. Administrator Ogarnio musi ją przypisać w panelu.", "price_missing", 503);
    const { data: sub } = await admin.from("workspace_subscriptions").select("*").eq("workspace_id", ctx.workspace.id).single();
    if (sub?.provider_subscription_id && ["active", "trialing", "past_due", "incomplete"].includes(sub.status) && sub.provider === "stripe")
      throw new AppError("Biuro ma już aktywną subskrypcję. Zmień plan w portalu płatności.", "has_subscription", 409);

    const stripe = getStripe();
    let customer = sub?.provider_customer_id ?? null;
    if (!customer) {
      const created = await stripe.customers.create(
        { email: ctx.userEmail, name: ctx.workspace.name, metadata: { workspace_id: ctx.workspace.id } },
        { idempotencyKey: `customer:${ctx.workspace.id}` },
      );
      customer = created.id;
      await admin.from("workspace_subscriptions").update({ provider: "stripe", provider_customer_id: customer }).eq("workspace_id", ctx.workspace.id);
    }
    const site = serverEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: ctx.workspace.id,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      subscription_data: { metadata: { workspace_id: ctx.workspace.id, plan_id: plan.id } },
      metadata: { workspace_id: ctx.workspace.id, plan_id: plan.id },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      locale: "pl",
      success_url: `${site}/settings/billing?checkout=success`,
      cancel_url: `${site}/settings/billing?checkout=canceled`,
    });
    if (!session.url) throw new AppError("Stripe nie zwrócił adresu płatności.", "checkout_failed", 502);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return apiError(error);
  }
}
