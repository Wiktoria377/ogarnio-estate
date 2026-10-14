import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { authorizePerm } from "@/lib/session";
import { completeOAuth } from "@/lib/social/connections";

/**
 * OAuth redirect target (registered in the Meta / LinkedIn app as
 * {SITE}/api/social/meta/callback and {SITE}/api/social/linkedin/callback).
 * Validates the one-time state bound to the signed-in user and office.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/connections?${q}`, req.nextUrl.origin), { status: 303 });
  if (provider !== "meta" && provider !== "linkedin") return back("error=" + encodeURIComponent("Nieznany dostawca."));
  const sp = req.nextUrl.searchParams;
  const denied = sp.get("error") || sp.get("error_reason");
  if (denied) return back("error=" + encodeURIComponent(denied === "user_denied" || denied === "user_cancelled_authorize" || denied === "user_cancelled_login" ? "Anulowano łączenie konta." : "Platforma odmówiła autoryzacji."));
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state || code.length > 2000 || state.length > 200) return back("error=" + encodeURIComponent("Nieprawidłowa odpowiedź autoryzacji."));
  try {
    const ctx = await authorizePerm("social.manage");
    const grant = await completeOAuth(ctx, provider, state, code);
    return NextResponse.redirect(new URL(`/connections/select?grant=${grant}`, req.nextUrl.origin), { status: 303 });
  } catch (error) {
    if (!(error instanceof AppError) || error.status >= 500) await logError("social_oauth", error, { context: { provider } });
    return back("error=" + encodeURIComponent(error instanceof AppError ? error.message : "Nie udało się połączyć konta."));
  }
}
