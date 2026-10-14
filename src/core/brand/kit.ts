import type { BrandProfileRow, BrandAssetRow } from "@/lib/supabase/database.types";
import { parseColors, type BrandKit } from "./model";
import { parseExtended } from "./profile";

export function toBrandKit(row: BrandProfileRow, logo: Pick<BrandAssetRow, "storage_path"> | null): BrandKit {
  const socials = (row.socials ?? {}) as Record<string, string | null>;
  return {
    companyName: row.company_name,
    tagline: row.tagline,
    colors: parseColors(row.colors),
    headingFont: row.heading_font,
    bodyFont: row.body_font,
    contact: { email: row.contact_email, phone: row.contact_phone, address: row.address, website: row.website },
    socials: Object.fromEntries(Object.entries(socials).filter(([, v]) => typeof v === "string" && v)) as BrandKit["socials"],
    style: row.brand_style,
    personality: row.personality,
    targetAudience: row.target_audience,
    communicationStyle: row.communication_style,
    addressForm: row.address_form,
    emojiPolicy: row.emoji_policy,
    preferredPhrases: row.preferred_phrases,
    avoidedPhrases: row.avoided_phrases,
    logoKey: logo?.storage_path ?? null,
    profile: parseExtended(row.extended),
    profileVersion: row.approved_version ?? null,
  };
}
