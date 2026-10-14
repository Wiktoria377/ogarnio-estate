/**
 * Usefulness of a skill measured on this office's own materials: how often a
 * material generated with the skill was approved, and approved without manual
 * edits. It is a signal for the catalog, not an objective quality score: below
 * MIN_USES nothing is shown, because a few materials say nothing.
 */
export const MIN_USES = 5;

export interface ItemOutcome {
  /** Skill ids recorded with the AI versions of the material. */
  skills: string[];
  /** Material marked ready (approved for use). */
  approved: boolean;
  /** A manual version exists (someone corrected the AI text). */
  edited: boolean;
}

export interface SkillUsefulness {
  uses: number;
  approved: number;
  approvedUnedited: number;
  edited: number;
  /** Share of materials approved without edits (0–1), only from MIN_USES uses. */
  rate: number | null;
}

export function computeUsefulness(items: ItemOutcome[]): Map<string, SkillUsefulness> {
  const out = new Map<string, SkillUsefulness>();
  for (const it of items) {
    for (const id of new Set(it.skills)) {
      const s = out.get(id) ?? { uses: 0, approved: 0, approvedUnedited: 0, edited: 0, rate: null };
      s.uses++;
      if (it.approved) s.approved++;
      if (it.approved && !it.edited) s.approvedUnedited++;
      if (it.edited) s.edited++;
      out.set(id, s);
    }
  }
  for (const s of out.values()) s.rate = s.uses >= MIN_USES ? s.approvedUnedited / s.uses : null;
  return out;
}
