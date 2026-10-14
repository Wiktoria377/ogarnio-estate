/** Curated, OFL-licensed fonts with full Polish glyph coverage (assets/fonts). */
export interface FontDef {
  id: string;
  family: string;
  category: "serif" | "sans" | "display";
  weights: number[];
  note: string;
}

export const FONTS: FontDef[] = [
  { id: "playfair-display", family: "Playfair Display", category: "serif", weights: [400, 500, 600, 700], note: "Klasyczny kontrast, oferty premium" },
  { id: "cormorant-garamond", family: "Cormorant Garamond", category: "serif", weights: [400, 500, 600, 700], note: "Elegancki, lekki, luksusowy" },
  { id: "fraunces", family: "Fraunces", category: "serif", weights: [400, 500, 600, 700], note: "Ciepły, z charakterem" },
  { id: "lora", family: "Lora", category: "serif", weights: [400, 500, 600, 700], note: "Czytelny serif do dłuższych tekstów" },
  { id: "dm-serif-display", family: "DM Serif Display", category: "display", weights: [400], note: "Wyrazisty nagłówek" },
  { id: "instrument-serif", family: "Instrument Serif", category: "display", weights: [400], note: "Edytorski, nowoczesny" },
  { id: "manrope", family: "Manrope", category: "sans", weights: [400, 500, 600, 700], note: "Nowoczesny, neutralny" },
  { id: "dm-sans", family: "DM Sans", category: "sans", weights: [400, 500, 600, 700], note: "Geometryczny, przyjazny" },
  { id: "plus-jakarta-sans", family: "Plus Jakarta Sans", category: "sans", weights: [400, 500, 600, 700], note: "Miękki, współczesny" },
  { id: "montserrat", family: "Montserrat", category: "sans", weights: [400, 500, 600, 700], note: "Mocny, korporacyjny" },
  { id: "outfit", family: "Outfit", category: "sans", weights: [400, 500, 600, 700], note: "Lekki, minimalistyczny" },
  { id: "sora", family: "Sora", category: "sans", weights: [400, 500, 600, 700], note: "Techniczny, odważny" },
  { id: "space-grotesk", family: "Space Grotesk", category: "sans", weights: [400, 500, 600, 700], note: "Wyrazisty grotesk" },
  { id: "work-sans", family: "Work Sans", category: "sans", weights: [400, 500, 600, 700], note: "Spokojny, uniwersalny" },
  { id: "geist", family: "Geist", category: "sans", weights: [400, 500, 600, 700], note: "Precyzyjny, interfejsowy" },
];

export const FONT_IDS = FONTS.map((f) => f.id) as [string, ...string[]];

export function fontById(id: string): FontDef {
  return FONTS.find((f) => f.id === id) ?? FONTS.find((f) => f.id === "manrope")!;
}

/** Closest available weight (renderer has only static instances). */
export function nearestWeight(font: FontDef, weight: number): number {
  return font.weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), font.weights[0]!);
}
