/**
 * Brand Memory (etap 4, faza 3): structured preferences learned from the office's
 * own decisions. Deterministic and explainable: every suggestion carries the
 * decisions it came from. No model training, no data shared between offices.
 *
 * Two levels:
 *  - explicit: saved or approved by a person, used in generation,
 *  - suggested: a pattern seen in REPEATED decisions, used only after acceptance.
 * A single correction never becomes a suggestion; the UI only offers to save it.
 */
import type { MemoryKind } from "@/lib/supabase/database.types";

export const MEMORY_VERSION = "brand-memory-1.0.0";

export const MEMORY_KINDS: Record<MemoryKind, { label: string; hint: string }> = {
  cta: { label: "Preferowane CTA", hint: "Wezwanie do działania używane przez biuro." },
  avoid: { label: "Zwroty do unikania", hint: "Generator ich nie użyje, kontrola jakości je oznaczy." },
  headline: { label: "Preferowane nagłówki", hint: "Przykład nagłówka zaakceptowanego przez biuro." },
  headline_style: { label: "Styl nagłówków", hint: "Ogólna zasada pisania nagłówków." },
  tone: { label: "Styl komunikacji", hint: "Wskazówka dotycząca tonu." },
  template: { label: "Preferowane szablony", hint: "Szablon grafiki wybierany domyślnie." },
  color: { label: "Kolorystyka grafik", hint: "Kolor wybierany przy edycji grafik." },
  rejected: { label: "Odrzucone propozycje", hint: "Typ propozycji, którego biuro nie chce." },
  example_text: { label: "Wzorcowe teksty", hint: "Zaakceptowany tekst używany jako przykład stylu." },
  note: { label: "Inne preferencje", hint: "Dowolna wskazówka zapisana przez biuro." },
};

const norm = (s: string) => s.toLowerCase().replace(/[„”"'.!?,:;()]/g, "").replace(/\s+/g, " ").trim();

export function dedupeKey(kind: MemoryKind, content: string): string {
  return `${kind}:${norm(content)}`.slice(0, 300);
}

// ── Decisions → candidate preferences ──────────────────────────────────────

export interface VariantLike {
  angle?: string;
  headline: string;
  hook: string;
  cta: string;
  sections: { content: string }[];
}

export interface EditDiff {
  headline?: { before: string; after: string };
  cta?: { before: string; after: string };
  /** Words (5+ letters) the person deleted from the AI text and did not use elsewhere. */
  removed: string[];
  changedChars: number;
}

const WORD = /\p{L}{5,}/gu;
const COMMON = new Set("które który która oraz także bardzo tylko można będzie jesteśmy państwa naszej naszego mieszkanie mieszkania nieruchomości nieruchomość oferta oferty".split(" "));

function words(text: string): Set<string> {
  return new Set((text.toLowerCase().match(WORD) ?? []).filter((w) => !COMMON.has(w)));
}

const fullText = (v: VariantLike) => [v.headline, v.hook, ...v.sections.map((s) => s.content), v.cta].join(" ");

/** What changed between the AI version and the person's edit. */
export function diffVariant(before: VariantLike, after: VariantLike): EditDiff {
  const d: EditDiff = { removed: [], changedChars: 0 };
  if (norm(before.headline) !== norm(after.headline) && after.headline.trim()) d.headline = { before: before.headline, after: after.headline };
  if (norm(before.cta) !== norm(after.cta) && after.cta.trim()) d.cta = { before: before.cta, after: after.cta };
  // Removed words: from the body only (a shortened headline is not a ban on its words),
  // compared by stem so a changed inflection does not count as a removal.
  const body = (x: VariantLike) => [x.hook, ...x.sections.map((s) => s.content)].join(" ");
  const b = words(body(before));
  const a = words(fullText(after));
  const stems = new Set([...a].map((w) => w.slice(0, 5)));
  d.removed = [...b].filter((w) => !a.has(w) && !stems.has(w.slice(0, 5))).slice(0, 12);
  d.changedChars = Math.abs(fullText(before).length - fullText(after).length) + [...a].filter((w) => !b.has(w)).join("").length;
  return d;
}

export interface Candidate {
  kind: MemoryKind;
  content: string;
  reason: string;
  detail?: Record<string, unknown>;
}

/**
 * What the person may choose to remember after ONE edit. Nothing is saved
 * automatically: these are offered as "Zapamiętaj" options.
 */
export function candidatesFromEdit(d: EditDiff): Candidate[] {
  const out: Candidate[] = [];
  if (d.cta) out.push({ kind: "cta", content: d.cta.after.trim().slice(0, 200), reason: `Zmieniono CTA z „${d.cta.before.slice(0, 60)}”.` });
  if (d.headline) {
    out.push({ kind: "headline", content: d.headline.after.trim().slice(0, 200), reason: "Nagłówek napisany przez Ciebie: może służyć jako przykład." });
    const shorter = d.headline.after.length < d.headline.before.length * 0.8;
    const longer = d.headline.after.length > d.headline.before.length * 1.25;
    if (shorter) out.push({ kind: "headline_style", content: `Krótsze nagłówki (do ok. ${roundUp(d.headline.after.length)} znaków)`, reason: "Skrócono nagłówek.", detail: { direction: "shorter", max: roundUp(d.headline.after.length) } });
    if (longer) out.push({ kind: "headline_style", content: "Dłuższe, bardziej opisowe nagłówki", reason: "Rozbudowano nagłówek.", detail: { direction: "longer" } });
  }
  for (const w of d.removed.slice(0, 3)) out.push({ kind: "avoid", content: w, reason: `Usunięto słowo „${w}” z tekstu AI.` });
  return out;
}

const roundUp = (n: number) => Math.max(20, Math.ceil(n / 10) * 10);

// ── Repeated decisions → suggestions ───────────────────────────────────────

export interface FeedbackEvent {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface Suggestion {
  kind: MemoryKind;
  content: string;
  dedupeKey: string;
  detail: Record<string, unknown>;
  evidence: { event: string; at: string; summary: string }[];
}

/** How many independent decisions make a pattern (a single one never does). */
export const THRESHOLDS = { cta: 2, avoid: 2, headline_style: 2, template: 3, color: 2, rejected: 2 } as const;

function bucket<T>(items: T[], key: (t: T) => string | null) {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  return m;
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * Suggestions from repeated decisions. `known` holds dedupe keys already in
 * memory (any level or status): a dismissed suggestion is not proposed again.
 */
export function deriveSuggestions(events: FeedbackEvent[], known: Set<string>): Suggestion[] {
  const out: Suggestion[] = [];
  const push = (kind: MemoryKind, content: string, evs: FeedbackEvent[], summary: (e: FeedbackEvent) => string, detail: Record<string, unknown> = {}) => {
    const key = dedupeKey(kind, content);
    if (known.has(key) || out.some((s) => s.dedupeKey === key)) return;
    out.push({ kind, content, dedupeKey: key, detail: { ...detail, count: evs.length }, evidence: evs.slice(0, 10).map((e) => ({ event: e.id, at: e.created_at, summary: summary(e) })) });
  };
  const edits = events.filter((e) => e.kind === "content_edited");

  // Same CTA written by hand in several edits.
  for (const [, evs] of bucket(edits, (e) => {
    const c = e.data.cta as { after?: string } | undefined;
    return c?.after ? norm(c.after) : null;
  })) {
    // Wording of the first decision (events arrive newest first).
    if (evs.length >= THRESHOLDS.cta) push("cta", String((evs.at(-1)!.data.cta as { after: string }).after).trim().slice(0, 200), evs, () => "CTA zmienione ręcznie na ten sam tekst");
  }

  // The same word deleted from AI text in several edits.
  const removedCounts = new Map<string, FeedbackEvent[]>();
  for (const e of edits) for (const w of (Array.isArray(e.data.removed) ? e.data.removed : []).filter((x): x is string => typeof x === "string")) removedCounts.set(w, [...(removedCounts.get(w) ?? []), e]);
  for (const [w, evs] of removedCounts) if (evs.length >= THRESHOLDS.avoid) push("avoid", w, evs, () => `Usunięto „${w}” z tekstu AI`);

  // Headlines consistently shortened or lengthened.
  const short = edits.filter((e) => {
    const h = e.data.headline as { before?: string; after?: string } | undefined;
    return h?.before && h.after && h.after.length < h.before.length * 0.8;
  });
  if (short.length >= THRESHOLDS.headline_style) {
    const max = roundUp(Math.max(...short.map((e) => String((e.data.headline as { after: string }).after).length)));
    push("headline_style", `Krótsze nagłówki (do ok. ${max} znaków)`, short, () => "Nagłówek skrócony ręcznie", { direction: "shorter", max });
  }
  const long = edits.filter((e) => {
    const h = e.data.headline as { before?: string; after?: string } | undefined;
    return h?.before && h.after && h.after.length > h.before.length * 1.25;
  });
  if (long.length >= THRESHOLDS.headline_style) push("headline_style", "Dłuższe, bardziej opisowe nagłówki", long, () => "Nagłówek rozbudowany ręcznie", { direction: "longer" });

  // Graphic template chosen repeatedly.
  for (const [tpl, evs] of bucket(events.filter((e) => e.kind === "graphic_template"), (e) => str(e.data.template))) {
    if (evs.length >= THRESHOLDS.template) push("template", str(evs[0]!.data.templateLabel) ?? tpl, evs, () => "Wybrano ten szablon grafiki", { template: tpl });
  }

  // The same colour set by hand in several graphic edits.
  const colorEvents = new Map<string, FeedbackEvent[]>();
  for (const e of events.filter((x) => x.kind === "graphic_edited")) {
    for (const c of (Array.isArray(e.data.colors) ? e.data.colors : []).filter((x): x is string => typeof x === "string" && /^#[0-9A-F]{6}$/i.test(x))) colorEvents.set(c.toUpperCase(), [...(colorEvents.get(c.toUpperCase()) ?? []), e]);
  }
  for (const [c, evs] of colorEvents) if (evs.length >= THRESHOLDS.color) push("color", c, evs, () => `Kolor ${c} ustawiony ręcznie w grafice`, { hex: c });

  // The same kind of proposal rejected several times.
  for (const [, evs] of bucket(events.filter((e) => e.kind === "variant_rejected" || e.kind === "material_rejected"), (e) => {
    const a = str(e.data.angle);
    return a ? norm(a.replace(/\(test\)/i, "")) : null;
  })) {
    if (evs.length >= THRESHOLDS.rejected) push("rejected", `Nie proponuj wariantów typu: ${String(evs[0]!.data.angle).replace(/\s*\(test\)/i, "").slice(0, 150)}`, evs, () => "Wariant odrzucony", { angle: evs[0]!.data.angle });
  }
  return out;
}

// ── Memory → generation context ────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  kind: MemoryKind;
  content: string;
  detail: Record<string, unknown>;
}

export interface TextExample {
  contentType: string;
  platform: string | null;
  headline: string;
  hook: string;
  cta: string;
  excerpt: string;
}

export interface BrandMemoryContext {
  version: string;
  ctas: string[];
  avoid: string[];
  headlines: string[];
  headlineStyle: string[];
  tone: string[];
  templates: string[];
  colors: string[];
  rejected: string[];
  notes: string[];
  examples: TextExample[];
  entryIds: string[];
}

/** Only explicit, active entries reach this function (suggestions wait for acceptance). */
export function buildMemoryContext(entries: MemoryEntry[], examples: TextExample[]): BrandMemoryContext {
  const of = (k: MemoryKind) => entries.filter((e) => e.kind === k).map((e) => e.content);
  return {
    version: MEMORY_VERSION,
    ctas: of("cta").slice(0, 8),
    avoid: of("avoid").slice(0, 40),
    headlines: of("headline").slice(0, 5),
    headlineStyle: of("headline_style").slice(0, 3),
    tone: of("tone").slice(0, 5),
    templates: entries.filter((e) => e.kind === "template").map((e) => String(e.detail.template ?? e.content)).slice(0, 5),
    colors: of("color").slice(0, 5),
    rejected: of("rejected").slice(0, 8),
    notes: of("note").slice(0, 8),
    examples: [...entries.filter((e) => e.kind === "example_text").map((e) => e.detail as unknown as TextExample).filter((x) => x && typeof x.excerpt === "string"), ...examples].slice(0, 12),
    entryIds: entries.map((e) => e.id),
  };
}

/** Selective retrieval: at most `max` examples, same content type first, then same platform. */
export function pickExamples(mem: BrandMemoryContext | null | undefined, contentType: string, platform: string | null, max = 2): TextExample[] {
  if (!mem) return [];
  const score = (e: TextExample) => (e.contentType === contentType ? 2 : 0) + (platform && e.platform === platform ? 1 : 0);
  return [...mem.examples].filter((e) => score(e) > 0).sort((a, b) => score(b) - score(a)).slice(0, max);
}

export function isEmptyMemory(m: BrandMemoryContext | null | undefined): boolean {
  return !m || (!m.ctas.length && !m.avoid.length && !m.headlines.length && !m.headlineStyle.length && !m.tone.length && !m.rejected.length && !m.notes.length && !m.examples.length && !m.templates.length && !m.colors.length);
}
