import type { RuleFinding } from "@/core/marketing-engine/quality/rules";
import { QUALITY_CATEGORIES, type Variant } from "@/core/marketing-engine/schemas";
import type { Goal } from "@/core/marketing-engine/taxonomy";
import { fmt, type QaCheck } from "./types";

/**
 * Text QA: language, facts (the rule layer of the generator, re-run on the
 * current text), readability, fit to the goal, headline and CTA. Rules only,
 * no AI cost; readability is an estimate.
 */
const PL_WORDS = new Set("i w z na do nie się to jest że o od po dla oraz a ale przy czy jak co ten ta te są ze za przez już jeszcze także lub bez tylko może można mieszkanie mieszkania dom domu pokoje pokoi metrów cena ofert oferta oferty biuro zapraszamy umów napisz zadzwoń sprawdź twój twoje pan pani".split(" "));
const EN_WORDS = new Set("the and of to in is are with for you your this that it on at from by be or an as our we new now home house room rooms apartment price call book visit more".split(" "));
const VOWELS = /[aąeęioóuy]+/gi;
const ACTION = /\b(zadzwoń|zadzwon|napisz|umów|umow|sprawdź|zobacz|wyślij|zapisz|pobierz|odwiedź|kliknij|przyjdź|zarezerwuj|zostaw|daj znać|zapytaj|obejrzyj|wypełnij|skontaktuj|poproś|odbierz|zamów)\w*/i;
const CONTACT_ACTION = /\b(zadzwoń|napisz|umów|wyślij|zostaw|zapytaj|wypełnij|skontaktuj|poproś|formularz|wiadomość|telefon)\w*/i;
const GENERIC_CTA = /^(zapraszamy( do kontaktu)?|skontaktuj się z nami|więcej informacji|zapraszamy serdecznie|kontakt)\.?$/i;
const STOCK_HEAD = /^(nowa oferta|uwaga|przedstawiamy|zapraszamy|szukasz|czy szukasz|marzysz|hej|cześć|super okazja|okazja)\b/i;

export function words(text: string): string[] {
  return text
    .replace(/#\S+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .filter((w) => w.length > 0 && /\p{L}/u.test(w));
}

export function syllables(word: string): number {
  return Math.max(1, (word.match(VOWELS) ?? []).length);
}

export interface Readability {
  sentences: number;
  words: number;
  avgSentence: number;
  hardShare: number;
  /** FOG adapted for Polish (hard word = 4+ syllables). */
  fog: number;
  longSentences: number;
}

export function readability(text: string): Readability {
  const sentences = text.replace(/#\S+/g, " ").split(/[.!?…]+|\n+/).map((s) => s.trim()).filter((s) => words(s).length > 0);
  const all = words(text);
  const n = Math.max(1, all.length);
  const hard = all.filter((w) => syllables(w) >= 4).length;
  const avg = all.length / Math.max(1, sentences.length);
  return {
    sentences: sentences.length,
    words: all.length,
    avgSentence: Math.round(avg * 10) / 10,
    hardShare: Math.round((hard / n) * 1000) / 1000,
    fog: Math.round(0.4 * (avg + 100 * (hard / n)) * 10) / 10,
    longSentences: sentences.filter((s) => words(s).length > 25).length,
  };
}

/** Share of common Polish vs English function words (hashtags and links ignored). */
export function languageScore(text: string): { pl: number; en: number; words: number; englishSeen: string[] } {
  const w = words(text);
  const n = Math.max(1, w.length);
  const en = w.filter((x) => EN_WORDS.has(x));
  return { pl: w.filter((x) => PL_WORDS.has(x)).length / n, en: en.length / n, words: w.length, englishSeen: [...new Set(en)].slice(0, 5) };
}

export interface TextQaInput {
  variant: Variant;
  goal: Goal;
  ctaType: string;
  /** Findings of the generator's rule layer on this exact text. */
  ruleFindings: RuleFinding[];
  /** Key fact values (city, district) that make a headline concrete. */
  factWords: string[];
  shortForm: boolean;
}

export function textQa(input: TextQaInput): QaCheck[] {
  const v = input.variant;
  const body = [v.headline, v.hook, ...v.sections.map((s) => s.content), v.cta].filter(Boolean).join("\n");
  const out: QaCheck[] = [];

  // ── Language ──────────────────────────────────────────────────────────
  const lang = languageScore(body);
  if (lang.words >= 8 && lang.en > lang.pl) {
    out.push({ area: "Język", code: "not_polish", severity: "problem", message: "Tekst wygląda na napisany nie po polsku.", fix: "Wygeneruj tekst ponownie albo przetłumacz go na polski.", method: "estimate" });
  } else if (lang.englishSeen.length >= 3) {
    out.push({ area: "Język", code: "english_words", severity: "info", message: `Wtrącenia angielskie: ${lang.englishSeen.join(", ")}.`, fix: "Zamień je na polskie odpowiedniki, jeśli to nie nazwy własne.", method: "estimate" });
  } else {
    out.push({ area: "Język", code: "polish", severity: "ok", message: "Tekst po polsku.", method: "estimate" });
  }
  const languageFindings = input.ruleFindings.filter((f) => f.category === "language");
  for (const f of languageFindings) out.push({ area: "Język", code: "style", severity: f.severity === "critical" ? "problem" : f.severity === "warning" ? "warning" : "info", message: f.message, measured: f.excerpt, fix: "Przeredaguj ten fragment prostszym, konkretnym zdaniem.", method: "rule" });

  // ── Facts and claims (the generator's rule layer, re-run on the current text) ──
  const factCats = new Set(["property_facts", "unverified_claims", "investment_promises"]);
  const facts = input.ruleFindings.filter((f) => factCats.has(f.category));
  if (!facts.length) out.push({ area: "Fakty", code: "facts_ok", severity: "ok", message: "Liczby zgodne z danymi oferty, bez obietnic inwestycyjnych.", method: "rule" });
  for (const f of facts)
    out.push({
      area: "Fakty", code: f.category, severity: f.severity === "critical" ? "problem" : f.severity === "warning" ? "warning" : "info",
      message: `${QUALITY_CATEGORIES[f.category]}: ${f.message}`, measured: f.excerpt,
      fix: f.category === "investment_promises" ? "Usuń obietnicę zysku lub wzrostu wartości." : "Popraw wartość według karty oferty albo usuń zdanie.",
      method: "rule",
    });
  for (const f of input.ruleFindings.filter((x) => x.category === "brand" || x.category === "platform"))
    out.push({ area: f.category === "brand" ? "Marka" : "Platforma", code: f.category, severity: f.severity === "critical" ? "problem" : f.severity === "warning" ? "warning" : "info", message: f.message, measured: f.excerpt, method: "rule" });

  // ── Readability (estimate) ────────────────────────────────────────────
  const r = readability(body);
  const limit = input.shortForm ? 10 : 13;
  const measured = `FOG-PL ${fmt(r.fog)}, śr. ${fmt(r.avgSentence)} słów w zdaniu, trudne słowa ${fmt(r.hardShare * 100)}%`;
  if (r.words < 5) out.push({ area: "Czytelność", code: "too_short", severity: "info", message: "Za mało tekstu do oceny czytelności.", method: "estimate" });
  else if (r.fog > limit + 4) out.push({ area: "Czytelność", code: "hard", severity: "warning", message: "Tekst trudny w odbiorze jak na ten format.", measured, fix: "Skróć zdania do 10–15 słów i zamień długie słowa na prostsze.", method: "estimate" });
  else if (r.fog > limit) out.push({ area: "Czytelność", code: "medium", severity: "info", message: "Tekst średnio trudny.", measured, fix: "Podziel najdłuższe zdania.", method: "estimate" });
  else out.push({ area: "Czytelność", code: "readable", severity: "ok", message: "Tekst łatwy w odbiorze.", measured, method: "estimate" });
  if (r.longSentences) out.push({ area: "Czytelność", code: "long_sentences", severity: "info", message: `Zdania dłuższe niż 25 słów: ${r.longSentences}.`, fix: "Podziel je na krótsze.", method: "rule" });

  // ── Headline ──────────────────────────────────────────────────────────
  const head = (v.headline || v.hook || "").trim();
  if (!head) out.push({ area: "Nagłówek", code: "missing", severity: "warning", message: "Brak nagłówka lub pierwszego zdania.", fix: "Dodaj krótkie zdanie z najważniejszą korzyścią.", method: "rule" });
  else {
    const letters = head.replace(/[^\p{L}]/gu, "");
    const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
    const issues: QaCheck[] = [];
    if (head.length > 90) issues.push({ area: "Nagłówek", code: "long", severity: "warning", message: `Nagłówek ma ${head.length} znaków.`, fix: "Skróć do ok. 60 znaków: w podglądzie widać tylko początek.", method: "rule" });
    if (head.length < 12) issues.push({ area: "Nagłówek", code: "short", severity: "info", message: "Bardzo krótki nagłówek.", fix: "Dodaj konkret: lokalizację, metraż albo korzyść.", method: "rule" });
    if (letters.length >= 8 && upper / letters.length > 0.6) issues.push({ area: "Nagłówek", code: "caps", severity: "warning", message: "Nagłówek pisany wielkimi literami.", fix: "Użyj zwykłej pisowni; wielkie litery czyta się trudniej.", method: "rule" });
    if (/!{2,}|\?!|!\?/.test(head)) issues.push({ area: "Nagłówek", code: "exclaim", severity: "info", message: "Wielokrotne wykrzykniki w nagłówku.", fix: "Zostaw jedną kropkę albo jeden wykrzyknik.", method: "rule" });
    if (STOCK_HEAD.test(head)) issues.push({ area: "Nagłówek", code: "stock", severity: "warning", message: "Nagłówek zaczyna się schematycznie.", measured: head.slice(0, 40), fix: "Zacznij od konkretu oferty albo korzyści dla odbiorcy.", method: "rule" });
    const concrete = /\d/.test(head) || input.factWords.some((w) => w && head.toLowerCase().includes(w.toLowerCase()));
    if (!concrete) issues.push({ area: "Nagłówek", code: "vague", severity: "info", message: "Nagłówek bez konkretu (liczby, miejsca).", fix: "Dodaj parametr lub lokalizację z karty oferty.", method: "rule" });
    out.push(...(issues.length ? issues : [{ area: "Nagłówek", code: "ok", severity: "ok" as const, message: "Nagłówek konkretny i czytelny.", method: "rule" as const }]));
  }

  // ── CTA ───────────────────────────────────────────────────────────────
  const cta = v.cta.trim();
  if (!cta) {
    if (input.ctaType !== "soft") out.push({ area: "CTA", code: "missing", severity: "warning", message: "Brak wezwania do działania.", fix: "Dodaj jeden konkretny krok, np. „Umów prezentację, zadzwoń do biura”.", method: "rule" });
  } else {
    const issues: QaCheck[] = [];
    if (cta.length > 80) issues.push({ area: "CTA", code: "long", severity: "warning", message: `CTA ma ${cta.length} znaków.`, fix: "Skróć do jednego zdania z jednym działaniem.", method: "rule" });
    if (GENERIC_CTA.test(cta)) issues.push({ area: "CTA", code: "generic", severity: "warning", message: "Ogólne CTA bez konkretnego kroku.", measured: cta, fix: "Napisz, co dokładnie zrobić: zadzwonić, umówić prezentację, wysłać wiadomość.", method: "rule" });
    else if (!ACTION.test(cta)) issues.push({ area: "CTA", code: "no_verb", severity: "info", message: "CTA bez czasownika działania.", measured: cta, fix: "Zacznij od czasownika, np. „Umów”, „Napisz”, „Sprawdź”.", method: "rule" });
    out.push(...(issues.length ? issues : [{ area: "CTA", code: "ok", severity: "ok" as const, message: "CTA z konkretnym działaniem.", measured: cta, method: "rule" as const }]));
  }

  // ── Fit to the goal ───────────────────────────────────────────────────
  if ((input.goal === "leads" || input.goal === "owner_acquisition") && cta && !CONTACT_ACTION.test(cta))
    out.push({ area: "Cel", code: "goal_contact", severity: "warning", message: "Cel to zapytania, a CTA nie prosi o kontakt.", fix: "Zaproponuj telefon, wiadomość albo formularz.", method: "rule" });
  for (const f of input.ruleFindings.filter((x) => x.category === "goal" || x.category === "hook" || x.category === "cta"))
    out.push({ area: f.category === "goal" ? "Cel" : f.category === "hook" ? "Nagłówek" : "CTA", code: `rule_${f.category}`, severity: f.severity === "critical" ? "problem" : f.severity === "warning" ? "warning" : "info", message: f.message, measured: f.excerpt, method: "rule" });
  if (!out.some((c) => c.area === "Cel")) out.push({ area: "Cel", code: "goal_ok", severity: "ok", message: "Tekst nie odbiega od wybranego celu (w zakresie reguł).", method: "rule" });
  return out;
}
