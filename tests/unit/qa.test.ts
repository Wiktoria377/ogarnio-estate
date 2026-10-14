import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { DEFAULT_COLORS, type BrandKit } from "@/core/brand/model";
import { EMPTY_EXTENDED } from "@/core/brand/profile";
import { defaultSlides, graphicDesignSchema, type GraphicDesign } from "@/core/graphics/design";
import { svgToPng } from "@/core/graphics/render";
import { renderSlideSvg, type LayoutElement } from "@/core/graphics/templates";
import type { Variant } from "@/core/marketing-engine/schemas";
import { contrast, graphicQa, measureTextContrast, relLum, type RasterRGBA } from "@/core/qa/graphic";
import { languageScore, readability, syllables, textQa } from "@/core/qa/text";
import { buildReport, QA_VERSION } from "@/core/qa/types";
import { estimateLines, videoQa, type ProbeResult } from "@/core/qa/video";
import { videoDesignSchema } from "@/core/video/model";
import { mp4Faststart } from "@/lib/qa";

const brand: BrandKit = {
  companyName: "Biuro Testowe", tagline: null, colors: DEFAULT_COLORS, headingFont: "playfair-display", bodyFont: "manrope",
  contact: { email: "biuro@example.com", phone: "500 600 700", address: null, website: null }, socials: {},
  style: "modern_minimal", personality: null, targetAudience: null, communicationStyle: "professional_warm",
  addressForm: "pan_pani", emojiPolicy: "none", preferredPhrases: null, avoidedPhrases: null, logoKey: "ws/logo.png", profile: EMPTY_EXTENDED, profileVersion: null,
};
const variant = (p: Partial<Variant>): Variant => ({ angle: "", headline: "", hook: "", sections: [], cta: "", hashtags: [], notes: "", ...p });
const codes = (c: { code: string; severity: string }[], sev?: string) => c.filter((x) => !sev || x.severity === sev).map((x) => x.code);

describe("text QA", () => {
  const good = variant({
    headline: "Trzy pokoje z balkonem na Mokotowie",
    hook: "Trzy pokoje, balkon i cicha ulica.",
    sections: [{ key: "body", label: "Treść", content: "Mieszkanie ma 54,5 m² i balkon od strony podwórza. Do metra dojdzie Pan pieszo. Kuchnia jest jasna i oddzielona od salonu." }],
    cta: "Umów prezentację w tym tygodniu.",
  });

  it("good Polish text passes language, readability, headline and CTA", () => {
    const c = textQa({ variant: good, goal: "leads", ctaType: "contact", ruleFindings: [], factWords: ["Mokotów", "Warszawa"], shortForm: true });
    expect(codes(c, "problem")).toEqual([]);
    expect(codes(c, "warning")).toEqual([]);
    expect(codes(c, "ok")).toEqual(expect.arrayContaining(["polish", "facts_ok", "readable", "ok", "goal_ok"]));
  });

  it("flags English text, shouting headline, generic CTA and a CTA that does not ask for contact", () => {
    const bad = variant({
      headline: "NOWA OFERTA!!! NAJLEPSZE MIESZKANIE",
      sections: [{ key: "body", label: "Treść", content: "This is the best new home for you and your family with a great view of the city and the park." }],
      cta: "Zapraszamy do kontaktu",
    });
    const c = textQa({ variant: bad, goal: "leads", ctaType: "contact", ruleFindings: [], factWords: [], shortForm: true });
    expect(codes(c, "problem")).toContain("not_polish");
    expect(codes(c)).toEqual(expect.arrayContaining(["caps", "stock", "exclaim", "generic", "goal_contact", "vague"]));
    // Every non-ok check proposes a fix.
    expect(c.filter((x) => x.severity === "warning" || x.severity === "problem").every((x) => x.fix)).toBe(true);
  });

  it("long sentences raise the readability estimate", () => {
    const long = "Mieszkanie znajdujące się w zrewitalizowanej kamienicy charakteryzuje się nieprzeciętnymi rozwiązaniami architektonicznymi oraz wyjątkowo funkcjonalnym rozplanowaniem pomieszczeń mieszkalnych, które zapewniają komfortowe użytkowanie przez wieloosobowe rodziny poszukujące przestronnych wnętrz w centrum miasta.";
    const r = readability(long);
    expect(r.longSentences).toBe(1);
    expect(r.fog).toBeGreaterThan(14);
    const c = textQa({ variant: variant({ headline: "Kamienica w centrum, 3 pokoje", sections: [{ key: "b", label: "b", content: long }], cta: "Zadzwoń" }), goal: "sales", ctaType: "contact", ruleFindings: [], factWords: [], shortForm: true });
    expect(codes(c, "warning")).toContain("hard");
    expect(syllables("architektonicznymi")).toBe(7);
  });

  it("re-reports the generator's fact findings as problems", () => {
    const c = textQa({ variant: good, goal: "sales", ctaType: "contact", ruleFindings: [{ category: "property_facts", severity: "critical", source: "rules", message: "Metraż 60 m² nie występuje w danych nieruchomości", excerpt: "60 m²" }], factWords: [], shortForm: true });
    expect(c.find((x) => x.code === "property_facts")).toMatchObject({ severity: "problem", measured: "60 m²" });
    expect(codes(c)).not.toContain("facts_ok");
  });

  it("language score ignores hashtags and links", () => {
    expect(languageScore("#home #the #and https://example.com/the-and Mieszkanie jest na sprzedaż").en).toBe(0);
  });
});

/** Solid background with a block of "text" pixels. */
function raster(w: number, h: number, bg: [number, number, number], fg: [number, number, number], box: { x: number; y: number; w: number; h: number }): RasterRGBA {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    // Glyph-like stripes inside the box (about 30% coverage).
    const inText = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h && x % 10 < 3;
    const c = inText ? fg : bg;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

describe("graphic QA", () => {
  const design = graphicDesignSchema.parse({ format: "square", template: "editorial", propertyId: null, slides: defaultSlides("square", []) });
  const text = (key: string, b: { x: number; y: number; w: number; h: number }, size = 40): LayoutElement => ({ key, kind: "text", label: key, ...b, size });

  it("measures contrast on pixels (WCAG formula)", () => {
    expect(contrast(relLum(0, 0, 0), relLum(255, 255, 255))).toBeCloseTo(21, 0);
    const box = { x: 100, y: 100, w: 300, h: 60 };
    expect(measureTextContrast(raster(540, 540, [255, 255, 255], [20, 20, 20], box), box)!.ratio).toBeGreaterThan(15);
    expect(measureTextContrast(raster(540, 540, [255, 255, 255], [215, 215, 215], box), box)!.ratio).toBeLessThan(1.6);
  });

  it("flags low contrast, small text, edges, story UI zone, overlap, cut text and off-brand colours", () => {
    const box = { x: 100, y: 100, w: 300, h: 60 };
    const r = raster(1080, 1080, [255, 255, 255], [215, 215, 215], box);
    const c = graphicQa({
      design: { ...design, colors: { primary: "#FF0000" }, showLogo: false },
      brand,
      slides: [{
        index: 0, width: 1080, height: 1080, raster: r, photoIds: [],
        layout: [text("title", box), text("subtitle", { x: 120, y: 110, w: 300, h: 40 }, 16), text("price", { x: 5, y: 900, w: 200, h: 50 })],
        warnings: ["Slajd 1: tekst „Bardzo długi tytuł…” skrócony."],
      }],
      photos: new Map(),
      factWarnings: ["Kwota 1 200 000 zł nie występuje w danych"],
    });
    expect(codes(c, "problem")).toEqual(expect.arrayContaining(["low_contrast", "small_text", "overlap", "text_cut", "fact"]));
    expect(codes(c)).toEqual(expect.arrayContaining(["edge", "colors", "no_logo"]));
    expect(c.every((x) => x.method)).toBe(true);
  });

  it("flags upscaled photos and heavy crops", () => {
    const photo: LayoutElement = { key: "photo0", kind: "photo", label: "Zdjęcie", x: 0, y: 0, w: 1080, h: 1080 };
    const c = graphicQa({
      design, brand, factWarnings: [],
      slides: [{ index: 0, width: 1080, height: 1080, raster: raster(108, 108, [128, 128, 128], [128, 128, 128], { x: 0, y: 0, w: 0, h: 0 }), photoIds: ["p1"], layout: [photo], warnings: [] }],
      photos: new Map([["p1", { width: 640, height: 220 }]]),
    });
    expect(c.find((x) => x.code === "upscaled")).toMatchObject({ severity: "problem" });
    expect(codes(c)).toContain("heavy_crop");
  });

  it("real render: brand design passes contrast and margins; text on its own colour fails", async () => {
    const run = async (d: GraphicDesign) => {
      const r = await renderSlideSvg({ design: d, brand, photos: new Map(), logo: null }, 0);
      const raw = await sharp(svgToPng(r.svg, 540)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return graphicQa({ design: d, brand, factWarnings: [], photos: new Map(), slides: [{ index: 0, width: r.width, height: r.height, layout: r.layout, warnings: r.warnings, photoIds: [], raster: { width: raw.info.width, height: raw.info.height, data: raw.data } }] });
    };
    const base = graphicDesignSchema.parse({ format: "square", template: "corporate", propertyId: null, slides: defaultSlides("square", []).slice(0, 1).map((s) => ({ ...s, texts: { title: "Trzy pokoje z balkonem", details: "54,5 m² · 3 pokoje", price: "899 000 zł" } })) });
    const ok = await run(base);
    expect(codes(ok, "problem").filter((x) => x === "low_contrast" || x === "overlap" || x === "text_cut")).toEqual([]);
    expect(codes(ok, "ok")).toEqual(expect.arrayContaining(["contrast_ok", "size_ok"]));
    const bad = await run({ ...base, slides: base.slides.map((s) => ({ ...s, overrides: { title: { color: "#F2F2F2" }, details: { color: "#F2F2F2" } } })) });
    expect(codes(bad)).toEqual(expect.arrayContaining(["element_colors"]));
    expect(bad.some((x) => x.area === "Kontrast" && (x.severity === "problem" || x.severity === "warning"))).toBe(true);
  });
});

describe("video QA", () => {
  const photo = "00000000-0000-4000-8000-0000000000a1";
  const design = (p: Record<string, unknown> = {}) => videoDesignSchema.parse({
    propertyId: "00000000-0000-4000-8000-000000000001", style: "modern", length: 15,
    hook: "Trzy pokoje na Mokotowie",
    scenes: [{ photoId: photo, headline: "Jasny salon", subline: "" }, { photoId: "00000000-0000-4000-8000-0000000000a2", headline: "Balkon", subline: "" }, { photoId: "00000000-0000-4000-8000-0000000000a3", headline: "Kuchnia", subline: "" }],
    cta: "Umów prezentację", scriptApproved: true, ...p,
  });
  const photos = new Map([[photo, { width: 3000, height: 4000 }], ["00000000-0000-4000-8000-0000000000a2", { width: 3000, height: 4000 }], ["00000000-0000-4000-8000-0000000000a3", { width: 3000, height: 4000 }]]);
  const probe: ProbeResult = { codec: "h264", pixFmt: "yuv420p", width: 1080, height: 1920, fps: 30, durationSec: 15.0, audioCodec: null, faststart: true, sizeBytes: 4_000_000 };

  it("good design and file pass timing, safe zones and export", () => {
    const c = videoQa({ design: design(), photos, musicDurationMs: null, probe, renderedVersion: 3, currentVersion: 3 });
    expect(codes(c, "problem")).toEqual([]);
    expect(codes(c, "warning")).toEqual([]);
    expect(codes(c, "ok")).toEqual(expect.arrayContaining(["timeline_ok", "safe_ok", "ok"]));
    expect(c.find((x) => x.area === "Eksport" && x.severity === "ok")!.measured).toContain("1080×1920");
  });

  it("flags subtitles too long for the scene, low-res photos, short music and a wrong file", () => {
    const long = "Przestronny salon z dużym oknem i wyjściem na balkon od podwórza";
    const c = videoQa({
      design: design({ length: 10, scenes: [{ photoId: photo, headline: long.slice(0, 60), subline: "Kuchnia z oknem, osobna łazienka i pokój dzienny z miejscem na biurko" }, { photoId: photo, headline: "", subline: "" }], musicAssetId: "00000000-0000-4000-8000-0000000000b1", cta: "Zadzwoń dziś i umów prezentację mieszkania z nami" }),
      photos: new Map([[photo, { width: 800, height: 600 }]]), musicDurationMs: 6000,
      probe: { ...probe, width: 720, height: 1280, durationSec: 12, fps: 25, codec: "hevc" }, renderedVersion: 2, currentVersion: 3,
    });
    expect(codes(c)).toEqual(expect.arrayContaining(["reading_time", "upscaled", "same_photo", "music_short", "cta_long", "stale", "codec", "size", "duration", "fps", "no_audio"]));
  });

  it("not rendered yet: says so instead of guessing", () => {
    const c = videoQa({ design: design({ scriptApproved: false }), photos, musicDurationMs: null, probe: null, renderedVersion: null, currentVersion: 1 });
    expect(codes(c, "info")).toEqual(expect.arrayContaining(["not_rendered", "not_approved"]));
  });

  it("estimates lines of on-screen text", () => {
    expect(estimateLines("", 80, false)).toBe(0);
    expect(estimateLines("Jasny salon", 80, false)).toBe(1);
    expect(estimateLines("Przestronny salon z dużym oknem i wyjściem na balkon od podwórza", 80, false)).toBeGreaterThanOrEqual(3);
  });

  it("MP4 faststart: moov before mdat", () => {
    const atom = (type: string, len = 16) => { const b = Buffer.alloc(len); b.writeUInt32BE(len, 0); b.write(type, 4, "latin1"); return b; };
    expect(mp4Faststart(Buffer.concat([atom("ftyp"), atom("moov"), atom("mdat")]))).toBe(true);
    expect(mp4Faststart(Buffer.concat([atom("ftyp"), atom("mdat"), atom("moov")]))).toBe(false);
    expect(mp4Faststart(atom("ftyp"))).toBeNull();
  });
});

describe("report", () => {
  it("orders problems first and counts", () => {
    const r = buildReport("text", [{ area: "A", code: "x", severity: "ok", message: "", method: "rule" }, { area: "A", code: "y", severity: "problem", message: "", method: "rule" }, { area: "B", code: "z", severity: "info", message: "", method: "rule" }]);
    expect(r.version).toBe(QA_VERSION);
    expect(r.checks.map((c) => c.code)).toEqual(["y", "z", "x"]);
    expect(r.summary).toEqual({ problems: 1, warnings: 0, infos: 1, passed: 1 });
  });
});
