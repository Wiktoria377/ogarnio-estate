import { describe, expect, it } from "vitest";
import { autopilotInputSchema, buildAutopilotPlan, pillarWeights, planRationale, weightedSequence, type PlanProperty } from "@/core/autopilot/plan";

const props: PlanProperty[] = [
  { id: "00000000-0000-4000-8000-000000000001", title: "Mieszkanie z balkonem", photos: 5 },
  { id: "00000000-0000-4000-8000-000000000002", title: "Dom pod miastem", photos: 0 },
];
const input = (p: Record<string, unknown> = {}) => autopilotInputSchema.parse({
  startDate: "2026-11-01", days: 30, count: 12, platforms: ["instagram", "facebook"], propertyIds: props.map((x) => x.id),
  pillars: ["offers", "education", "trust"], goals: ["sell_listings"], aiLimit: 12, ...p,
});

describe("autopilot plan", () => {
  it("validates choices: offers need a property, ads need an offer, limits", () => {
    expect(autopilotInputSchema.safeParse({ startDate: "2026-11-01", platforms: ["instagram"], pillars: ["offers"], goals: ["leads"] }).success).toBe(false);
    expect(autopilotInputSchema.safeParse({ startDate: "2026-11-01", platforms: ["instagram"], pillars: ["education"], goals: ["leads"], includeAds: true }).success).toBe(false);
    expect(autopilotInputSchema.safeParse({ startDate: "2026-11-01", platforms: ["instagram"], pillars: ["education"], goals: ["leads"], count: 41 }).success).toBe(false);
    expect(autopilotInputSchema.safeParse({ startDate: "2026-11-01", platforms: [], pillars: ["education"], goals: ["leads"] }).success).toBe(false);
  });

  it("builds exactly N items inside the period, each with a reason", () => {
    const plan = buildAutopilotPlan(input(), props);
    expect(plan).toHaveLength(12);
    expect(plan.map((p) => p.position)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(plan.every((p) => p.date >= "2026-11-01" && p.date < "2026-12-01")).toBe(true);
    expect(plan.every((p) => p.rationale.length > 20)).toBe(true);
    expect(new Set(plan.map((p) => p.platform))).toEqual(new Set(["instagram", "facebook"]));
  });

  it("weights pillars by goals and keeps offers on chosen offers only", () => {
    const plan = buildAutopilotPlan(input(), props);
    const offers = plan.filter((p) => p.pillar === "offers");
    expect(offers.length).toBeGreaterThan(plan.filter((p) => p.pillar === "education").length);
    expect(offers.every((p) => props.some((x) => x.id === p.propertyId))).toBe(true);
    expect(plan.filter((p) => p.pillar !== "offers").every((p) => p.propertyId === null)).toBe(true);
    expect(pillarWeights({ pillars: ["offers", "owners"], goals: ["acquire_listings"] })).toMatchObject({ offers: 1, owners: 3 });
    expect(weightedSequence({ a: 3, b: 1 }, 8).filter((x) => x === "a")).toHaveLength(6);
  });

  it("formats follow the channel and the photos: TikTok = video script, graphics only with photos", () => {
    const plan = buildAutopilotPlan(input({ platforms: ["instagram", "facebook", "tiktok"], count: 18 }), props);
    expect(plan.filter((p) => p.platform === "tiktok").every((p) => p.kind === "video_script")).toBe(true);
    const graphics = plan.filter((p) => p.kind === "carousel" || p.kind === "promo_graphic");
    expect(graphics.length).toBeGreaterThan(0);
    expect(graphics.every((p) => p.propertyId === props[0]!.id)).toBe(true);
  });

  it("Instagram offers rotate carousel, post and Reels script", () => {
    const plan = buildAutopilotPlan(input({ platforms: ["instagram"], pillars: ["offers"], propertyIds: [props[0]!.id], count: 6, includeVideo: true }), props);
    expect(plan.map((p) => p.kind)).toEqual(["carousel", "post", "video_script", "carousel", "post", "video_script"]);
    expect(buildAutopilotPlan(input({ platforms: ["instagram"], pillars: ["offers"], propertyIds: [props[0]!.id], count: 2, includeVideo: false }), props).map((p) => p.kind)).toEqual(["carousel", "post"]);
  });

  it("ad proposals: only when asked, first in the plan, at most 2, never more than the count", () => {
    expect(buildAutopilotPlan(input(), props).some((p) => p.kind === "ad_proposal")).toBe(false);
    const plan = buildAutopilotPlan(input({ includeAds: true }), props);
    expect(plan.filter((p) => p.kind === "ad_proposal")).toHaveLength(2);
    expect(plan[0]!.kind).toBe("ad_proposal");
    expect(plan[0]!.rationale).toContain("nie zostanie uruchomiona ani opłacona");
    expect(buildAutopilotPlan(input({ includeAds: true, count: 1 }), props)).toHaveLength(1);
  });

  it("an accepted strategy's materials come first", () => {
    const plan = buildAutopilotPlan(input(), props, [{ content_type: "educational_post", platform: "facebook", property_id: null, topic: "Jak czytać księgę wieczystą", week: 2, pillar: "Edukacja" }]);
    expect(plan[0]).toMatchObject({ pillar: "education", platform: "facebook", topic: "Jak czytać księgę wieczystą" });
    expect(plan[0]!.rationale).toContain("Z zaakceptowanej strategii");
  });

  it("rationale uses only the office's facts and says what is unknown", () => {
    const i = input({ includeAds: true });
    const r = planRationale(i, buildAutopilotPlan(i, props), [{ label: "Aktywne oferty", value: "2" }, { label: "Zapytania (90 dni)", value: "Brak danych" }]).join(" ");
    expect(r).toContain("Aktywne oferty: 2");
    expect(r).toContain("Brak danych o: zapytania (90 dni)");
    expect(r).toContain("nie uruchamia ani nie opłaca");
    expect(r).toContain("kolejki akceptacji");
    expect(r).not.toMatch(/\d+\s?%/);
  });
});
