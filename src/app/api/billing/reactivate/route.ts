import { NextResponse, type NextRequest } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { authorizePerm } from "@/lib/session";
import { getStripe } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Withdraws a scheduled cancellation (cancel_at_period_end → false). The local
 * state is not changed here: the resulting customer.subscription.updated
 * webhook updates it, so the database never drifts from Stripe.
 */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await authorizePerm("billing.manage");
    const { data: sub } = await createAdminClient().from("workspace_subscriptions").select("provider_subscription_id, cancel_at_period_end, status").eq("workspace_id", ctx.workspace.id).single();
    if (!sub?.provider_subscription_id || !sub.cancel_at_period_end || sub.status === "canceled")
      throw new AppError("Nie ma zaplanowanej rezygnacji do wycofania. Po zakończeniu subskrypcji wybierz plan ponownie.", "not_reactivatable", 409);
    await getStripe().subscriptions.update(sub.provider_subscription_id, { cancel_at_period_end: false }, { idempotencyKey: `reactivate:${sub.provider_subscription_id}:${Date.now() >> 16}` });
    return NextResponse.json({ ok: true, pending: true });
  } catch (error) {
    return apiError(error);
  }
}
