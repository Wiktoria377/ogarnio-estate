import { z } from "zod";
import type { BrandKit } from "@/core/brand/model";
import { brandBlock, buildSystemPrompt, fence } from "./prompt";
import { renderFactSheet, type FactSheet } from "./facts";
import { factCheckTexts, type EngineContext } from "./pipeline";
import { composeSkillInstructions, selectionSummary, type SkillUsage } from "./skills/composer";
import { selectSkills } from "./skills/selector";
import type { Goal } from "./taxonomy";

/**
 * AI Marketing Director: turns a campaign request into a structured brief
 * BEFORE any material is written. Every deliverable is then generated from the
 * same brief (one big idea, one key message, one CTA), which keeps the
 * campaign consistent across channels. It is a decision step, not a chat.
 *
 * DIRECTOR_VERSION is stored with the brief and every job, together with the
 * versions of the skills that were used (instruction versioning).
 */
export const DIRECTOR_VERSION = "director-2.0.0";

export const campaignBriefSchema = z.object({
  big_idea: z.string().describe("Myśl przewodnia kampanii w jednym zdaniu, oparta na faktach"),
  key_message: z.string().describe("Główny przekaz, który powtórzy każdy materiał"),
  positioning: z.string().describe("Dlaczego ta oferta dla tego odbiorcy: pozycjonowanie w 1–2 zdaniach"),
  audience_insight: z.string().describe("Sytuacja i potrzeba odbiorcy (bez stereotypów)"),
  selling_points: z
    .array(z.object({ point: z.string().describe("Argument sprzedażowy"), evidence: z.string().describe("Fakt z <fakty>, na którym argument się opiera, przepisany dosłownie") }))
    .describe("3–5 argumentów, każdy oparty na fakcie"),
  tone: z.string().describe("Ton kampanii w 1 zdaniu"),
  cta: z.string().describe("Jedno wspólne wezwanie do działania"),
  channel_plan: z
    .array(z.object({ deliverable: z.string().describe("Klucz materiału dokładnie jak w <materialy>"), angle: z.string(), guidance: z.string() }))
    .describe("Po jednej pozycji na każdy materiał z <materialy>"),
  visual_direction: z.string().describe("Kierunek wizualny: nastrój, kolejność pokazywanych pomieszczeń (tylko z danych)"),
  hashtags: z.array(z.string()).describe("Do 5 hashtagów kampanii"),
  avoid: z.array(z.string()).describe("Czego unikać w tej kampanii"),
  gaps: z.array(z.string()).describe("Brakujące dane, które wzmocniłyby kampanię"),
});
export type CampaignBriefOutput = z.infer<typeof campaignBriefSchema>;

export interface StoredBrief extends CampaignBriefOutput {
  version: string;
  model: string;
  skills: SkillUsage;
  warnings: string[];
  createdAt: string;
}

export interface DirectorInput {
  goalLabel: string;
  goalDescription: string;
  engineGoal: Goal;
  goalTags: string[];
  styleLabel: string;
  styleHint: string;
  audienceLabel: string;
  audienceTags: string[];
  platforms: string[];
  deliverables: { id: string; label: string; hint: string }[];
  facts: FactSheet;
  notes: string;
  brandStyle: BrandKit["style"];
}

export function directorSkillQuery(input: DirectorInput) {
  return {
    task: "campaign_brief" as const,
    outputKind: "campaign" as const,
    goal: input.engineGoal,
    hasProperty: true,
    brandStyle: input.brandStyle,
    tags: ["campaign", "planning", ...input.goalTags, ...input.audienceTags],
  };
}

export async function generateCampaignBrief(ctx: EngineContext, input: DirectorInput): Promise<StoredBrief> {
  const selection = selectSkills(ctx.skills, directorSkillQuery(input), { budget: 7000, maxSkills: 9 });
  const system = buildSystemPrompt(ctx.brand.companyName, composeSkillInstructions(selection));
  const user = [
    `<marka>\n${brandBlock(ctx.brand)}\n</marka>`,
    `<zadanie>
Jesteś dyrektorem marketingu biura. Przygotuj brief kampanii dla jednej nieruchomości, zanim powstaną materiały.
Cel kampanii: ${input.goalLabel}. ${input.goalDescription}
Styl komunikacji kampanii: ${input.styleLabel} (${input.styleHint})
Odbiorca: ${fence(input.audienceLabel)}
Kanały: ${input.platforms.join(", ")}
Nie obiecuj wyników kampanii (liczby zapytań, czasu sprzedaży, wzrostu wartości). Argumenty wyłącznie z <fakty>.
</zadanie>`,
    `<materialy>\n${input.deliverables.map((d) => `- ${d.id}: ${d.label} (${d.hint})`).join("\n")}\n</materialy>`,
    `<fakty>\n${fence(renderFactSheet(input.facts))}\n</fakty>`,
    input.notes.trim() ? `<dane_uzytkownika>\n${fence(input.notes.trim())}\n</dane_uzytkownika>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await ctx.provider.complete({
    operation: "campaign_brief",
    tier: "main",
    system,
    user,
    schema: campaignBriefSchema,
    effort: "medium",
    testHint: {
      kind: "campaign_brief",
      facts: input.facts.facts.map((f) => ({ label: f.label, value: f.value })),
      subject: input.facts.subject,
      goalLabel: input.goalLabel,
      deliverables: input.deliverables.map((d) => d.id),
    },
  });

  const b = res.data;
  const known = new Set(input.deliverables.map((d) => d.id));
  const brief: CampaignBriefOutput = {
    ...b,
    selling_points: b.selling_points.slice(0, 5),
    channel_plan: input.deliverables.map((d) => b.channel_plan.find((c) => c.deliverable === d.id) ?? { deliverable: d.id, angle: b.key_message, guidance: "" }).filter((c) => known.has(c.deliverable)),
    hashtags: [...new Set(b.hashtags.map((h) => h.trim().replace(/^#*/, "#")).filter((h) => h.length > 1))].slice(0, 5),
  };
  // QA: the brief steers every material, so its numbers and claims are checked first.
  const warnings = factCheckTexts(
    [
      { key: "big_idea", content: brief.big_idea },
      { key: "key_message", content: brief.key_message },
      { key: "positioning", content: brief.positioning },
      { key: "cta", content: brief.cta },
      ...brief.selling_points.map((p, i) => ({ key: `point_${i}`, content: p.point })),
      ...brief.channel_plan.map((c) => ({ key: `plan_${c.deliverable}`, content: `${c.angle} ${c.guidance}` })),
    ],
    { facts: input.facts, brand: ctx.brand, platform: "general", goal: input.engineGoal, userTexts: [input.notes] },
  );
  return { ...brief, version: DIRECTOR_VERSION, model: res.model, skills: selectionSummary(selection), warnings, createdAt: new Date().toISOString() };
}

/** Compact brief for one deliverable (passed to the generator as instructions). */
export function briefInstructions(brief: CampaignBriefOutput, deliverable: string, extra = ""): string {
  const plan = brief.channel_plan.find((c) => c.deliverable === deliverable);
  const lines = [
    `Brief kampanii (zachowaj spójność z pozostałymi materiałami).`,
    `Myśl przewodnia: ${brief.big_idea}`,
    `Główny przekaz: ${brief.key_message}`,
    `Argumenty: ${brief.selling_points.map((p) => p.point).join("; ")}`,
    `Ton: ${brief.tone}`,
    `CTA kampanii: ${brief.cta}`,
    plan ? `Ten materiał: ${plan.angle}${plan.guidance ? `. ${plan.guidance}` : ""}` : "",
    brief.avoid.length ? `Unikaj: ${brief.avoid.join("; ")}` : "",
    extra,
  ].filter(Boolean);
  let out = lines.join("\n");
  if (out.length > 1450) out = `${out.slice(0, 1449)}…`;
  return out;
}
