"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DIRECTOR_VERSION } from "@/core/marketing-engine/director";
import { getQuota } from "@/lib/ai";
import { authorize } from "@/lib/session";
import { AppError, dbError, toActionError, type ActionResult } from "@/lib/errors";
import { enqueueJobs } from "@/lib/jobs/queue";
import { DELIVERABLES, DELIVERABLE_IDS } from "@/verticals/real-estate/campaign";

const id = z.uuid();

async function ownCampaign(campaignId: string) {
  const ctx = await authorize("editor");
  if (!id.safeParse(campaignId).success) throw new AppError("Nie znaleziono kampanii.", "not_found", 404);
  const { data } = await ctx.supabase.from("campaigns").select("id, name, deliverables").eq("id", campaignId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) throw new AppError("Nie znaleziono kampanii.", "not_found", 404);
  return { ctx, campaign: data };
}

export async function renameCampaign(campaignId: string, name: string): Promise<ActionResult> {
  try {
    const { ctx } = await ownCampaign(campaignId);
    const n = z.string().trim().min(2).max(160).safeParse(name);
    if (!n.success) return { ok: false, error: "Nazwa kampanii: od 2 do 160 znaków." };
    const { error } = await ctx.supabase.from("campaigns").update({ name: n.data, updated_by: ctx.userId }).eq("id", campaignId).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: undefined, message: "Zmieniono nazwę" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setCampaignStatus(campaignId: string, status: "active" | "archived"): Promise<ActionResult> {
  try {
    const { ctx } = await ownCampaign(campaignId);
    const { error } = await ctx.supabase.from("campaigns").update({ status, updated_by: ctx.userId }).eq("id", campaignId).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error);
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: undefined, message: status === "archived" ? "Kampania w archiwum" : "Kampania przywrócona" };
  } catch (e) {
    return toActionError(e);
  }
}

/** Regenerates one deliverable (new version of the same material) or the brief. */
export async function regenerateDeliverable(campaignId: string, deliverable: string): Promise<ActionResult> {
  try {
    const { ctx, campaign } = await ownCampaign(campaignId);
    const isBrief = deliverable === "brief";
    if (!isBrief && (!z.enum(DELIVERABLE_IDS).safeParse(deliverable).success || !campaign.deliverables.includes(deliverable))) return { ok: false, error: "Ten materiał nie należy do kampanii." };
    const quota = await getQuota(ctx);
    if (quota.used >= quota.limit) return { ok: false, error: `Wykorzystano miesięczny limit generowań (${quota.limit}).` };
    await enqueueJobs(ctx, [
      isBrief
        ? { kind: "campaign_brief", label: "Brief kampanii (ponownie)", campaignId, dedupeKey: `campaign:${campaignId}:brief`, instructionsVersion: DIRECTOR_VERSION }
        : { kind: "campaign_asset", label: `${DELIVERABLES[deliverable as keyof typeof DELIVERABLES].label} (nowa wersja)`, campaignId, deliverable, dedupeKey: `campaign:${campaignId}:${deliverable}`, instructionsVersion: DIRECTOR_VERSION },
    ]);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: undefined, message: "Dodano do kolejki" };
  } catch (e) {
    return toActionError(e);
  }
}

/** Deletes the campaign. Its materials stay in the library (unlinked). */
export async function deleteCampaign(campaignId: string): Promise<ActionResult> {
  try {
    const { ctx } = await ownCampaign(campaignId);
    // The generated publication plan belongs to the campaign; manual planner entries stay (unlinked).
    await ctx.supabase.from("schedule_plans").delete().eq("campaign_id", campaignId).eq("workspace_id", ctx.workspace.id);
    const { error } = await ctx.supabase.from("campaigns").delete().eq("id", campaignId).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error, "Nie udało się usunąć kampanii.");
    revalidatePath("/campaigns");
  } catch (e) {
    return toActionError(e);
  }
  redirect("/campaigns");
}
