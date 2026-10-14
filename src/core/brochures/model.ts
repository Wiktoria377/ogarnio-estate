import { z } from "zod";

/**
 * Brochures are data, not files: the PDF is rendered on demand from this JSON
 * plus the CURRENT property records (parameters and price always come from the
 * database), so a brochure never shows stale or invented numbers.
 */
export const BROCHURE_VARIANTS = {
  card: { label: "Karta oferty", description: "Jedna strona A4: zdjęcia, parametry, atuty i kontakt. Do wydruku i wysyłki mailem.", page: "A4 pionowo · 1 strona", min: 1, max: 1 },
  premium: { label: "Broszura premium", description: "Kilkustronicowa broszura: okładka, opis, parametry, galeria i kontakt.", page: "A4 pionowo · 5+ stron", min: 1, max: 1 },
  catalog: { label: "Katalog ofert", description: "Kilka nieruchomości w jednym pliku: okładka i karty ofert, po dwie na stronie.", page: "A4 pionowo · 2–12 ofert", min: 2, max: 12 },
  presentation: { label: "Prezentacja dla klienta", description: "Poziome slajdy przygotowane dla konkretnego klienta, z kolejnymi krokami.", page: "A4 poziomo · 6 slajdów", min: 1, max: 1 },
} as const;
export type BrochureVariant = keyof typeof BROCHURE_VARIANTS;
export const BROCHURE_VARIANT_IDS = Object.keys(BROCHURE_VARIANTS) as [BrochureVariant, ...BrochureVariant[]];

const uuid = z.uuid();

export const brochureDesignSchema = z
  .object({
    variant: z.enum(BROCHURE_VARIANT_IDS),
    propertyIds: z.array(uuid).min(1).max(12),
    /** Cover headline; for single-property variants defaults to the property title. */
    title: z.string().max(120).default(""),
    subtitle: z.string().max(220).default(""),
    /** Lead/description. Defaults to the office's own property description (user-provided facts). */
    intro: z.string().max(4000).default(""),
    highlights: z.array(z.string().max(110)).max(8).default([]),
    /** Selected photos per property, in order. Empty = first photos of the property. */
    photoIds: z.record(z.string(), z.array(uuid).max(16)).default({}),
    clientName: z.string().max(80).default(""),
    nextSteps: z.array(z.string().max(110)).max(5).default([]),
    agent: z.object({ name: z.string().max(80).default(""), phone: z.string().max(40).default(""), email: z.string().max(120).default("") }).default({ name: "", phone: "", email: "" }),
    showPrice: z.boolean().default(true),
    labelVisualizations: z.boolean().default(true),
    accent: z.enum(["primary", "secondary", "accent"]).default("primary"),
  })
  .superRefine((d, ctx) => {
    const v = BROCHURE_VARIANTS[d.variant];
    if (d.propertyIds.length < v.min || d.propertyIds.length > v.max)
      ctx.addIssue({ code: "custom", path: ["propertyIds"], message: v.min === v.max ? `${v.label} obejmuje jedną nieruchomość.` : `${v.label}: wybierz od ${v.min} do ${v.max} nieruchomości.` });
    if (new Set(d.propertyIds).size !== d.propertyIds.length) ctx.addIssue({ code: "custom", path: ["propertyIds"], message: "Nieruchomości nie mogą się powtarzać." });
  });
export type BrochureDesign = z.infer<typeof brochureDesignSchema>;

/** Which fields each variant actually uses (the editor hides the rest). */
export const VARIANT_FIELDS: Record<BrochureVariant, { title: boolean; subtitle: boolean; intro: boolean; highlights: boolean; client: boolean; nextSteps: boolean; photos: boolean }> = {
  card: { title: true, subtitle: false, intro: true, highlights: true, client: false, nextSteps: false, photos: true },
  premium: { title: true, subtitle: true, intro: true, highlights: true, client: false, nextSteps: false, photos: true },
  catalog: { title: true, subtitle: true, intro: false, highlights: false, client: false, nextSteps: false, photos: false },
  presentation: { title: true, subtitle: false, intro: true, highlights: true, client: true, nextSteps: true, photos: true },
};
