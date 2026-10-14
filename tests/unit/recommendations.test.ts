import { describe, expect, it } from "vitest";
import { numbersIn } from "@/core/analytics/insights";
import { buildRecommendations, dataGaps, EDUCATION_TOPICS, type RecoData, type RecoProperty, type RecoPublication } from "@/core/recommendations/engine";

const prop = (p: Partial<RecoProperty> & { id: string }): RecoProperty => ({
  title: "Mieszkanie z balkonem", daysListed: 40, photos: 6, materials: 2, carousels: 0, publications: 1, lastPublicationDaysAgo: 35, clicks30: 0, leads30: 0, ...p,
});
const pub = (i: number, p: Partial<RecoPublication> = {}): RecoPublication => ({
  id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`, contentItemId: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, "0")}`, contentKind: "text",
  title: `Post ${String.fromCharCode(65 + i)}`, platform: "instagram", daysAgo: 5 + i, views: 1000, interactions: 50, simulated: false, ...p,
});
const base = (d: Partial<RecoData> = {}): RecoData => ({
  windowDays: 90, properties: [], publications: [], lastPublicationDaysAgo: 3, weekly: [2, 1, 2, 1, 2, 1, 2, 1], plannedNext14: 4,
  education: Object.fromEntries(EDUCATION_TOPICS.map((t) => [t.type, 1])), connectedChannels: 2, trackedLinks: 3, leadsInWindow: 5, ...d,
});
const codes = (d: RecoData) => buildRecommendations(d).map((r) => r.code);
const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const P3 = "00000000-0000-4000-8000-000000000003";

describe("recommendations from data", () => {
  it("a healthy office with no gaps gets no invented recommendations", () => {
    expect(buildRecommendations(base())).toEqual([]);
  });

  it("detects a long break and an empty plan", () => {
    const r = buildRecommendations(base({ lastPublicationDaysAgo: 41, weekly: [0, 0, 0, 0, 0, 1, 0, 0], plannedNext14: 0 }));
    const gap = r.find((x) => x.code === "publication_gap")!;
    expect(gap.priority).toBe("high");
    expect(gap.why).toContain("41 dni temu");
    expect(gap.actions.map((a) => a.href)).toContain("/autopilot");
    expect(r.some((x) => x.code === "empty_planner")).toBe(false); // covered by the gap
    expect(codes(base({ plannedNext14: 0, properties: [prop({ id: P1, publications: 3, lastPublicationDaysAgo: 2, carousels: 1 })] }))).toContain("empty_planner");
  });

  it("recommends a steady rhythm only when posts cluster in a few weeks", () => {
    expect(codes(base({ weekly: [4, 0, 0, 3, 0, 0, 0, 0] }))).toContain("irregular_frequency");
    expect(codes(base({ weekly: [1, 1, 1, 1, 0, 0, 0, 0] }))).not.toContain("irregular_frequency");
    expect(codes(base({ weekly: [0, 0, 0, 0, 0, 0, 0, 0], lastPublicationDaysAgo: 80 }))).not.toContain("irregular_frequency");
  });

  it("finds unused offers, unpublished materials, offers to repromote, carousels and missing photos", () => {
    const r = buildRecommendations(base({ properties: [
      prop({ id: P1, title: "Dom pod lasem", materials: 0, publications: 0, lastPublicationDaysAgo: null, daysListed: 45 }),
      prop({ id: P2, title: "Kawalerka", materials: 3, publications: 0, lastPublicationDaysAgo: null, daysListed: 10, photos: 2 }),
      prop({ id: P3, title: "Apartament", photos: 0, publications: 2, lastPublicationDaysAgo: 31 }),
    ] }));
    const by = (code: string, id: string) => r.find((x) => x.code === code && x.subject?.id === id);
    expect(by("unused_property", P1)!.priority).toBe("high");
    expect(by("unused_property", P1)!.actions[0]!.href).toBe(`/studio/new?type=property_sales_post&property=${P1}`);
    expect(by("unpublished_material", P2)!.priority).toBe("medium");
    expect(by("missing_photos", P3)!.priority).toBe("high");
    expect(by("repromote_property", P3)!.caveat).toMatch(/portale/);
    expect(by("missing_carousel", P1)!.actions[0]!.href).toContain("format=carousel");
    expect(by("missing_carousel", P2)).toBeUndefined(); // only 2 photos
    // A fresh listing (under 7 days) is not "unused" yet; an offer with recent inquiries is not repromoted.
    expect(codes(base({ properties: [prop({ id: P1, daysListed: 3, publications: 0, lastPublicationDaysAgo: null, carousels: 1 })] }))).toEqual([]);
    expect(codes(base({ properties: [prop({ id: P1, leads30: 2, carousels: 1 })] }))).toEqual([]);
  });

  it("suggests a headline test only with enough platform statistics, and says it may not be the headline", () => {
    const five = [0, 1, 2, 3].map((i) => pub(i)).concat(pub(4, { interactions: 5 }));
    const r = buildRecommendations(base({ publications: five })).filter((x) => x.code === "headline_test");
    expect(r).toHaveLength(1);
    expect(r[0]!.subject!.title).toBe("Post E");
    expect(r[0]!.why).toContain("0,5%");
    expect(r[0]!.caveat).toMatch(/nie musi wynikać z nagłówka/);
    expect(r[0]!.actions[0]!.href).toBe(`/studio/${five[4]!.contentItemId}`);
    expect(codes(base({ publications: five.slice(1) }))).not.toContain("headline_test"); // 4 with stats: not enough
    expect(codes(base({ publications: five.map((p) => ({ ...p, views: null, interactions: null })) }))).not.toContain("headline_test");
    const sim = buildRecommendations(base({ publications: five.map((p) => ({ ...p, simulated: true })) })).find((x) => x.code === "headline_test")!;
    expect(sim.data.map((d) => d.value).join(" ")).toContain("symulatora");
  });

  it("lists missing educational topics", () => {
    const none = buildRecommendations(base({ education: {} })).find((x) => x.code === "missing_education")!;
    expect(none.priority).toBe("medium");
    expect(none.actions).toHaveLength(3);
    expect(none.actions[0]!.href).toMatch(/^\/studio\/new\?type=buying_content&topic=/);
    const some = buildRecommendations(base({ education: { educational_post: 3, faq: 1 } })).find((x) => x.code === "missing_education")!;
    expect(some.why).toContain("dni: 4. Brakuje materiału dla 4 z 6 tematów");
    expect(some.data[1]!.value).not.toContain("najczęstsze pytania");
  });

  it("asks to connect accounts or add tracking links when results cannot be measured", () => {
    expect(codes(base({ connectedChannels: 0, lastPublicationDaysAgo: null }))).toEqual(["connect_channels"]);
    expect(codes(base({ trackedLinks: 0, publications: [pub(0)] }))).toEqual(["tracking_links"]);
  });

  it("every number in a rationale is shown in its data (or is a rule threshold)", () => {
    const d = base({
      lastPublicationDaysAgo: 22, weekly: [3, 0, 0, 2, 0, 0, 0, 0], education: { faq: 2 }, trackedLinks: 0,
      publications: [0, 1, 2, 3].map((i) => pub(i)).concat(pub(4, { interactions: 4, views: 1250 })),
      properties: [prop({ id: P1, materials: 0, publications: 0, lastPublicationDaysAgo: null }), prop({ id: P2, photos: 0, clicks30: 7, lastPublicationDaysAgo: 64 })],
    });
    const recs = buildRecommendations(d);
    expect(recs.length).toBeGreaterThan(6);
    const THRESHOLDS = new Set([7, 8, 14, 30, 90]);
    for (const r of recs) {
      const shown = new Set(r.data.flatMap((x) => [...numbersIn(x.value), ...numbersIn(x.label)]));
      const unexplained = numbersIn(r.why).filter((n) => !shown.has(n) && !THRESHOLDS.has(n));
      expect(unexplained, `${r.code}: ${r.why}`).toEqual([]);
      expect(r.actions.length, r.code).toBeGreaterThan(0);
      expect(r.measure.length, r.code).toBeGreaterThan(10);
      expect(r.why).not.toMatch(/dzięki|spowoduje|zwiększy|gwarant/i);
    }
    expect(new Set(recs.map((r) => r.key)).size).toBe(recs.length);
  });

  it("names data gaps instead of guessing", () => {
    const g = dataGaps(base({ publications: [pub(0, { simulated: true })], trackedLinks: 0, leadsInWindow: 0 })).join(" ");
    expect(g).toContain("Statystyki platform ma 1 publikacji");
    expect(g).toContain("linków śledzących");
    expect(g).toContain("Brak zapytań");
    expect(g).toContain("symulatora");
  });
});
