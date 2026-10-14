import { z } from "zod";

export const sectionSchema = z.object({
  key: z.string().describe("Klucz sekcji dokładnie jak w <struktura>"),
  label: z.string().describe("Etykieta sekcji (dla sekcji z własną etykietą: pytanie / śródtytuł)"),
  content: z.string(),
});

export const variantSchema = z.object({
  angle: z.string().describe("Krótki opis kąta komunikacji / zastosowanej struktury"),
  headline: z.string().describe("Nagłówek; pusty string, jeśli format go nie używa"),
  hook: z.string().describe("Pierwsze zdanie przyciągające uwagę"),
  sections: z.array(sectionSchema),
  cta: z.string().describe("Główne wezwanie do działania"),
  hashtags: z.array(z.string()),
  notes: z.string().describe("Uwagi dla użytkownika, np. gdzie wstawić link"),
});
export type Variant = z.infer<typeof variantSchema>;

export const generationOutputSchema = z.object({
  variants: z.array(variantSchema),
  gaps: z.array(z.string()).describe("Brakujące informacje, które poprawiłyby tekst"),
});
export type GenerationOutput = z.infer<typeof generationOutputSchema>;

export const refineOutputSchema = z.object({
  variant: variantSchema,
  change_summary: z.string(),
});
export type RefineOutput = z.infer<typeof refineOutputSchema>;

export const QUALITY_CATEGORIES = {
  goal: "Zgodność z celem marketingowym",
  hook: "Siła początku",
  platform: "Dopasowanie do platformy",
  cta: "Sensowne CTA",
  brand: "Zgodność z marką",
  unverified_claims: "Brak niepotwierdzonych twierdzeń",
  property_facts: "Zgodność z parametrami nieruchomości",
  investment_promises: "Brak obietnic inwestycyjnych",
  language: "Naturalność języka",
} as const;
export type QualityCategory = keyof typeof QUALITY_CATEGORIES;
const CATEGORY_IDS = Object.keys(QUALITY_CATEGORIES) as [QualityCategory, ...QualityCategory[]];

export const reviewOutputSchema = z.object({
  checks: z.array(
    z.object({
      id: z.enum(CATEGORY_IDS),
      pass: z.boolean(),
      severity: z.enum(["info", "warning", "critical"]),
      note: z.string(),
    }),
  ),
  suggestions: z.array(z.string()),
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export const graphicCopyOutputSchema = z.object({
  slides: z.array(z.object({ fields: z.array(z.object({ key: z.string(), value: z.string() })) })),
  caption: z.string(),
  gaps: z.array(z.string()),
});
export type GraphicCopyOutput = z.infer<typeof graphicCopyOutputSchema>;

export interface QualityFinding {
  severity: "info" | "warning" | "critical";
  message: string;
  source: "rules" | "ai";
  excerpt?: string;
}

export interface QualityCheck {
  id: QualityCategory;
  label: string;
  status: "pass" | "warn" | "fail";
  findings: QualityFinding[];
}

export interface QualityReport {
  score: number;
  checks: QualityCheck[];
  reviewedByAi: boolean;
  repaired: boolean;
  suggestions: string[];
}

export function variantToText(v: Variant, opts: { includeLabels?: boolean } = {}): string {
  const parts: string[] = [];
  if (v.headline) parts.push(v.headline);
  for (const s of v.sections) {
    if (!s.content.trim()) continue;
    parts.push(opts.includeLabels ? `${s.label}\n${s.content}` : s.content);
  }
  if (v.cta && !parts.some((p) => p.includes(v.cta))) parts.push(v.cta);
  if (v.hashtags.length) parts.push(v.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "));
  return parts.join("\n\n");
}
