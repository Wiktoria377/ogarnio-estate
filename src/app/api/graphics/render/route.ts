import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { graphicDesignSchema } from "@/core/graphics/design";
import { renderSlideSvg } from "@/core/graphics/templates";
import { svgToPng } from "@/core/graphics/render";
import { loadBrandKit } from "@/lib/ai";
import { loadRenderInput } from "@/lib/graphics";
import { apiError, assertSameOrigin } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/observability";

/**
 * Live preview of one slide from an unsaved design.
 * mode "png" (default): PNG + X-Render-Warnings header (thumbnails).
 * mode "json": { image (data URL), layout, warnings, width, height } for the
 * on-canvas editor, which draws selectable boxes over the image.
 */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await authorize("member");
    await rateLimit(`render:${ctx.userId}`, 120, 60, "Za dużo operacji renderowania w krótkim czasie. Odczekaj minutę.");
    const parsed = z
      .object({ design: graphicDesignSchema, slide: z.number().int().min(0).max(9), width: z.number().int().min(200).max(1080).default(720), mode: z.enum(["png", "json"]).default("png") })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError("Nieprawidłowy projekt grafiki.", "bad_design");
    const { design, slide, width, mode } = parsed.data;
    if (slide >= design.slides.length) throw new AppError("Nie ma takiego slajdu.", "bad_slide");
    const input = await loadRenderInput(ctx, design, await loadBrandKit(ctx));
    const r = await renderSlideSvg(input, slide);
    const png = svgToPng(r.svg, width);
    if (mode === "json") {
      return NextResponse.json(
        { image: `data:image/png;base64,${png.toString("base64")}`, layout: r.layout, warnings: r.warnings, width: r.width, height: r.height },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return new NextResponse(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Render-Warnings": encodeURIComponent(JSON.stringify(r.warnings)) },
    });
  } catch (error) {
    return apiError(error);
  }
}
