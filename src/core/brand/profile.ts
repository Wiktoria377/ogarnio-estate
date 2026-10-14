import { z } from "zod";
import { brandFormSchema } from "./model";

/**
 * Brand Profile (etap 4): the ten elements the generators use. The first ones
 * already live as columns of brand_profiles (colors, fonts, logo, style, voice),
 * the rest are kept in brand_profiles.extended. A profile is binding only after
 * the user approves it; every approved state is a version that can be restored.
 */
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);
const list = (item: number, max: number) =>
  z
    .array(text(item))
    .max(max)
    .default([])
    .transform((a) => [...new Set(a.map((s) => s.trim()).filter(Boolean))]);

export const audienceSchema = z.object({ name: text(80).min(1), description: text(300).default("") });

export const brandExtendedSchema = z.object({
  graphic_style: optText(500),
  photo_style: optText(500),
  typography_notes: optText(300),
  characteristic_words: list(60, 30),
  avoid_words: list(60, 40),
  ctas: list(80, 10),
  audiences: z.array(audienceSchema).max(8).default([]),
  guidelines: list(300, 15),
  differentiators: list(200, 8),
  message_structure: optText(500),
  offer_presentation: optText(300),
  logo_variants: z.array(z.object({ asset_id: z.uuid(), label: text(60).min(1) })).max(6).default([]),
});
export type BrandExtended = z.infer<typeof brandExtendedSchema>;

export const EMPTY_EXTENDED: BrandExtended = brandExtendedSchema.parse({});

export function parseExtended(value: unknown): BrandExtended {
  const r = brandExtendedSchema.safeParse(value ?? {});
  return r.success ? r.data : EMPTY_EXTENDED;
}

/** A full profile state as stored in brand_profile_versions.snapshot. */
export const profileSnapshotSchema = brandFormSchema.extend({
  logo_asset_id: z.uuid().nullable().default(null),
  extended: brandExtendedSchema.default(EMPTY_EXTENDED),
});
export type ProfileSnapshot = z.infer<typeof profileSnapshotSchema>;

/** The ten elements of the brief, with the snapshot fields each one covers. */
export const PROFILE_ELEMENTS = [
  { id: "palette", label: "Paleta kolorów", fields: ["colors"] },
  { id: "typography", label: "Typografia", fields: ["heading_font", "body_font", "extended.typography_notes"] },
  { id: "logo", label: "Logo i warianty", fields: ["logo_asset_id", "extended.logo_variants"] },
  { id: "graphic_style", label: "Styl materiałów graficznych", fields: ["brand_style", "extended.graphic_style", "extended.photo_style"] },
  { id: "tone", label: "Tone of voice", fields: ["communication_style", "address_form", "emoji_policy", "personality"] },
  { id: "words", label: "Słowa charakterystyczne", fields: ["extended.characteristic_words", "preferred_phrases"] },
  { id: "avoid", label: "Słowa, których marka unika", fields: ["extended.avoid_words", "avoided_phrases"] },
  { id: "cta", label: "Preferowane CTA", fields: ["extended.ctas"] },
  { id: "audiences", label: "Grupy odbiorców", fields: ["extended.audiences", "target_audience"] },
  { id: "guidelines", label: "Wytyczne marketingowe", fields: ["extended.guidelines", "extended.differentiators", "extended.message_structure"] },
] as const;
export type ProfileElementId = (typeof PROFILE_ELEMENTS)[number]["id"];

/** Confidence of a detected trait: value 0–1 plus where it came from. */
export interface TraitConfidence {
  score: number;
  source: string;
  evidence?: string[];
}
export type ConfidenceMap = Partial<Record<ProfileElementId | string, TraitConfidence>>;

export const CONFIDENCE_LEVELS = [
  { min: 0.75, id: "confirmed", label: "Potwierdzone na stronie" },
  { min: 0.5, id: "likely", label: "Prawdopodobne" },
  { min: 0.01, id: "proposal", label: "Propozycja do sprawdzenia" },
  { min: -1, id: "unknown", label: "Nie ustalono" },
] as const;

export function confidenceLevel(score: number | undefined) {
  return CONFIDENCE_LEVELS.find((l) => (score ?? 0) >= l.min) ?? CONFIDENCE_LEVELS[3];
}

/** Words to avoid, from both the legacy phrase field and the structured list. */
export function avoidList(avoidedPhrases: string | null, ext: BrandExtended): string[] {
  const legacy = (avoidedPhrases ?? "").split(/[\n,;]/).map((s) => s.trim()).filter((s) => s.length > 2);
  return [...new Set([...legacy, ...ext.avoid_words].map((s) => s.toLowerCase()))];
}

/** Human-readable list of what changed between two snapshots (for history). */
export function diffSnapshots(a: Partial<ProfileSnapshot> | null, b: Partial<ProfileSnapshot>): string[] {
  if (!a) return ["Pierwsza wersja"];
  const changed: string[] = [];
  // Empty values are equal however they are stored ({} vs {instagram: null}, "" vs null).
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== "" && x !== undefined).map(([k, x]) => [k, norm(x)]).sort(([a], [b]) => String(a).localeCompare(String(b)))) : v === "" || v === undefined ? null : v;
  const same = (x: unknown, y: unknown) => JSON.stringify(norm(x)) === JSON.stringify(norm(y));
  const get = (s: Partial<ProfileSnapshot>, path: string) =>
    path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), s);
  for (const el of PROFILE_ELEMENTS) {
    if (el.fields.some((f) => !same(get(a, f), get(b, f)))) changed.push(el.label);
  }
  const basics = ["company_name", "tagline", "contact_email", "contact_phone", "address", "website", "socials"] as const;
  if (basics.some((k) => !same(a[k], b[k]))) changed.push("Dane firmy i kontakt");
  return changed;
}
