import { z } from "zod";
import { CTA_TYPES, GOAL_IDS, LENGTHS, PLATFORM_IDS, TONE_OVERRIDES } from "./taxonomy";
import { REFINE_OPERATIONS } from "./prompt";
import { variantSchema } from "./schemas";

const keys = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

/** Server-side validation of everything the studio wizard sends. */
export const generationRequestSchema = z.object({
  contentType: z.string().min(1).max(80),
  platform: z.enum(PLATFORM_IDS),
  goal: z.enum(GOAL_IDS),
  audience: z.string().trim().max(300).default(""),
  topic: z.string().trim().max(2000).default(""),
  propertyId: z.uuid().nullable().default(null),
  tone: z.enum(keys(TONE_OVERRIDES)).default("brand"),
  length: z.enum(keys(LENGTHS)).default("medium"),
  ctaType: z.enum(keys(CTA_TYPES)),
  variants: z.number().int().min(1).max(3).default(2),
  sequenceCount: z.number().int().min(1).max(20).optional(),
  extraInstructions: z.string().trim().max(1500).default(""),
  marketData: z.string().trim().max(4000).default(""),
});

export const refineRequestSchema = z.object({
  operation: z.enum(keys(REFINE_OPERATIONS)),
  sectionKey: z.string().max(40).optional(),
  tone: z.enum(keys(TONE_OVERRIDES)).optional(),
  ctaType: z.enum(keys(CTA_TYPES)).optional(),
  instruction: z.string().trim().max(1000).optional(),
});

/** Stored body of a text material version. */
export const storedVariantSchema = z.object({
  id: z.string().max(40),
  variant: variantSchema,
  quality: z.unknown(),
  createdAt: z.string(),
  origin: z.enum(["ai", "refine", "manual"]),
  changeSummary: z.string().optional(),
});
export type StoredVariant = z.infer<typeof storedVariantSchema> & { quality: import("./schemas").QualityReport };

export interface TextBody {
  request: z.infer<typeof generationRequestSchema>;
  variants: StoredVariant[];
  selected: string;
  gaps: string[];
}
