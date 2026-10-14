import { NextResponse, type NextRequest } from "next/server";
import { generateContent } from "@/core/marketing-engine/pipeline";
import { generationRequestSchema, type TextBody } from "@/core/marketing-engine/request";
import { createEngine, guardAiUsage, loadBrandKit } from "@/lib/ai";
import { addVersion, buildTaskInput, newVariantId } from "@/lib/content";
import { apiError, assertSameOrigin } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError, dbError } from "@/lib/errors";
import { PLATFORMS } from "@/core/marketing-engine/taxonomy";

export const maxDuration = 300;

/** Wizard → new library item with AI variants (each QA-checked). */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await authorize("editor");
    const parsed = generationRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError("Nieprawidłowe parametry generowania.", "bad_request");
    const request = parsed.data;
    await guardAiUsage(ctx, "generate");
    const brand = await loadBrandKit(ctx);
    const input = await buildTaskInput(ctx, request, brand);
    const engine = await createEngine(ctx, brand);
    const result = await generateContent(engine, input);

    const now = new Date().toISOString();
    const variants = result.variants.map((v) => ({ id: newVariantId(), variant: v.variant, quality: v.quality, createdAt: now, origin: "ai" as const }));
    const body: TextBody = { request, variants, selected: variants[0]!.id, gaps: result.gaps };
    const title = `${input.def.label}${input.facts ? ` · ${input.facts.subject}` : request.topic ? ` · ${request.topic.slice(0, 60)}` : ""}`.slice(0, 200);
    const { data: item, error } = await ctx.supabase
      .from("content_items")
      .insert({ workspace_id: ctx.workspace.id, property_id: request.propertyId, kind: "text", content_type: input.def.id, title, platform: PLATFORMS[request.platform].label, params: request, created_by: ctx.userId, updated_by: ctx.userId, current_version: 0 })
      .select("id")
      .single();
    if (error || !item) throw dbError(error, "Nie udało się zapisać materiału.");
    try {
      await addVersion(ctx, item.id, body, "ai_generate", { operation: "generate", skills: result.skills, quality: variants.map((v) => ({ id: v.id, score: v.quality.score })), model: result.model });
    } catch (e) {
      await ctx.supabase.from("content_items").delete().eq("id", item.id);
      throw e;
    }
    return NextResponse.json({ id: item.id });
  } catch (error) {
    return apiError(error);
  }
}
