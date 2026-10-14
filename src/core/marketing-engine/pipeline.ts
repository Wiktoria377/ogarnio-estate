import type { BrandKit } from "@/core/brand/model";
import type { LlmProvider } from "@/core/ai/provider";
import { expectedSectionKeys, type ContentTypeDef } from "./content-types";
import { allowedNumbers, type FactSheet } from "./facts";
import {
  buildGenerationUserPrompt,
  buildRefineUserPrompt,
  buildSystemPrompt,
  fence,
  brandBlock,
  type GenerationRequest,
  type RefineRequest,
} from "./prompt";
import { aiReview, buildQualityReport, criticalFindings, repairInstruction } from "./quality/review";
import { runRuleChecks, type RuleContext } from "./quality/rules";
import {
  generationOutputSchema,
  graphicCopyOutputSchema,
  refineOutputSchema,
  type QualityReport,
  type Variant,
} from "./schemas";
import { composeSkillInstructions, selectionSummary, type SkillUsage } from "./skills/composer";
import { selectSkills } from "./skills/selector";
import type { Skill, SkillQuery, SkillSelection } from "./skills/types";
import { PLATFORMS, type Platform } from "./taxonomy";
import { renderFactSheet } from "./facts";

export interface EngineContext {
  provider: LlmProvider;
  skills: Skill[];
  brand: BrandKit;
  /** Second-model review on top of deterministic rules (on by default). */
  aiReview?: boolean;
}

export interface TaskInput {
  def: ContentTypeDef;
  request: GenerationRequest;
  facts: FactSheet | null;
  audienceLabel: string;
  audienceTags?: string[];
  /** Tags from the property's own data (e.g. premium, rental), see propertySkillTags. */
  propertyTags?: string[];
  /** Business process for cost accounting (e.g. one Autopilot run). */
  process?: { type: string; id: string };
}

export interface GeneratedVariant {
  variant: Variant;
  quality: QualityReport;
}

export interface GenerateResult {
  variants: GeneratedVariant[];
  gaps: string[];
  skills: SkillUsage;
  model: string;
}

/** Tags from the approved Brand Profile: audiences named by the office steer domain skills. */
export function brandSkillTags(brand: BrandKit): string[] {
  const names = (brand.profile?.audiences ?? []).map((a) => `${a.name} ${a.description}`.toLowerCase()).join(" ") + ` ${(brand.targetAudience ?? "").toLowerCase()}`;
  const tags: string[] = [];
  if (/inwest/.test(names)) tags.push("investors");
  if (/pierwsz|młod/.test(names)) tags.push("first-buyers");
  if (/najem|najemc|wynaj/.test(names)) tags.push("rental");
  if (/właściciel|sprzedając/.test(names)) tags.push("owner-acquisition");
  if (/premium|luksus|zamożn/.test(names) || brand.style === "luxury") tags.push("premium");
  return tags;
}

export function skillQueryFor(task: "generate" | "refine", input: TaskInput, brand: BrandKit) {
  return {
    task,
    group: input.def.group,
    outputKind: input.def.outputKind,
    contentType: input.def.id,
    platform: input.request.platform,
    goal: input.request.goal,
    hasProperty: input.facts !== null,
    brandStyle: brand.style,
    tags: [...new Set([...input.def.skillTags, ...(input.audienceTags ?? []), ...(input.propertyTags ?? []), ...brandSkillTags(brand)])] as string[],
    focusTags: [...new Set([...(input.audienceTags ?? []), ...(input.propertyTags ?? []), ...brandSkillTags(brand)])] as string[],
  } as const;
}

function userTexts(r: GenerationRequest): string[] {
  return [r.topic, r.extraInstructions, r.marketData].map((t) => t.trim()).filter(Boolean);
}

export function ruleContext(input: TaskInput, brand: BrandKit): RuleContext {
  const texts = userTexts(input.request);
  const brandTexts = [brand.contact.address, brand.tagline, brand.preferredPhrases].filter((t): t is string => !!t);
  return {
    def: input.def,
    platform: input.request.platform,
    facts: input.facts,
    allowedNumbers: allowedNumbers(input.facts, [...texts, ...brandTexts]),
    brand,
    marketDataProvided: input.request.marketData.trim().length > 0,
    ctaType: input.request.ctaType,
    userTexts: texts,
  };
}

/** Forces the model output into the declared structure: order, keys, labels. */
export function normalizeVariant(def: ContentTypeDef, v: Variant, sequenceCount?: number): Variant {
  const expected = expectedSectionKeys(def, sequenceCount);
  const byKey = new Map(v.sections.map((s) => [s.key.trim(), s]));
  const modelLabels = def.sequence?.modelLabels;
  const sections = expected.map((e) => {
    const got = byKey.get(e.key);
    const isSeq = def.sequence && e.key.startsWith(def.sequence.prefix);
    const label = isSeq && modelLabels && got?.label.trim() ? got.label.trim() : e.label;
    return { key: e.key, label, content: (got?.content ?? "").trim() };
  });
  return {
    angle: v.angle.trim(),
    headline: v.headline.trim(),
    hook: v.hook.trim(),
    sections,
    cta: v.cta.trim(),
    hashtags: def.usesHashtags ? [...new Set(v.hashtags.map((h) => h.trim().replace(/^#*/, "#")).filter((h) => h.length > 1))] : [],
    notes: v.notes.trim(),
  };
}

function criteriaOf(selection: SkillSelection): string[] {
  return selection.selected.filter((s) => s.skill.layer === "guardrail" || s.skill.layer === "qa").flatMap((s) => s.skill.quality_criteria);
}

/**
 * QA for one variant: deterministic rules, AI review, and at most one automatic
 * repair pass when something blocks publication (invented fact, investment promise).
 */
async function assure(ctx: EngineContext, input: TaskInput, variant: Variant, system: string, criteria: string[]): Promise<GeneratedVariant> {
  const rc = ruleContext(input, ctx.brand);
  const review = async (v: Variant) => {
    if (ctx.aiReview === false) return null;
    try {
      return (await aiReview(ctx.provider, { variant: v, ctx: rc, goal: input.request.goal, audienceLabel: input.audienceLabel, skillCriteria: criteria, process: input.process })).review;
    } catch (error) {
      // Review is an extra safety net; rules still run when it is unavailable.
      console.warn("ai review failed", error instanceof Error ? error.message : error);
      return null;
    }
  };
  let report = buildQualityReport(runRuleChecks(variant, rc), await review(variant));
  const critical = criticalFindings(report);
  if (critical.length === 0) return { variant, quality: report };

  try {
    const repaired = await ctx.provider.complete({
      operation: "repair",
      tier: "main",
      system,
      user: buildRefineUserPrompt({ ...input, brand: ctx.brand, variant, refine: { operation: "custom", instruction: repairInstruction(critical) } }),
      schema: refineOutputSchema,
      effort: "low",
      process: input.process,
      testHint: { kind: "refine", variant, operation: "repair" },
    });
    const fixed = normalizeVariant(input.def, repaired.data.variant, input.request.sequenceCount);
    const fixedReport = buildQualityReport(runRuleChecks(fixed, rc), await review(fixed), true);
    if (criticalFindings(fixedReport).length <= critical.length) return { variant: fixed, quality: fixedReport };
  } catch (error) {
    console.warn("repair failed", error instanceof Error ? error.message : error);
  }
  report = { ...report, suggestions: [...report.suggestions] };
  return { variant, quality: report };
}

/** Brand instructions in a machine-readable form, for the offline test provider only. */
function brandHint(brand: EngineContext["brand"]) {
  const m = brand.memory;
  const max = m?.headlineStyle.map((s) => /do ok\. (\d+)/.exec(s)?.[1]).find(Boolean);
  return {
    ctas: [...new Set([...(m?.ctas ?? []), ...(brand.profile?.ctas ?? [])])],
    avoid: [...new Set([...(m?.avoid ?? []), ...(brand.profile?.avoid_words ?? []), ...(brand.avoidedPhrases ?? "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)])],
    headlineMax: max ? Number(max) : null,
  };
}

export async function generateContent(
  ctx: EngineContext,
  input: TaskInput,
  previous: Pick<Variant, "headline" | "hook" | "angle">[] = [],
): Promise<GenerateResult> {
  const selection = selectSkills(ctx.skills, skillQueryFor("generate", input, ctx.brand));
  const system = buildSystemPrompt(ctx.brand.companyName, composeSkillInstructions(selection));
  const user = buildGenerationUserPrompt({ def: input.def, request: input.request, brand: ctx.brand, facts: input.facts, audienceLabel: input.audienceLabel, previous });
  const res = await ctx.provider.complete({
    operation: "generate",
    tier: "main",
    system,
    user,
    schema: generationOutputSchema,
    maxTokens: input.def.outputKind === "long_form" ? 32000 : 16000,
    process: input.process,
    testHint: {
      kind: "generate",
      sections: expectedSectionKeys(input.def, input.request.sequenceCount),
      facts: input.facts?.facts.map((f) => ({ label: f.label, value: f.value })) ?? [],
      subject: input.facts?.subject ?? null,
      count: input.request.variants,
      usesHashtags: !!input.def.usesHashtags,
      seed: previous.length,
      brand: brandHint(ctx.brand),
    },
  });
  const variants = res.data.variants.slice(0, input.request.variants).map((v) => normalizeVariant(input.def, v, input.request.sequenceCount));
  if (variants.length === 0) throw new Error("Model nie zwrócił żadnego wariantu.");
  const criteria = criteriaOf(selection);
  const assured = await Promise.all(variants.map((v) => assure(ctx, input, v, system, criteria)));
  return { variants: assured, gaps: res.data.gaps, skills: selectionSummary(selection), model: res.model };
}

export async function refineContent(
  ctx: EngineContext,
  input: TaskInput,
  variant: Variant,
  refine: RefineRequest,
): Promise<GeneratedVariant & { changeSummary: string; skills: SkillUsage; model: string }> {
  const selection = selectSkills(ctx.skills, skillQueryFor("refine", input, ctx.brand));
  const system = buildSystemPrompt(ctx.brand.companyName, composeSkillInstructions(selection));
  const res = await ctx.provider.complete({
    operation: "refine",
    tier: "main",
    system,
    user: buildRefineUserPrompt({ ...input, brand: ctx.brand, variant, refine }),
    schema: refineOutputSchema,
    testHint: { kind: "refine", variant, operation: refine.operation },
  });
  const next = normalizeVariant(input.def, res.data.variant, input.request.sequenceCount);
  const assured = await assure(ctx, input, next, system, criteriaOf(selection));
  return { ...assured, changeSummary: res.data.change_summary, skills: selectionSummary(selection), model: res.model };
}

/** Runs QA on manually edited text (rules only; no AI cost). */
export function checkManualEdit(ctx: Pick<EngineContext, "brand">, input: TaskInput, variant: Variant): GeneratedVariant {
  const v = normalizeVariant(input.def, variant, input.request.sequenceCount);
  return { variant: v, quality: buildQualityReport(runRuleChecks(v, ruleContext(input, ctx.brand)), null) };
}

// ---------------------------------------------------------------- graphics copy

export interface GraphicSlot {
  key: string;
  label: string;
  maxChars: number;
}

export interface GraphicCopyInput {
  /** One entry per slide; each slide lists the text slots of its layout. */
  slides: GraphicSlot[][];
  facts: FactSheet | null;
  platform: Platform;
  goal: GenerationRequest["goal"];
  audienceLabel: string;
  brief: string;
  formatLabel: string;
  /** Tags from the property's data (premium, rental…), see propertySkillTags. */
  propertyTags?: string[];
  /** Creative direction (Creative Engine variants): changes approach, never facts or brand identity. */
  direction?: { label: string; brief: string; tags: string[] };
  /** Business process for cost accounting (e.g. one variant set). */
  process?: { type: string; id: string };
}

export interface GraphicCopyResult {
  slides: Record<string, string>[];
  caption: string;
  gaps: string[];
  warnings: string[];
  skills: SkillUsage;
  model: string;
}

/** Trims to a limit on a word boundary (layout safety net; QA reports it). */
export function clampText(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : t.slice(0, max)).replace(/[,;:–-]+$/, "")}…`;
}

/**
 * Deterministic fact check for short texts outside the variant structure
 * (graphics, campaign brief, video scenes): numbers must exist in the data,
 * no investment promises, no unverifiable claims. Returns user-facing warnings.
 */
export function factCheckTexts(
  texts: { key: string; content: string }[],
  o: { facts: FactSheet | null; brand: BrandKit; platform: Platform; goal: GenerationRequest["goal"]; userTexts: string[] },
): string[] {
  const allowed = allowedNumbers(o.facts, [...o.userTexts, o.brand.contact.address ?? "", o.brand.contact.phone ?? ""]);
  const pseudo: Variant = { angle: "", headline: "", hook: "", sections: texts.map((t) => ({ key: t.key, label: t.key, content: t.content })), cta: "", hashtags: [], notes: "" };
  const pseudoDef: ContentTypeDef = {
    id: "short_texts", group: "property", label: "Teksty", description: "", outputKind: "short_copy", defaultPlatform: o.platform,
    platforms: [o.platform], property: "optional", defaultGoal: o.goal, defaultCta: "soft", defaultLength: "short", skillTags: [], sections: [],
  };
  return runRuleChecks(pseudo, {
    def: pseudoDef, platform: o.platform, facts: o.facts, allowedNumbers: allowed, brand: o.brand,
    marketDataProvided: false, ctaType: "soft", userTexts: o.userTexts,
  })
    .filter((f) => f.severity === "critical" && f.source === "rules" && (f.category === "property_facts" || f.category === "investment_promises" || f.category === "unverified_claims"))
    .map((f) => `${f.message}${f.excerpt ? `: „${f.excerpt}”` : ""}`);
}

/**
 * What the skills engine knows about a graphic: format, platform, goal, the
 * property (premium, audience) and the brand. Sales goals pull sales copy,
 * premium properties pull premium storytelling.
 */
export function graphicSkillQuery(input: Pick<GraphicCopyInput, "slides" | "platform" | "goal" | "facts" | "propertyTags" | "direction">, brand: BrandKit): SkillQuery {
  const carousel = input.slides.length > 1;
  const propertyTags = input.propertyTags ?? [];
  const focus = [...propertyTags, ...brandSkillTags(brand)];
  if (input.goal === "sales" || input.goal === "leads") focus.push("sales-copy");
  if (focus.includes("premium") || brand.style === "luxury") focus.push("storytelling");
  // On a carousel the first slide decides whether anyone swipes: the hook is essential.
  if (carousel) focus.push("hooks");
  if (input.direction) focus.push("variants", ...input.direction.tags);
  const tags = ["graphic", "graphic-copy", carousel ? "carousel" : "post", "headlines", "cta", "hooks", "typography", ...focus];
  return {
    task: "graphic_copy",
    group: input.facts ? "property" : undefined,
    outputKind: carousel ? "carousel" : "post",
    platform: input.platform,
    goal: input.goal,
    hasProperty: input.facts !== null,
    brandStyle: brand.style,
    tags: [...new Set(tags)],
    focusTags: [...new Set(focus)],
  };
}

export async function generateGraphicCopy(ctx: EngineContext, input: GraphicCopyInput): Promise<GraphicCopyResult> {
  const selection = selectSkills(ctx.skills, graphicSkillQuery(input, ctx.brand));
  const system = buildSystemPrompt(ctx.brand.companyName, composeSkillInstructions(selection));
  const slideSpec = input.slides
    .map((slots, i) => `Slajd ${i + 1}:\n${slots.map((s) => `  - ${s.key}: ${s.label} (maks. ${s.maxChars} znaków)`).join("\n")}`)
    .join("\n");
  const user = [
    `<marka>\n${brandBlock(ctx.brand)}\n</marka>`,
    `<zadanie>\nTeksty na grafikę: ${input.formatLabel}\nPlatforma: ${PLATFORMS[input.platform].label}\nOdbiorca: ${fence(input.audienceLabel)}\nTeksty na grafice muszą być krótkie i czytelne z odległości kciuka. Liczby przepisuj dokładnie z faktów.${input.direction ? `\nWariant kreatywny: ${input.direction.label}. ${input.direction.brief} Fakty i marka pozostają te same, zmienia się podejście.` : ""}\n</zadanie>`,
    `<struktura>\nDla każdego slajdu zwróć pola dokładnie o tych kluczach, w tej kolejności (pusty string, jeśli brak danych):\n${slideSpec}\nPole caption: opis posta do publikacji z grafiką.\n</struktura>`,
    input.facts ? `<fakty>\n${fence(renderFactSheet(input.facts))}\n</fakty>` : "<fakty>\nBrak powiązanej nieruchomości. Nie podawaj parametrów żadnej oferty.\n</fakty>",
    input.brief.trim() ? `<dane_uzytkownika>\n${fence(input.brief.trim())}\n</dane_uzytkownika>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await ctx.provider.complete({
    operation: "graphic_copy",
    tier: "main",
    system,
    user,
    schema: graphicCopyOutputSchema,
    effort: "low",
    process: input.process,
    testHint: {
      kind: "graphic_copy",
      direction: input.direction?.label,
      slides: input.slides,
      facts: input.facts?.facts.map((f) => ({ label: f.label, value: f.value })) ?? [],
      subject: input.facts?.subject ?? null,
    },
  });

  const warnings: string[] = [];
  const slides = input.slides.map((slots, i) => {
    const got = new Map(res.data.slides[i]?.fields.map((f) => [f.key, f.value]) ?? []);
    const out: Record<string, string> = {};
    for (const slot of slots) {
      const raw = got.get(slot.key) ?? "";
      if (raw.length > slot.maxChars) warnings.push(`Slajd ${i + 1}, ${slot.label}: tekst skrócony do ${slot.maxChars} znaków.`);
      out[slot.key] = clampText(raw, slot.maxChars);
    }
    return out;
  });
  // Same fact check as for long copy: numbers on a graphic must exist in the data.
  warnings.push(
    ...factCheckTexts(
      slides.flatMap((sl, i) => Object.entries(sl).map(([key, content]) => ({ key: `s${i}_${key}`, content }))),
      { facts: input.facts, brand: ctx.brand, platform: input.platform, goal: input.goal, userTexts: [input.brief] },
    ),
  );

  return { slides, caption: res.data.caption.trim(), gaps: res.data.gaps, warnings, skills: selectionSummary(selection), model: res.model };
}
