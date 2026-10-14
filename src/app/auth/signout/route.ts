import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/session";

/** POST only, so a link or image on another site cannot sign the user out. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/login?notice=signed-out", request.nextUrl.origin), { status: 303 });
  res.cookies.delete(WORKSPACE_COOKIE);
  return res;
}
