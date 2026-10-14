import "server-only";
import { randomUUID } from "node:crypto";
import { AUTOPILOT_KINDS, AUTOPILOT_VERSION, autopilotInputSchema, buildAutopilotPlan, planRationale, type AutopilotInput, type PlanProperty, type StrategyMaterial } from "@/core/autopilot/plan";
import { can } from "@/core/auth/permissions";
import { warsawToIso } from "@/core/planner/time";
import { buildStrategyFacts } from "@/core/strategy/data";
import type { StrategyOutput } from "@/core/strategy/director";
import { guardAiQuota, guardAiUsage } from "@/lib/ai";
import { AppError, dbError } from "@/lib/errors";
import { enqueueJobs } from "@/lib/jobs/queue";
import type { WorkspaceContext } from "@/lib/session";
import { collectStrategyStats } from "@/lib/strategy/service";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AutopilotItemRow, AutopilotItemStatus, Json } from "@/lib/supabase/database.types";

function requireEditor(ctx: WorkspaceContext) {
  if (!can(ctx.role, "content.edit")) throw new AppError("Autopilota obsługuje właściciel, administrator, agent lub osoba od marketingu.", "forbidden", 403);
}

/** Admin client scoped by hand: every query below filters by the caller's workspace. */
const db = () => createAdminClient();

async function planProperties(ctx: WorkspaceContext, ids: string[]): Promise<PlanProperty[]> {
  if (!ids.length) return [];
  const { data: props } = await ctx.supabase.from("properties").select("id, title, status").eq("workspace_id", ctx.workspace.id).in("id", ids);
  if ((props ?? []).length !== new Set(ids).size) throw new AppError("Nie znaleziono jednej z wybranych ofert.", "not_found", 404);
  const { data: photos } = await ctx.supabase.from("property_photos").select("property_id").eq("workspace_id", ctx.workspace.id).in("property_id", ids);
  const n = new Map<string, number>();
  for (const p of photos ?? []) n.set(p.property_id, (n.get(p.property_id) ?? 0) + 1);
  return (props ?? []).map((p) => ({ id: p.id, title: p.title, photos: n.get(p.id) ?? 0 }));
}

/**
 * „Przygotuj mój marketing na najbliższy miesiąc”: plan, rationale from the
 * office's own data, and the approval queue (no AI cost yet).
 */
export async function createAutopilotRun(ctx: WorkspaceContext, raw: unknown): Promise<{ id: string }> {
  requireEditor(ctx);
  const parsed = autopilotInputSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane.", "validation", 422);
  const input: AutopilotInput = { ...parsed.data, aiLimit: Math.min(parsed.data.aiLimit, parsed.data.count) };
  const properties = await planProperties(ctx, input.propertyIds);
  let strategy: StrategyMaterial[] = [];
  if (input.strategyId) {
    const { data: s } = await ctx.supabase.from("marketing_strategies").select("status, output").eq("id", input.strategyId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!s) throw new AppError("Nie znaleziono strategii.", "not_found", 404);
    if (s.status !== "accepted") throw new AppError("Autopilot korzysta tylko z zaakceptowanej strategii.", "strategy_not_accepted", 409);
    strategy = ((s.output as unknown as StrategyOutput).materials ?? []) as StrategyMaterial[];
  }
  const plan = buildAutopilotPlan(input, properties, strategy);
  const { stats } = await collectStrategyStats(ctx, input.propertyIds);
  const facts = buildStrategyFacts(stats).map((f) => ({ key: f.key, label: f.label, value: f.value }));
  const id = randomUUID();
  const title = `Marketing ${input.startDate} · ${input.days} dni`;
  const { error } = await db().from("autopilot_runs").insert({
    id, workspace_id: ctx.workspace.id, title, status: "planned", input: input as unknown as Json, rationale: planRationale(input, plan, facts) as unknown as Json,
    data_snapshot: facts as unknown as Json, strategy_id: input.strategyId, ai_limit: input.aiLimit, ai_used: 0, plan_version: AUTOPILOT_VERSION, created_by: ctx.userId,
  });
  if (error) throw dbError(error, "Nie udało się zapisać planu.");
  const rows = plan.map((p) => ({
    run_id: id, workspace_id: ctx.workspace.id, position: p.position, kind: p.kind, platform: p.platform, pillar: p.pillar, goal: p.goal,
    property_id: p.propertyId, content_type: p.contentType, format: p.format, planned_at: warsawToIso(p.date, p.time), topic: p.topic, rationale: p.rationale.slice(0, 1000),
    status: "proposed" as const, content_item_id: null, schedule_entry_id: null, generations: 0, error: null, decided_by: null, decided_at: null,
  }));
  const { error: e2 } = await db().from("autopilot_items").insert(rows);
  if (e2) {
    await db().from("autopilot_runs").delete().eq("id", id);
    throw dbError(e2, "Nie udało się zapisać kolejki materiałów.");
  }
  return { id };
}

async function loadItem(ctx: WorkspaceContext, itemId: string) {
  const { data } = await ctx.supabase.from("autopilot_items").select("*").eq("id", itemId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) throw new AppError("Nie znaleziono pozycji.", "not_found", 404);
  return data;
}

/** Reserves AI generations within the run's limit (optimistic, so parallel clicks cannot exceed it). */
async function reserve(ctx: WorkspaceContext, runId: string, wanted: number): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: run } = await db().from("autopilot_runs").select("ai_limit, ai_used").eq("id", runId).eq("workspace_id", ctx.workspace.id).single();
    if (!run) throw new AppError("Nie znaleziono planu.", "not_found", 404);
    const n = Math.min(wanted, run.ai_limit - run.ai_used);
    if (n <= 0) return 0;
    const { data } = await db().from("autopilot_runs").update({ ai_used: run.ai_used + n, status: "generating", updated_at: new Date().toISOString() }).eq("id", runId).eq("ai_used", run.ai_used).select("id");
    if (data?.length) return n;
  }
  throw new AppError("Spróbuj ponownie za chwilę.", "busy", 409);
}

async function release(runId: string, n: number) {
  if (n <= 0) return;
  const { data: run } = await db().from("autopilot_runs").select("ai_used").eq("id", runId).single();
  if (run) await db().from("autopilot_runs").update({ ai_used: Math.max(0, run.ai_used - n) }).eq("id", runId);
}

async function enqueue(ctx: WorkspaceContext, items: Pick<AutopilotItemRow, "id" | "position" | "kind">[]) {
  await db().from("autopilot_items").update({ status: "generating", error: null }).in("id", items.map((i) => i.id)).eq("workspace_id", ctx.workspace.id);
  try {
    await enqueueJobs(ctx, items.map((i) => ({ kind: "autopilot_item" as const, label: `Autopilot: ${AUTOPILOT_KINDS[i.kind].label} #${i.position}`, payload: { itemId: i.id }, dedupeKey: `autopilot:${i.id}:${Date.now()}` })));
  } catch (error) {
    await db().from("autopilot_items").update({ status: "proposed" }).in("id", items.map((i) => i.id));
    throw error;
  }
}

/**
 * Prepares materials for proposed items, up to the run's AI limit and the
 * office's monthly quota. Items beyond the limit stay proposed.
 */
export async function generateRun(ctx: WorkspaceContext, runId: string): Promise<{ queued: number; skipped: number }> {
  requireEditor(ctx);
  const { data: items } = await ctx.supabase.from("autopilot_items").select("id, position, kind, status").eq("run_id", runId).eq("workspace_id", ctx.workspace.id).in("status", ["proposed", "failed"]).order("position");
  if (!items?.length) return { queued: 0, skipped: 0 };
  await guardAiUsage(ctx, "autopilot");
  const n = await reserve(ctx, runId, items.length);
  if (n === 0) throw new AppError("Wykorzystano limit generowań AI tego planu. Zwiększ limit w nowym planie albo przygotuj materiały ręcznie.", "autopilot_limit", 402);
  try {
    await guardAiQuota(ctx, n);
    await enqueue(ctx, items.slice(0, n));
  } catch (error) {
    await release(runId, n);
    throw error;
  }
  return { queued: n, skipped: items.length - n };
}

export async function regenerateItem(ctx: WorkspaceContext, itemId: string): Promise<void> {
  requireEditor(ctx);
  const item = await loadItem(ctx, itemId);
  if (item.status === "generating") throw new AppError("Materiał jest właśnie przygotowywany.", "busy", 409);
  if (item.status === "scheduled") throw new AppError("Materiał jest już w planerze. Zmień go w edytorze.", "scheduled", 409);
  if (item.generations >= 5) throw new AppError("Limit ponownych generowań tej pozycji (5) został wykorzystany. Popraw materiał w edytorze.", "regen_limit", 409);
  await guardAiUsage(ctx, "autopilot");
  if ((await reserve(ctx, item.run_id, 1)) === 0) throw new AppError("Wykorzystano limit generowań AI tego planu.", "autopilot_limit", 402);
  try {
    await guardAiQuota(ctx, 1);
    await db().from("autopilot_items").update({ decided_by: null, decided_at: null }).eq("id", item.id);
    await enqueue(ctx, [item]);
  } catch (error) {
    await release(item.run_id, 1);
    throw error;
  }
}

const TRANSITIONS: Record<"accept" | "reject" | "restore", { from: AutopilotItemStatus[]; to: AutopilotItemStatus }> = {
  accept: { from: ["ready", "rejected"], to: "accepted" },
  reject: { from: ["proposed", "ready", "failed", "accepted"], to: "rejected" },
  restore: { from: ["rejected"], to: "proposed" },
};

export async function decideItem(ctx: WorkspaceContext, itemId: string, action: keyof typeof TRANSITIONS): Promise<AutopilotItemStatus> {
  requireEditor(ctx);
  const item = await loadItem(ctx, itemId);
  const t = TRANSITIONS[action];
  if (!t.from.includes(item.status)) throw new AppError(action === "accept" ? "Zaakceptować można tylko przygotowany materiał." : "Tej pozycji nie można teraz zmienić.", "bad_state", 409);
  const to = action === "accept" && !item.content_item_id ? null : action === "restore" && item.content_item_id ? "ready" : t.to;
  if (!to) throw new AppError("Brak materiału do akceptacji.", "bad_state", 409);
  const { error } = await db().from("autopilot_items").update({ status: to, decided_by: ctx.userId, decided_at: new Date().toISOString() }).eq("id", item.id).eq("workspace_id", ctx.workspace.id).eq("status", item.status);
  if (error) throw dbError(error);
  return to;
}

/**
 * Puts accepted materials in the planner (status „Gotowe”). This is not a
 * publication: publishing keeps its own approval and platform confirmation.
 * Ad proposals are never scheduled (the system does not run paid campaigns).
 */
export async function scheduleItems(ctx: WorkspaceContext, itemIds: string[]): Promise<{ scheduled: number; skipped: string[] }> {
  requireEditor(ctx);
  const skipped: string[] = [];
  let scheduled = 0;
  for (const id of itemIds.slice(0, 40)) {
    const item = await loadItem(ctx, id);
    if (item.kind === "ad_proposal") { skipped.push(`#${item.position}: reklamy nie są planowane ani uruchamiane przez system`); continue; }
    if (item.status !== "accepted" || !item.content_item_id) { skipped.push(`#${item.position}: najpierw zaakceptuj materiał`); continue; }
    const { data: content } = await ctx.supabase.from("content_items").select("title").eq("id", item.content_item_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!content) { skipped.push(`#${item.position}: materiał został usunięty`); continue; }
    const { data: entry, error } = await ctx.supabase.from("schedule_entries").insert({
      workspace_id: ctx.workspace.id, content_item_id: item.content_item_id, title: content.title.slice(0, 200), channel: item.platform, scheduled_at: item.planned_at, status: "ready",
      notes: `Z autopilota (pozycja ${item.position}). Publikacja wymaga osobnej akceptacji.`, created_by: ctx.userId, updated_by: ctx.userId,
    }).select("id").single();
    if (error || !entry) throw dbError(error, "Nie udało się dodać materiału do planera.");
    await db().from("autopilot_items").update({ status: "scheduled", schedule_entry_id: entry.id }).eq("id", item.id).eq("workspace_id", ctx.workspace.id);
    scheduled++;
  }
  return { scheduled, skipped };
}

export async function archiveRun(ctx: WorkspaceContext, runId: string) {
  requireEditor(ctx);
  const { data } = await db().from("autopilot_runs").update({ status: "archived" }).eq("id", runId).eq("workspace_id", ctx.workspace.id).select("id");
  if (!data?.length) throw new AppError("Nie znaleziono planu.", "not_found", 404);
}

/** After a job: the run is ready when nothing is being generated. */
export async function settleRun(runId: string) {
  const { count } = await db().from("autopilot_items").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "generating");
  if (!count) await db().from("autopilot_runs").update({ status: "ready" }).eq("id", runId).neq("status", "archived");
}
