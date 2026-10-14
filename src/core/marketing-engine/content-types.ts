import type { ContentGroup, CtaType, Goal, Length, OutputKind, Platform } from "./taxonomy";

export interface SectionSpec {
  key: string;
  label: string;
  hint?: string;
  /** Soft limit enforced by QA and passed to the model. */
  maxChars?: number;
  optional?: boolean;
}

/** A repeated section, e.g. slides of a carousel or headline variants. */
export interface SequenceSpec {
  prefix: string;
  label: string;
  min: number;
  max: number;
  hint?: string;
  maxChars?: number;
  /** When true the model provides each item's own label (e.g. FAQ question, blog subheading). */
  modelLabels?: boolean;
}

export interface ContentTypeDef {
  id: string;
  group: ContentGroup;
  label: string;
  description: string;
  outputKind: OutputKind;
  defaultPlatform: Platform;
  platforms: Platform[];
  property: "required" | "optional" | "none";
  defaultGoal: Goal;
  defaultCta: CtaType;
  defaultLength: Length;
  /** Tags used by the skill selector to pick competencies for this type. */
  skillTags: string[];
  sections: SectionSpec[];
  sequence?: SequenceSpec;
  /** Sections appended after the sequence (e.g. carousel caption). */
  tailSections?: SectionSpec[];
  /** Content about market conditions: numbers allowed only from user-provided data. */
  marketData?: "required_for_numbers";
  usesHashtags?: boolean;
  /** Writes a single headline field. */
  usesHeadline?: boolean;
}

export const CONTENT_GROUPS: Record<ContentGroup, { label: string; description: string }> = {
  property: { label: "Nieruchomości", description: "Opisy, posty, karuzele i reklamy konkretnych ofert" },
  expert: { label: "Marketing ekspercki biura", description: "Edukacja, poradniki, rynek, zaufanie" },
  personal: { label: "Marka osobista agenta", description: "Wizerunek, storytelling, LinkedIn, TikTok" },
  ads: { label: "Reklama i sprzedaż", description: "Meta Ads, landing page, e-maile, kampanie, testy A/B" },
};

export function expectedSectionKeys(def: ContentTypeDef, sequenceCount?: number): { key: string; label: string; optional: boolean }[] {
  const out = def.sections.map((s) => ({ key: s.key, label: s.label, optional: !!s.optional }));
  if (def.sequence) {
    const n = Math.min(def.sequence.max, Math.max(def.sequence.min, sequenceCount ?? def.sequence.min));
    for (let i = 1; i <= n; i++) out.push({ key: `${def.sequence.prefix}${i}`, label: `${def.sequence.label} ${i}`, optional: false });
  }
  for (const s of def.tailSections ?? []) out.push({ key: s.key, label: s.label, optional: !!s.optional });
  return out;
}

export function sectionLimit(def: ContentTypeDef, key: string): number | undefined {
  const fixed = [...def.sections, ...(def.tailSections ?? [])].find((s) => s.key === key);
  if (fixed) return fixed.maxChars;
  if (def.sequence && key.startsWith(def.sequence.prefix)) return def.sequence.maxChars;
  return undefined;
}
