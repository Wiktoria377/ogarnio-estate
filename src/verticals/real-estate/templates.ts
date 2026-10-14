import type { BrandStyle } from "@/core/brand/model";
import type { FormatId, TemplateId } from "@/core/graphics/design";
import type { CampaignGoal, CampaignStyle } from "@/lib/supabase/database.types";

/**
 * Automatic template choice for campaign graphics: campaign style first, then
 * the office's brand style, then the goal. The user can switch templates in the
 * editor at any time (the design keeps texts and photos).
 */
export function pickTemplate(o: { campaignStyle: CampaignStyle; brandStyle: BrandStyle; goal: CampaignGoal; format: FormatId; photoCount: number }): TemplateId {
  const story = o.format === "story" || o.format === "stories";
  // Goal-driven compositions first: the layout should carry the campaign's message.
  if (o.goal === "price_drop") return story ? "split" : "pricetag";
  if (o.goal === "premium" || o.campaignStyle === "premium") return o.brandStyle === "modern_minimal" ? "noir" : story ? "noir" : "arch";
  if (o.goal === "open_house") return o.photoCount >= 3 && !story ? "collage" : "frame";
  if (o.goal === "agent_brand") return "magazine";
  switch (o.campaignStyle) {
    case "energetic":
      return "split";
    case "expert":
      return o.format === "carousel" ? "corporate" : "editorial";
    case "warm":
      return o.photoCount >= 3 && !story ? "collage" : "frame";
    case "direct":
      return "minimal";
  }
  const byBrand: Record<BrandStyle, TemplateId> = {
    luxury: "arch",
    modern_minimal: o.photoCount >= 2 ? "lines" : "gallery",
    elegant_corporate: "corporate",
    warm_lifestyle: "frame",
    bold_contemporary: "split",
  };
  return byBrand[o.brandStyle];
}
