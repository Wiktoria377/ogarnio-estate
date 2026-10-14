import { describe, expect, it } from "vitest";
import { TestProvider } from "@/core/ai/test-provider";
import { buildStrategyFacts, type StrategyStats } from "@/core/strategy/data";
import { checkStrategy, maxMaterials, strategySchema, type StrategyInput, type StrategyOutput } from "@/core/strategy/director";
import { REAL_ESTATE_CONTENT_TYPES } from "@/verticals/real-estate/content-types";

const stats = (p: Partial<StrategyStats> = {}): StrategyStats => ({
  windowDays: 90,
  properties: { active: 6, byType: { apartment: 4, house: 2 }, sale: 5, rent: 1, withoutPhotos: 1, withoutMaterials: 3, listedOver60Days: 2, newInWindow: 2 },
  selected: [{ id: "11111111-1111-4111-8111-111111111111", title: "Apartament nad Wisłą", daysListed: 75, photos: 12, materials: 0, publications: 0, leads: 0, clicks: 0 }],
  content: { inWindow: 14, byKind: { text: 10, graphic: 4 }, carousels: 0, expert: 1, video: 0, ready: 9 },
  publications: { published: 7, byPlatform: { facebook_page: 5, instagram: 2 }, lastDaysAgo: 18, weeksWithPost: 4, weeksInWindow: 13 },
  planned: { next30: 0 },
  leads: { inWindow: 3, byChannel: { facebook: 3 } },
  traffic: { clicks: 41, pageViews: 120 },
  metrics: { withStats: 0, views: null, simulated: false },
  connectedChannels: ["facebook_page (Biuro)"],
  brand: { profileApproved: true, memoryEntries: 2 },
  ...p,
});

const input: StrategyInput = { goal: "sell_listings", periodDays: 30, audience: "families", propertyIds: ["11111111-1111-4111-8111-111111111111"], channels: ["instagram", "facebook"], adBudget: 0, postsPerWeek: 3, notes: "" };
const known = { contentTypes: new Set(REAL_ESTATE_CONTENT_TYPES.map((d) => d.id)), propertyIds: new Set(input.propertyIds) };

const base = (): StrategyOutput => ({
  diagnosis: { summary: "Biuro ma 6 aktywnych ofert i 7 publikacji.", findings: [{ text: "3 oferty nie mają materiałów.", facts: ["properties_without_materials", "nieistniejacy"] }, { text: "Zasięg wzrósł o 250%.", facts: [] }] },
  conclusions: [{ text: "Brakuje karuzel (0 w okresie).", facts: ["content_carousels"] }, { text: "Odbiorcy wolą wideo.", facts: [] }, { text: "Mamy 999 obserwujących.", facts: ["publications"] }],
  hypotheses: [{ text: "Karuzele mogą zwiększyć zapytania.", verify: "Porównaj zapytania po 4 tygodniach." }],
  goals: [{ goal: "Gwarantujemy sprzedaż w 30 dni", metric: "Zapytania", horizon: "4 tyg." }],
  segments: [{ name: "Rodziny", need: "Przestrzeń", message: "Dom blisko szkoły", property_ids: ["11111111-1111-4111-8111-111111111111", "obca-oferta"] }],
  key_messages: [{ message: "Spokojna okolica", segment: "Rodziny", proof: "Opis oferty" }],
  pillars: [{ name: "Oferty", purpose: "Sprzedaż", share: 60, examples: [] }],
  campaign_ideas: [{ name: "Seria", idea: "Karuzele", channels: ["instagram", "meta_ads", "linkedin"], format: "Karuzela", property_ids: ["obca-oferta"], week: 9 }],
  schedule: [{ week: 1, focus: "Start", actions: [] }, { week: 8, focus: "Poza okresem", actions: [] }],
  formats: [{ format: "Karuzela", channel: "instagram", why: "Format sprzedażowy" }, { format: "Reklama", channel: "meta_ads", why: "Zasięg" }],
  ctas: [{ cta: "Umów prezentację", when: "Oferty" }],
  metrics: [{ metric: "Zapytania", how: "Moduł Zapytania", available: true }],
  materials: [
    { content_type: "property_sales_carousel", platform: "instagram", property_id: "11111111-1111-4111-8111-111111111111", topic: "Apartament", week: 1, pillar: "Oferty" },
    { content_type: "nie_istnieje", platform: "instagram", property_id: null, topic: "x", week: 1, pillar: "x" },
    { content_type: "property_meta_ad", platform: "meta_ads", property_id: null, topic: "Reklama", week: 2, pillar: "Oferty" },
    { content_type: "educational_post", platform: "linkedin", property_id: "obca-oferta", topic: "Jak kupić", week: 12, pillar: "Wiedza" },
    ...Array.from({ length: 20 }, () => ({ content_type: "property_sales_post", platform: "facebook" as const, property_id: null, topic: "Post", week: 2, pillar: "Oferty" })),
  ],
  recommendations: [
    { what: "Dodaj karuzele", why: "Brak karuzel", data: "Karuzele w ostatnich 90 dniach: 0", facts: ["content_carousels"], action: "Przygotuj 2 karuzele", metric: "Zapytania" },
    { what: "Zwiększ budżet", why: "Konkurencja wydaje więcej", data: "Średni CPC w branży 3,40 zł", facts: [], action: "x", metric: "CPC" },
  ],
  limitations: [],
});

describe("strategy data (computed, never invented)", () => {
  it("unknown values are 'Brak danych', zero is a real zero", () => {
    const f = buildStrategyFacts(stats());
    const by = (k: string) => f.find((x) => x.key === k)!;
    expect(by("platform_views").value).toBe("Brak danych");
    expect(by("content_carousels").value).toBe("0");
    expect(by("properties_without_materials").numbers).toEqual([3]);
    expect(f.some((x) => x.key.startsWith("offer_11111111"))).toBe(true);
    expect(buildStrategyFacts(stats({ publications: { published: 0, byPlatform: {}, lastDaysAgo: null, weeksWithPost: 0, weeksInWindow: 13 } })).find((x) => x.key === "last_publication_days")!.value).toBe("Brak danych");
  });
  it("labels simulator statistics", () => {
    expect(buildStrategyFacts(stats({ metrics: { withStats: 3, views: 900, simulated: true } })).some((f) => f.key === "simulator")).toBe(true);
  });
});

describe("checkStrategy", () => {
  const facts = buildStrategyFacts(stats());
  const { output: o, warnings } = checkStrategy(base(), facts, input, known);

  it("drops statements with numbers that are not in the data", () => {
    expect(o.diagnosis.findings.map((f) => f.text)).toEqual(["3 oferty nie mają materiałów."]);
    expect(o.diagnosis.findings[0]!.facts).toEqual(["properties_without_materials"]);
    expect(o.conclusions.map((c) => c.text)).toEqual(["Brakuje karuzel (0 w okresie)."]);
    expect(o.recommendations.map((r) => r.what)).toEqual(["Dodaj karuzele"]);
    expect(warnings.some((w) => w.includes("999"))).toBe(true);
  });

  it("turns a conclusion without evidence into a hypothesis", () => {
    expect(o.hypotheses.map((h) => h.text)).toContain("Odbiorcy wolą wideo.");
  });

  it("keeps materials within known types, chosen offers, channels, period, frequency and budget", () => {
    expect(o.materials.length).toBe(maxMaterials(input));
    expect(maxMaterials(input)).toBe(13);
    expect(o.materials.every((m) => known.contentTypes.has(m.content_type))).toBe(true);
    expect(o.materials.some((m) => m.content_type === "property_meta_ad" || m.platform === "meta_ads")).toBe(false);
    expect(o.materials.every((m) => ["instagram", "facebook"].includes(m.platform))).toBe(true);
    expect(o.materials.every((m) => m.week >= 1 && m.week <= 5)).toBe(true);
    expect(o.materials.find((m) => m.content_type === "educational_post")!.property_id).toBeNull();
    expect(warnings.some((w) => /reklam płatnych/.test(w))).toBe(true);
    expect(o.campaign_ideas[0]!.channels).toEqual(["instagram"]);
    expect(o.campaign_ideas[0]!.property_ids).toEqual([]);
    expect(o.segments[0]!.property_ids).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(o.schedule.map((w) => w.week)).toEqual([1]);
    expect(o.formats.map((f) => f.channel)).toEqual(["instagram"]);
  });

  it("with an ad budget, paid proposals stay (as proposals)", () => {
    const r = checkStrategy(base(), facts, { ...input, adBudget: 2000, channels: ["instagram", "facebook", "meta_ads"] }, known);
    expect(r.output.materials.some((m) => m.content_type === "property_meta_ad")).toBe(true);
  });

  it("flags promised results", () => {
    expect(warnings.some((w) => w.includes("Gwarantujemy"))).toBe(true);
  });
});

describe("offline provider", () => {
  it("returns a schema-valid strategy built only from facts and choices", async () => {
    const facts = buildStrategyFacts(stats());
    const r = await new TestProvider().complete({
      operation: "strategy", tier: "main", system: "", user: "", schema: strategySchema,
      testHint: { kind: "strategy", facts: facts.map(({ key, label, value }) => ({ key, label, value })), properties: [{ id: input.propertyIds[0]!, title: "Apartament" }], channels: input.channels, weeks: 5, limit: 13, contentTypes: [...known.contentTypes], adBudget: 0, goalLabel: "Sprzedaż" },
    });
    const checked = checkStrategy(r.data, facts, input, known);
    expect(checked.output.materials).toHaveLength(13);
    expect(checked.output.conclusions.length).toBeGreaterThan(0);
    expect(checked.output.hypotheses.some((h) => h.text.includes("Wniosek testowy bez wskazania danych"))).toBe(true);
    expect(checked.output.limitations[0]).toMatch(/dostawca offline/);
  });
});
