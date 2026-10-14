import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { authorizePerm } from "@/lib/session";
import { getStripe } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

const schema = z.object({ flow: z.enum(["manage", "update", "cancel", "payment_method"]).default("manage") });

/** Stripe Customer Portal: plan change, cancellation, payment methods, invoices. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await authorizePerm("billing.manage");
    const { flow } = schema.parse((await req.json().catch(() => ({}))) ?? {});
    const { data: sub } = await createAdminClient().from("workspace_subscriptions").select("provider_customer_id, provider_subscription_id").eq("workspace_id", ctx.workspace.id).single();
    if (!sub?.provider_customer_id) throw new AppError("Biuro nie ma jeszcze konta płatności. Najpierw wybierz plan.", "no_customer", 409);
    const site = serverEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    const returnUrl = `${site}/settings/billing?portal=1`;
    const flowData =
      flow === "update" && sub.provider_subscription_id
        ? { type: "subscription_update" as const, subscription_update: { subscription: sub.provider_subscription_id } }
        : flow === "cancel" && sub.provider_subscription_id
          ? { type: "subscription_cancel" as const, subscription_cancel: { subscription: sub.provider_subscription_id } }
          : flow === "payment_method"
            ? { type: "payment_method_update" as const }
            : undefined;
    const session = await getStripe().billingPortal.sessions.create({ customer: sub.provider_customer_id, return_url: returnUrl, locale: "pl", ...(flowData ? { flow_data: flowData } : {}) });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return apiError(error);
  }
}
