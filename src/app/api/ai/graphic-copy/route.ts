import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { FORMATS, SLIDE_KINDS, graphicDesignSchema, slotsFor } from "@/core/graphics/design";
import { generateGraphicCopy } from "@/core/marketing-engine/pipeline";
import { GOAL_IDS, type Platform } from "@/core/marketing-engine/taxonomy";
import { createEngine, guardAiUsage, loadBrandKit } from "@/lib/ai";
import { apiError, assertSameOrigin } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { propertyFactSheet, propertySkillTags } from "@/verticals/real-estate/property";
import { AUDIENCE_PRESETS } from "@/verticals/real-estate/content-types";

export const maxDuration = 300;

/** AI writes only the creative slots; fact slots stay exactly as in the data. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await authorize("editor");
    const parsed = z.object({ design: graphicDesignSchema, brief: z.string().trim().max(1000).default(""), goal: z.enum(GOAL_IDS).default("sales"), audience: z.string().max(40).default("") }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError("Nieprawidłowe dane.", "bad_request");
    const { design, brief, goal } = parsed.data;
    await guardAiUsage(ctx, "graphic_copy");
    const brand = await loadBrandKit(ctx);
    let facts = null;
    let propertyTags: string[] = [];
    if (design.propertyId) {
      const { data: p } = await ctx.supabase.from("properties").select("*").eq("id", design.propertyId).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (p) {
        facts = propertyFactSheet(p);
        propertyTags = propertySkillTags(p).tags;
      }
    }
    const slides = design.slides.map((s) => slotsFor(s.kind).filter((x) => x.source === "ai").map((x) => ({ key: x.key, label: `${SLIDE_KINDS[s.kind].label}: ${x.label}`, maxChars: x.maxChars })));
    const platform: Platform = "instagram";
    const audienceLabel = AUDIENCE_PRESETS[parsed.data.audience as keyof typeof AUDIENCE_PRESETS] ?? brand.targetAudience ?? "Osoby szukające nieruchomości";
    const res = await generateGraphicCopy(await createEngine(ctx, brand), { slides, facts, platform, goal, audienceLabel, brief, propertyTags, formatLabel: `${FORMATS[design.format].label} ${FORMATS[design.format].size}, ${design.slides.length} ${design.slides.length === 1 ? "slajd" : "slajdy"}` });
    return NextResponse.json({ slides: res.slides, caption: res.caption, warnings: res.warnings, gaps: res.gaps, skills: res.skills });
  } catch (error) {
    return apiError(error);
  }
}
