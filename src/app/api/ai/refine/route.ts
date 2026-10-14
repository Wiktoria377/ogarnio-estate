import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { refineContent } from "@/core/marketing-engine/pipeline";
import { refineRequestSchema, type TextBody } from "@/core/marketing-engine/request";
import { REFINE_OPERATIONS } from "@/core/marketing-engine/prompt";
import { createEngine, guardAiUsage, loadBrandKit } from "@/lib/ai";
import { addVersion, buildTaskInput, loadCurrentBody } from "@/lib/content";
import { apiError, assertSameOrigin } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError } from "@/lib/errors";

export const maxDuration = 300;

/** AI edit of one variant (headline, shorten, tone…). Saved as a new version. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await authorize("editor");
    const parsed = z.object({ itemId: z.uuid(), variantId: z.string().max(40), refine: refineRequestSchema }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError("Nieprawidłowe dane.", "bad_request");
    const { itemId, variantId, refine } = parsed.data;
    if (refine.operation === "custom" && !refine.instruction) throw new AppError("Wpisz, co zmienić.", "bad_request");
    const { body } = await loadCurrentBody<TextBody>(ctx, itemId);
    const target = body.variants.find((v) => v.id === variantId);
    if (!target) throw new AppError("Nie znaleziono wariantu.", "not_found", 404);
    await guardAiUsage(ctx, "refine");
    const brand = await loadBrandKit(ctx);
    const input = await buildTaskInput(ctx, body.request, brand);
    const res = await refineContent(await createEngine(ctx, brand), input, target.variant, refine);
    const next: TextBody = {
      ...body,
      variants: body.variants.map((v) => (v.id === variantId ? { ...v, variant: res.variant, quality: res.quality, origin: "refine" as const, changeSummary: res.changeSummary, createdAt: new Date().toISOString() } : v)),
      selected: variantId,
    };
    await addVersion(ctx, itemId, next, "ai_refine", { operation: REFINE_OPERATIONS[refine.operation], skills: res.skills, model: res.model });
    return NextResponse.json({ ok: true, changeSummary: res.changeSummary });
  } catch (error) {
    return apiError(error);
  }
}
