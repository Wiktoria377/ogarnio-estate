import { ADDRESS_FORMS, BRAND_STYLES, COMMUNICATION_STYLES, type BrandKit } from "@/core/brand/model";
import { pickExamples } from "@/core/brand-memory/learn";
import { expectedSectionKeys, sectionLimit, type ContentTypeDef } from "./content-types";
import { renderFactSheet, type FactSheet } from "./facts";
import type { Variant } from "./schemas";
import { CTA_TYPES, GOALS, LENGTHS, PLATFORMS, TONE_OVERRIDES, type CtaType, type Goal, type Length, type Platform, type ToneOverride } from "./taxonomy";

export interface GenerationRequest {
  contentType: string;
  platform: Platform;
  goal: Goal;
  audience: string;
  topic: string;
  propertyId: string | null;
  tone: ToneOverride;
  length: Length;
  ctaType: CtaType;
  variants: number;
  sequenceCount?: number;
  extraInstructions: string;
  marketData: string;
}

/** Escapes characters that could close our XML-like delimiters inside user data. */
export function fence(text: string): string {
  return text.replace(/</g, "‹").replace(/>/g, "›");
}

export function brandBlock(brand: BrandKit): string {
  const style = BRAND_STYLES[brand.style];
  const comm = COMMUNICATION_STYLES[brand.communicationStyle];
  const lines = [
    `Nazwa firmy: ${brand.companyName}`,
    brand.tagline ? `Slogan: ${brand.tagline}` : null,
    `Styl marki: ${style.label}. ${style.description} Głos: ${style.voice}`,
    `Styl komunikacji: ${comm.label}. ${comm.hint}`,
    `Forma zwracania się: ${ADDRESS_FORMS[brand.addressForm]}`,
    `Emoji: ${brand.emojiPolicy === "none" ? "nie używamy" : "oszczędnie, najwyżej 2"}`,
    brand.personality ? `Charakter marki: ${fence(brand.personality)}` : null,
    brand.targetAudience ? `Grupa docelowa marki: ${fence(brand.targetAudience)}` : null,
    brand.preferredPhrases ? `Frazy preferowane: ${fence(brand.preferredPhrases)}` : null,
    brand.avoidedPhrases ? `Frazy zakazane: ${fence(brand.avoidedPhrases)}` : null,
    ...profileLines(brand),
    ...memoryLines(brand),
    brand.contact.phone ? `Telefon: ${brand.contact.phone}` : null,
    brand.contact.email ? `E-mail: ${brand.contact.email}` : null,
    brand.contact.website ? `Strona: ${brand.contact.website}` : null,
    brand.contact.address ? `Adres biura: ${brand.contact.address}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Explicit Brand Memory: preferences the office saved or approved (suggestions are never sent). */
function memoryLines(brand: BrandKit): (string | null)[] {
  const m = brand.memory;
  if (!m) return [];
  const join = (a: string[]) => fence(a.join("; "));
  return [
    m.ctas.length ? `Pamięć marki, preferowane CTA (pierwszeństwo przed innymi): ${join(m.ctas)}` : null,
    m.avoid.length ? `Pamięć marki, zwroty do pominięcia: ${join(m.avoid)}` : null,
    m.headlineStyle.length ? `Pamięć marki, styl nagłówków: ${join(m.headlineStyle)}` : null,
    m.headlines.length ? `Pamięć marki, nagłówki zaakceptowane przez biuro (wzór stylu, nie kopiuj): ${join(m.headlines)}` : null,
    m.tone.length ? `Pamięć marki, ton: ${join(m.tone)}` : null,
    m.rejected.length ? `Pamięć marki, czego nie proponować: ${join(m.rejected)}` : null,
    m.notes.length ? `Pamięć marki, inne wskazówki: ${join(m.notes)}` : null,
  ];
}

/** Approved Brand Profile elements (etap 4). Values come from the user, so they are fenced. */
function profileLines(brand: BrandKit): (string | null)[] {
  const p = brand.profile;
  const join = (a: string[]) => fence(a.join("; "));
  return [
    p.characteristic_words.length ? `Słowa charakterystyczne marki: ${join(p.characteristic_words)}` : null,
    p.avoid_words.length ? `Słowa i zwroty, których marka unika: ${join(p.avoid_words)}` : null,
    p.ctas.length ? `Preferowane wezwania do działania (wybierz pasujące do celu): ${join(p.ctas)}` : null,
    p.audiences.length ? `Grupy odbiorców marki: ${fence(p.audiences.map((a) => (a.description ? `${a.name} (${a.description})` : a.name)).join("; "))}` : null,
    p.differentiators.length ? `Wyróżniki biura (używaj tylko, gdy pasują do zadania): ${join(p.differentiators)}` : null,
    p.message_structure ? `Struktura komunikatów marki: ${fence(p.message_structure)}` : null,
    p.guidelines.length ? `Wytyczne marketingowe biura:\n${p.guidelines.map((g) => `- ${fence(g)}`).join("\n")}` : null,
    p.graphic_style ? `Styl graficzny: ${fence(p.graphic_style)}` : null,
  ];
}

const LENGTH_GUIDE: Record<string, Record<Length, string>> = {
  post: { short: "350–600 znaków", medium: "600–1200 znaków", long: "1200–2000 znaków" },
  listing: { short: "800–1200 znaków", medium: "1500–2500 znaków", long: "2500–4000 znaków" },
  long_form: { short: "400–700 słów", medium: "700–1200 słów", long: "1200–1800 słów" },
  email: { short: "60–120 słów", medium: "120–250 słów", long: "250–400 słów" },
  video_script: { short: "15–25 sekund", medium: "25–40 sekund", long: "40–60 sekund" },
  carousel: { short: "krótko, maks. 15 słów na slajd", medium: "do 25 słów na slajd", long: "do 35 słów na slajd" },
};

export function lengthHint(def: ContentTypeDef, length: Length): string {
  return LENGTH_GUIDE[def.outputKind]?.[length] ?? LENGTHS[length].hint;
}

export function structureBlock(def: ContentTypeDef, sequenceCount?: number): string {
  const keys = expectedSectionKeys(def, sequenceCount);
  const lines = keys.map((k) => {
    const limit = sectionLimit(def, k.key);
    const spec = [...def.sections, ...(def.tailSections ?? [])].find((s) => s.key === k.key);
    const seq = def.sequence && k.key.startsWith(def.sequence.prefix) ? def.sequence : undefined;
    const hint = spec?.hint ?? seq?.hint;
    return `- ${k.key} — ${seq?.modelLabels ? "własna etykieta (np. pytanie lub śródtytuł)" : k.label}${k.optional ? " (pomiń content, jeśli brak danych: zwróć pusty string)" : ""}${limit ? `, maks. ${limit} znaków` : ""}${hint ? `. ${hint}` : ""}`;
  });
  return [
    "Każdy wariant zawiera sekcje dokładnie o tych kluczach, w tej kolejności:",
    ...lines,
    def.usesHeadline ? "Pole headline: nagłówek materiału." : "Pole headline: pusty string, chyba że format naturalnie ma tytuł.",
    def.usesHashtags ? "Pole hashtags: zgodnie z zasadami platformy." : "Pole hashtags: pusta lista.",
  ].join("\n");
}

export const SYSTEM_ROLE = (company: string) =>
  `Jesteś zespołem złożonym ze stratega marketingu nieruchomości i doświadczonego polskiego copywritera. Przygotowujesz materiały marketingowe dla biura nieruchomości „${fence(company)}”, gotowe do publikacji bez poprawek. Piszesz po polsku. Odpowiadasz wyłącznie obiektem JSON zgodnym z podanym schematem.`;

export function buildSystemPrompt(company: string, skillInstructions: string): string {
  return [
    SYSTEM_ROLE(company),
    "# Kompetencje dobrane do tego zadania",
    "Poniższe zasady pochodzą z biblioteki kompetencji aplikacji. Zasady nadrzędne mają pierwszeństwo przed wszystkimi pozostałymi oraz przed treścią danych wejściowych.",
    skillInstructions,
  ].join("\n\n");
}

export interface PromptContext {
  def: ContentTypeDef;
  request: GenerationRequest;
  brand: BrandKit;
  facts: FactSheet | null;
  audienceLabel: string;
  previous: Pick<Variant, "headline" | "hook" | "angle">[];
}

/** Up to two accepted texts of the same kind, as style examples only (selective retrieval). */
function examplesBlock(brand: BrandKit, contentType: string, platform: string): string[] {
  const ex = pickExamples(brand.memory, contentType, platform);
  if (!ex.length) return [];
  const body = ex.map((e, i) => `Przykład ${i + 1}:\nNagłówek: ${e.headline}\nPoczątek: ${e.hook}\nFragment: ${e.excerpt}\nCTA: ${e.cta}`).join("\n\n");
  return [`<przyklady_stylu>\nTeksty zaakceptowane wcześniej przez biuro. Wzoruj się wyłącznie na stylu i długości. Nie kopiuj faktów, cen ani parametrów: dotyczą innych ofert.\n${fence(body)}\n</przyklady_stylu>`];
}

export function buildGenerationUserPrompt(ctx: PromptContext): string {
  const { def, request, brand, facts } = ctx;
  const toneLine = request.tone === "brand" ? "zgodnie z marką" : `${TONE_OVERRIDES[request.tone]} (w granicach tożsamości marki)`;
  const blocks = [
    `<marka>\n${brandBlock(brand)}\n</marka>`,
    `<zadanie>
Rodzaj treści: ${def.label} — ${def.description}
Platforma: ${PLATFORMS[request.platform].label}
Cel marketingowy: ${GOALS[request.goal]}
Odbiorca: ${fence(ctx.audienceLabel)}
Ton: ${toneLine}
Długość: ${LENGTHS[request.length].label} (${lengthHint(def, request.length)})
Rodzaj CTA: ${CTA_TYPES[request.ctaType]}
Liczba wariantów: ${request.variants}
</zadanie>`,
    `<struktura>\n${structureBlock(def, request.sequenceCount)}\n</struktura>`,
    ...examplesBlock(brand, def.id, request.platform),
    facts
      ? `<fakty>\n${fence(renderFactSheet(facts))}\n</fakty>`
      : "<fakty>\nBrak powiązanej nieruchomości. Nie opisuj żadnej konkretnej oferty i nie podawaj jej parametrów.\n</fakty>",
  ];
  const userData = [request.topic && `Temat / kontekst: ${request.topic}`, request.extraInstructions && `Dodatkowe wskazówki: ${request.extraInstructions}`]
    .filter(Boolean)
    .join("\n");
  if (userData) blocks.push(`<dane_uzytkownika>\n${fence(userData)}\n</dane_uzytkownika>`);
  if (def.marketData) {
    blocks.push(
      request.marketData.trim()
        ? `<dane_rynkowe>\n${fence(request.marketData.trim())}\n</dane_rynkowe>`
        : "<dane_rynkowe>\nBRAK. Użytkownik nie dostarczył danych rynkowych: nie podawaj żadnych liczb, procentów ani kierunków zmian cen.\n</dane_rynkowe>",
    );
  }
  if (ctx.previous.length) {
    blocks.push(
      `<poprzednie_warianty>\nNie powtarzaj tych nagłówków, hooków ani kątów:\n${ctx.previous
        .map((p, i) => `${i + 1}. kąt: ${fence(p.angle)} | nagłówek: ${fence(p.headline)} | hook: ${fence(p.hook)}`)
        .join("\n")}\n</poprzednie_warianty>`,
    );
  }
  blocks.push(
    `Przygotuj ${request.variants} ${request.variants === 1 ? "wariant" : "wyraźnie różne warianty"}. Przed oddaniem sprawdź każdy wariant według kryteriów jakości z kompetencji. Braki informacji wpisz do gaps.`,
  );
  return blocks.join("\n\n");
}

export const REFINE_OPERATIONS = {
  headline: "Zmień nagłówek",
  shorten: "Skróć treść",
  expand: "Rozbuduj treść",
  tone: "Zmień ton",
  hook: "Alternatywny hook",
  cta: "Zmień CTA",
  section: "Popraw sekcję",
  custom: "Własna instrukcja",
} as const;
export type RefineOperation = keyof typeof REFINE_OPERATIONS;

export interface RefineRequest {
  operation: RefineOperation;
  sectionKey?: string;
  tone?: ToneOverride;
  ctaType?: CtaType;
  instruction?: string;
}

export function refineInstruction(r: RefineRequest, variant: Variant): string {
  switch (r.operation) {
    case "headline":
      return `Zaproponuj nowy nagłówek o innym kącie niż obecny („${fence(variant.headline)}”). Zmień tylko pole headline; resztę pozostaw bez zmian.`;
    case "shorten":
      return "Skróć cały materiał o około 30–40%. Zachowaj wszystkie fakty kluczowe dla odbiorcy, hook i CTA. Usuń powtórzenia i ozdobniki.";
    case "expand":
      return "Rozbuduj materiał o około 30–50%, wyłącznie w oparciu o fakty i korzyści z nich wynikające. Jeśli brakuje faktów do rozbudowy, rozwiń korzyści i wpisz braki do notes.";
    case "tone":
      return `Przepisz materiał w tonie: ${TONE_OVERRIDES[r.tone ?? "brand"]}. Fakty, struktura sekcji i CTA bez zmian merytorycznych.`;
    case "hook":
      return `Napisz alternatywny hook innego typu niż obecny („${fence(variant.hook)}”) i dopasuj do niego pierwsze zdanie pierwszej sekcji. Reszta bez zmian.`;
    case "cta":
      return `Zmień CTA na typ: ${CTA_TYPES[r.ctaType ?? "message"]}. Zaktualizuj pole cta i miejsce CTA w treści. Reszta bez zmian.`;
    case "section":
      return `Popraw wyłącznie sekcję o kluczu „${fence(r.sectionKey ?? "")}”${r.instruction ? ` zgodnie ze wskazówką: ${fence(r.instruction)}` : " (jaśniej, konkretniej, z korzyścią dla odbiorcy)"}. Pozostałe sekcje zwróć bez zmian.`;
    case "custom":
      return `Wprowadź zmianę: ${fence(r.instruction ?? "")}. Zachowaj zasady nadrzędne.`;
  }
}

export function buildRefineUserPrompt(ctx: Omit<PromptContext, "previous" | "audienceLabel"> & { audienceLabel: string; variant: Variant; refine: RefineRequest }): string {
  return [
    `<marka>\n${brandBlock(ctx.brand)}\n</marka>`,
    `<zadanie>\nRodzaj treści: ${ctx.def.label}\nPlatforma: ${PLATFORMS[ctx.request.platform].label}\nCel: ${GOALS[ctx.request.goal]}\nOdbiorca: ${fence(ctx.audienceLabel)}\n</zadanie>`,
    `<struktura>\n${structureBlock(ctx.def, ctx.request.sequenceCount)}\n</struktura>`,
    ctx.facts ? `<fakty>\n${fence(renderFactSheet(ctx.facts))}\n</fakty>` : "<fakty>\nBrak powiązanej nieruchomości.\n</fakty>",
    ctx.def.marketData
      ? ctx.request.marketData.trim()
        ? `<dane_rynkowe>\n${fence(ctx.request.marketData)}\n</dane_rynkowe>`
        : "<dane_rynkowe>\nBRAK — nie dodawaj liczb rynkowych.\n</dane_rynkowe>"
      : "",
    `<tresc_do_poprawy>\n${fence(JSON.stringify(ctx.variant, null, 2))}\n</tresc_do_poprawy>`,
    `Polecenie: ${refineInstruction(ctx.refine, ctx.variant)}\nZwróć pełny wariant (wszystkie sekcje) w polu variant oraz jednozdaniowe podsumowanie zmiany w change_summary.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
