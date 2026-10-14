import { EMPTY_EXTENDED } from "@/core/brand/profile";
import { describe, expect, it } from "vitest";
import { TestProvider } from "@/core/ai/test-provider";
import type { LlmCall, LlmProvider, LlmResult } from "@/core/ai/provider";
import { DEFAULT_COLORS, type BrandKit } from "@/core/brand/model";
import { generateContent, normalizeVariant, refineContent, generateGraphicCopy, clampText } from "@/core/marketing-engine/pipeline";
import { loadSkills } from "@/core/marketing-engine/skills/loader";
import { getContentType } from "@/verticals/real-estate/content-types";
import { propertyFactSheet } from "@/verticals/real-estate/property";
import type { PropertyRow } from "@/lib/supabase/database.types";
import type { GenerationRequest } from "@/core/marketing-engine/prompt";

export const brand: BrandKit = {
  companyName: "Biuro Testowe", tagline: null, colors: DEFAULT_COLORS, headingFont: "playfair-display", bodyFont: "manrope",
  contact: { email: "biuro@example.com", phone: "500 600 700", address: null, website: null }, socials: {},
  style: "modern_minimal", personality: null, targetAudience: null, communicationStyle: "professional_warm",
  addressForm: "pan_pani", emojiPolicy: "none", preferredPhrases: null, avoidedPhrases: null, logoKey: null, profile: EMPTY_EXTENDED, profileVersion: null,
};

export const property: PropertyRow = {
  id: "00000000-0000-4000-8000-000000000001", workspace_id: "00000000-0000-4000-8000-000000000002", title: "Mieszkanie z balkonem na Mokotowie",
  property_type: "apartment", market: "secondary", transaction_type: "sale", city: "Warszawa", district: "Mokotów", street: "Puławska",
  show_street: false, area_m2: 54.5, rooms: 3, floor: 2, total_floors: 4, year_built: 2012, price: 899000, currency: "PLN",
  price_per_m2: 16495.41, description: "Jasne mieszkanie, balkon od strony podwórza.", features: ["balkon"], amenities: ["winda"],
  agent_id: null, status: "active", created_by: null, created_at: "", updated_at: "",
  source_id: null, external_ref: null, external_hash: null, last_synced_at: null, public_slug: null, public_enabled: false,
};

const request = (over: Partial<GenerationRequest> = {}): GenerationRequest => ({
  contentType: "property_sales_post", platform: "instagram", goal: "sales", audience: "families", topic: "", propertyId: property.id,
  tone: "brand", length: "medium", ctaType: "message", variants: 2, extraInstructions: "", marketData: "", ...over,
});

/** Provider that returns a fixed variant with an invented number, to exercise QA + repair. */
class LyingProvider implements LlmProvider {
  readonly name = "lying";
  calls: string[] = [];
  async complete<T>(call: LlmCall<T>): Promise<LlmResult<T>> {
    this.calls.push(call.operation);
    const bad = { angle: "a", headline: "Mieszkanie 72 m² na Mokotowie", hook: "Gwarantowany zysk z najmu.", sections: [{ key: "body", label: "x", content: "Mieszkanie ma 72 m² i 4 pokoje." }], cta: "Napisz.", hashtags: [], notes: "" };
    const good = { ...bad, headline: "Mieszkanie 54,5 m² na Mokotowie", hook: "Trzy pokoje i balkon.", sections: [{ key: "body", label: "x", content: "Mieszkanie ma 54,5 m² i 3 pokoje." }] };
    let data: unknown;
    if (call.operation === "generate") data = { variants: [bad], gaps: [] };
    else if (call.operation === "repair") data = { variant: good, change_summary: "fix" };
    else data = { checks: [], suggestions: [] };
    return { data: call.schema.parse(data), model: "fake", usage: { input: 1, output: 1 } };
  }
}

describe("marketing engine pipeline", () => {
  const skills = loadSkills();
  const facts = propertyFactSheet(property);

  it("generates the requested number of normalised variants with QA and skills", async () => {
    const def = getContentType("property_sales_post")!;
    const res = await generateContent({ provider: new TestProvider(), skills, brand }, { def, request: request(), facts, audienceLabel: "Rodziny" });
    expect(res.variants).toHaveLength(2);
    for (const { variant, quality } of res.variants) {
      expect(variant.sections.map((s) => s.key)).toEqual(def.sections.map((s) => s.key));
      expect(quality.checks).toHaveLength(9);
      expect(quality.score).toBeGreaterThan(0);
    }
    expect(res.skills.some((s) => s.id === "core.fact-integrity")).toBe(true);
  });

  it("flags invented facts and investment promises, then repairs once", async () => {
    const def = { ...getContentType("property_sales_post")!, sections: [{ key: "body", label: "Treść" }] };
    const provider = new LyingProvider();
    const res = await generateContent({ provider, skills, brand }, { def, request: request({ variants: 1 }), facts, audienceLabel: "Rodziny" });
    expect(provider.calls).toContain("repair");
    expect(res.variants[0]!.quality.repaired).toBe(true);
    expect(res.variants[0]!.variant.headline).toContain("54,5");
  });

  it("refines a variant and keeps the structure", async () => {
    const def = getContentType("property_sales_post")!;
    const first = await generateContent({ provider: new TestProvider(), skills, brand }, { def, request: request({ variants: 1 }), facts, audienceLabel: "Rodziny" });
    const r = await refineContent({ provider: new TestProvider(), skills, brand }, { def, request: request(), facts, audienceLabel: "Rodziny" }, first.variants[0]!.variant, { operation: "headline" });
    expect(r.variant.headline).toContain("nowy nagłówek");
    expect(r.variant.sections).toHaveLength(def.sections.length);
  });

  it("normalises sections order and drops unknown keys", () => {
    const def = getContentType("property_meta_ad")!;
    const v = normalizeVariant(def, { angle: "", headline: "", hook: "", cta: "", hashtags: ["x"], notes: "", sections: [{ key: "headline", label: "", content: "H" }, { key: "zzz", label: "", content: "?" }] });
    expect(v.sections.map((s) => s.key)).toEqual(["primary_text", "headline", "description", "cta_button"]);
    expect(v.hashtags).toEqual([]);
  });

  it("produces graphic copy within slot limits", async () => {
    const res = await generateGraphicCopy({ provider: new TestProvider(), skills, brand }, {
      slides: [[{ key: "title", label: "Tytuł", maxChars: 20 }, { key: "price", label: "Cena", maxChars: 30 }]],
      facts, platform: "instagram", goal: "sales", audienceLabel: "Rodziny", brief: "", formatLabel: "Post 1080×1350",
    });
    expect(res.slides[0]!.title!.length).toBeLessThanOrEqual(21);
    expect(clampText("Bardzo długi tekst do przycięcia na granicy słowa", 20).length).toBeLessThanOrEqual(21);
  });
});
