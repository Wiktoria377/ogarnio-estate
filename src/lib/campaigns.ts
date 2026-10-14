import "server-only";
import type { FactSheet } from "@/core/marketing-engine/facts";
import type { StoredBrief } from "@/core/marketing-engine/director";
import type { BrandKit } from "@/core/brand/model";
import { AppError } from "@/lib/errors";
import type { CampaignRow, PropertyRow } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import {
  CAMPAIGN_GOALS,
  CAMPAIGN_STYLES,
  campaignAudience,
  campaignFacts,
  campaignOptionsSchema,
  withCampaignFacts,
  type CampaignOptions,
} from "@/verticals/real-estate/campaign";
import { propertyFactSheet } from "@/verticals/real-estate/property";

export interface CampaignContext {
  campaign: CampaignRow;
  property: PropertyRow;
  options: CampaignOptions;
  facts: FactSheet;
  audience: { label: string; tags: string[] };
  goal: (typeof CAMPAIGN_GOALS)[keyof typeof CAMPAIGN_GOALS];
  style: (typeof CAMPAIGN_STYLES)[keyof typeof CAMPAIGN_STYLES];
  brief: StoredBrief | null;
}

/** Loads a campaign with everything generators need; always scoped to the workspace. */
export async function loadCampaignContext(ctx: WorkspaceContext, campaignId: string, brand: BrandKit): Promise<CampaignContext> {
  const { data: campaign } = await ctx.supabase.from("campaigns").select("*").eq("id", campaignId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!campaign) throw new AppError("Nie znaleziono kampanii.", "not_found", 404);
  if (!campaign.property_id) throw new AppError("Nieruchomość tej kampanii została usunięta.", "property_missing", 409);
  const { data: property } = await ctx.supabase.from("properties").select("*").eq("id", campaign.property_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!property) throw new AppError("Nieruchomość tej kampanii została usunięta.", "property_missing", 409);
  const { data: photos } = await ctx.supabase.from("property_photos").select("is_visualization").eq("property_id", property.id).eq("workspace_id", ctx.workspace.id);
  const options = campaignOptionsSchema.parse(campaign.options ?? {});
  return {
    campaign,
    property,
    options,
    facts: withCampaignFacts(propertyFactSheet(property, photos ?? []), campaignFacts(campaign.goal, options, property)),
    audience: campaignAudience(campaign.audience, brand.targetAudience),
    goal: CAMPAIGN_GOALS[campaign.goal],
    style: CAMPAIGN_STYLES[campaign.style],
    brief: (campaign.brief as unknown as StoredBrief | null) ?? null,
  };
}
