import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { FORMAT_IDS, TEMPLATE_IDS, defaultSlides, graphicDesignSchema, savedTemplateSchema, slidesFromSaved } from "@/core/graphics/design";
import { renderSlideSvg } from "@/core/graphics/templates";
import { svgToPng } from "@/core/graphics/render";
import { loadBrandKit } from "@/lib/ai";
import { loadRenderInput } from "@/lib/graphics";
import { apiError } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { applyFactTexts, factTexts } from "@/verticals/real-estate/graphics";
import { rateLimit } from "@/lib/observability";

/** Small template thumbnail with the office's brand and (optionally) a property. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await authorize("member");
    await rateLimit(`preview:${ctx.userId}`, 240, 60, "Za dużo operacji renderowania w krótkim czasie. Odczekaj minutę.");
    const q = z.object({ template: z.enum(TEMPLATE_IDS), format: z.enum(FORMAT_IDS), property: z.uuid().optional(), saved: z.uuid().optional() }).safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!q.success) throw new AppError("Nieprawidłowe parametry.", "bad_request");
    const brand = await loadBrandKit(ctx);
    let property = null;
    let photoIds: string[] = [];
    if (q.data.property) {
      const { data } = await ctx.supabase.from("properties").select("*").eq("id", q.data.property).eq("workspace_id", ctx.workspace.id).maybeSingle();
      property = data;
      const { data: ph } = await ctx.supabase.from("property_photos").select("id").eq("property_id", q.data.property).order("position").limit(3);
      photoIds = (ph ?? []).map((p) => p.id);
    }
    const facts = factTexts(property, brand);
    let look = {};
    let base = defaultSlides(q.data.format, photoIds);
    if (q.data.saved) {
      const { data: row } = await ctx.supabase.from("design_templates").select("design").eq("id", q.data.saved).eq("workspace_id", ctx.workspace.id).maybeSingle();
      const t = row ? savedTemplateSchema.safeParse(row.design) : null;
      if (!t?.success) throw new AppError("Nie znaleziono szablonu biura.", "not_found", 404);
      const { slides: _s, ...rest } = t.data;
      look = rest;
      base = slidesFromSaved(t.data, photoIds);
    }
    const slides = applyFactTexts(base.slice(0, 1), facts).map((s) => ({ ...s, texts: { title: property?.title ?? "Nagłówek Twojej oferty", ...(property ? {} : { details: "Metraż · pokoje · piętro", price: "Cena oferty" }), ...s.texts } }));
    const design = graphicDesignSchema.parse({ format: q.data.format, template: q.data.template, ...look, propertyId: property?.id ?? null, slides });
    const r = await renderSlideSvg(await loadRenderInput(ctx, design, brand), 0);
    return new NextResponse(new Uint8Array(svgToPng(r.svg, 360)), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    return apiError(error);
  }
}
