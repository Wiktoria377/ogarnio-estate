import { z } from "zod";

/**
 * AI insights for the analytics report. The model receives only the computed
 * facts (our numbers) and must keep observations (what the data shows),
 * hypotheses (possible causes, to be verified) and recommendations apart.
 * Observations that cite a number not present in the facts are dropped by a
 * deterministic check; nothing is presented as a guaranteed outcome.
 */
export interface InsightFact {
  key: string;
  label: string;
  value: string;
  numbers: number[];
}

export const insightSchema = z.object({
  observations: z.array(z.object({ text: z.string().min(5).max(400), facts: z.array(z.string().max(60)).max(6) })).max(8),
  hypotheses: z.array(z.object({ text: z.string().min(5).max(400), verify: z.string().min(5).max(300) })).max(6),
  recommendations: z.array(z.object({
    what: z.string().min(3).max(200),
    why: z.string().min(5).max(400),
    data: z.string().min(2).max(300),
    action: z.string().min(3).max(300),
    metric: z.string().min(3).max(160),
  })).max(5),
  limitations: z.array(z.string().max(300)).max(5),
});
export type Insights = z.infer<typeof insightSchema>;

export const INSIGHTS_VERSION = "insights-2026-10-v1";

export const INSIGHTS_SYSTEM = `Jesteś analitykiem marketingu biura nieruchomości. Dostajesz WYŁĄCZNIE policzone fakty z raportu (lista klucz: wartość).
Zasady:
- observations: tylko to, co wynika wprost z faktów. Każda liczba w tekście musi występować w faktach. Podaj klucze faktów w polu facts.
- hypotheses: możliwe przyczyny, sformułowane jako przypuszczenia ("możliwe, że…"), z opisem jak je sprawdzić (verify).
- recommendations: co zrobić, dlaczego, na jakich danych (data), konkretna akcja (action) i metryka, po której ocenimy efekt (metric).
- Fakty oznaczone "Brak danych" traktuj jako nieznane. Nie zakładaj zera, nie szacuj, nie obiecuj wyników.
- limitations: braki danych i ograniczenia wniosków (np. mała liczba publikacji, dane z symulatora).
- Pisz po polsku, rzeczowo, bez wykrzykników.`;

/** Every number written in a text (Polish formatting: "1 250", "3,5", "12%"). */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d{1,3}(?:[   ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g)) {
    const n = Number(m[0].replace(/[   ]/g, "").replace(",", "."));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function checkInsights(raw: Insights, facts: InsightFact[]): { insights: Insights; dropped: string[] } {
  const allowed = new Set<number>();
  // Numbers in our own fact labels (e.g. "na 100 kliknięć") are also allowed.
  for (const f of facts) for (const n of [...f.numbers, ...numbersIn(f.label)]) allowed.add(Math.round(n * 10) / 10);
  const ok = (text: string) => numbersIn(text).every((n) => allowed.has(Math.round(n * 10) / 10) || (n >= 1 && n <= 12 && Number.isInteger(n) && /tydz|tygod|miesi|dni/.test(text)));
  const dropped: string[] = [];
  const keys = new Set(facts.map((f) => f.key));
  const observations = raw.observations.filter((o) => {
    const pass = ok(o.text);
    if (!pass) dropped.push(o.text);
    return pass;
  }).map((o) => ({ ...o, facts: o.facts.filter((k) => keys.has(k)) }));
  const recommendations = raw.recommendations.filter((r) => {
    const pass = ok(r.data);
    if (!pass) dropped.push(r.data);
    return pass;
  });
  return { insights: { ...raw, observations, recommendations }, dropped };
}

export function factsPrompt(facts: InsightFact[], period: string): string {
  return `Okres raportu: ${period}\nFakty:\n${facts.map((f) => `- ${f.key} | ${f.label}: ${f.value}`).join("\n")}\n\nZwróć JSON zgodny ze schematem.`;
}
