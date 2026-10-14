import { SKILL_LAYERS, type Skill, type SkillQuery, type SkillSelection, type SelectedSkill } from "./types";

export interface SelectorOptions {
  /** Token budget for non-guardrail skills. Guardrails are never dropped. */
  budget?: number;
  /** Hard cap on non-guardrail skills, so prompts stay focused. */
  maxSkills?: number;
}

type Dim = { key: keyof NonNullable<Skill["applies_to"]>; value: string | boolean | undefined; label: string };

function dims(q: SkillQuery): Dim[] {
  return [
    { key: "tasks", value: q.task, label: "zadanie" },
    { key: "groups", value: q.group, label: "kategoria" },
    { key: "output_kinds", value: q.outputKind, label: "format" },
    { key: "content_types", value: q.contentType, label: "rodzaj treści" },
    { key: "platforms", value: q.platform, label: "platforma" },
    { key: "goals", value: q.goal, label: "cel" },
    { key: "requires_property", value: q.hasProperty, label: "nieruchomość" },
    { key: "brand_styles", value: q.brandStyle, label: "styl marki" },
  ];
}

/**
 * Scores one skill against the query. A skill is eligible when every dimension
 * it constrains matches the query; it must also be *relevant*, i.e. constrain at
 * least one dimension that matched, or share a tag with the task, or be `always`.
 */
export function scoreSkill(skill: Skill, q: SkillQuery): { eligible: boolean; score: number; reasons: string[]; reject?: string } {
  const reasons: string[] = [];
  let matchedDims = 0;
  for (const d of dims(q)) {
    const constraint = skill.applies_to[d.key];
    if (constraint === undefined) continue;
    if (d.key === "requires_property") {
      if (constraint === true && !d.value) return { eligible: false, score: 0, reasons, reject: "wymaga nieruchomości" };
      if (constraint === true) { matchedDims++; reasons.push("powiązana nieruchomość"); }
      continue;
    }
    const list = constraint as readonly string[];
    if (d.value === undefined || !list.includes(d.value as string)) {
      return { eligible: false, score: 0, reasons, reject: `${d.label}: ${String(d.value ?? "—")} poza zakresem` };
    }
    matchedDims++;
    reasons.push(`${d.label}: ${String(d.value)}`);
  }
  const tagHits = (q.tags ?? []).filter((t) => skill.tags.includes(t));
  if (tagHits.length) reasons.push(`tagi: ${tagHits.join(", ")}`);
  const focusHits = (q.focusTags ?? []).filter((t) => skill.tags.includes(t));
  if (focusHits.length) reasons.push(`specyfika: ${focusHits.join(", ")}`);
  if (skill.always) reasons.unshift("zasada stała");

  const relevant = skill.always || tagHits.length > 0 || matchedDims > (skill.applies_to.tasks ? 1 : 0);
  if (!relevant) return { eligible: false, score: 0, reasons, reject: "brak dopasowania do zadania" };
  // Case-specific tags (premium property, investors, sales goal) outweigh generic format tags.
  // Format-defining dimensions (platform, content type, output kind, brand style)
  // outweigh generic tag overlap, so e.g. the Instagram skill beats a 4th copy technique.
  const strongDims = (["platforms", "content_types", "output_kinds", "brand_styles"] as const).filter((k) => skill.applies_to[k] !== undefined).length;
  const score = skill.priority + matchedDims * 15 + strongDims * 30 + tagHits.length * 25 + focusHits.length * 40 + (skill.always ? 1000 : 0);
  return { eligible: true, score, reasons };
}

export function selectSkills(all: Skill[], q: SkillQuery, opts: SelectorOptions = {}): SkillSelection {
  const budget = opts.budget ?? 9000;
  const maxSkills = opts.maxSkills ?? 12;
  const skipped: SkillSelection["skipped"] = [];
  const candidates: SelectedSkill[] = [];

  for (const skill of all) {
    const r = scoreSkill(skill, q);
    if (r.eligible) candidates.push({ skill, score: r.score, reasons: r.reasons });
    else if (r.reject && r.reject !== "brak dopasowania do zadania") skipped.push({ id: skill.id, reason: r.reject });
  }

  // Exclusive groups (e.g. one copy framework per text): keep the best-scoring skill.
  candidates.sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id));
  const groups = new Set<string>();
  const deduped: SelectedSkill[] = [];
  for (const c of candidates) {
    const g = c.skill.exclusive_group;
    if (g && groups.has(g)) {
      skipped.push({ id: c.skill.id, reason: `grupa wyłączna „${g}” — wybrano wyżej ocenioną kompetencję` });
      continue;
    }
    if (g) groups.add(g);
    deduped.push(c);
  }

  const selected: SelectedSkill[] = [];
  let used = 0;
  let count = 0;
  for (const c of deduped) {
    // Guardrails, standing rules (`always`) and the brand's own style are never dropped for budget reasons.
    if (c.skill.layer === "guardrail" || c.skill.always || (q.brandStyle && c.skill.applies_to.brand_styles?.includes(q.brandStyle))) {
      selected.push(c);
      continue;
    }
    if (count >= maxSkills || used + c.skill.tokens > budget) {
      skipped.push({ id: c.skill.id, reason: "przekroczony budżet kontekstu" });
      continue;
    }
    selected.push(c);
    used += c.skill.tokens;
    count++;
  }

  const layerIndex = (s: Skill) => SKILL_LAYERS.indexOf(s.layer);
  selected.sort((a, b) => layerIndex(a.skill) - layerIndex(b.skill) || b.score - a.score);
  return {
    selected,
    skipped,
    tokenEstimate: selected.reduce((sum, s) => sum + s.skill.tokens, 0),
  };
}
