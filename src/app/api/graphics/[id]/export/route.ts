import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { graphicDesignSchema } from "@/core/graphics/design";
import { renderPdf, renderSlidePng, renderSlideRaster, renderZipAs } from "@/core/graphics/render";
import { loadBrandKit } from "@/lib/ai";
import { loadRenderInput } from "@/lib/graphics";
import { loadCurrentBody } from "@/lib/content";
import { logExport } from "@/lib/exports";
import { apiError } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import { rateLimit } from "@/lib/observability";
import { consumeUsage, monthKey } from "@/lib/billing/usage";

const MIME = { png: "image/png", jpg: "image/jpeg", pdf: "application/pdf", zip: "application/zip" } as const;

const querySchema = z.object({
  thumb: z.literal("1").optional(),
  /** png|jpg: one slide (?slide=N); pdf: all slides as pages; zip: all slides (?as=png|jpg). */
  format: z.enum(["png", "jpg", "pdf", "zip"]).optional(),
  as: z.enum(["png", "jpg"]).default("png"),
  slide: z.coerce.number().int().min(0).max(9).default(0),
  /** Legacy: ?all=1 → ZIP of PNGs. */
  all: z.literal("1").optional(),
});

/** Full-resolution export of the SAVED design; every download is logged in export history. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authorize("member");
    await rateLimit(`export:${ctx.userId}`, 120, 60, "Za dużo operacji renderowania w krótkim czasie. Odczekaj minutę.");
    const { id } = await params;
    const q = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!q.success) throw new AppError("Nieprawidłowe parametry eksportu.", "bad_request");
    const { item, body } = await loadCurrentBody<unknown>(ctx, id);
    if (item.kind !== "graphic") throw new AppError("To nie jest grafika.", "bad_kind");
    const design = graphicDesignSchema.parse(body);
    const input = await loadRenderInput(ctx, design, await loadBrandKit(ctx));
    const base = slugify(item.title) || "grafika";
    if (q.data.thumb) {
      const { png } = await renderSlidePng(input, Math.min(design.slides.length - 1, q.data.slide), 400);
      return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=30" } });
    }
    const format = q.data.format ?? (q.data.all ? "zip" : "png");
    // Plan limit: one export per material version and format per month (re-downloads are free).
    const variant = format === "zip" ? q.data.as : format === "pdf" ? "all" : String(q.data.slide);
    await consumeUsage(ctx, "graphic_export", { key: `export:${item.id}:v${item.current_version}:${format}:${variant}:${monthKey()}`, refType: "content_item", refId: item.id });
    let data: Buffer;
    let name: string;
    if (format === "zip") {
      data = await renderZipAs(input, base, q.data.as);
      name = `${base}.zip`;
    } else if (format === "pdf") {
      data = await renderPdf(input, item.title);
      name = `${base}.pdf`;
    } else {
      const slide = Math.min(design.slides.length - 1, q.data.slide);
      data = (await renderSlideRaster(input, slide, format)).data;
      name = design.slides.length > 1 ? `${base}-${String(slide + 1).padStart(2, "0")}.${format}` : `${base}.${format}`;
    }
    await logExport(ctx, { itemId: item.id, format, version: item.current_version, size: data.length });
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": MIME[format], "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
