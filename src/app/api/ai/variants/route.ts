import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateContent } from "@/core/marketing-engine/pipeline";
import type { TextBody } from "@/core/marketing-engine/request";
import { createEngine, guardAiUsage, loadBrandKit } from "@/lib/ai";
import { addVersion, buildTaskInput, loadCurrentBody, newVariantId } from "@/lib/content";
import { apiError, assertSameOrigin } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError } from "@/lib/errors";

export const maxDuration = 300;
const MAX_VARIANTS = 12;

/** Adds new variants to a material; previous variants are kept. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await authorize("editor");
    const parsed = z.object({ itemId: z.uuid(), count: z.number().int().min(1).max(3).default(2) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError("Nieprawidłowe dane.", "bad_request");
    const { body } = await loadCurrentBody<TextBody>(ctx, parsed.data.itemId);
    if (body.variants.length >= MAX_VARIANTS) throw new AppError(`Materiał ma już ${MAX_VARIANTS} wariantów. Usuń niepotrzebne lub zduplikuj materiał.`, "limit", 409);
    await guardAiUsage(ctx, "generate");
    const brand = await loadBrandKit(ctx);
    const request = { ...body.request, variants: Math.min(parsed.data.count, MAX_VARIANTS - body.variants.length) };
    const input = await buildTaskInput(ctx, request, brand);
    const result = await generateContent(await createEngine(ctx, brand), input, body.variants.map((v) => v.variant));
    const now = new Date().toISOString();
    const added = result.variants.map((v) => ({ id: newVariantId(), variant: v.variant, quality: v.quality, createdAt: now, origin: "ai" as const }));
    const next: TextBody = { ...body, variants: [...body.variants, ...added], selected: added[0]!.id, gaps: [...new Set([...body.gaps, ...result.gaps])] };
    await addVersion(ctx, parsed.data.itemId, next, "ai_generate", { operation: "more_variants", skills: result.skills, model: result.model });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
