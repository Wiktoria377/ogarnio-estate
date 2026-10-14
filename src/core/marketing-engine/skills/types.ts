import { z } from "zod";
import { OUTPUT_KINDS, PLATFORM_IDS, GOAL_IDS } from "../taxonomy";

/** Engine tasks a skill can be limited to. */
export const ENGINE_TASKS = ["generate", "refine", "graphic_copy", "review", "campaign_brief", "video_script", "brand_analysis", "strategy", "creative_variants", "autopilot_plan"] as const;

export const SKILL_CATEGORIES = [
  "core", "copywriting", "social-media", "real-estate", "performance-marketing",
  "brand-strategy", "content-strategy", "design", "email", "imported",
] as const;

/** Order in which skill instructions are composed into the prompt. */
export const SKILL_LAYERS = ["guardrail", "brand", "strategy", "domain", "format", "technique", "qa"] as const;
export type SkillLayer = (typeof SKILL_LAYERS)[number];

export const skillMetaSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "id: małe litery, cyfry, kropki i myślniki"),
    name: z.string().min(3).max(80),
    description: z.string().min(10).max(400),
    category: z.enum(SKILL_CATEGORIES),
    layer: z.enum(SKILL_LAYERS),
    purpose: z.string().min(10).max(400),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    source: z.object({
      type: z.enum(["builtin", "imported"]),
      origin: z.string().min(3),
      path: z.string().optional(),
      license: z.string().optional(),
      upstream_version: z.string().optional(),
    }),
    priority: z.number().int().min(0).max(100).default(50),
    always: z.boolean().default(false),
    exclusive_group: z.string().optional(),
    applies_to: z
      .object({
        groups: z.array(z.enum(["property", "expert", "personal", "ads"])).optional(),
        output_kinds: z.array(z.enum(OUTPUT_KINDS)).optional(),
        content_types: z.array(z.string()).optional(),
        platforms: z.array(z.enum(PLATFORM_IDS)).optional(),
        goals: z.array(z.enum(GOAL_IDS)).optional(),
        tasks: z.array(z.enum(ENGINE_TASKS)).optional(),
        requires_property: z.boolean().optional(),
        brand_styles: z.array(z.string()).optional(),
      })
      .default({}),
    tags: z.array(z.string()).default([]),
    inputs: z.array(z.string()).min(1),
    output_format: z.string().min(5),
    quality_criteria: z.array(z.string()).min(1),
  })
  .strict();

export type SkillMeta = z.infer<typeof skillMetaSchema>;

export interface Skill extends SkillMeta {
  instructions: string;
  file: string;
  tokens: number;
}

/** What the engine knows about the task when picking skills. */
export interface SkillQuery {
  task: (typeof ENGINE_TASKS)[number];
  group?: "property" | "expert" | "personal" | "ads";
  outputKind?: (typeof OUTPUT_KINDS)[number];
  contentType?: string;
  platform?: string;
  goal?: string;
  hasProperty?: boolean;
  brandStyle?: string;
  /** Preferred tags declared by the content type / operation. */
  tags?: string[];
  /**
   * Tags that describe this specific case (property, audience, brand, goal),
   * weighted above the generic tags of the format. Subset of `tags`.
   */
  focusTags?: string[];
}

export interface SelectedSkill {
  skill: Skill;
  score: number;
  reasons: string[];
}

export interface SkillSelection {
  selected: SelectedSkill[];
  skipped: { id: string; reason: string }[];
  tokenEstimate: number;
}
