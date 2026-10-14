import type { z } from "zod";

export type ModelTier = "main" | "review";

/** Extra structured context used only by the offline test provider. */
export type TestHint =
  | { kind: "generate"; sections: { key: string; label: string }[]; facts: { label: string; value: string }[]; subject: string | null; count: number; usesHashtags: boolean; seed: number; brand?: { ctas: string[]; avoid: string[]; headlineMax: number | null } }
  | { kind: "refine"; variant: unknown; operation: string }
  | { kind: "review" }
  | { kind: "graphic_copy"; slides: { key: string; label: string; maxChars: number }[][]; facts: { label: string; value: string }[]; subject: string | null; direction?: string }
  | { kind: "campaign_brief"; facts: { label: string; value: string }[]; subject: string; goalLabel: string; deliverables: string[] }
  | { kind: "video_script"; facts: { label: string; value: string }[]; subject: string; scenes: { photoIndex: number; role: string }[]; maxWords: number }
  | { kind: "insights"; facts: { key: string; label: string; value: string }[] }
  | { kind: "brand_traits"; headings: string[]; paragraphs: string[]; ctas: string[]; text: string }
  | { kind: "strategy"; facts: { key: string; label: string; value: string }[]; properties: { id: string; title: string }[]; channels: string[]; weeks: number; limit: number; contentTypes: string[]; adBudget: number; goalLabel: string };

export interface LlmCall<T> {
  operation: string;
  tier: ModelTier;
  /** Stable instructions (cached by the provider when possible). */
  system: string;
  /** Task-specific content. */
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  testHint?: TestHint;
  /** Business process this call belongs to (cost per process), e.g. one strategy or one autopilot run. */
  process?: { type: string; id: string };
  /** Version identifier of the prompt template (stored with usage). */
  promptVersion?: string;
}

export interface LlmResult<T> {
  data: T;
  model: string;
  usage: { input: number; output: number };
}

export interface LlmProvider {
  readonly name: string;
  complete<T>(call: LlmCall<T>): Promise<LlmResult<T>>;
}

/** Errors the UI can show as-is. */
export class LlmError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "auth" | "rate_limited" | "overloaded" | "refusal" | "too_long" | "invalid_output" | "network" | "quota" | "unknown",
  ) {
    super(message);
    this.name = "LlmError";
  }
}
