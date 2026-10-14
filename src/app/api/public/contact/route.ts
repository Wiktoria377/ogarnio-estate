import { NextResponse, type NextRequest } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { readBodyLimited } from "@/lib/http-body";
import { submitContact } from "@/lib/site/service";

/** Sales-page contact form: same-origin, small body, consent, honeypot, rate limit. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const raw = await readBodyLimited(req, 16 * 1024, "Wiadomość jest za długa.");
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      throw new AppError("Nieprawidłowe dane formularza.", "bad_request", 400);
    }
    await submitContact(body, req);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
