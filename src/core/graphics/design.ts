import { z } from "zod";
import { brandColorsSchema } from "@/core/brand/model";
import { FONT_IDS } from "@/core/brand/fonts";

/**
 * Graphic designs are data, not pixels: a format, a template and per-slide texts
 * and photo references. Every render is reproduced from this JSON, so a material
 * reopened from the library is fully editable again.
 */
export const FORMATS = {
  square: { label: "Post kwadratowy", size: "1080 × 1080", w: 1080, h: 1080, multi: false },
  portrait: { label: "Post pionowy", size: "1080 × 1350", w: 1080, h: 1350, multi: false },
  story: { label: "Stories / Reels", size: "1080 × 1920", w: 1080, h: 1920, multi: false },
  carousel: { label: "Karuzela", size: "1080 × 1350, wiele slajdów", w: 1080, h: 1350, multi: true },
  stories: { label: "Seria Stories", size: "1080 × 1920, wiele plansz", w: 1080, h: 1920, multi: true },
} as const;
export type FormatId = keyof typeof FORMATS;
export const FORMAT_IDS = Object.keys(FORMATS) as [FormatId, ...FormatId[]];

export const TEMPLATE_CATEGORIES = {
  luxury: "Luxury Real Estate",
  minimal: "Minimalist",
  corporate: "Corporate",
  editorial: "Editorial",
  architecture: "Modern Architecture",
  bold: "Bold Social Media",
} as const;
export type TemplateCategory = keyof typeof TEMPLATE_CATEGORIES;

/**
 * Twelve layouts in six categories. Each differs in composition (photo
 * placement, type scale, decorations, where price and parameters live), not
 * only in colour; all of them take colours, fonts and logo from the brand.
 */
export const TEMPLATES = {
  arch: { label: "Łuk premium", category: "luxury", description: "Ciemne tło, zdjęcie w łuku, typografia szeryfowa i złota linia.", photos: 1 },
  noir: { label: "Noir", category: "luxury", description: "Pełne zdjęcie w ciemnej oprawie, cienkie ramy, rozstrzelone kapitaliki.", photos: 1 },
  minimal: { label: "Minimal", category: "minimal", description: "Zdjęcie na całą powierzchnię, delikatny gradient i biały tekst.", photos: 1 },
  gallery: { label: "Galeria", category: "minimal", description: "Zdjęcie w passe-partout jak w galerii, opis jak etykieta dzieła.", photos: 1 },
  frame: { label: "Rama", category: "corporate", description: "Pełne zdjęcie w cienkiej ramie i karta z ceną.", photos: 1 },
  corporate: { label: "Pasek danych", category: "corporate", description: "Zdjęcie i pas marki z parametrami w kolumnach, cena w osobnym polu.", photos: 1 },
  editorial: { label: "Edytorski", category: "editorial", description: "Zdjęcie u góry, spokojny panel z tekstem. Uniwersalny.", photos: 1 },
  magazine: { label: "Magazyn", category: "editorial", description: "Okładka magazynu: duży szeryfowy tytuł na zdjęciu i linia redakcyjna.", photos: 1 },
  collage: { label: "Kolaż", category: "architecture", description: "Trzy zdjęcia w siatce i pasek z danymi oferty.", photos: 3 },
  lines: { label: "Linie architektoniczne", category: "architecture", description: "Asymetryczny kadr, siatka cienkich linii i pionowy podpis.", photos: 1 },
  split: { label: "Mocny podział", category: "bold", description: "Duży nagłówek na kolorze marki i zdjęcie. Wyrazisty.", photos: 1 },
  pricetag: { label: "Cena w centrum", category: "bold", description: "Tytuł na paskach koloru i okrągła naklejka z ceną.", photos: 1 },
} as const satisfies Record<string, { label: string; category: TemplateCategory; description: string; photos: number }>;
export type TemplateId = keyof typeof TEMPLATES;
export const TEMPLATE_IDS = Object.keys(TEMPLATES) as [TemplateId, ...TemplateId[]];

export interface TextSlot {
  key: string;
  label: string;
  maxChars: number;
  /** fact: filled from property/brand data (AI never writes it); ai: creative copy. */
  source: "fact" | "ai";
  multiline?: boolean;
}

export const SLIDE_KINDS = {
  cover: {
    label: "Okładka",
    photos: 1,
    slots: [
      { key: "badge", label: "Etykieta", maxChars: 24, source: "ai" },
      { key: "eyebrow", label: "Nadtytuł", maxChars: 44, source: "fact" },
      { key: "title", label: "Nagłówek", maxChars: 70, source: "ai" },
      { key: "details", label: "Parametry", maxChars: 70, source: "fact" },
      { key: "price", label: "Cena", maxChars: 32, source: "fact" },
    ],
  },
  photo: {
    label: "Zdjęcie z opisem",
    photos: 1,
    slots: [
      { key: "title", label: "Nagłówek", maxChars: 50, source: "ai" },
      { key: "body", label: "Opis", maxChars: 170, source: "ai", multiline: true },
    ],
  },
  features: {
    label: "Lista atutów",
    photos: 0,
    slots: [
      { key: "title", label: "Nagłówek", maxChars: 50, source: "ai" },
      { key: "item1", label: "Atut 1", maxChars: 60, source: "ai" },
      { key: "item2", label: "Atut 2", maxChars: 60, source: "ai" },
      { key: "item3", label: "Atut 3", maxChars: 60, source: "ai" },
      { key: "item4", label: "Atut 4", maxChars: 60, source: "ai" },
      { key: "item5", label: "Atut 5", maxChars: 60, source: "ai" },
    ],
  },
  facts: {
    label: "Parametry",
    photos: 1,
    slots: [
      { key: "title", label: "Nagłówek", maxChars: 40, source: "ai" },
      { key: "rows", label: "Parametry (etykieta: wartość, w osobnych liniach)", maxChars: 320, source: "fact", multiline: true },
    ],
  },
  cta: {
    label: "Kontakt i CTA",
    photos: 0,
    slots: [
      { key: "title", label: "Nagłówek", maxChars: 60, source: "ai" },
      { key: "body", label: "Tekst", maxChars: 140, source: "ai", multiline: true },
      { key: "contact", label: "Kontakt", maxChars: 140, source: "fact", multiline: true },
    ],
  },
} as const satisfies Record<string, { label: string; photos: number; slots: readonly TextSlot[] }>;
export type SlideKind = keyof typeof SLIDE_KINDS;
export const SLIDE_KIND_IDS = Object.keys(SLIDE_KINDS) as [SlideKind, ...SlideKind[]];

export const MAX_SLIDES = 10;

const uuid = z.uuid();

/**
 * Per-element edits made on the canvas. Keys are text slot keys, "photo0".."photo2",
 * "logo", "badge" or "decor". Text keeps reflowing inside its layout box; dx/dy move
 * the element afterwards (clamped to safe margins by the renderer).
 */
export const elementOverrideSchema = z
  .object({
    dx: z.number().min(-1920).max(1920).optional(),
    dy: z.number().min(-1920).max(1920).optional(),
    scale: z.number().min(0.5).max(2).optional(),
    hidden: z.boolean().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    font: z.enum(FONT_IDS).optional(),
    zoom: z.number().min(1).max(3).optional(),
    fx: z.number().min(0).max(1).optional(),
    fy: z.number().min(0).max(1).optional(),
  })
  .strict();
export type ElementOverride = z.infer<typeof elementOverrideSchema>;

export const slideSchema = z.object({
  kind: z.enum(SLIDE_KIND_IDS),
  photoIds: z.array(uuid).max(3),
  texts: z.record(z.string().max(20), z.string().max(400)),
  overrides: z.record(z.string().max(20), elementOverrideSchema).default({}),
});
export type Slide = z.infer<typeof slideSchema>;

export const graphicDesignSchema = z.object({
  format: z.enum(FORMAT_IDS),
  template: z.enum(TEMPLATE_IDS),
  propertyId: uuid.nullable(),
  slides: z.array(slideSchema).min(1).max(MAX_SLIDES),
  colors: brandColorsSchema.partial().default({}),
  headingFont: z.enum(FONT_IDS).nullable().default(null),
  bodyFont: z.enum(FONT_IDS).nullable().default(null),
  showLogo: z.boolean().default(true),
  /** Photos flagged as visualizations get a visible "Wizualizacja" label. */
  labelVisualizations: z.boolean().default(true),
  caption: z.string().max(2200).default(""),
});
export type GraphicDesign = z.infer<typeof graphicDesignSchema>;

/** Elements the user can select on the canvas, with Polish labels. */
export function elementLabel(kind: SlideKind, key: string): string {
  const slot = SLIDE_KINDS[kind].slots.find((s) => s.key === key) as TextSlot | undefined;
  if (slot) return slot.label;
  if (key.startsWith("photo")) return `Zdjęcie ${Number(key.slice(5)) + 1}`;
  return ({ logo: "Logo", badge: "Etykieta", decor: "Dekoracje", pager: "Numer slajdu" } as Record<string, string>)[key] ?? key;
}

export function slotsFor(kind: SlideKind): readonly TextSlot[] {
  return SLIDE_KINDS[kind].slots;
}

/** Default carousel narrative: cover → photo → features → facts → photo → CTA. */
export function defaultSlides(format: FormatId, photoIds: string[]): Slide[] {
  const p = (i: number) => (photoIds.length ? [photoIds[i % photoIds.length]!] : []);
  const base = { texts: {}, overrides: {} };
  if (!FORMATS[format].multi) return [{ kind: "cover", photoIds: photoIds.slice(0, 3), ...base }];
  if (format === "stories")
    return [
      { kind: "cover", photoIds: photoIds.slice(0, 3), ...base },
      { kind: "facts", photoIds: p(1), ...base },
      { kind: "cta", photoIds: [], ...base },
    ];
  return [
    { kind: "cover", photoIds: photoIds.slice(0, 3), ...base },
    { kind: "photo", photoIds: p(1), ...base },
    { kind: "features", photoIds: [], ...base },
    { kind: "facts", photoIds: p(2), ...base },
    { kind: "photo", photoIds: p(3), ...base },
    { kind: "cta", photoIds: [], ...base },
  ];
}

/**
 * An office's own template: look and layout only (template, colours, fonts,
 * per-element overrides and slide structure). Never texts, photos or facts,
 * so it can be reused for any property.
 */
export const savedTemplateSchema = z.object({
  template: z.enum(TEMPLATE_IDS),
  colors: brandColorsSchema.partial().default({}),
  headingFont: z.enum(FONT_IDS).nullable().default(null),
  bodyFont: z.enum(FONT_IDS).nullable().default(null),
  showLogo: z.boolean().default(true),
  labelVisualizations: z.boolean().default(true),
  slides: z.array(z.object({ kind: z.enum(SLIDE_KIND_IDS), overrides: z.record(z.string().max(20), elementOverrideSchema).default({}) })).min(1).max(MAX_SLIDES),
});
export type SavedTemplate = z.infer<typeof savedTemplateSchema>;

export function toSavedTemplate(d: GraphicDesign): SavedTemplate {
  return {
    template: d.template,
    colors: d.colors,
    headingFont: d.headingFont,
    bodyFont: d.bodyFont,
    showLogo: d.showLogo,
    labelVisualizations: d.labelVisualizations,
    slides: d.slides.map((s) => ({ kind: s.kind, overrides: s.overrides ?? {} })),
  };
}

/** Builds slides from a saved template's structure, assigning the property's photos in order. */
export function slidesFromSaved(t: SavedTemplate, photoIds: string[]): Slide[] {
  let next = 1;
  return t.slides.map((s, i) => {
    const want = s.kind === "cover" ? TEMPLATES[t.template].photos : SLIDE_KINDS[s.kind].photos;
    let ids: string[] = [];
    if (i === 0 || s.kind === "cover") ids = photoIds.slice(0, Math.max(1, want));
    else if (want && photoIds.length) ids = [photoIds[next++ % photoIds.length]!];
    return { kind: s.kind, photoIds: ids, texts: {}, overrides: s.overrides };
  });
}
