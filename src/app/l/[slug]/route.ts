import { NextResponse, type NextRequest } from "next/server";
import { resolveClick } from "@/lib/analytics/service";

/** Short tracking link: records the click (bots flagged, no raw IP stored) and redirects with UTM. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const target = await resolveClick(slug, req).catch((e) => {
    console.error("[links] resolve failed", e);
    return null;
  });
  if (!target) return new NextResponse("Link nie istnieje lub wygasł.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return NextResponse.redirect(target, { status: 302, headers: { "cache-control": "no-store", "referrer-policy": "strict-origin-when-cross-origin" } });
}
