import { avoidList, EMPTY_EXTENDED } from "@/core/brand/profile";
import type { BrandKit } from "@/core/brand/model";
import { expectedSectionKeys, sectionLimit, type ContentTypeDef } from "../content-types";
import { extractNumbers, type FactSheet } from "../facts";
import type { QualityCategory, QualityFinding, Variant } from "../schemas";
import type { Platform } from "../taxonomy";

export interface RuleContext {
  def: ContentTypeDef;
  platform: Platform;
  facts: FactSheet | null;
  /** Numbers that copy may contain (facts + anything the user typed). */
  allowedNumbers: number[];
  brand: BrandKit;
  marketDataProvided: boolean;
  ctaType: string;
  /** Raw user texts (topic, instructions, market data) – their words are not "invented". */
  userTexts: string[];
}

export type RuleFinding = QualityFinding & { category: QualityCategory };

const PLATFORM_LIMITS: Partial<Record<Platform, { total?: number; firstLine?: number; hashtagsMax?: number }>> = {
  instagram: { total: 2200, firstLine: 125, hashtagsMax: 5 },
  facebook: { total: 6000, hashtagsMax: 3 },
  linkedin: { total: 3000, firstLine: 210, hashtagsMax: 3 },
  tiktok: { total: 2200, firstLine: 150, hashtagsMax: 5 },
  meta_ads: { hashtagsMax: 0 },
  portal: { total: 8000, hashtagsMax: 0 },
  email: { hashtagsMax: 0 },
};

const SHORT_COPY_KINDS = new Set(["post", "ad", "carousel", "short_copy", "video_script"]);

const AI_TELLS: { re: RegExp; message: string }[] = [
  { re: /w dzisiejszych czasach|w dynamicznym świecie|w dzisiejszym świecie/i, message: "Szablonowe otwarcie („w dzisiejszych czasach”)" },
  { re: /\bczy marzysz o\b|\bwyobraź sobie\b|\bwyobraźcie sobie\b/i, message: "Szablonowe otwarcie („Wyobraź sobie”, „Czy marzysz”)" },
  { re: /nie szukaj dalej|nie czekaj|nie zwlekaj|nie przegap|to musisz zobaczyć|zadzwoń już dziś/i, message: "Schematyczne, ponaglające CTA" },
  { re: /\bto nie (jest )?(tylko |zwykł\w+ |kolejn\w+ )?[^.!?\n]{1,40}[,.:—–-]\s*to\b/i, message: "Kontrast-odwrócenie („To nie X, to Y”)" },
  { re: /\bnie chodzi o\b[^.!?\n]{1,60}\bchodzi o\b/i, message: "Kontrast-odwrócenie („Nie chodzi o X, chodzi o Y”)" },
  { re: /(^|[.!?]\s+)(efekt|rezultat|najlepsze|haczyk|sekret|wynik|powód)\?/im, message: "Pytanie z natychmiastową odpowiedzią („Efekt? …”)" },
  { re: /\bbez [^.,!?\n]{2,25}\.\s*bez [^.,!?\n]{2,25}\.\s*bez\b/i, message: "Lista zaprzeczeń („Bez X. Bez Y. Bez Z.”)" },
  { re: /oaza spokoju|perła na mapie|spełnienie marzeń|mieszkanie marzeń|dom marzeń|nowy rozdział (życia|w życiu)|luksus na wyciągnięcie ręki|przestrzeń, która inspiruje|idealne dla każdego/i, message: "Pusty frazes" },
  { re: /zapraszamy (serdecznie )?do kontaktu\.?$/im, message: "Schematyczne CTA („Zapraszamy do kontaktu”)" },
];

const SUPERLATIVES = /\b(najlepsz\w*|wyjątkow\w*|niepowtarzaln\w*|idealn\w*|unikatow\w*|unikaln\w*|prestiżow\w*|ekskluzywn\w*|luksusow\w*|perfekcyjn\w*|wymarzon\w*|bajeczn\w*|rewelacyjn\w*)\b/gi;

const INVESTMENT = /gwarant\w* (zysk|zwrot|wzrost|dochód|przych)|pewn\w+ (inwestycj|zysk|lokat)|bezpieczn\w+ (inwestycj|lokat)\w*|zwrot z inwestycji|stop\w+ zwrotu|\broi\b|wartość (na pewno |z pewnością )?(wzrośnie|będzie rosła)|ceny (na pewno |z pewnością )?(będą rosły|wzrosną)|zabezpieczenie (na przyszłość|kapitału)|inwestycja bez ryzyka|bez ryzyka/i;
const GUARANTEE = /\bgwarant\w*/i;
const MARKET_CLAIM = /\d+([,.]\d+)?\s?%|ceny\s+(mieszka\w+\s+)?(wzrosły|spadły|rosną|spadają|rosły|spadały|wzrosną|spadną)|średni\w* cen\w*|wzrost cen|spadek cen|liczba transakcji|rekordow\w+ (cen|popyt)/i;
const STOCK_OPENERS = /^(nowa oferta|uwaga|przedstawiamy|zapraszamy|szukasz|czy szukasz|marzysz|hej|cześć)\b/i;
const EMOJI = /\p{Extended_Pictographic}/gu;
const TY_FORMS = /\b(ty|ciebie|cię|tobie|twój|twoja|twoje|twoim|twojej|twoich|twoją|twojego)\b/i;
const PAN_FORMS = /\b(Pan|Pani|Państw\w*|Panu|Panią)\b/;

function allText(v: Variant): string {
  return [v.headline, v.hook, ...v.sections.map((s) => s.content), v.cta].join("\n");
}

function near(value: number, allowed: number[], tolerance: number): boolean {
  return allowed.some((a) => Math.abs(a - value) <= Math.max(tolerance, Math.abs(a) * 0.005));
}

/** Checks numbers against the fact layer. Units decide how strict we are. */
function numberFindings(text: string, ctx: RuleContext): RuleFinding[] {
  const out: RuleFinding[] = [];
  const cleaned = text
    .replace(/#\S+/g, " ") // hashtags
    .replace(/\b\d{1,2}\s*[–-]\s*\d{1,2}\s*(s|sek\.?|sekund)\b/gi, " ") // video time codes
    .replace(/^\s*\d{1,2}[.)]\s/gm, " ") // list numbering
    .replace(/\b(slajd|krok|ujęcie|pytanie|sekcja)\s+\d+/gi, " ")
    .replace(/(\+48)?[\s-]?\d{3}[\s-]\d{3}[\s-]\d{3}/g, " "); // phone numbers
  const year = new Date().getFullYear();
  const allowed = [...ctx.allowedNumbers, year, year + 1];
  const seen = new Set<string>();
  for (const n of extractNumbers(cleaned)) {
    const after = cleaned.slice(n.index + n.raw.length, n.index + n.raw.length + 14).toLowerCase();
    const key = `${n.value}|${after.slice(0, 4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const excerpt = cleaned.slice(Math.max(0, n.index - 25), n.index + n.raw.length + 14).replace(/\s+/g, " ").trim();
    if (/^\s?(m²|m2|mkw|m\.kw|metr)/.test(after)) {
      if (!near(n.value, allowed, 0.6)) out.push({ category: "property_facts", severity: "critical", source: "rules", message: `Metraż ${n.raw} nie występuje w danych nieruchomości`, excerpt });
    } else if (/^\s?(zł|pln|złotych|€|eur|usd|\$|tys\.? zł|mln zł)/.test(after) || /^\s?(tys|mln)/.test(n.raw.slice(-4))) {
      if (!near(n.value, allowed, 1) && !near(n.value * 1000, allowed, 1000) && !near(n.value * 1_000_000, allowed, 10_000))
        out.push({ category: "property_facts", severity: "critical", source: "rules", message: `Kwota ${n.raw} nie występuje w danych`, excerpt });
    } else if (/^\s?%/.test(after)) {
      if (!near(n.value, allowed, 0.01))
        out.push({ category: "unverified_claims", severity: ctx.def.marketData ? "critical" : "warning", source: "rules", message: `Wartość procentowa ${n.raw}% bez źródła w danych`, excerpt });
    } else if (/^\s?(pok[oó]j|pokoje|pokoi)/.test(after)) {
      if (!near(n.value, allowed, 0)) out.push({ category: "property_facts", severity: "critical", source: "rules", message: `Liczba pokoi (${n.raw}) niezgodna z danymi`, excerpt });
    } else if (/^\s?\.?\s?(piętr|pięter|kondygnac)/.test(after)) {
      if (!near(n.value, allowed, 0)) out.push({ category: "property_facts", severity: "critical", source: "rules", message: `Piętro / liczba pięter (${n.raw}) niezgodne z danymi`, excerpt });
    } else if (/^\s?(km|min\b|minut|metrów|m od|m do|kroków|przystan)/.test(after)) {
      if (!near(n.value, allowed, 0)) out.push({ category: "unverified_claims", severity: "warning", source: "rules", message: `Odległość lub czas (${n.raw} ${after.trim().split(/\s/)[0]}) nie wynika z danych`, excerpt });
    } else if (n.value >= 1800 && n.value <= 2100 && Number.isInteger(n.value)) {
      if (!near(n.value, allowed, 0)) out.push({ category: "unverified_claims", severity: "warning", source: "rules", message: `Rok ${n.raw} nie występuje w danych`, excerpt });
    } else if (n.value > 12 && !near(n.value, allowed, 0)) {
      out.push({ category: "unverified_claims", severity: "warning", source: "rules", message: `Liczba ${n.raw} nie wynika z danych — sprawdź, czy jest prawdziwa`, excerpt });
    }
  }
  return out;
}

export function runRuleChecks(v: Variant, ctx: RuleContext): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const text = allText(v);
  const userText = ctx.userTexts.join("\n");
  const push = (f: RuleFinding) => findings.push(f);

  // ── Facts & claims ───────────────────────────────────────────────────
  findings.push(...numberFindings(text, ctx));
  const invest = text.match(INVESTMENT);
  if (invest) push({ category: "investment_promises", severity: "critical", source: "rules", message: `Obietnica inwestycyjna: „${invest[0]}”`, excerpt: invest[0] });
  const guarantee = text.match(GUARANTEE);
  if (guarantee && !GUARANTEE.test(userText) && !invest)
    push({ category: "unverified_claims", severity: "warning", source: "rules", message: "Słowo „gwarancja/gwarantujemy” bez podstawy w danych", excerpt: guarantee[0] });
  if (ctx.def.marketData && !ctx.marketDataProvided) {
    const m = text.match(MARKET_CLAIM);
    if (m) push({ category: "unverified_claims", severity: "critical", source: "rules", message: "Twierdzenie o rynku bez danych od użytkownika", excerpt: m[0] });
  }

  // ── Language & AI tells ──────────────────────────────────────────────
  for (const t of AI_TELLS) {
    const m = text.match(t.re);
    if (m && !t.re.test(userText)) push({ category: "language", severity: "warning", source: "rules", message: t.message, excerpt: m[0].trim().slice(0, 80) });
  }
  const supers = [...text.matchAll(SUPERLATIVES)].map((m) => m[0]);
  if (supers.length > (ctx.brand.style === "luxury" ? 0 : 1))
    push({ category: "language", severity: "warning", source: "rules", message: `Superlatywy bez pokrycia (${[...new Set(supers)].slice(0, 4).join(", ")})` });
  const exclamations = (text.match(/!/g) ?? []).length;
  if (exclamations > 1) push({ category: "language", severity: "warning", source: "rules", message: `Za dużo wykrzykników (${exclamations})` });
  const emoji = (text.match(EMOJI) ?? []).length;
  if (ctx.brand.emojiPolicy === "none" && emoji > 0) push({ category: "brand", severity: "warning", source: "rules", message: `Emoji (${emoji}) mimo polityki marki „bez emoji”` });
  if (ctx.brand.emojiPolicy === "sparing" && emoji > 2) push({ category: "brand", severity: "warning", source: "rules", message: `Za dużo emoji (${emoji}), marka dopuszcza najwyżej 2` });
  if (SHORT_COPY_KINDS.has(ctx.def.outputKind) && /—/.test(text))
    push({ category: "language", severity: "info", source: "rules", message: "Myślnik (—) w krótkim tekście: zamień na kropkę lub przecinek" });

  // ── Brand ────────────────────────────────────────────────────────────
  const avoided = [...new Set([...avoidList(ctx.brand.avoidedPhrases, ctx.brand.profile ?? EMPTY_EXTENDED), ...(ctx.brand.memory?.avoid ?? []).map((w) => w.toLowerCase())])];
  for (const phrase of avoided) if (text.toLowerCase().includes(phrase)) push({ category: "brand", severity: "warning", source: "rules", message: `Fraza zakazana przez markę: „${phrase}”` });
  if (ctx.brand.addressForm === "pan_pani" && TY_FORMS.test(text)) push({ category: "brand", severity: "warning", source: "rules", message: "Marka zwraca się per Pan/Pani, a tekst używa formy „Ty”" });
  if (ctx.brand.addressForm === "ty" && PAN_FORMS.test(text)) push({ category: "brand", severity: "info", source: "rules", message: "Marka zwraca się na „Ty”, a tekst używa formy Pan/Pani" });

  // ── Hook ─────────────────────────────────────────────────────────────
  const limits = PLATFORM_LIMITS[ctx.platform] ?? {};
  const firstLine = (v.hook || v.sections[0]?.content || "").split("\n")[0]?.trim() ?? "";
  if (!firstLine) push({ category: "hook", severity: "warning", source: "rules", message: "Brak wyraźnego pierwszego zdania (hooka)" });
  else {
    if (limits.firstLine && firstLine.length > limits.firstLine)
      push({ category: "hook", severity: "warning", source: "rules", message: `Hook ma ${firstLine.length} znaków; na tej platformie widać ok. ${limits.firstLine}` });
    if (STOCK_OPENERS.test(firstLine)) push({ category: "hook", severity: "warning", source: "rules", message: "Hook zaczyna się schematycznie", excerpt: firstLine.slice(0, 60) });
  }

  // ── Platform & structure ─────────────────────────────────────────────
  const expected = expectedSectionKeys(ctx.def, ctx.def.sequence ? undefined : 0);
  const keys = new Set(v.sections.map((s) => s.key));
  for (const e of expected) {
    if (e.optional) continue;
    if (ctx.def.sequence && e.key.startsWith(ctx.def.sequence.prefix)) continue;
    const s = v.sections.find((x) => x.key === e.key);
    if (!keys.has(e.key) || !s?.content.trim()) push({ category: "platform", severity: "warning", source: "rules", message: `Brak sekcji „${e.label}”` });
  }
  if (ctx.def.sequence) {
    const n = v.sections.filter((s) => s.key.startsWith(ctx.def.sequence!.prefix)).length;
    if (n < ctx.def.sequence.min) push({ category: "platform", severity: "warning", source: "rules", message: `Za mało elementów (${n}, min. ${ctx.def.sequence.min})` });
  }
  for (const s of v.sections) {
    const limit = sectionLimit(ctx.def, s.key);
    if (limit && s.content.length > limit) push({ category: "platform", severity: "warning", source: "rules", message: `Sekcja „${s.label}” ma ${s.content.length} znaków (limit ${limit})` });
  }
  if (limits.total) {
    const total = v.sections.reduce((n, s) => n + s.content.length, 0) + v.hashtags.join(" ").length;
    if (total > limits.total) push({ category: "platform", severity: "warning", source: "rules", message: `Tekst ma ${total} znaków, limit platformy to ${limits.total}` });
  }
  if (limits.hashtagsMax !== undefined && v.hashtags.length > limits.hashtagsMax)
    push({ category: "platform", severity: limits.hashtagsMax === 0 ? "info" : "warning", source: "rules", message: `Hashtagi: ${v.hashtags.length} (zalecane maks. ${limits.hashtagsMax})` });

  // ── CTA ──────────────────────────────────────────────────────────────
  if (!v.cta.trim() && ctx.ctaType !== "soft") push({ category: "cta", severity: "warning", source: "rules", message: "Brak wezwania do działania" });

  // ── Goal (property materials should mention at least one parameter) ──
  if (ctx.facts && ctx.def.property === "required") {
    const keyFacts = ctx.facts.facts.filter((f) => ["area", "rooms", "price", "location"].includes(f.key));
    const mentions = keyFacts.some((f) => (f.numbers ?? []).some((n) => text.includes(String(n).replace(".", ","))) || text.includes(f.value.split(",")[0] ?? "@@"));
    if (keyFacts.length && !mentions) push({ category: "goal", severity: "info", source: "rules", message: "Tekst nie wspomina żadnego kluczowego parametru oferty" });
  }
  return findings;
}
