import { NextResponse, type NextRequest } from "next/server";
import { brochureDesignSchema } from "@/core/brochures/model";
import { renderBrochureFor } from "@/lib/brochures";
import { loadCurrentBody } from "@/lib/content";
import { logExport } from "@/lib/exports";
import { apiError } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import { rateLimit } from "@/lib/observability";
import { consumeUsage, monthKey } from "@/lib/billing/usage";

/** The SAVED brochure as PDF, rendered from current property data. ?download=1 → attachment (logged). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authorize("member");
    await rateLimit(`brochure_dl:${ctx.userId}`, 120, 60, "Za dużo operacji renderowania w krótkim czasie. Odczekaj minutę.");
    const { id } = await params;
    const { item, body } = await loadCurrentBody<unknown>(ctx, id);
    if (item.kind !== "document") throw new AppError("To nie jest broszura.", "bad_kind");
    const parsed = brochureDesignSchema.safeParse(body);
    if (!parsed.success) throw new AppError("Broszura zawiera nieprawidłowe dane. Otwórz ją w edytorze i zapisz ponownie.", "bad_design");
    const download = req.nextUrl.searchParams.get("download") === "1";
    if (download) await consumeUsage(ctx, "graphic_export", { key: `export:${item.id}:v${item.current_version}:pdf:brochure:${monthKey()}`, refType: "content_item", refId: item.id });
    const r = await renderBrochureFor(ctx, parsed.data, item.title);
    const name = `${slugify(item.title) || "broszura"}.pdf`;
    if (download) await logExport(ctx, { itemId: item.id, format: "pdf", version: item.current_version, size: r.pdf.length });
    return new NextResponse(new Uint8Array(r.pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`, "Cache-Control": "no-store", "X-Pages": String(r.pages) },
    });
  } catch (error) {
    return apiError(error);
  }
}
