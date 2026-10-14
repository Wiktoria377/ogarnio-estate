import { NextResponse, type NextRequest } from "next/server";
import { authorizePerm } from "@/lib/session";
import { apiError, assertSameOrigin } from "@/lib/api";
import { readFormDataLimited } from "@/lib/http-body";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/observability";
import { addPdfReference } from "@/lib/brand-intel/service";

const MAX = 15 * 1024 * 1024;

/** PDF reference upload (company presentations, brand books). Text is extracted, the file is never rendered. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    if (Number(req.headers.get("content-length") ?? 0) > MAX + 64 * 1024) throw new AppError("Plik PDF jest za duży (maks. 15 MB).", "too_large", 413);
    const ctx = await authorizePerm("brand.edit");
    await rateLimit(`brand-pdf:${ctx.userId}`, 20, 3600, "Za dużo przesłanych plików. Spróbuj za godzinę.");
    const form = await readFormDataLimited(req, MAX + 64 * 1024, "Plik PDF jest za duży (maks. 15 MB).");
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Nie wybrano pliku.", "no_file");
    const title = typeof form.get("title") === "string" ? String(form.get("title")) : "";
    const r = await addPdfReference(ctx, file, title);
    return NextResponse.json({ ok: true, note: r.note });
  } catch (error) {
    return apiError(error);
  }
}
