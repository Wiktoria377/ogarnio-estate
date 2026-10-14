import { NextResponse, type NextRequest } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { submitLead } from "@/lib/analytics/service";
import { readBodyLimited } from "@/lib/http-body";

/** Public lead form (no login). Same-origin only, small body, consent required, rate limited. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertSameOrigin(req);
    const { slug } = await params;
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) throw new AppError("Nie znaleziono oferty.", "not_found", 404);
    const raw = await readBodyLimited(req, 16 * 1024, "Wiadomość jest za długa.");
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      throw new AppError("Nieprawidłowe dane formularza.", "bad_request", 400);
    }
    await submitLead(slug, body, req);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
