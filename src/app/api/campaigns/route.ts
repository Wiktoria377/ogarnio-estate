import { assertActivePlan } from "@/lib/billing/usage";
import { NextResponse, type NextRequest } from "next/server";
import { DIRECTOR_VERSION } from "@/core/marketing-engine/director";
import { getQuota } from "@/lib/ai";
import { apiError, assertSameOrigin } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError, dbError } from "@/lib/errors";
import { assertWorkerAvailable, enqueueJobs, getRenderQuota, type NewJob } from "@/lib/jobs/queue";
import type { Json } from "@/lib/supabase/database.types";
import { aiAvailability } from "@/lib/env";
import {
  DELIVERABLES,
  DELIVERABLE_ORDER,
  campaignInputSchema,
  estimateAiOperations,
  goalDataProblems,
} from "@/verticals/real-estate/campaign";

/** Creates a campaign and queues its brief and materials (generated in the background). */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await authorize("editor");
    const parsed = campaignInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Nieprawidłowe parametry kampanii.", "bad_request");
    const input = parsed.data;
    if (aiAvailability().mode === "unconfigured") throw new AppError("Generowanie AI nie jest skonfigurowane. Administrator musi ustawić ANTHROPIC_API_KEY na serwerze.", "not_configured", 503);
    assertWorkerAvailable();

    const { data: property } = await ctx.supabase.from("properties").select("*").eq("id", input.propertyId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!property) throw new AppError("Nie znaleziono nieruchomości.", "not_found", 404);
    const problems = goalDataProblems(input.goal, input.options, property);
    if (problems.length) throw new AppError(problems[0]!, "goal_data");

    const { count: photoCount } = await ctx.supabase.from("property_photos").select("id", { count: "exact", head: true }).eq("property_id", property.id).eq("workspace_id", ctx.workspace.id);
    const photos = photoCount ?? 0;
    const visual = input.deliverables.filter((d) => ["graphic", "video", "document"].includes(DELIVERABLES[d].kind));
    if (visual.length && photos === 0) throw new AppError("Ta oferta nie ma zdjęć. Dodaj zdjęcia, aby przygotować grafiki, wideo lub broszurę (aplikacja używa tylko prawdziwych zdjęć oferty).", "no_photos");
    if (input.deliverables.includes("reel") && photos < 3) throw new AppError("Do Reels potrzebne są co najmniej 3 zdjęcia oferty.", "few_photos");

    await assertActivePlan(ctx);
    // Cost control: the whole campaign must fit in the remaining monthly quota.
    const needed = estimateAiOperations(input.deliverables);
    const quota = await getQuota(ctx);
    if (quota.used + needed > quota.limit) throw new AppError(`Kampania potrzebuje ${needed} generowań AI, a w tym miesiącu zostało ${Math.max(0, quota.limit - quota.used)} z ${quota.limit}. Wybierz mniej materiałów lub poczekaj na odnowienie limitu.`, "quota", 402);
    if (input.deliverables.includes("reel")) {
      const rq = await getRenderQuota(ctx);
      if (rq.used >= rq.limit) throw new AppError(`Wykorzystano miesięczny limit renderowania wideo (${rq.limit}). Usuń „Reels” z listy materiałów lub poczekaj na odnowienie limitu.`, "render_quota", 402);
    }

    const { data: campaign, error } = await ctx.supabase
      .from("campaigns")
      .insert({
        workspace_id: ctx.workspace.id,
        property_id: property.id,
        name: input.name,
        goal: input.goal,
        audience: input.audience,
        style: input.style,
        platforms: input.platforms,
        deliverables: input.deliverables,
        options: input.options as unknown as Json,
        status: "active",
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error || !campaign) throw dbError(error, "Nie udało się utworzyć kampanii.");

    const ordered = DELIVERABLE_ORDER.filter((d) => input.deliverables.includes(d));
    const soon = new Date(Date.now() + 1500);
    const jobs: NewJob[] = [
      { kind: "campaign_brief", label: "Brief kampanii (AI Marketing Director)", campaignId: campaign.id, dedupeKey: `campaign:${campaign.id}:brief`, instructionsVersion: DIRECTOR_VERSION },
      ...ordered.map((d) => ({ kind: "campaign_asset" as const, label: DELIVERABLES[d].label, campaignId: campaign.id, deliverable: d, dedupeKey: `campaign:${campaign.id}:${d}`, instructionsVersion: DIRECTOR_VERSION, runAfter: soon })),
    ];
    try {
      await enqueueJobs(ctx, jobs);
    } catch (e) {
      await ctx.supabase.from("campaigns").delete().eq("id", campaign.id).eq("workspace_id", ctx.workspace.id);
      throw e;
    }
    return NextResponse.json({ id: campaign.id });
  } catch (error) {
    return apiError(error);
  }
}
