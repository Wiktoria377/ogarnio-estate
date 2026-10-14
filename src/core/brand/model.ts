import { z } from "zod";
import { FONT_IDS } from "./fonts";
import type { BrandExtended } from "./profile";

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Podaj kolor w formacie #RRGGBB")
  .transform((v) => v.toUpperCase());

export const brandColorsSchema = z.object({
  primary: hex,
  secondary: hex,
  accent: hex,
  background: hex,
  text: hex,
});
export type BrandColors = z.infer<typeof brandColorsSchema>;

export const DEFAULT_COLORS: BrandColors = {
  primary: "#6D4AFF",
  secondary: "#1F1B2E",
  accent: "#C9B8FF",
  background: "#FAF9F7",
  text: "#211F26",
};

export const BRAND_STYLES = {
  luxury: {
    label: "Luxury Real Estate",
    description: "Powściągliwość, przestrzeń, detal. Mniej słów, więcej konkretu o materiałach i widoku.",
    voice: "Spokojny, pewny, bez superlatyw. Krótkie zdania, precyzyjne rzeczowniki, zero wykrzykników.",
  },
  modern_minimal: {
    label: "Modern Minimal",
    description: "Czysta typografia, dużo światła, fakty podane bez ozdobników.",
    voice: "Rzeczowy i jasny. Jedna myśl na zdanie, konkret zamiast przymiotników.",
  },
  elegant_corporate: {
    label: "Elegant Corporate",
    description: "Wiarygodność i porządek. Komunikacja doradcy, który zna procedury.",
    voice: "Profesjonalny, uprzejmy, merytoryczny. Terminologia poprawna, ale zrozumiała.",
  },
  warm_lifestyle: {
    label: "Warm Lifestyle",
    description: "Codzienne życie w miejscu: poranek, spacer, sąsiedztwo. Ciepło bez cukru.",
    voice: "Ciepły, obrazowy, bliski. Sceny z życia oparte wyłącznie na podanych cechach.",
  },
  bold_contemporary: {
    label: "Bold & Contemporary",
    description: "Wyraziste nagłówki, kontrast, energia. Odważny, ale uczciwy.",
    voice: "Dynamiczny, bezpośredni, z charakterem. Mocne czasowniki, krótkie akapity.",
  },
} as const;
export type BrandStyle = keyof typeof BRAND_STYLES;

export const COMMUNICATION_STYLES = {
  professional_warm: { label: "Profesjonalny i ciepły", hint: "Kompetentnie, życzliwie, bez dystansu urzędu." },
  expert_formal: { label: "Ekspercki i formalny", hint: "Doradca prawno-rynkowy. Precyzja, pełne zdania." },
  friendly_direct: { label: "Przyjazny i bezpośredni", hint: "Jak rozmowa z dobrym znajomym, który zna rynek." },
  premium_restrained: { label: "Premium, powściągliwy", hint: "Mniej znaczy więcej. Cisza zamiast zachwytów." },
  energetic_modern: { label: "Energiczny i nowoczesny", hint: "Tempo, konkret, lekki humor tam, gdzie pasuje." },
} as const;
export type CommunicationStyle = keyof typeof COMMUNICATION_STYLES;

export const ADDRESS_FORMS = {
  ty: "Na „Ty”",
  pan_pani: "Per Pan / Pani",
  wy: "Na „Wy” (do grupy)",
} as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksymalnie ${max} znaków`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const url = z
  .string()
  .trim()
  .max(240)
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v), "Podaj pełny adres zaczynający się od https://")
  .nullable()
  .optional();

export const SOCIAL_NETWORKS = ["instagram", "facebook", "linkedin", "tiktok", "youtube"] as const;

export const brandFormSchema = z.object({
  company_name: z.string().trim().min(1, "Podaj nazwę firmy").max(120),
  tagline: optionalText(160),
  colors: brandColorsSchema,
  heading_font: z.enum(FONT_IDS),
  body_font: z.enum(FONT_IDS),
  contact_email: z
    .string()
    .trim()
    .max(160)
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || z.email().safeParse(v).success, "Nieprawidłowy adres e-mail")
    .nullable()
    .optional(),
  contact_phone: optionalText(40),
  address: optionalText(240),
  website: url,
  socials: z.object(Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, url])) as Record<(typeof SOCIAL_NETWORKS)[number], typeof url>),
  brand_style: z.enum(Object.keys(BRAND_STYLES) as [BrandStyle, ...BrandStyle[]]),
  personality: optionalText(1000),
  target_audience: optionalText(1000),
  communication_style: z.enum(Object.keys(COMMUNICATION_STYLES) as [CommunicationStyle, ...CommunicationStyle[]]),
  address_form: z.enum(["ty", "pan_pani", "wy"]),
  emoji_policy: z.enum(["none", "sparing"]),
  preferred_phrases: optionalText(1000),
  avoided_phrases: optionalText(1000),
});
export type BrandForm = z.infer<typeof brandFormSchema>;

/** Brand data as consumed by the marketing and graphics engines (industry-agnostic). */
export interface BrandKit {
  companyName: string;
  tagline: string | null;
  colors: BrandColors;
  headingFont: string;
  bodyFont: string;
  contact: { email: string | null; phone: string | null; address: string | null; website: string | null };
  socials: Partial<Record<(typeof SOCIAL_NETWORKS)[number], string>>;
  style: BrandStyle;
  personality: string | null;
  targetAudience: string | null;
  communicationStyle: CommunicationStyle;
  addressForm: keyof typeof ADDRESS_FORMS;
  emojiPolicy: "none" | "sparing";
  preferredPhrases: string | null;
  avoidedPhrases: string | null;
  logoKey: string | null;
  /** Approved Brand Profile elements beyond the basic columns (etap 4). */
  profile: BrandExtended;
  profileVersion: number | null;
  /** Explicit Brand Memory (etap 4); null when memory is disabled or empty. */
  memory?: import("@/core/brand-memory/learn").BrandMemoryContext | null;
}

export function parseColors(value: unknown): BrandColors {
  const parsed = brandColorsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_COLORS;
}
