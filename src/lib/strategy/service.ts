import "server-only";
import { randomUUID } from "node:crypto";
import { aiCost } from "@/core/admin/costs";
import { can } from "@/core/auth/permissions";
import { brandBlock, buildSystemPrompt, fence } from "@/core/marketing-engine/prompt";
import { composeSkillInstructions, selectionSummary } from "@/core/marketing-engine/skills/composer";
import { selectSkills } from "@/core/marketing-engine/skills/selector";
import { buildStrategyFacts, type StrategyStats } from "@/core/strategy/data";
import {
  BUSINESS_GOALS,
  STRATEGY_SYSTEM_RULES,
  STRATEGY_VERSION,
  buildStrategyUserPrompt,
  checkStrategy,
  maxMaterials,
  strategyInputSchema,
  strategySchema,
  strategySkillQuery,
  strategyWeeks,
  type StrategyInput,
  type StrategyOutput,
  type StrategyProperty,
} from "@/core/strategy/director";
import { REAL_ESTATE_CONTENT_TYPES } from "@/verticals/real-estate/content-types";
import { AUDIENCE_PRESETS, type AudiencePreset } from "@/verticals/real-estate/content-types";
import { propertySkillTags } from "@/verticals/real-estate/property";
import { createEngine, guardAiUsage } from "@/lib/ai";
import { loadRates } from "@/lib/admin/costs";
import { AppError, dbError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import { fetchAll } from "@/lib/supabase/fetch-all";

const DAY = 86_400_000;
const WINDOW_DAYS = 90;

const EXPERT_GROUPS = new Set(["expert", "personal"]);
const typeDef = new Map(REAL_ESTATE_CONTENT_TYPES.map((d) => [d.id, d]));

/** Computes the office's situation from its own records (RLS-scoped client: only this office). */
export async function collectStrategyStats(ctx: WorkspaceContext, propertyIds: string[], now = new Date()): Promise<{ stats: StrategyStats; properties: StrategyProperty[] }> {
  const ws = ctx.workspace.id;
  const sb = ctx.supabase;
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY).toISOString();
  const in30 = new Date(now.getTime() + 30 * DAY).toISOString();
  const [props, photos, content, pubs, conns, planned, leads, events, profile, memory] = await Promise.all([
    fetchAll((lo, hi) => sb.from("properties").select("id, title, property_type, transaction_type, status, created_at, price, price_per_m2, area_m2, rooms, city, district, description, features, market").eq("workspace_id", ws).order("id").range(lo, hi), 5000),
    fetchAll((lo, hi) => sb.from("property_photos").select("property_id").eq("workspace_id", ws).order("id").range(lo, hi), 50000),
    fetchAll((lo, hi) => sb.from("content_items").select("id, property_id, kind, content_type, status, created_at").eq("workspace_id", ws).order("id").range(lo, hi), 20000),
    fetchAll((lo, hi) => sb.from("publications").select("id, connection_id, content_item_id, published_at").eq("workspace_id", ws).eq("state", "published").gte("published_at", since).order("id").range(lo, hi), 5000),
    sb.from("social_connections").select("id, platform, name, status").eq("workspace_id", ws),
    sb.from("schedule_entries").select("id", { count: "exact", head: true }).eq("workspace_id", ws).gte("scheduled_at", now.toISOString()).lt("scheduled_at", in30),
    fetchAll((lo, hi) => sb.from("leads").select("property_id, channel, status").eq("workspace_id", ws).neq("status", "spam").gte("created_at", since).order("id").range(lo, hi), 20000),
    fetchAll((lo, hi) => sb.from("web_events").select("kind, property_id").eq("workspace_id", ws).eq("is_bot", false).gte("created_at", since).order("id").range(lo, hi), 50000),
    sb.from("brand_profiles").select("approved_version").eq("workspace_id", ws).maybeSingle(),
    sb.from("brand_memory").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("level", "explicit").eq("status", "active"),
  ]);
  for (const r of [props, photos, content, pubs, conns, leads, events]) if (r.error) throw dbError(r.error, "Nie udało się odczytać danych biura.");

  const active = (props.data ?? []).filter((p) => p.status === "active");
  const photoCount = new Map<string, number>();
  for (const p of photos.data ?? []) photoCount.set(p.property_id, (photoCount.get(p.property_id) ?? 0) + 1);
  const materialCount = new Map<string, number>();
  for (const c of content.data ?? []) if (c.property_id) materialCount.set(c.property_id, (materialCount.get(c.property_id) ?? 0) + 1);
  const byType: Record<string, number> = {};
  for (const p of active) byType[p.property_type] = (byType[p.property_type] ?? 0) + 1;

  const recent = (content.data ?? []).filter((c) => c.created_at >= since);
  const byKind: Record<string, number> = {};
  for (const c of recent) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  const def = (t: string) => typeDef.get(t);

  const connById = new Map((conns.data ?? []).map((c) => [c.id, c]));
  const contentById = new Map((content.data ?? []).map((c) => [c.id, c]));
  const byPlatform: Record<string, number> = {};
  const weeks = new Set<number>();
  let last: string | null = null;
  const pubsPerProperty = new Map<string, number>();
  for (const p of pubs.data ?? []) {
    const platform = connById.get(p.connection_id)?.platform ?? "inne";
    byPlatform[platform] = (byPlatform[platform] ?? 0) + 1;
    if (p.published_at) {
      weeks.add(Math.floor((now.getTime() - new Date(p.published_at).getTime()) / (7 * DAY)));
      if (!last || p.published_at > last) last = p.published_at;
    }
    const prop = p.content_item_id ? contentById.get(p.content_item_id)?.property_id : null;
    if (prop) pubsPerProperty.set(prop, (pubsPerProperty.get(prop) ?? 0) + 1);
  }
  // Last publication may be older than the window.
  if (!last) {
    const { data } = await sb.from("publications").select("published_at").eq("workspace_id", ws).eq("state", "published").order("published_at", { ascending: false }).limit(1).maybeSingle();
    last = data?.published_at ?? null;
  }

  const leadsByChannel: Record<string, number> = {};
  const leadsPerProperty = new Map<string, number>();
  for (const l of leads.data ?? []) {
    const ch = l.channel || "bezpośrednio";
    leadsByChannel[ch] = (leadsByChannel[ch] ?? 0) + 1;
    if (l.property_id) leadsPerProperty.set(l.property_id, (leadsPerProperty.get(l.property_id) ?? 0) + 1);
  }
  const clicksPerProperty = new Map<string, number>();
  let clicks = 0;
  let pageViews = 0;
  for (const e of events.data ?? []) {
    if (e.kind !== "click") { pageViews++; continue; }
    clicks++;
    if (e.property_id) clicksPerProperty.set(e.property_id, (clicksPerProperty.get(e.property_id) ?? 0) + 1);
  }

  // Platform statistics: only what platforms (or the labelled simulator) returned.
  let views: number | null = null;
  let withStats = 0;
  let simulated = false;
  const pubIds = (pubs.data ?? []).map((p) => p.id);
  const seen = new Set<string>();
  for (let i = 0; i < pubIds.length; i += 200) {
    const { data } = await sb.from("publication_metrics").select("publication_id, metrics, source, fetched_at").in("publication_id", pubIds.slice(i, i + 200)).order("fetched_at", { ascending: false });
    for (const m of data ?? []) {
      if (seen.has(m.publication_id)) continue;
      seen.add(m.publication_id);
      const v = (m.metrics as { views?: number | null })?.views;
      if (typeof v === "number") { views = (views ?? 0) + v; withStats++; }
      if (m.source === "mock") simulated = true;
    }
  }

  const selectedRows = active.filter((p) => propertyIds.includes(p.id));
  if (selectedRows.length !== propertyIds.length) throw new AppError("Wybrane oferty muszą być aktywnymi ofertami Twojego biura.", "validation", 422);
  const days = (iso: string) => Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY));

  const stats: StrategyStats = {
    windowDays: WINDOW_DAYS,
    properties: {
      active: active.length,
      byType,
      sale: active.filter((p) => p.transaction_type === "sale").length,
      rent: active.filter((p) => p.transaction_type === "rent").length,
      withoutPhotos: active.filter((p) => !photoCount.get(p.id)).length,
      withoutMaterials: active.filter((p) => !materialCount.get(p.id)).length,
      listedOver60Days: active.filter((p) => days(p.created_at) > 60).length,
      newInWindow: (props.data ?? []).filter((p) => p.created_at >= since).length,
    },
    selected: selectedRows.map((p) => ({
      id: p.id, title: p.title, daysListed: days(p.created_at), photos: photoCount.get(p.id) ?? 0, materials: materialCount.get(p.id) ?? 0,
      publications: pubsPerProperty.get(p.id) ?? 0, leads: leadsPerProperty.get(p.id) ?? 0, clicks: clicksPerProperty.get(p.id) ?? 0,
    })),
    content: {
      inWindow: recent.length,
      byKind,
      carousels: recent.filter((c) => def(c.content_type)?.outputKind === "carousel" || /carousel/.test(c.content_type)).length,
      expert: recent.filter((c) => EXPERT_GROUPS.has(def(c.content_type)?.group ?? "")).length,
      video: recent.filter((c) => c.kind === "video" || def(c.content_type)?.outputKind === "video_script").length,
      ready: recent.filter((c) => c.status === "ready").length,
    },
    publications: { published: pubs.data?.length ?? 0, byPlatform, lastDaysAgo: last ? days(last) : null, weeksWithPost: weeks.size, weeksInWindow: Math.ceil(WINDOW_DAYS / 7) },
    planned: { next30: planned.count ?? 0 },
    leads: { inWindow: leads.data?.length ?? 0, byChannel: leadsByChannel },
    traffic: { clicks, pageViews },
    metrics: { withStats, views, simulated },
    connectedChannels: (conns.data ?? []).filter((c) => c.status === "connected" || c.status === "limited").map((c) => `${c.platform} (${c.name})`),
    brand: { profileApproved: (profile.data?.approved_version ?? 0) > 1 /* version 1 is the automatic starting profile */, memoryEntries: memory.count ?? 0 },
  };

  const pln = (n: number | null) => (n == null ? null : `${new Intl.NumberFormat("pl-PL").format(n)} zł`);
  const properties: StrategyProperty[] = selectedRows.map((p) => ({
    id: p.id,
    title: p.title,
    summary: [p.transaction_type === "rent" ? "najem" : "sprzedaż", p.city, p.district, p.area_m2 ? `${p.area_m2} m²` : null, p.rooms ? `${p.rooms} pok.` : null, pln(p.price)].filter(Boolean).join(", "),
    tags: propertySkillTags(p).tags,
  }));
  return { stats, properties };
}

export function audienceLabelFor(audience: string, brandAudience: string | null): string {
  if (audience in AUDIENCE_PRESETS) {
    const preset = audience as AudiencePreset;
    return preset === "brand" ? brandAudience || AUDIENCE_PRESETS.brand : AUDIENCE_PRESETS[preset];
  }
  return audience;
}

export interface StoredStrategy {
  id: string;
  output: StrategyOutput;
  warnings: string[];
}

/** „Zaproponuj mi strategię”: data → model → deterministic check → saved draft. */
export async function generateStrategy(ctx: WorkspaceContext, raw: unknown): Promise<StoredStrategy> {
  if (!can(ctx.role, "content.edit")) throw new AppError("Strategię przygotowuje właściciel, administrator, agent lub osoba od marketingu.", "forbidden", 403);
  const parsed = strategyInputSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane strategii.", "validation", 422);
  const input: StrategyInput = { ...parsed.data, propertyIds: [...new Set(parsed.data.propertyIds)] };
  await guardAiUsage(ctx, "strategy");

  const { stats, properties } = await collectStrategyStats(ctx, input.propertyIds);
  const facts = buildStrategyFacts(stats);
  const engine = await createEngine(ctx);
  const selection = selectSkills(engine.skills, strategySkillQuery(input, engine.brand.style), { budget: 6000, maxSkills: 8 });
  const contentTypes = REAL_ESTATE_CONTENT_TYPES.map((d) => ({ id: d.id, label: d.label }));
  const audienceLabel = audienceLabelFor(input.audience, engine.brand.targetAudience);
  const id = randomUUID();
  const res = await engine.provider.complete({
    operation: "strategy",
    tier: "main",
    system: `${buildSystemPrompt(engine.brand.companyName, composeSkillInstructions(selection))}\n\n${STRATEGY_SYSTEM_RULES}`,
    user: buildStrategyUserPrompt({ brandBlock: brandBlock(engine.brand), input, audienceLabel, facts, properties, contentTypes, fence }),
    schema: strategySchema,
    maxTokens: 12000,
    effort: "high",
    process: { type: "strategy", id },
    promptVersion: STRATEGY_VERSION,
    testHint: {
      kind: "strategy",
      facts: facts.map((f) => ({ key: f.key, label: f.label, value: f.value })),
      properties: properties.map((p) => ({ id: p.id, title: p.title })),
      channels: input.channels,
      weeks: strategyWeeks(input.periodDays),
      limit: maxMaterials(input),
      contentTypes: contentTypes.map((c) => c.id),
      adBudget: input.adBudget,
      goalLabel: BUSINESS_GOALS[input.goal].label,
    },
  });
  const checked = checkStrategy(res.data, facts, input, { contentTypes: new Set(contentTypes.map((c) => c.id)), propertyIds: new Set(properties.map((p) => p.id)) });
  const title = `${BUSINESS_GOALS[input.goal].label} · ${new Date().toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}`;
  // Written by the server only: clients cannot store a "strategy" that did not pass the checks.
  const { error } = await createAdminClient().from("marketing_strategies").insert({
    id, workspace_id: ctx.workspace.id, title: title.slice(0, 200), status: "draft",
    input: { ...input, audienceLabel } as unknown as Json, data_snapshot: facts as unknown as Json, output: checked.output as unknown as Json,
    warnings: checked.warnings as unknown as Json, prompt_version: STRATEGY_VERSION, model: res.model.slice(0, 80),
    skills: selectionSummary(selection) as unknown as Json, created_by: ctx.userId,
  });
  if (error) throw dbError(error, "Nie udało się zapisać strategii.");
  return { id, output: checked.output, warnings: checked.warnings };
}

export async function setStrategyStatus(ctx: WorkspaceContext, id: string, status: "draft" | "accepted" | "archived") {
  if (!can(ctx.role, "content.edit")) throw new AppError("Twoja rola nie pozwala zmieniać strategii.", "forbidden", 403);
  const { data, error } = await ctx.supabase.from("marketing_strategies").update({ status, decided_by: ctx.userId, decided_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", ctx.workspace.id).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new AppError("Nie znaleziono strategii.", "not_found", 404);
}

export async function deleteStrategy(ctx: WorkspaceContext, id: string) {
  const { data, error } = await ctx.supabase.from("marketing_strategies").delete().eq("id", id).eq("workspace_id", ctx.workspace.id).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new AppError("Nie możesz usunąć tej strategii (usuwa ją autor albo administrator).", "forbidden", 403);
}

/** Tokens and estimated cost of one process (all model calls tagged with its id). */
export async function processCost(ctx: WorkspaceContext, processId: string) {
  const { data } = await ctx.supabase.from("ai_usage_events").select("model, input_tokens, output_tokens, status, prompt_version").eq("workspace_id", ctx.workspace.id).eq("process_id", processId);
  const rows = (data ?? []).filter((r) => r.status === "ok").map((r) => ({ model: r.model ?? "", input_tokens: r.input_tokens, output_tokens: r.output_tokens }));
  const cost = aiCost(rows, await loadRates());
  const { data: rate } = await createAdminClient().from("cost_rates").select("currency").in("kind", ["ai_input_mtok", "ai_output_mtok"]).limit(1).maybeSingle();
  return {
    currency: rate?.currency ?? null,
    calls: data?.length ?? 0,
    input: rows.reduce((s, r) => s + r.input_tokens, 0),
    output: rows.reduce((s, r) => s + r.output_tokens, 0),
    models: [...new Set(rows.map((r) => r.model))],
    promptVersions: [...new Set((data ?? []).map((r) => r.prompt_version).filter(Boolean))] as string[],
    cost,
  };
}
