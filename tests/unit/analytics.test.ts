import { describe, expect, it } from "vitest";
import { NO_DATA, aggregate, formatMetric, isBot, rate, sanitizeMetrics, utmValue, weekKey, withUtm, consentText, PLATFORM_METRICS } from "@/core/analytics/metrics";
import { checkInsights, insightSchema, numbersIn, factsPrompt, type InsightFact, type Insights } from "@/core/analytics/insights";
import { TestProvider } from "@/core/ai/test-provider";

const ws = (s: string) => s.replace(/\s/g, " ");

describe("metrics: missing data is not zero", () => {
  it("formats null as Brak danych and keeps real zero", () => {
    expect(formatMetric(null)).toBe(NO_DATA);
    expect(formatMetric(undefined)).toBe(NO_DATA);
    expect(formatMetric(0)).toBe("0");
    expect(ws(formatMetric(12500))).toBe("12 500");
  });
  it("sanitizes API payloads: non-numbers and negatives become null", () => {
    expect(sanitizeMetrics({ views: 10.4, reach: "5", likes: -1, comments: Number.NaN, shares: 0 })).toEqual({ views: 10, reach: null, interactions: null, likes: null, comments: null, shares: 0, saves: null, clicks: null });
  });
  it("aggregates only covered posts and reports coverage", () => {
    expect(aggregate([{ views: 10 }, { views: null }, { views: 5 }], "views")).toEqual({ value: 15, covered: 2, total: 3 });
    expect(aggregate([{ views: null }, {}], "views")).toEqual({ value: null, covered: 0, total: 2 });
    expect(aggregate([], "views")).toEqual({ value: null, covered: 0, total: 0 });
  });
  it("rate is null without a denominator", () => {
    expect(rate(1, 0)).toBeNull();
    expect(rate(null, 10)).toBeNull();
    expect(rate(3, 40)).toBe(7.5);
  });
  it("LinkedIn member profile has no statistics API", () => {
    expect(PLATFORM_METRICS.linkedin_member!.keys).toHaveLength(0);
    expect(PLATFORM_METRICS.facebook_page!.keys).toContain("views");
  });
  it("week buckets start on Monday", () => {
    expect(weekKey("2026-10-15T10:00:00Z")).toBe("2026-10-12");
    expect(weekKey("2026-10-12T00:00:00Z")).toBe("2026-10-12");
  });
});

describe("UTM, bots, consent", () => {
  it("normalizes UTM values", () => {
    expect(utmValue("Jesień Łódź 2026!")).toBe("jesien_lodz_2026");
    expect(utmValue("***")).toBe("brak");
  });
  it("adds UTM params", () => {
    const u = new URL(withUtm("https://example.com/o/x?a=1", { source: "facebook", medium: "social", campaign: "jesien" }));
    expect(u.searchParams.get("a")).toBe("1");
    expect(u.searchParams.get("utm_campaign")).toBe("jesien");
    expect(u.searchParams.has("utm_content")).toBe(false);
  });
  it("detects bots and link previews", () => {
    for (const ua of [null, "", "facebookexternalhit/1.1", "LinkedInBot/1.0", "Mozilla/5.0 HeadlessChrome", "curl/8.0", "Googlebot"]) expect(isBot(ua)).toBe(true);
    expect(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36")).toBe(false);
  });
  it("consent text names the office as data controller", () => {
    expect(consentText("Biuro X")).toContain("Administratorem danych jest Biuro X");
  });
});

const FACTS: InsightFact[] = [
  { key: "clicks", label: "Kliknięcia", value: "120", numbers: [120] },
  { key: "leads", label: "Zapytania", value: "6", numbers: [6] },
  { key: "click_to_lead", label: "Zapytania na 100 kliknięć", value: "5%", numbers: [5] },
  { key: "total_views", label: "Wyświetlenia", value: "12 500", numbers: [12500, 3, 4] },
  { key: "total_saves", label: "Zapisania", value: NO_DATA, numbers: [0, 4] },
];
const base: Insights = { observations: [], hypotheses: [], recommendations: [], limitations: [] };

describe("insights: numbers must come from the facts", () => {
  it("reads Polish number formats", () => {
    expect(numbersIn("Mamy 12 500 wyświetleń, 3,5% i 120 kliknięć")).toEqual([12500, 3.5, 120]);
  });
  it("drops observations and recommendations with invented numbers", () => {
    const raw: Insights = {
      ...base,
      observations: [
        { text: "120 kliknięć dało 6 zapytań (5%).", facts: ["clicks", "leads", "nieistnieje"] },
        { text: "Posty zebrały 12 500 wyświetleń.", facts: ["total_views"] },
        { text: "Zasięg wzrośnie do 40 000 osób.", facts: [] },
      ],
      recommendations: [
        { what: "A", why: "Uzasadnienie", data: "Kliknięcia: 120", action: "Zrób", metric: "Zapytania" },
        { what: "B", why: "Uzasadnienie", data: "Konwersja 18%", action: "Zrób", metric: "Zapytania" },
      ],
    };
    const r = checkInsights(raw, FACTS);
    expect(r.insights.observations.map((o) => o.text)).toEqual(["120 kliknięć dało 6 zapytań (5%).", "Posty zebrały 12 500 wyświetleń."]);
    expect(r.insights.observations[0]!.facts).toEqual(["clicks", "leads"]);
    expect(r.insights.recommendations.map((x) => x.what)).toEqual(["A"]);
    expect(r.dropped).toEqual(["Zasięg wzrośnie do 40 000 osób.", "Konwersja 18%"]);
  });
  it("allows small time spans (e.g. 4 tygodnie)", () => {
    const r = checkInsights({ ...base, observations: [{ text: "W ciągu 4 tygodni było 6 zapytań.", facts: ["leads"] }] }, FACTS);
    expect(r.dropped).toHaveLength(0);
  });
  it("prompt lists facts with Brak danych", () => {
    expect(factsPrompt(FACTS, "2026-09-01 – 2026-10-01")).toContain("total_saves | Zapisania: Brak danych");
  });
  it("offline provider output is valid, separated and passes the check", async () => {
    const res = await new TestProvider().complete({ operation: "ai_insight", tier: "main", system: "", user: "", schema: insightSchema, maxTokens: 100, effort: "low", testHint: { kind: "insights", facts: FACTS } } as never);
    const data = res.data as Insights;
    expect(insightSchema.safeParse(data).success).toBe(true);
    expect(data.hypotheses[0]!.verify.length).toBeGreaterThan(5);
    expect(data.limitations.join(" ")).toContain("Zapisania");
    const r = checkInsights(data, FACTS);
    expect(r.dropped).toEqual([]);
    expect(r.insights.observations.every((o) => !o.text.includes(NO_DATA))).toBe(true);
  });
});
