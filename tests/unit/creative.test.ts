import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CREATIVE_DIRECTION_IDS, recommendCompositions, templateForDirection } from "@/core/creative/composition";
import { assessPhoto, keptShare, proposeCrop } from "@/core/creative/photos";
import { measurePhoto } from "@/lib/creative/photos";

const m = (p: Partial<Parameters<typeof assessPhoto>[0]> = {}) => assessPhoto({ width: 3000, height: 2000, brightness: 0.55, contrast: 0.22, sharpness: 0.5, colors: [], focus: null, ...p });

describe("photo assessment (deterministic)", () => {
  it("good photo: no warnings, high score, crop risk per format", () => {
    const r = m();
    expect(r.issues.filter((i) => i.severity !== "info")).toEqual([]);
    expect(r.issues.map((i) => i.code)).toEqual(["crop_risk"]);
    expect(r.orientation).toBe("landscape");
    expect(r.score).toBeGreaterThan(80);
    expect(r.crop.square.kept).toBeCloseTo(0.67, 2);
    expect(r.crop.story.risk).toBe("high");
  });
  it("flags resolution, exposure, blur, contrast and odd ratios", () => {
    const codes = (x: ReturnType<typeof m>) => x.issues.map((i) => i.code);
    expect(codes(m({ width: 640, height: 480 }))).toContain("very_low_resolution");
    expect(codes(m({ width: 1200, height: 800 }))).toContain("low_resolution");
    expect(codes(m({ brightness: 0.15 }))).toContain("dark");
    expect(codes(m({ brightness: 0.92 }))).toContain("overexposed");
    expect(codes(m({ sharpness: 0.05 }))).toContain("blurry");
    expect(codes(m({ contrast: 0.05 }))).toContain("low_contrast");
    expect(codes(m({ width: 6000, height: 1500 }))).toContain("extreme_ratio");
    expect(m({ sharpness: 0.05 }).score).toBeLessThan(m().score);
  });
  it("keptShare and crop proposal stay inside the photo", () => {
    expect(keptShare(1000, 1000, 1)).toBe(1);
    expect(keptShare(2000, 1000, 1)).toBe(0.5);
    const c = proposeCrop({ width: 1600, height: 900, focus: { x: 0.98, y: 0.1 } }, { w: 400, h: 500 });
    // Window half-width in scaled units: 200 / 889 ≈ 0.225 → fx ≤ 0.775
    expect(c.fx).toBeCloseTo(0.775, 2);
    expect(c.fy).toBe(0.5);
    expect(proposeCrop({ width: 1600, height: 900, focus: null }, { w: 400, h: 500 }).fx).toBe(0.5);
  });
});

describe("measurePhoto (real pixels via sharp)", () => {
  const img = async (bg: string, spot?: { left: number; top: number }) => {
    let s = sharp({ create: { width: 1600, height: 900, channels: 3, background: bg } });
    if (spot) s = s.composite([{ input: { create: { width: 220, height: 220, channels: 3, background: "#ff2a2a" } }, left: spot.left, top: spot.top }]);
    return s.jpeg().toBuffer();
  };
  it("measures brightness, colours and the salient point", async () => {
    const dark = await measurePhoto(await img("#141414"));
    expect(dark.brightness).toBeLessThan(0.15);
    expect(assessPhoto(dark).issues.map((i) => i.code)).toContain("dark");
    const spot = await measurePhoto(await img("#8a8a8a", { left: 1300, top: 80 }));
    expect(spot.width).toBe(1600);
    expect(spot.colors[0]).toMatch(/^#[0-9A-F]{6}$/);
    expect(spot.focus!.x).toBeGreaterThan(0.6);
    expect(spot.sharpness).toBeGreaterThan(dark.sharpness);
  });
});

describe("composition choice", () => {
  const photo = (o: Partial<{ orientation: "landscape" | "portrait" | "square"; brightness: number }> = {}) => ({ orientation: "landscape" as const, ratio: 1.5, brightness: 0.5, score: 80, issues: [], ...o });
  it("premium property in a luxury brand → luxury layout, with reasons", () => {
    const r = recommendCompositions({ format: "portrait", photos: [photo(), photo()], textLength: 50, message: "premium", propertyTags: ["premium"], brandStyle: "luxury" });
    expect(["arch", "noir", "magazine"]).toContain(r[0]!.template);
    expect(r[0]!.reasons.join(" ")).toMatch(/stylu marki/);
  });
  it("needs enough good photos for a collage; long text prefers a text panel; bright photos avoid white-on-photo", () => {
    const one = recommendCompositions({ format: "square", photos: [photo()], textLength: 50, message: "event", propertyTags: [], brandStyle: "warm_lifestyle" });
    expect(one.find((c) => c.template === "collage")!.reasons.join(" ")).toMatch(/wymaga 3 zdjęć/);
    const three = recommendCompositions({ format: "square", photos: [photo(), photo(), photo()], textLength: 50, message: "event", propertyTags: [], brandStyle: "warm_lifestyle" });
    expect(three.findIndex((c) => c.template === "collage")).toBeLessThan(one.findIndex((c) => c.template === "collage"));
    const long = recommendCompositions({ format: "portrait", photos: [photo({ brightness: 0.8 })], textLength: 140, message: "brand", propertyTags: [], brandStyle: "modern_minimal" });
    expect(long.find((c) => c.template === "minimal")!.reasons.join(" ")).toMatch(/czytelność|biały tekst/);
    expect(recommendCompositions({ format: "square", photos: [], textLength: 40, message: "sales", propertyTags: [], brandStyle: "bold_contemporary" })[0]!.template).not.toBe("collage");
  });
  it("five directions resolve to direction-specific layouts", () => {
    const base = { format: "portrait" as const, photos: [photo(), photo(), photo()], textLength: 60, propertyTags: [], brandStyle: "elegant_corporate" as const };
    for (const d of CREATIVE_DIRECTION_IDS) expect(templateForDirection(d, base).reasons[0]).toMatch(/kierunek/);
    expect(["arch", "noir", "magazine"]).toContain(templateForDirection("premium", base).template);
    expect(["editorial", "corporate", "lines"]).toContain(templateForDirection("expert", base).template);
  });
});
