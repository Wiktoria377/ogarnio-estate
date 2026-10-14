import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORMAT_IDS, TEMPLATE_IDS, defaultSlides, graphicDesignSchema } from "@/core/graphics/design";
import { renderSlideSvg, type RenderPhoto } from "@/core/graphics/templates";
import { svgToPng } from "@/core/graphics/render";
import { fitText, layoutColumn, measure } from "@/core/graphics/text";
import { fallbackFont, loadFont } from "@/core/graphics/fonts";
import { applyFactTexts, factTexts } from "@/verticals/real-estate/graphics";
import { brand, property } from "./engine.test";

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const photos = new Map<string, RenderPhoto>(ids.map((id, i) => [id, { id, data: readFileSync(`tests/fixtures/house-${i + 1}.jpg`), isVisualization: i === 1 }]));
const OUT = process.env.GRAPHICS_OUT;

describe("text fitting", () => {
  const style = { font: loadFont("playfair-display", 500), fallback: fallbackFont(), size: 80, lineHeight: 1.1, color: "#000" };
  it("shrinks long text until it fits the box", () => {
    const f = fitText("Przestronne mieszkanie z widokiem na park i dwoma balkonami w spokojnej okolicy", style, 600, 300);
    expect(f.height).toBeLessThanOrEqual(300.5);
    for (const l of f.lines) expect(measure(l, style, f.size)).toBeLessThanOrEqual(600.5);
  });
  it("truncates with an ellipsis instead of overflowing", () => {
    const f = fitText("słowo ".repeat(200), style, 400, 120, { minSize: 40 });
    expect(f.overflow).toBe(true);
    expect(f.height).toBeLessThanOrEqual(120.5);
    expect(f.lines.at(-1)!.endsWith("…")).toBe(true);
  });
  it("stacks a column without overlaps", () => {
    const col = layoutColumn({ x: 0, y: 0, w: 800, h: 500 }, [
      { text: "NADTYTUŁ", style: { ...style, size: 24 }, gap: 20 },
      { text: "Nagłówek ".repeat(12), style, flex: true, gap: 20 },
      { text: "54,5 m² · 3 pokoje", style: { ...style, size: 32 } },
    ]);
    expect(col.height).toBeLessThanOrEqual(500.5);
    for (let i = 1; i < col.fitted.length; i++) expect(col.tops[i]!).toBeGreaterThanOrEqual(col.tops[i - 1]! + col.fitted[i - 1]!.height);
  });
  it("renders the m² sign with a fallback font when the face lacks it", () => {
    const serif = { ...style, font: loadFont("instrument-serif", 400) };
    expect(measure("²", serif)).toBeGreaterThan(0);
  });
});

describe("templates", () => {
  const facts = factTexts(property, brand);
  for (const format of FORMAT_IDS) {
    for (const template of TEMPLATE_IDS) {
      it(`renders ${template} / ${format}`, async () => {
        const design = graphicDesignSchema.parse({
          format, template, propertyId: property.id,
          slides: applyFactTexts(defaultSlides(format, ids), facts).map((s) => ({ ...s, texts: { ...s.texts, badge: "Nowa oferta", title: s.texts.title || "Jasne wnętrza i balkon od podwórza", body: "Salon z aneksem wychodzi na zieloną stronę budynku." } })),
        });
        for (let i = 0; i < design.slides.length; i++) {
          const r = await renderSlideSvg({ design, brand, photos, logo: null }, i);
          expect(r.svg.startsWith("<svg")).toBe(true);
          const png = svgToPng(r.svg, 540);
          expect(png.subarray(1, 4).toString()).toBe("PNG");
          if (OUT) {
            mkdirSync(OUT, { recursive: true });
            writeFileSync(`${OUT}/${template}-${format}-${i + 1}.png`, png);
          }
        }
      });
    }
  }
});
