/**
 * Fact layer, separated from the creative layer. Verticals translate their
 * domain records (a property, a car, an investment) into a FactSheet; the
 * engine treats it as the ONLY source of checkable claims.
 */
export type FactUnit = "area" | "price" | "price_per_area" | "count" | "floor" | "year" | "text";

export interface Fact {
  key: string;
  label: string;
  /** Human-readable value exactly as it may appear in copy. */
  value: string;
  unit: FactUnit;
  /** Numeric values that copy may legitimately mention for this fact. */
  numbers?: number[];
}

export interface FactSheet {
  subject: string;
  facts: Fact[];
  /** User-authored descriptive text (also factual, but unstructured). */
  notes: { label: string; text: string }[];
}

export function renderFactSheet(sheet: FactSheet): string {
  const lines = sheet.facts.map((f) => `- ${f.label}: ${f.value}`);
  const notes = sheet.notes.map((n) => `${n.label}:\n${n.text}`);
  return [`Przedmiot: ${sheet.subject}`, ...lines, ...(notes.length ? ["", ...notes] : [])].join("\n");
}

/** Extracts numbers written the Polish way: "1 250 000", "54,5", "650 tys.", "1,2 mln". */
export function extractNumbers(text: string): { raw: string; value: number; index: number }[] {
  const out: { raw: string; value: number; index: number }[] = [];
  const re = /(\d{1,3}(?:[   .]\d{3})+|\d+)(?:[,.](\d+))?(\s?(?:tys\.?|mln|k)\b)?/gi;
  for (const m of text.matchAll(re)) {
    const intPart = m[1]!.replace(/[   .]/g, "");
    let value = Number(`${intPart}${m[2] ? `.${m[2]}` : ""}`);
    const mult = m[3]?.trim().toLowerCase();
    if (mult?.startsWith("tys") || mult === "k") value *= 1000;
    if (mult === "mln") value *= 1_000_000;
    if (Number.isFinite(value)) out.push({ raw: m[0], value, index: m.index ?? 0 });
  }
  return out;
}

export function allowedNumbers(sheet: FactSheet | null, extraTexts: string[]): number[] {
  const nums = new Set<number>();
  for (const f of sheet?.facts ?? []) for (const n of f.numbers ?? []) nums.add(n);
  for (const t of [...(sheet?.notes.map((n) => n.text) ?? []), ...extraTexts]) for (const n of extractNumbers(t)) nums.add(n.value);
  return [...nums];
}
