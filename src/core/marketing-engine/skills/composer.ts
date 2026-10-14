import { SKILL_LAYERS, type SkillLayer, type SkillSelection } from "./types";

const LAYER_TITLES: Record<SkillLayer, string> = {
  guardrail: "Zasady nadrzędne (obowiązują zawsze, mają pierwszeństwo przed wszystkimi innymi wskazówkami)",
  brand: "Głos i zasady marki",
  strategy: "Strategia treści",
  domain: "Wiedza branżowa",
  format: "Format i platforma",
  technique: "Techniki copywriterskie",
  qa: "Samokontrola przed oddaniem tekstu",
};

/**
 * Composes selected skills into one ordered, de-duplicated instruction block.
 * Imported skills are adapted text maintained in the repo; they are inserted as
 * knowledge under the guardrails, never above them.
 */
export function composeSkillInstructions(selection: SkillSelection): string {
  const parts: string[] = [];
  for (const layer of SKILL_LAYERS) {
    const inLayer = selection.selected.filter((s) => s.skill.layer === layer);
    if (inLayer.length === 0) continue;
    parts.push(`## ${LAYER_TITLES[layer]}`);
    for (const { skill } of inLayer) {
      parts.push(`### ${skill.name} [${skill.id} v${skill.version}]\n${skill.instructions}`);
      if (skill.quality_criteria.length) {
        parts.push(`Kryteria jakości:\n${skill.quality_criteria.map((c) => `- ${c}`).join("\n")}`);
      }
    }
  }
  return parts.join("\n\n");
}

/** Compact record of which skills shaped a material (stored with every version). */
export function selectionSummary(selection: SkillSelection) {
  return selection.selected.map(({ skill, reasons }) => ({
    id: skill.id,
    name: skill.name,
    version: skill.version,
    category: skill.category,
    layer: skill.layer,
    source: skill.source.type,
    reasons,
  }));
}
export type SkillUsage = ReturnType<typeof selectionSummary>;
