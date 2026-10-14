import { NextResponse } from "next/server";
import { brochureDesignSchema } from "@/core/brochures/model";
import { pdfToPngs, renderBrochureFor } from "@/lib/brochures";
import { loadCurrentBody } from "@/lib/content";
import { apiError } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/observability";

/** First page as PNG (library and campaign previews). 404 when pdftoppm is not installed. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authorize("member");
    await rateLimit(`thumb:${ctx.userId}`, 240, 60, "Za dużo operacji renderowania w krótkim czasie. Odczekaj minutę.");
    const { id } = await params;
    const { item, body } = await loadCurrentBody<unknown>(ctx, id);
    if (item.kind !== "document") throw new AppError("To nie jest broszura.", "bad_kind");
    const design = brochureDesignSchema.parse(body);
    const r = await renderBrochureFor(ctx, design, item.title);
    const pngs = await pdfToPngs(r.pdf, { dpi: 50, first: 1, last: 1 });
    if (!pngs?.[0]) throw new AppError("Podgląd niedostępny na tym serwerze (brak pdftoppm).", "no_preview", 404);
    return new NextResponse(new Uint8Array(pngs[0]), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    return apiError(error);
  }
}
