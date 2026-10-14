import { z } from "zod";
import { brandBlock, buildSystemPrompt, fence } from "./prompt";
import { renderFactSheet, type FactSheet } from "./facts";
import { factCheckTexts, type EngineContext } from "./pipeline";
import { composeSkillInstructions, selectionSummary, type SkillUsage } from "./skills/composer";
import { selectSkills } from "./skills/selector";
import type { Goal } from "./taxonomy";

export const VIDEO_SCRIPT_VERSION = "video-script-1.0.0";

export const videoScriptSchema = z.object({
  hook: z.string().describe("Pierwsza plansza: najmocniejszy fakt lub pytanie odbiorcy, maks. 6 słów"),
  scenes: z.array(z.object({ headline: z.string().describe("Nagłówek sceny, maks. 6 słów"), subline: z.string().describe("Podtytuł, maks. 8 słów, może być pusty") })).describe("Dokładnie tyle scen, ile w <sceny>, w tej samej kolejności"),
  cta: z.string().describe("Wezwanie do działania na planszę końcową, maks. 4 słowa"),
  caption: z.string().describe("Opis do publikacji pod filmem (2–4 zdania + do 5 hashtagów)"),
  gaps: z.array(z.string()).describe("Brakujące dane, które wzmocniłyby film"),
});
export type VideoScriptOutput = z.infer<typeof videoScriptSchema>;

export interface VideoScriptInput {
  facts: FactSheet;
  styleLabel: string;
  lengthSec: number;
  goal: Goal;
  scenes: { photoIndex: number; caption: string | null; isVisualization: boolean }[];
  instructions: string;
}

const words = (t: string, n: number) => t.trim().split(/\s+/).filter(Boolean).slice(0, n).join(" ");

/**
 * Script for a photo-based vertical video: one hook, one short text per photo
 * scene, a CTA and a caption. Numbers come only from the facts; scene texts
 * are kept short enough to read without sound. The result is fact-checked.
 */
export async function generateVideoScript(ctx: EngineContext, input: VideoScriptInput): Promise<VideoScriptOutput & { warnings: string[]; skills: SkillUsage; model: string; version: string }> {
  const selection = selectSkills(ctx.skills, { task: "video_script", outputKind: "video_script", goal: input.goal, hasProperty: true, brandStyle: ctx.brand.style, platform: "instagram", tags: ["reels", "video-script", "motion"] }, { budget: 6000, maxSkills: 8 });
  const system = buildSystemPrompt(ctx.brand.companyName, composeSkillInstructions(selection));
  const user = [
    `<marka>\n${brandBlock(ctx.brand)}\n</marka>`,
    `<zadanie>
Napisz teksty plansz do pionowego wideo (${input.lengthSec} s, styl: ${input.styleLabel}) zbudowanego z prawdziwych zdjęć oferty.
Hook maks. 6 słów, nagłówek sceny maks. 6 słów, podtytuł maks. 8 słów, CTA maks. 4 słowa.
Cenę i parametry aplikacja pokaże na osobnej planszy z danych, więc w scenach skup się na atutach i odczuciu miejsca.
Nie opisuj tego, czego nie wiadomo o zdjęciu. Nie obiecuj wyników.
</zadanie>`,
    `<sceny>\n${input.scenes.map((s, i) => `${i + 1}. zdjęcie ${s.photoIndex + 1}${s.caption ? `: ${fence(s.caption)}` : ""}${s.isVisualization ? " (wizualizacja)" : ""}`).join("\n")}\n</sceny>`,
    `<fakty>\n${fence(renderFactSheet(input.facts))}\n</fakty>`,
    input.instructions.trim() ? `<wskazowki>\n${fence(input.instructions.trim())}\n</wskazowki>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await ctx.provider.complete({
    operation: "video_script",
    tier: "main",
    system,
    user,
    schema: videoScriptSchema,
    effort: "low",
    testHint: { kind: "video_script", facts: input.facts.facts.map((f) => ({ label: f.label, value: f.value })), subject: input.facts.subject, scenes: input.scenes.map((s) => ({ photoIndex: s.photoIndex, role: "scene" })), maxWords: 6 },
  });
  const d = res.data;
  const scenes = input.scenes.map((_, i) => ({ headline: words(d.scenes[i]?.headline ?? "", 6).slice(0, 60), subline: words(d.scenes[i]?.subline ?? "", 8).slice(0, 80) }));
  const out = { hook: words(d.hook, 6).slice(0, 60), scenes, cta: words(d.cta, 4).slice(0, 50) || "Umów prezentację", caption: d.caption.slice(0, 2200), gaps: d.gaps.slice(0, 10).map((g) => g.slice(0, 300)) };
  const warnings = factCheckTexts(
    [{ key: "hook", content: out.hook }, ...out.scenes.map((s, i) => ({ key: `scene_${i}`, content: `${s.headline} ${s.subline}` })), { key: "cta", content: out.cta }, { key: "caption", content: out.caption }],
    { facts: input.facts, brand: ctx.brand, platform: "instagram", goal: input.goal, userTexts: [input.instructions] },
  );
  return { ...out, warnings, skills: selectionSummary(selection), model: res.model, version: VIDEO_SCRIPT_VERSION };
}
