import { LlmError, type LlmCall, type LlmProvider, type LlmResult, type TestHint } from "./provider";

/**
 * Offline provider for automated tests and local development without an API key.
 * It never pretends to be AI: every output is built mechanically from the fact
 * sheet and is labelled as test content. Disabled in production (see env.ts).
 */
export const TEST_MODEL = "offline-test-provider";
const LABEL = "Treść testowa (dostawca offline, bez AI). Skonfiguruj ANTHROPIC_API_KEY, aby generować prawdziwe teksty.";

const ANGLES = ["Konkret i parametry", "Codzienność w tym miejscu", "Najważniejsza korzyść", "Pytanie do odbiorcy"];

function sentenceFor(label: string, facts: { label: string; value: string }[], i: number): string {
  if (/parametr/i.test(label) && facts.length) return facts.map((f) => `${f.label}: ${f.value}`).join("\n");
  const f = facts.length ? facts[i % facts.length]! : null;
  return f ? `${label}: ${f.label.toLowerCase()} — ${f.value}.` : `${label}: treść testowa bez danych oferty.`;
}

/**
 * Mechanically follows the brand instructions a real model receives in the prompt
 * (preferred CTAs, avoided words, headline length), so the effect of changing
 * the Brand Profile or Brand Memory is visible in test mode too.
 */
function applyBrand(text: string, avoid: string[]) {
  let out = text;
  for (const w of avoid) if (w.trim()) out = out.replace(new RegExp(`\\s*${w.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "giu"), "");
  return out.replace(/\s{2,}/g, " ").trim();
}

function generate(h: Extract<TestHint, { kind: "generate" }>) {
  const subject = h.subject ?? "Materiał ekspercki biura";
  const b = h.brand ?? { ctas: [], avoid: [], headlineMax: null };
  return {
    variants: Array.from({ length: h.count }, (_, n) => {
      const i = n + h.seed;
      let headline = applyBrand(`${subject}${i ? ` · wariant ${i + 1}` : ""}`, b.avoid);
      if (b.headlineMax && headline.length > b.headlineMax) headline = headline.slice(0, b.headlineMax).replace(/\s+\S*$/, "");
      return {
        angle: `${ANGLES[i % ANGLES.length]} (test)`,
        headline,
        hook: applyBrand(h.facts[i % Math.max(1, h.facts.length)] ? `${subject}: ${h.facts[i % h.facts.length]!.value}.` : `${subject}.`, b.avoid),
        sections: h.sections.map((s, k) => ({ key: s.key, label: s.label, content: applyBrand(sentenceFor(s.label, h.facts, i + k), b.avoid) })),
        cta: b.ctas.length ? b.ctas[i % b.ctas.length]! : "Napisz wiadomość, aby umówić prezentację.",
        hashtags: h.usesHashtags ? ["#nieruchomosci", "#mieszkanie"] : [],
        notes: LABEL,
      };
    }),
    gaps: h.facts.length ? [] : ["Brak danych nieruchomości (tryb testowy)."],
  };
}

type V = { angle: string; headline: string; hook: string; sections: { key: string; label: string; content: string }[]; cta: string; hashtags: string[]; notes: string };

function refine(h: Extract<TestHint, { kind: "refine" }>) {
  const v = structuredClone(h.variant) as V;
  switch (h.operation) {
    case "headline":
      v.headline = `${v.headline} (nowy nagłówek)`;
      break;
    case "shorten":
      v.sections = v.sections.map((s) => ({ ...s, content: s.content.split(/(?<=[.!?])\s+/).slice(0, 1).join(" ") }));
      break;
    case "expand":
      v.sections = v.sections.map((s) => ({ ...s, content: s.content ? `${s.content} Rozwinięcie testowe tej sekcji.` : s.content }));
      break;
    case "hook":
      v.hook = `Alternatywny hook: ${v.hook}`;
      break;
    case "cta":
      v.cta = "Zadzwoń do agenta, aby poznać szczegóły.";
      break;
    case "repair":
      v.sections = v.sections.map((s) => ({ ...s, content: s.content.replace(/\d[\d\s,.]*\s?(%|zł|m²|m2)/g, "").trim() }));
      break;
    default:
      v.notes = `${v.notes} Zmiana testowa: ${h.operation}.`.trim();
  }
  return { variant: v, change_summary: `Operacja testowa „${h.operation}” wykonana mechanicznie (bez AI).` };
}

function graphicCopy(h: Extract<TestHint, { kind: "graphic_copy" }>) {
  let k = 0;
  return {
    slides: h.slides.map((slots) => ({
      fields: slots.map((s) => {
        // Feature items only from listed features: the offline provider, like the real
        // prompt, never turns price or area into a "benefit".
        if (/^item\d$/.test(s.key)) {
          const feats = h.facts.filter((x) => /cechy|udogodnienia|atuty/i.test(x.label)).flatMap((x) => x.value.split(/[;,]\s*/));
          return { key: s.key, value: (feats[Number(s.key.slice(4)) - 1] ?? "").slice(0, s.maxChars) };
        }
        const f = h.facts[k++ % Math.max(1, h.facts.length)];
        const title = h.direction ? `${h.direction}: ${h.subject ?? "Twoje biuro"}` : (h.subject ?? "Twoje biuro nieruchomości");
        const value = /tytu|nagł|headline|title/i.test(`${s.key} ${s.label}`) ? title : f ? f.value : s.label;
        return { key: s.key, value: value.slice(0, s.maxChars) };
      }),
    })),
    caption: `${h.subject ?? "Nowy materiał"}. ${LABEL}`,
    gaps: [],
  };
}

function campaignBrief(h: Extract<TestHint, { kind: "campaign_brief" }>) {
  const pick = (re: RegExp) => h.facts.find((f) => re.test(f.label));
  const points = h.facts.filter((f) => !/uwaga|transakcja|typ nieruchomości/i.test(f.label)).slice(0, 4);
  const price = pick(/^cena$|czynsz/i);
  const area = pick(/powierzchnia/i);
  return {
    big_idea: `${h.subject}: konkret zamiast obietnic (test).`,
    key_message: [h.subject, area?.value, price?.value].filter(Boolean).join(" · "),
    positioning: `Oferta przedstawiona przez fakty: ${points.map((p) => p.label.toLowerCase()).join(", ")}.`,
    audience_insight: "Odbiorca porównuje oferty i potrzebuje jasnych parametrów (treść testowa).",
    selling_points: points.map((f) => ({ point: `${f.label}: ${f.value}`, evidence: `${f.label}: ${f.value}` })),
    tone: "Rzeczowo i spokojnie (tryb testowy).",
    cta: "Umów prezentację tej nieruchomości.",
    channel_plan: h.deliverables.map((d) => ({ deliverable: d, angle: `${h.goalLabel}: ${h.subject}`, guidance: "Materiał testowy dostawcy offline." })),
    visual_direction: "Najpierw zdjęcie okładkowe, potem pomieszczenia w kolejności z galerii.",
    hashtags: ["#nieruchomosci", "#nowaoferta"],
    avoid: ["obietnic zysku", "parametrów spoza danych"],
    gaps: [LABEL],
  };
}

function videoScript(h: Extract<TestHint, { kind: "video_script" }>) {
  const facts = h.facts.filter((f) => !/uwaga|transakcja/i.test(f.label));
  const short = (t: string) => t.split(/\s+/).slice(0, h.maxWords).join(" ");
  return {
    hook: short(h.subject),
    scenes: h.scenes.map((s, i) => {
      const f = facts[i % Math.max(1, facts.length)];
      return { headline: short(i === 0 ? h.subject : f ? f.label : h.subject), subline: f ? short(f.value) : "" };
    }),
    cta: "Umów prezentację",
    caption: `${h.subject}. ${LABEL}`,
    gaps: [],
  };
}

/**
 * Brand traits from simple keyword rules over the fetched text. Evidence is
 * copied verbatim from the text, so the verification step can be exercised.
 */
function brandTraits(h: Extract<TestHint, { kind: "brand_traits" }>) {
  const t = h.text.toLowerCase();
  const quote = (re: RegExp) => {
    const src = [...h.headings, ...h.paragraphs].find((x) => re.test(x.toLowerCase()));
    return src ? [src.slice(0, 110)] : [];
  };
  const premium = /premium|luksus|ekskluzyw|prestiż/.test(t);
  const formal = /\b(pan|pani|państwa|państwu)\b/.test(t);
  const audiences = [
    /rodzin|dzieci|szkoł/.test(t) && { name: "Rodziny", description: "Szukają większego mieszkania lub domu blisko szkół i zieleni (test).", evidence: quote(/rodzin|dzieci|szkoł/) },
    /inwest|najem|zwrot/.test(t) && { name: "Inwestorzy", description: "Kupują pod wynajem (test).", evidence: quote(/inwest|najem/) },
    /pierwsz|kredyt|młod/.test(t) && { name: "Kupujący pierwsze mieszkanie", description: "Potrzebują prowadzenia przez proces (test).", evidence: quote(/pierwsz|kredyt|młod/) },
    /sprzeda|właściciel|wycen/.test(t) && { name: "Właściciele sprzedający nieruchomość", description: "Szukają biura do sprzedaży (test).", evidence: quote(/sprzeda|właściciel|wycen/) },
  ].filter(Boolean) as { name: string; description: string; evidence: string[] }[];
  const lead = h.headings[0] ?? h.paragraphs[0] ?? "";
  return {
    tone: {
      summary: `${formal ? "Uprzejmy, formalny" : "Bezpośredni"} ton (test).`,
      communication_style: premium ? "premium_restrained" : formal ? "expert_formal" : "professional_warm",
      address_form: formal ? "pan_pani" : /\b(ty|twoj|ciebie|tobie)\w*/.test(t) ? "ty" : "unknown",
      uses_emoji: /\p{Extended_Pictographic}/u.test(h.text),
      evidence: lead ? [lead.slice(0, 110)] : [],
    },
    personality: { summary: premium ? "Marka premium (test)." : "Marka lokalnego biura (test).", evidence: quote(/premium|luksus|lokal|rodzinn|doświadcz/) },
    brand_style: { id: premium ? "luxury" : "modern_minimal", reason: "Reguła słów kluczowych (test).", evidence: quote(/premium|luksus|nowoczes|minimal/) },
    graphic_style: { summary: premium ? "Powściągliwy, elegancki (test)." : "Czysty, prosty (test).", evidence: [] },
    audiences,
    differentiators: h.paragraphs.filter((p) => /lat|doświadcz|specjaliz|lokal|kompleks/.test(p.toLowerCase())).slice(0, 3).map((p) => ({ text: p.slice(0, 160), evidence: [p.slice(0, 110)] })),
    message_structure: { summary: "Nagłówek z obietnicą, krótki opis, przycisk kontaktu (test).", evidence: lead ? [lead.slice(0, 110)] : [] },
    characteristic_words: [],
    avoid_words: [{ word: "okazja", reason: "Nie pasuje do spokojnego tonu (test)." }],
    ctas: h.ctas.length ? [] : ["Umów prezentację"],
    guidelines: ["Pokazuj konkretne parametry ofert (test)."],
  };
}

function insights(h: Extract<TestHint, { kind: "insights" }>) {
  const known = h.facts.filter((f) => f.value !== "Brak danych" && f.key !== "simulator");
  const unknown = h.facts.filter((f) => f.value === "Brak danych");
  const leads = h.facts.find((f) => f.key === "leads");
  const clicks = h.facts.find((f) => f.key === "clicks");
  return {
    observations: known.slice(0, 5).map((f) => ({ text: `${f.label}: ${f.value} (test).`, facts: [f.key] })),
    hypotheses: [{ text: "Możliwe, że liczba zapytań zależy bardziej od kanału niż od liczby postów (hipoteza testowa).", verify: "Porównaj zapytania z linków śledzących w poszczególnych kanałach w kolejnym okresie." }],
    recommendations: [{
      what: "Dodawaj link śledzący do każdego posta z ofertą",
      why: "Bez linku nie da się przypisać zapytania do publikacji (treść testowa).",
      data: [clicks, leads].filter(Boolean).map((f) => `${f!.label}: ${f!.value}`).join("; ") || "Brak danych",
      action: "Utwórz link UTM w sekcji Linki śledzące i wklej go do opisu posta.",
      metric: "Zapytania na 100 kliknięć",
    }],
    limitations: [LABEL, ...(unknown.length ? [`Brak danych dla: ${unknown.map((f) => f.label).slice(0, 4).join(", ")}.`.slice(0, 300)] : [])],
  };
}

/**
 * Mechanical strategy built only from the computed facts and the user's
 * choices, so the whole flow (data → conclusions → plan → materials) can be
 * tested without a model. Every section says it is test content.
 */
function strategy(h: Extract<TestHint, { kind: "strategy" }>) {
  const known = h.facts.filter((f) => f.value !== "Brak danych" && f.key !== "simulator" && /\d/.test(f.value));
  const fact = (key: string) => h.facts.find((f) => f.key === key);
  const pub = fact("publications");
  const noMat = fact("properties_without_materials");
  const types = h.contentTypes;
  const pick = (want: string[]) => want.find((t) => types.includes(t)) ?? types[0]!;
  const pillars = [
    { name: "Oferty", purpose: "Prezentacja wybranych nieruchomości (test).", share: 50, examples: h.properties.slice(0, 2).map((p) => `Post o ofercie: ${p.title}`.slice(0, 160)) },
    { name: "Wiedza", purpose: "Odpowiedzi na pytania kupujących (test).", share: 30, examples: ["Jak przygotować się do zakupu"] },
    { name: "Biuro", purpose: "Ludzie i sposób pracy biura (test).", share: 20, examples: ["Przedstawienie agenta"] },
  ];
  const rotation = [
    { type: pick(["property_sales_post"]), pillar: "Oferty", withProperty: true },
    { type: pick(["property_sales_carousel", "property_sales_post"]), pillar: "Oferty", withProperty: true },
    { type: pick(["educational_post", "guide_content"]), pillar: "Wiedza", withProperty: false },
    { type: pick(["trust_post", "agent_intro"]), pillar: "Biuro", withProperty: false },
    { type: pick(["property_reels_script", "short_video_script"]), pillar: "Oferty", withProperty: true },
  ];
  const materials = Array.from({ length: h.limit }, (_, i) => {
    const r = rotation[i % rotation.length]!;
    const prop = r.withProperty && h.properties.length ? h.properties[i % h.properties.length]! : null;
    return {
      content_type: r.type,
      platform: h.channels[i % h.channels.length]!,
      property_id: prop?.id ?? null,
      topic: (prop ? `${prop.title} (test)` : `${r.pillar}: temat testowy ${i + 1}`).slice(0, 200),
      week: Math.min(h.weeks, 1 + Math.floor((i * h.weeks) / Math.max(1, h.limit))),
      pillar: r.pillar,
    };
  });
  return {
    diagnosis: {
      summary: `Diagnoza testowa na podstawie danych biura. Cel: ${h.goalLabel}.`,
      findings: known.slice(0, 5).map((f) => ({ text: `${f.label}: ${f.value} (test).`.slice(0, 300), facts: [f.key] })),
    },
    conclusions: [
      ...(noMat && noMat.value !== "0" ? [{ text: `Część aktywnych ofert nie ma materiałów (${noMat.value}) (test).`, facts: [noMat.key] }] : []),
      ...(pub ? [{ text: `Liczba publikacji w okresie: ${pub.value} (test).`, facts: [pub.key] }] : []),
      { text: "Wniosek testowy bez wskazania danych.", facts: [] },
    ],
    hypotheses: [{ text: "Możliwe, że karuzele z ofertami przyciągną więcej zapytań niż pojedyncze posty (hipoteza testowa).", verify: "Porównaj zapytania z linków śledzących dla obu formatów po miesiącu." }],
    goals: [{ goal: h.goalLabel.slice(0, 200), metric: "Zapytania z linków śledzących", horizon: `${h.weeks} tyg.` }],
    segments: [{ name: "Odbiorcy z zadania", need: "Potrzeba testowa.", message: "Przekaz testowy.", property_ids: h.properties.map((p) => p.id).slice(0, 3) }],
    key_messages: [{ message: "Główny przekaz testowy oparty na ofertach.", segment: "Odbiorcy z zadania", proof: "Parametry wybranych ofert." }],
    pillars,
    campaign_ideas: h.properties.slice(0, 2).map((p, i) => ({ name: `Kampania testowa ${i + 1}`, idea: `Seria materiałów o ofercie ${p.title} (test).`.slice(0, 400), channels: h.channels.slice(0, 2), format: "Karuzela i post", property_ids: [p.id], week: Math.min(h.weeks, i + 1) })),
    schedule: Array.from({ length: Math.min(h.weeks, 13) }, (_, i) => ({ week: i + 1, focus: `Tydzień ${i + 1}: ${pillars[i % 3]!.name} (test)`, actions: [`Przygotuj materiały z tygodnia ${i + 1}`] })),
    formats: h.channels.slice(0, 3).map((c) => ({ format: "Post", channel: c, why: "Format testowy dla kanału." })),
    ctas: [{ cta: "Umów prezentację", when: "Materiały ofertowe (test)." }],
    metrics: [
      { metric: "Zapytania z linków śledzących", how: "Moduł Zapytania i linki UTM", available: true },
      { metric: "Wyświetlenia postów", how: "Statystyki platform po połączeniu kont", available: false },
    ],
    materials,
    recommendations: [{
      what: "Przygotuj materiały dla ofert bez promocji (test)",
      why: "Oferty bez materiałów nie są widoczne w kanałach biura (treść testowa).",
      data: noMat ? `${noMat.label}: ${noMat.value}` : "Brak danych",
      facts: noMat ? [noMat.key] : [],
      action: "Wygeneruj post sprzedażowy dla każdej takiej oferty.",
      metric: "Liczba ofert z co najmniej jednym materiałem",
    }, ...(h.adBudget > 0 ? [] : [])],
    limitations: [LABEL],
  };
}

/** Put this text in a property title or instructions to simulate an AI failure in tests. */
export const FAIL_MARKER = "[TEST:AI_FAIL]";

export class TestProvider implements LlmProvider {
  readonly name = "test";

  async complete<T>(call: LlmCall<T>): Promise<LlmResult<T>> {
    const h = call.testHint;
    let raw: unknown;
    if (!h) throw new LlmError("Dostawca testowy nie obsługuje tego zadania.", "unknown");
    // Failure injection for acceptance tests (offline provider only): any input containing the marker fails.
    if (JSON.stringify(h).includes(FAIL_MARKER)) throw new LlmError("Model AI odmówił wykonania tego zadania. Zmień temat lub instrukcje i spróbuj ponownie.", "refusal");
    if (h.kind === "generate") raw = generate(h);
    else if (h.kind === "refine") raw = refine(h);
    else if (h.kind === "graphic_copy") raw = graphicCopy(h);
    else if (h.kind === "campaign_brief") raw = campaignBrief(h);
    else if (h.kind === "video_script") raw = videoScript(h);
    else if (h.kind === "insights") raw = insights(h);
    else if (h.kind === "brand_traits") raw = brandTraits(h);
    else if (h.kind === "strategy") raw = strategy(h);
    else raw = { checks: [], suggestions: [] };
    const parsed = call.schema.safeParse(raw);
    if (!parsed.success) throw new LlmError("Dostawca testowy zwrócił niepoprawne dane.", "invalid_output");
    return { data: parsed.data, model: TEST_MODEL, usage: { input: 0, output: 0 } };
  }
}
