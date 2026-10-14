import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BROCHURE_VARIANT_IDS, brochureDesignSchema } from "@/core/brochures/model";
import { renderBrochure, type BrochurePhoto } from "@/core/brochures/render";
import { brand, property } from "./engine.test";

const OUT = process.env.BROCHURE_OUT;
const photos: BrochurePhoto[] = [1, 2, 3, 1, 2, 3].map((n, i) => ({ id: `p${i}`, data: readFileSync(`tests/fixtures/house-${n}.jpg`), isVisualization: i === 1, caption: i === 3 ? "Salon z aneksem kuchennym" : null }));
const longText = "Mieszkanie znajduje się w kameralnym budynku z 2012 roku, na drugim piętrze z czterech. Salon z aneksem kuchennym wychodzi na balkon od strony zielonego podwórza, dzięki czemu jest tu cicho. Dwie sypialnie są od siebie oddzielone, a łazienka ma okno. W budynku jest winda. Źródło opisu: biuro; wszystkie dane można zweryfikować podczas prezentacji. ".repeat(4);
const rich = { ...property, features: ["balkon od strony podwórza", "osobna kuchnia z oknem", "piwnica"], amenities: ["winda", "rowerownia"], description: longText };

describe("brochures", () => {
  for (const variant of BROCHURE_VARIANT_IDS) {
    it(`renders ${variant} with Polish glyphs and no fictional data`, async () => {
      const ids = variant === "catalog" ? [property.id, "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004"] : [property.id];
      const design = brochureDesignSchema.parse({ variant, propertyIds: ids, subtitle: "Cisza zielonego podwórza, 10 minut do metra pieszo według mapy biura", clientName: variant === "presentation" ? "Pani Joanna Żółkiewska" : "", nextSteps: variant === "presentation" ? ["Prezentacja na miejscu", "Weryfikacja księgi wieczystej", "Ustalenie terminu umowy"] : [], agent: { name: "Łukasz Ślęzak", phone: "", email: "" } });
      const properties = ids.map((id, i) => ({ row: { ...rich, id, title: i ? `Dom szeregowy w Ząbkach ${i}` : rich.title, price: 899000 + i * 150000 }, photos: photos.slice(i % 3) }));
      const r = await renderBrochure({ design, brand, logo: null, properties, asOf: "13.10.2026" }, "Test");
      expect(r.pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(r.pages).toBeGreaterThanOrEqual(variant === "card" ? 1 : 4);
      if (variant === "card") expect(r.pages).toBe(1);
      if (OUT) {
        mkdirSync(OUT, { recursive: true });
        writeFileSync(`${OUT}/${variant}.pdf`, r.pdf);
        writeFileSync(`${OUT}/${variant}.json`, JSON.stringify(r.warnings, null, 2));
      }
    });
  }
  it("rejects a catalog with one property and a card with many", () => {
    expect(brochureDesignSchema.safeParse({ variant: "catalog", propertyIds: [property.id] }).success).toBe(false);
    expect(brochureDesignSchema.safeParse({ variant: "card", propertyIds: [property.id, "00000000-0000-4000-8000-000000000003"] }).success).toBe(false);
  });
});
