import "server-only";
import { z } from "zod";
import {
  buildMemoryContext,
  dedupeKey,
  deriveSuggestions,
  isEmptyMemory,
  MEMORY_KINDS,
  type BrandMemoryContext,
  type FeedbackEvent,
  type MemoryEntry,
  type TextExample,
} from "@/core/brand-memory/learn";
import { AppError, dbError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FeedbackKind, Json, MemoryKind } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";

/** Events looked at when deriving suggestions (recent decisions only). */
const WINDOW = 300;

export async function memoryEnabled(ctx: WorkspaceContext): Promise<boolean> {
  const { data } = await ctx.supabase.from("brand_profiles").select("memory_enabled").eq("workspace_id", ctx.workspace.id).maybeSingle();
  return data?.memory_enabled ?? false;
}

export interface FeedbackInput {
  kind: FeedbackKind;
  subjectType: "content_item" | "graphic" | "campaign" | "autopilot_item" | "publication";
  subjectId: string | null;
  data: Record<string, unknown>;
}

/**
 * Records one decision (accept, edit, reject, choose). Never fails the user's
 * action: memory is a side effect. With memory disabled nothing is stored.
 */
export async function recordFeedback(ctx: WorkspaceContext, e: FeedbackInput): Promise<void> {
  try {
    if (!(await memoryEnabled(ctx))) return;
    const { error } = await ctx.supabase.from("brand_feedback_events").insert({
      workspace_id: ctx.workspace.id, kind: e.kind, subject_type: e.subjectType, subject_id: e.subjectId, data: e.data as Json, created_by: ctx.userId,
    });
    if (error) throw error;
    await refreshSuggestions(ctx.workspace.id);
  } catch (error) {
    logError("brand-memory", error, { workspaceId: ctx.workspace.id });
  }
}

/** Recomputes suggestions from recent decisions (server-side; clients cannot create suggestions). */
export async function refreshSuggestions(workspaceId: string): Promise<number> {
  const admin = createAdminClient();
  const [{ data: events }, { data: existing }] = await Promise.all([
    admin.from("brand_feedback_events").select("id, kind, data, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(WINDOW),
    admin.from("brand_memory").select("id, dedupe_key, level, status").eq("workspace_id", workspaceId),
  ]);
  const known = new Set((existing ?? []).map((m) => m.dedupe_key));
  // Profile values already cover some suggestions (e.g. the CTA is already in the profile).
  const { data: profile } = await admin.from("brand_profiles").select("extended").eq("workspace_id", workspaceId).maybeSingle();
  const ext = (profile?.extended ?? {}) as { ctas?: string[]; avoid_words?: string[] };
  for (const c of ext.ctas ?? []) known.add(dedupeKey("cta", c));
  for (const w of ext.avoid_words ?? []) known.add(dedupeKey("avoid", w));
  const fresh = deriveSuggestions((events ?? []) as FeedbackEvent[], known);
  if (!fresh.length) return 0;
  const { error } = await admin.from("brand_memory").insert(
    fresh.map((s) => ({
      workspace_id: workspaceId, level: "suggested" as const, status: "active" as const, kind: s.kind, content: s.content, detail: s.detail as Json,
      dedupe_key: s.dedupeKey, source: "suggestion" as const, evidence_count: s.evidence.length, evidence: s.evidence as unknown as Json,
    })),
  );
  // A concurrent refresh may have inserted the same key: the unique index keeps one.
  if (error && error.code !== "23505") throw error;
  return fresh.length;
}

const contentFor = (kind: MemoryKind) => z.string().trim().min(1, "Wpisz treść preferencji.").max(kind === "example_text" ? 600 : 300);

export const explicitSchema = z.object({
  kind: z.enum(Object.keys(MEMORY_KINDS) as [MemoryKind, ...MemoryKind[]]),
  content: z.string(),
  detail: z.record(z.string(), z.unknown()).optional(),
  source: z.enum(["manual", "decision"]).default("manual"),
});

/** Saves a preference the person chose to remember (or upgrades an existing suggestion). */
export async function saveExplicit(ctx: WorkspaceContext, input: z.input<typeof explicitSchema>): Promise<string> {
  const p = explicitSchema.safeParse(input);
  if (!p.success) throw new AppError("Nieprawidłowa preferencja.", "validation");
  const content = contentFor(p.data.kind).safeParse(p.data.content);
  if (!content.success) throw new AppError(content.error.issues[0]?.message ?? "Nieprawidłowa treść.", "validation");
  if (!(await memoryEnabled(ctx))) throw new AppError("Pamięć marki jest wyłączona. Włącz ją w zakładce Pamięć marki.", "memory_disabled", 409);
  const key = dedupeKey(p.data.kind, content.data);
  const { data: found } = await ctx.supabase.from("brand_memory").select("id, level, status").eq("workspace_id", ctx.workspace.id).eq("dedupe_key", key).maybeSingle();
  const now = new Date().toISOString();
  if (found) {
    const { error } = await ctx.supabase.from("brand_memory").update({ level: "explicit", status: "active", decided_by: ctx.userId, decided_at: now }).eq("id", found.id);
    if (error) throw dbError(error);
    return found.id;
  }
  const { data, error } = await ctx.supabase
    .from("brand_memory")
    .insert({ workspace_id: ctx.workspace.id, level: "explicit", status: "active", kind: p.data.kind, content: content.data, detail: (p.data.detail ?? {}) as Json, dedupe_key: key, source: p.data.source, created_by: ctx.userId, decided_by: ctx.userId, decided_at: now })
    .select("id")
    .single();
  if (error || !data) throw dbError(error, "Nie udało się zapisać preferencji.");
  return data.id;
}

/** Accept a suggestion (it becomes explicit and is used from now on) or dismiss it. */
export async function decideSuggestion(ctx: WorkspaceContext, id: string, decision: "accept" | "dismiss"): Promise<void> {
  const { data: m } = await ctx.supabase.from("brand_memory").select("id, level").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!m) throw new AppError("Nie znaleziono wpisu pamięci.", "not_found", 404);
  const patch = decision === "accept" ? { level: "explicit" as const, status: "active" as const } : { status: "dismissed" as const };
  const { error } = await ctx.supabase.from("brand_memory").update({ ...patch, decided_by: ctx.userId, decided_at: new Date().toISOString() }).eq("id", id);
  if (error) throw dbError(error);
}

export async function updateEntry(ctx: WorkspaceContext, id: string, content: string): Promise<void> {
  const { data: m } = await ctx.supabase.from("brand_memory").select("kind").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!m) throw new AppError("Nie znaleziono wpisu pamięci.", "not_found", 404);
  const c = contentFor(m.kind).safeParse(content);
  if (!c.success) throw new AppError(c.error.issues[0]?.message ?? "Nieprawidłowa treść.", "validation");
  const { error } = await ctx.supabase.from("brand_memory").update({ content: c.data }).eq("id", id);
  if (error) throw dbError(error);
}

export async function deleteEntry(ctx: WorkspaceContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from("brand_memory").delete().eq("id", id).eq("workspace_id", ctx.workspace.id).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new AppError("Nie możesz usunąć tego wpisu (usuwa go autor albo administrator).", "forbidden", 403);
}

export async function clearMemory(ctx: WorkspaceContext): Promise<{ memory: number; events: number }> {
  const { data, error } = await ctx.supabase.rpc("clear_brand_memory", { p_ws: ctx.workspace.id });
  if (error) throw dbError(error, "Nie udało się wyczyścić pamięci.");
  return data as { memory: number; events: number };
}

export async function setMemoryEnabled(ctx: WorkspaceContext, enabled: boolean): Promise<void> {
  const { data, error } = await ctx.supabase.from("brand_profiles").update({ memory_enabled: enabled, memory_updated_at: new Date().toISOString() }).eq("workspace_id", ctx.workspace.id).select("workspace_id");
  if (error) throw dbError(error);
  if (!data?.length) throw new AppError("Brak uprawnień do zmiany ustawień marki.", "forbidden", 403);
}

/**
 * Brand Memory for generation: explicit active entries plus up to 6 recent
 * accepted texts (examples are chosen per request by `pickExamples`).
 * Returns null when memory is disabled, so nothing reaches the prompt.
 */
export async function loadMemoryContext(ctx: WorkspaceContext, enabled: boolean): Promise<BrandMemoryContext | null> {
  if (!enabled) return null;
  const [{ data: entries }, { data: accepted }] = await Promise.all([
    ctx.supabase.from("brand_memory").select("id, kind, content, detail").eq("workspace_id", ctx.workspace.id).eq("level", "explicit").eq("status", "active").order("updated_at", { ascending: false }).limit(100),
    ctx.supabase.from("brand_feedback_events").select("data").eq("workspace_id", ctx.workspace.id).eq("kind", "content_accepted").order("created_at", { ascending: false }).limit(6),
  ]);
  const examples = (accepted ?? []).map((e) => e.data as unknown as TextExample).filter((x) => x && typeof x.excerpt === "string" && typeof x.contentType === "string");
  const mem = buildMemoryContext((entries ?? []) as unknown as MemoryEntry[], examples);
  return isEmptyMemory(mem) ? null : mem;
}
