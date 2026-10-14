import "server-only";
import { can } from "@/core/auth/permissions";
import { EDUCATION_TOPICS, RECO_VERSION, buildRecommendations, dataGaps, type RecoData, type RecoProperty, type RecoPublication, type Recommendation } from "@/core/recommendations/engine";
import { AppError, dbError } from "@/lib/errors";
import type { WorkspaceContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const CAROUSEL_TYPES = new Set(["graphic_carousel", "property_sales_carousel"]);
const EDU_TYPES = EDUCATION_TOPICS.map((t) => t.type);
const HIDE_DAYS = { dismissed: 30, done: 14 } as const;

/** The office's own records, read with the caller's session (RLS keeps offices apart). */
export async function collectRecoData(ctx: WorkspaceContext, now = new Date()): Promise<RecoData> {
  const ws = ctx.workspace.id;
  const sb = ctx.supabase;
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY).toISOString();
  const since30 = new Date(now.getTime() - 30 * DAY).toISOString();
  const in14 = new Date(now.getTime() + 14 * DAY).toISOString();
  const [props, photos, content, pubs, lastPub, conns, planned, leads, clicks, links] = await Promise.all([
    fetchAll((lo, hi) => sb.from("properties").select("id, title, created_at").eq("workspace_id", ws).eq("status", "active").order("id").range(lo, hi), 5000),
    fetchAll((lo, hi) => sb.from("property_photos").select("property_id").eq("workspace_id", ws).order("id").range(lo, hi), 50000),
    fetchAll((lo, hi) => sb.from("content_items").select("id, property_id, kind, content_type, title, created_at").eq("workspace_id", ws).order("id").range(lo, hi), 20000),
    // All confirmed publications (per-offer history needs more than the window).
    fetchAll((lo, hi) => sb.from("publications").select("id, connection_id, content_item_id, published_at").eq("workspace_id", ws).eq("state", "published").not("published_at", "is", null).order("published_at", { ascending: false }).order("id").range(lo, hi), 5000),
    sb.from("publications").select("published_at").eq("workspace_id", ws).eq("state", "published").not("published_at", "is", null).order("published_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("social_connections").select("id, platform, name, status").eq("workspace_id", ws),
    sb.from("schedule_entries").select("id", { count: "exact", head: true }).eq("workspace_id", ws).gte("scheduled_at", now.toISOString()).lt("scheduled_at", in14),
    fetchAll((lo, hi) => sb.from("leads").select("property_id, created_at").eq("workspace_id", ws).neq("status", "spam").gte("created_at", since).order("id").range(lo, hi), 20000),
    fetchAll((lo, hi) => sb.from("web_events").select("property_id").eq("workspace_id", ws).eq("kind", "click").eq("is_bot", false).gte("created_at", since30).order("id").range(lo, hi), 50000),
    sb.from("tracked_links").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("archived", false),
  ]);
  for (const r of [props, photos, content, pubs, conns, leads, clicks]) if (r.error) throw dbError(r.error, "Nie udało się odczytać danych biura.");
  const ago = (iso: string) => Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY));

  const photoCount = new Map<string, number>();
  for (const p of photos.data ?? []) photoCount.set(p.property_id, (photoCount.get(p.property_id) ?? 0) + 1);
  const contentById = new Map((content.data ?? []).map((c) => [c.id, c]));
  const materials = new Map<string, number>();
  const carousels = new Map<string, number>();
  const education: Record<string, number> = {};
  for (const c of content.data ?? []) {
    if (c.property_id) {
      materials.set(c.property_id, (materials.get(c.property_id) ?? 0) + 1);
      if (CAROUSEL_TYPES.has(c.content_type)) carousels.set(c.property_id, (carousels.get(c.property_id) ?? 0) + 1);
    }
    if (c.created_at >= since && EDU_TYPES.includes(c.content_type)) education[c.content_type] = (education[c.content_type] ?? 0) + 1;
  }

  const connById = new Map((conns.data ?? []).map((c) => [c.id, c]));
  const propPubs = new Map<string, { n: number; last: string }>();
  const weekly = Array.from({ length: 8 }, () => 0);
  const inWindow = (pubs.data ?? []).filter((p) => p.published_at! >= since);
  for (const p of pubs.data ?? []) {
    const prop = p.content_item_id ? contentById.get(p.content_item_id)?.property_id : null;
    if (prop) {
      const cur = propPubs.get(prop);
      propPubs.set(prop, { n: (cur?.n ?? 0) + 1, last: !cur || p.published_at! > cur.last ? p.published_at! : cur.last });
    }
    const w = Math.floor(ago(p.published_at!) / 7);
    if (w < 8) weekly[w]!++;
  }

  // Latest platform statistics of each publication in the window.
  const metrics = new Map<string, { views: number | null; interactions: number | null; simulated: boolean }>();
  const ids = inWindow.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from("publication_metrics").select("publication_id, metrics, source, fetched_at").eq("workspace_id", ws).in("publication_id", ids.slice(i, i + 200)).order("fetched_at", { ascending: false });
    for (const m of data ?? []) {
      if (metrics.has(m.publication_id)) continue;
      const v = m.metrics as { views?: unknown; interactions?: unknown };
      metrics.set(m.publication_id, { views: typeof v.views === "number" ? v.views : null, interactions: typeof v.interactions === "number" ? v.interactions : null, simulated: m.source === "mock" });
    }
  }

  const leads30 = new Map<string, number>();
  for (const l of leads.data ?? []) if (l.property_id && l.created_at >= since30) leads30.set(l.property_id, (leads30.get(l.property_id) ?? 0) + 1);
  const clicks30 = new Map<string, number>();
  for (const e of clicks.data ?? []) if (e.property_id) clicks30.set(e.property_id, (clicks30.get(e.property_id) ?? 0) + 1);

  const properties: RecoProperty[] = (props.data ?? []).map((p) => {
    const pp = propPubs.get(p.id);
    return {
      id: p.id, title: p.title, daysListed: ago(p.created_at), photos: photoCount.get(p.id) ?? 0, materials: materials.get(p.id) ?? 0, carousels: carousels.get(p.id) ?? 0,
      publications: pp?.n ?? 0, lastPublicationDaysAgo: pp ? ago(pp.last) : null, clicks30: clicks30.get(p.id) ?? 0, leads30: leads30.get(p.id) ?? 0,
    };
  });
  const publications: RecoPublication[] = inWindow.map((p) => {
    const c = p.content_item_id ? contentById.get(p.content_item_id) : undefined;
    const m = metrics.get(p.id);
    return {
      id: p.id, contentItemId: c?.id ?? null, contentKind: c?.kind ?? null, title: c?.title ?? "Publikacja", platform: connById.get(p.connection_id)?.platform ?? "inne",
      daysAgo: ago(p.published_at!), views: m?.views ?? null, interactions: m?.interactions ?? null, simulated: m?.simulated ?? false,
    };
  });
  return {
    windowDays: WINDOW_DAYS, properties, publications, lastPublicationDaysAgo: lastPub.data?.published_at ? ago(lastPub.data.published_at) : null, weekly,
    plannedNext14: planned.count ?? 0, education, connectedChannels: (conns.data ?? []).filter((c) => c.status === "connected" || c.status === "limited").length,
    trackedLinks: links.count ?? 0, leadsInWindow: leads.data?.length ?? 0,
  };
}

export interface RecommendationsView {
  version: string;
  computedAt: string;
  items: Recommendation[];
  hidden: { key: string; title: string; status: "dismissed" | "done"; until: string }[];
  gaps: string[];
  /** The numbers the rules used (for the dashboard overview). */
  data: RecoData;
}

export async function loadRecommendations(ctx: WorkspaceContext, now = new Date()): Promise<RecommendationsView> {
  const data = await collectRecoData(ctx, now);
  const all = buildRecommendations(data);
  const { data: states } = await ctx.supabase.from("recommendation_states").select("key, status, hidden_until").eq("workspace_id", ctx.workspace.id).gt("hidden_until", now.toISOString());
  const hiddenKeys = new Map((states ?? []).map((s) => [s.key, s]));
  return {
    version: RECO_VERSION,
    computedAt: now.toISOString(),
    items: all.filter((r) => !hiddenKeys.has(r.key)),
    hidden: all.filter((r) => hiddenKeys.has(r.key)).map((r) => ({ key: r.key, title: r.title, status: hiddenKeys.get(r.key)!.status, until: hiddenKeys.get(r.key)!.hidden_until })),
    gaps: dataGaps(data),
    data,
  };
}

/**
 * „Nie teraz” (hidden for 30 days) or „Zrobione” (14 days; if the data still
 * show the same situation afterwards, it comes back). Restore shows it again.
 */
export async function decideRecommendation(ctx: WorkspaceContext, key: string, action: "dismissed" | "done" | "restore", now = new Date()): Promise<void> {
  if (!can(ctx.role, "content.edit")) throw new AppError("Rekomendacje obsługuje właściciel, administrator, agent lub osoba od marketingu.", "forbidden", 403);
  if (typeof key !== "string" || !/^[a-z_]+(:[0-9a-f-]{36})?$/.test(key)) throw new AppError("Nieprawidłowa rekomendacja.", "validation", 422);
  const db = createAdminClient();
  if (action === "restore") {
    const { error } = await db.from("recommendation_states").delete().eq("workspace_id", ctx.workspace.id).eq("key", key);
    if (error) throw dbError(error);
    return;
  }
  // Only a recommendation the office currently has can be hidden.
  const current = buildRecommendations(await collectRecoData(ctx, now));
  if (!current.some((r) => r.key === key)) throw new AppError("Ta rekomendacja nie jest już aktualna.", "not_found", 404);
  const { error } = await db.from("recommendation_states").upsert({
    workspace_id: ctx.workspace.id, key, status: action, hidden_until: new Date(now.getTime() + HIDE_DAYS[action] * DAY).toISOString(), reco_version: RECO_VERSION, decided_by: ctx.userId, decided_at: now.toISOString(),
  }, { onConflict: "workspace_id,key" });
  if (error) throw dbError(error);
}
