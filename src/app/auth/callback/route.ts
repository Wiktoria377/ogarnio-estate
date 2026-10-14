import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for e-mail links (signup confirmation, password recovery).
 * Supports both the PKCE `code` flow and `token_hash` links from custom templates.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  const next = /^\/(?![\/\\])[^\s]*$/.test(nextParam) && !nextParam.includes("\\") ? nextParam : "/dashboard";
  const supabase = await createClient();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  let target = new URL(ok ? next : "/login?error=link", url.origin);
  if (target.origin !== url.origin) target = new URL("/dashboard", url.origin);
  return NextResponse.redirect(target);
}
