import { NextResponse, type NextRequest } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { readBodyLimited } from "@/lib/http-body";
import { STATS_COOKIE, recordSiteEvent } from "@/lib/site/service";

/** Page-view beacon of the sales page. Without the consent cookie nothing is stored. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const raw = await readBodyLimited(req, 4 * 1024, "Za duże zdarzenie.");
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      throw new AppError("Nieprawidłowe dane.", "bad_request", 400);
    }
    const recorded = await recordSiteEvent(body, req, req.cookies.get(STATS_COOKIE)?.value === "1");
    return NextResponse.json({ ok: true, recorded });
  } catch (error) {
    return apiError(error);
  }
}
