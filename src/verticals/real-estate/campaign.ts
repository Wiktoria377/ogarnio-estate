import { z } from "zod";
import type { Fact, FactSheet } from "@/core/marketing-engine/facts";
import type { CtaType, Goal, Platform, ToneOverride } from "@/core/marketing-engine/taxonomy";
import type { CampaignGoal, CampaignStyle, PropertyRow } from "@/lib/supabase/database.types";
import { formatPrice } from "@/lib/utils";
import { AUDIENCE_PRESETS, AUDIENCE_TAGS, type AudiencePreset } from "./content-types";

/**
 * Campaign Studio vocabulary: one property → a coordinated set of materials.
 * Each campaign goal maps onto the engine's generic goals and skill tags, so
 * the AI Marketing Director and every deliverable pick matching skills.
 */
export const CAMPAIGN_GOALS: Record<
  CampaignGoal,
  { label: string; description: string; engineGoal: Goal; cta: CtaType; tags: string[] }
> = {
  buyers: {
    label: "Pozyskanie kupujących",
    description: "Zapytania i prezentacje od osób realnie zainteresowanych tą ofertą.",
    engineGoal: "leads",
    cta: "viewing",
    tags: ["campaign-goal-buyers", "lead-generation"],
  },
  new_listing: {
    label: "Promocja nowej oferty",
    description: "Pierwsze wejście oferty na rynek: zasięg i szybkie zapytania.",
    engineGoal: "sales",
    cta: "viewing",
    tags: ["campaign-goal-new-listing"],
  },
  price_drop: {
    label: "Promocja obniżki ceny",
    description: "Komunikat o nowej, niższej cenie. Wymaga podania poprzedniej ceny.",
    engineGoal: "sales",
    cta: "message",
    tags: ["campaign-goal-price-drop"],
  },
  premium: {
    label: "Sprzedaż nieruchomości premium",
    description: "Powściągliwa, ekskluzywna komunikacja dla wymagających klientów.",
    engineGoal: "sales",
    cta: "viewing",
    tags: ["campaign-goal-premium", "premium"],
  },
  open_house: {
    label: "Promocja dnia otwartego",
    description: "Zaproszenie na dzień otwarty w konkretnym terminie. Wymaga daty i godzin.",
    engineGoal: "leads",
    cta: "viewing",
    tags: ["campaign-goal-open-house"],
  },
  agent_brand: {
    label: "Budowanie rozpoznawalności agenta",
    description: "Oferta jako dowód kompetencji agenta i biura.",
    engineGoal: "trust",
    cta: "message",
    tags: ["campaign-goal-agent-brand", "trust"],
  },
};
export const CAMPAIGN_GOAL_IDS = Object.keys(CAMPAIGN_GOALS) as [CampaignGoal, ...CampaignGoal[]];

export const CAMPAIGN_STYLES: Record<CampaignStyle, { label: string; hint: string; tone: ToneOverride }> = {
  brand: { label: "Zgodnie z marką", hint: "Głos i styl z Brand Studio", tone: "brand" },
  premium: { label: "Premium i powściągliwie", hint: "Mniej słów, więcej przestrzeni, bez wykrzykników", tone: "more_premium" },
  warm: { label: "Ciepło i lifestyle'owo", hint: "Codzienność w tym miejscu, emocje oparte na faktach", tone: "warmer" },
  expert: { label: "Ekspercko", hint: "Konkret, parametry, argumenty", tone: "more_expert" },
  direct: { label: "Bezpośrednio", hint: "Krótko, prosto, wyraźne CTA", tone: "more_direct" },
  energetic: { label: "Dynamicznie", hint: "Szybki rytm, mocne hooki, social-first", tone: "lighter" },
};
export const CAMPAIGN_STYLE_IDS = Object.keys(CAMPAIGN_STYLES) as [CampaignStyle, ...CampaignStyle[]];

export const CAMPAIGN_PLATFORMS = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  meta_ads: "Meta Ads",
} as const satisfies Partial<Record<Platform, string>>;
export type CampaignPlatform = keyof typeof CAMPAIGN_PLATFORMS;
export const CAMPAIGN_PLATFORM_IDS = Object.keys(CAMPAIGN_PLATFORMS) as [CampaignPlatform, ...CampaignPlatform[]];

export type DeliverableDef =
  | { kind: "text"; label: string; contentType: string; platform: Platform; hint: string; ai: true }
  | { kind: "graphic"; label: string; format: "carousel" | "stories"; slides: number; hint: string; ai: true }
  | { kind: "video"; label: string; hint: string; ai: true }
  | { kind: "document"; label: string; hint: string; ai: true }
  | { kind: "schedule"; label: string; hint: string; ai: false };

/** What a campaign can produce. Text deliverables reuse the studio's content types. */
export const DELIVERABLES = {
  ig_post: { kind: "text", label: "Post na Instagram", contentType: "property_sales_post", platform: "instagram", hint: "Opis posta z hookiem, CTA i hashtagami", ai: true },
  fb_post: { kind: "text", label: "Post na Facebook", contentType: "property_sales_post", platform: "facebook", hint: "Dłuższy opis z parametrami i CTA", ai: true },
  carousel: { kind: "graphic", label: "Karuzela (6 slajdów)", format: "carousel", slides: 6, hint: "Okładka, zdjęcia, atuty, parametry, CTA; edytowalna", ai: true },
  stories: { kind: "graphic", label: "3 Stories", format: "stories", slides: 3, hint: "Seria 1080 × 1920 z ceną i kontaktem", ai: true },
  reel: { kind: "video", label: "Reels pionowy (MP4)", hint: "Scenariusz z AI, akceptacja, render 1080 × 1920", ai: true },
  reel_caption: { kind: "text", label: "Opis do wideo", contentType: "property_reels_caption", platform: "instagram", hint: "Opis pod Reels / TikTok", ai: true },
  ad_headlines: { kind: "text", label: "Nagłówki reklamowe", contentType: "property_ad_headlines", platform: "meta_ads", hint: "Warianty nagłówków do testów", ai: true },
  meta_ads: { kind: "text", label: "Teksty Meta Ads", contentType: "property_meta_ad", platform: "meta_ads", hint: "Tekst główny, nagłówek, opis", ai: true },
  brochure: { kind: "document", label: "Broszura PDF", hint: "Karta oferty z danymi, zdjęciami i kontaktem", ai: true },
  schedule: { kind: "schedule", label: "Harmonogram publikacji", hint: "Wpisy w planerze dla materiałów kampanii", ai: false },
} as const satisfies Record<string, DeliverableDef>;
export type DeliverableId = keyof typeof DELIVERABLES;
export const DELIVERABLE_IDS = Object.keys(DELIVERABLES) as [DeliverableId, ...DeliverableId[]];

/** Deliverables processed in this order; the schedule comes last (it links the others). */
export const DELIVERABLE_ORDER: DeliverableId[] = ["ig_post", "fb_post", "carousel", "stories", "reel_caption", "ad_headlines", "meta_ads", "reel", "brochure", "schedule"];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const campaignOptionsSchema = z.object({
  previousPrice: z.number().positive().max(1e11).nullable().default(null),
  openHouseDate: isoDate.nullable().default(null),
  openHouseFrom: hhmm.nullable().default(null),
  openHouseTo: hhmm.nullable().default(null),
  notes: z.string().trim().max(1000).default(""),
  startDate: isoDate.nullable().default(null),
});
export type CampaignOptions = z.infer<typeof campaignOptionsSchema>;

export const campaignInputSchema = z
  .object({
    propertyId: z.uuid(),
    name: z.string().trim().min(2).max(160),
    goal: z.enum(CAMPAIGN_GOAL_IDS),
    audience: z.string().trim().min(1).max(300),
    style: z.enum(CAMPAIGN_STYLE_IDS),
    platforms: z.array(z.enum(CAMPAIGN_PLATFORM_IDS)).min(1).max(5),
    deliverables: z.array(z.enum(DELIVERABLE_IDS)).min(1).max(DELIVERABLE_IDS.length),
    options: campaignOptionsSchema,
  })
  .superRefine((v, ctx) => {
    if (v.goal === "price_drop" && !v.options.previousPrice) ctx.addIssue({ code: "custom", path: ["options", "previousPrice"], message: "Podaj poprzednią cenę, aby komunikować obniżkę." });
    if (v.goal === "open_house" && (!v.options.openHouseDate || !v.options.openHouseFrom || !v.options.openHouseTo))
      ctx.addIssue({ code: "custom", path: ["options", "openHouseDate"], message: "Podaj datę i godziny dnia otwartego." });
    if (new Set(v.deliverables).size !== v.deliverables.length) ctx.addIssue({ code: "custom", path: ["deliverables"], message: "Powtórzone materiały." });
  });
export type CampaignInput = z.infer<typeof campaignInputSchema>;

/** Audience label and skill tags from a preset id or free text. */
export function campaignAudience(audience: string, brandAudience: string | null): { label: string; tags: string[] } {
  if (audience in AUDIENCE_PRESETS) {
    const preset = audience as AudiencePreset;
    return { label: preset === "brand" ? brandAudience || AUDIENCE_PRESETS.brand : AUDIENCE_PRESETS[preset], tags: AUDIENCE_TAGS[preset] ?? [] };
  }
  return { label: audience, tags: [] };
}

function formatDatePl(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Campaign-specific facts (previous price, open-house date). They come from the
 * user's form, are added to the property fact sheet and become allowed numbers.
 */
export function campaignFacts(goal: CampaignGoal, options: CampaignOptions, property: PropertyRow): Fact[] {
  const facts: Fact[] = [];
  if (goal === "price_drop" && options.previousPrice) {
    facts.push({ key: "previous_price", label: "Poprzednia cena", value: formatPrice(options.previousPrice, property.currency) ?? "", unit: "price", numbers: [options.previousPrice, Math.round(options.previousPrice / 1000), Number((options.previousPrice / 1_000_000).toFixed(2))] });
    if (property.price != null && property.price < options.previousPrice) {
      const diff = options.previousPrice - property.price;
      facts.push({ key: "price_drop", label: "Obniżka ceny", value: formatPrice(diff, property.currency) ?? "", unit: "price", numbers: [diff, Math.round(diff / 1000)] });
    }
  }
  if (goal === "open_house" && options.openHouseDate && options.openHouseFrom && options.openHouseTo) {
    const [y, m, d] = options.openHouseDate.split("-").map(Number);
    const hours = [options.openHouseFrom, options.openHouseTo].flatMap((t) => t.split(":").map(Number));
    facts.push({ key: "open_house", label: "Dzień otwarty", value: `${formatDatePl(options.openHouseDate)}, ${options.openHouseFrom}–${options.openHouseTo}`, unit: "text", numbers: [y!, m!, d!, ...hours] });
  }
  return facts;
}

export function withCampaignFacts(sheet: FactSheet, extra: Fact[]): FactSheet {
  return extra.length ? { ...sheet, facts: [...sheet.facts, ...extra] } : sheet;
}

/** Problems that make a goal impossible to communicate honestly with the given data. */
export function goalDataProblems(goal: CampaignGoal, options: CampaignOptions, property: PropertyRow): string[] {
  const out: string[] = [];
  if (goal === "price_drop") {
    if (property.price == null) out.push("Oferta nie ma ceny, więc nie można komunikować obniżki.");
    else if (options.previousPrice != null && options.previousPrice <= property.price) out.push("Poprzednia cena musi być wyższa od obecnej ceny oferty.");
  }
  if (goal === "open_house" && options.openHouseDate && options.openHouseFrom && options.openHouseTo && options.openHouseFrom >= options.openHouseTo)
    out.push("Godzina zakończenia dnia otwartego musi być późniejsza niż rozpoczęcia.");
  return out;
}

/** Estimated billable AI operations for a campaign (shown before starting). */
export function estimateAiOperations(deliverables: DeliverableId[]): number {
  return 1 + deliverables.filter((d) => DELIVERABLES[d].ai).length;
}
