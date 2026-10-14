import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { brochureDesignSchema } from "@/core/brochures/model";
import { pdfToPngs, renderBrochureFor } from "@/lib/brochures";
import { apiError, assertSameOrigin } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/observability";

/** Live preview of an unsaved brochure: page images (or the PDF when pdftoppm is missing). */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await authorize("member");
    await rateLimit(`brochure:${ctx.userId}`, 60, 60, "Za dużo operacji renderowania w krótkim czasie. Odczekaj minutę.");
    const parsed = z.object({ design: brochureDesignSchema, title: z.string().max(200).default("Broszura") }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane broszury.", "bad_design");
    const r = await renderBrochureFor(ctx, parsed.data.design, parsed.data.title);
    const pngs = await pdfToPngs(r.pdf, { dpi: 72 });
    return NextResponse.json(
      { pages: pngs ? pngs.map((p) => `data:image/png;base64,${p.toString("base64")}`) : null, pdf: pngs ? null : `data:application/pdf;base64,${r.pdf.toString("base64")}`, count: r.pages, warnings: r.warnings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
