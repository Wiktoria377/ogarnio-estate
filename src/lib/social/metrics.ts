import "server-only";
import { createHmac } from "node:crypto";
import { PLATFORM_METRICS, sanitizeMetrics, type MetricKey, type Metrics } from "@/core/analytics/metrics";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, PublicationRow, SocialConnectionRow } from "@/lib/supabase/database.types";
import { LINKEDIN_VERSION, linkedinUrls, metaUrls, socialMock } from "./config";
import { accessToken } from "./connections";
import { SocialError, socialFetch } from "./http";
import { mapGraphError } from "./meta";
import { mapLinkedinError } from "./linkedin";

/**
 * Post metrics from the official APIs only. Metrics a platform does not return
 * stay null ("Brak danych"); nothing is estimated. Snapshots are stored in
 * publication_metrics with their source, so simulator data is never mixed up
 * with real platform data.
 */
type Insight = { data?: { name: string; values?: { value?: unknown }[] }[] };

function proof(token: string) {
  return createHmac("sha256", process.env.META_APP_SECRET ?? "").update(token).digest("hex");
}

async function graph<T>(path: string, token: string, params: Record<string, string>) {
  const q = new URLSearchParams({ ...params, access_token: token, appsecret_proof: proof(token) });
  return (await socialFetch<T>(`${metaUrls().graph}/${path}?${q}`, { method: "GET" }, mapGraphError)).data;
}

const value = (r: Insight, name: string): number | null => {
  const v = r.data?.find((d) => d.name === name)?.values?.[0]?.value;
  return typeof v === "number" ? v : null;
};

async function facebook(token: string, postId: string): Promise<Metrics> {
  const [ins, obj] = await Promise.all([
    graph<Insight>(`${postId}/insights`, token, { metric: "post_media_view,post_total_media_view_unique" }).catch((e) => {
      if (e instanceof SocialError && e.socialCode === "token_expired") throw e;
      return {} as Insight;
    }),
    graph<{ reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number } }>(postId, token, { fields: "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares" }),
  ]);
  const likes = obj.reactions?.summary?.total_count ?? null;
  const comments = obj.comments?.summary?.total_count ?? null;
  // Shares are omitted by the Graph API when there are none, so absence means 0 only if the post object loaded.
  const shares = obj.shares?.count ?? (likes !== null ? 0 : null);
  return sanitizeMetrics({ views: value(ins, "post_media_view"), reach: value(ins, "post_total_media_view_unique"), likes, comments, shares, interactions: likes !== null && comments !== null && shares !== null ? likes + comments + shares : null });
}

async function instagram(token: string, mediaId: string): Promise<Metrics> {
  const ins = await graph<Insight>(`${mediaId}/insights`, token, { metric: "views,reach,likes,comments,shares,saved,total_interactions" });
  return sanitizeMetrics({ views: value(ins, "views"), reach: value(ins, "reach"), likes: value(ins, "likes"), comments: value(ins, "comments"), shares: value(ins, "shares"), saves: value(ins, "saved"), interactions: value(ins, "total_interactions") });
}

async function linkedinOrg(token: string, orgUrn: string, postUrn: string): Promise<Metrics> {
  const kind = postUrn.startsWith("urn:li:ugcPost:") ? "ugcPosts" : "shares";
  const url = `${linkedinUrls().api}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}&${kind}=List(${encodeURIComponent(postUrn)})`;
  const res = await socialFetch<{ elements?: { totalShareStatistics?: Record<string, number> }[] }>(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, "LinkedIn-Version": LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0" } }, mapLinkedinError);
  const s = res.data.elements?.[0]?.totalShareStatistics;
  if (!s) return sanitizeMetrics({});
  return sanitizeMetrics({ views: s.impressionCount, reach: s.uniqueImpressionsCount, clicks: s.clickCount, likes: s.likeCount, comments: s.commentCount, shares: s.shareCount, interactions: [s.likeCount, s.commentCount, s.shareCount, s.clickCount].every((x) => typeof x === "number") ? s.likeCount! + s.commentCount! + s.shareCount! + s.clickCount! : null });
}

export async function fetchPublicationMetrics(pub: Pick<PublicationRow, "id" | "workspace_id" | "external_id">, conn: SocialConnectionRow): Promise<{ metrics: Metrics; unavailable: MetricKey[]; note: string | null }> {
  const supported = PLATFORM_METRICS[conn.platform]?.keys ?? [];
  if (!supported.length || !pub.external_id) return { metrics: {}, unavailable: [], note: PLATFORM_METRICS[conn.platform]?.note ?? "Platforma nie udostępnia statystyk." };
  const token = await accessToken(conn);
  let metrics: Metrics;
  if (conn.platform === "facebook_page") metrics = await facebook(token, pub.external_id);
  else if (conn.platform === "instagram") metrics = await instagram(token, pub.external_id);
  else metrics = await linkedinOrg(token, conn.external_id, pub.external_id);
  const unavailable = supported.filter((k) => metrics[k] == null);
  return { metrics, unavailable, note: unavailable.length ? "Platforma nie zwróciła części metryk (brak uprawnień, za mało danych albo metryka niedostępna dla tego formatu)." : null };
}

/** Fetches and stores one snapshot; marks the publication as checked even on failure (no hammering). */
export async function refreshMetrics(publicationId: string): Promise<{ ok: boolean; message: string | null }> {
  const admin = createAdminClient();
  const { data: pub } = await admin.from("publications").select("id, workspace_id, external_id, connection_id, state").eq("id", publicationId).maybeSingle();
  if (!pub || pub.state !== "published") return { ok: false, message: "Statystyki są dostępne tylko dla opublikowanych postów." };
  await admin.from("publications").update({ metrics_checked_at: new Date().toISOString() }).eq("id", pub.id);
  const { data: conn } = await admin.from("social_connections").select("*").eq("id", pub.connection_id).maybeSingle();
  if (!conn || conn.status === "disconnected") return { ok: false, message: "Konto zostało odłączone – nie można pobrać statystyk." };
  try {
    const r = await fetchPublicationMetrics(pub, conn);
    await admin.from("publication_metrics").insert({ workspace_id: pub.workspace_id, publication_id: pub.id, source: socialMock() ? "mock" : conn.platform.startsWith("linkedin") ? "linkedin" : "meta", metrics: r.metrics as Json, unavailable: r.unavailable, note: r.note });
    return { ok: true, message: r.note };
  } catch (e) {
    const message = e instanceof SocialError ? e.message : "Nie udało się pobrać statystyk.";
    if (e instanceof SocialError && (e.socialCode === "token_expired" || e.socialCode === "permission")) {
      await admin.from("social_connections").update({ status: e.socialCode === "token_expired" ? "reauth_required" : "limited", last_error: message.slice(0, 1000) }).eq("id", conn.id).neq("status", "disconnected");
    }
    return { ok: false, message };
  }
}

const g = globalThis as typeof globalThis & { __oeMetricsAt?: number };

/** Background refresh: posts from the last 30 days, every 6 hours, a few per minute. */
export async function metricsTick() {
  if (Date.now() - (g.__oeMetricsAt ?? 0) < 60_000) return;
  g.__oeMetricsAt = Date.now();
  const admin = createAdminClient();
  const stale = new Date(Date.now() - 6 * 3600_000).toISOString();
  const { data } = await admin
    .from("publications")
    .select("id")
    .eq("state", "published")
    .gte("published_at", new Date(Date.now() - 30 * 86400_000).toISOString())
    .lte("published_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .or(`metrics_checked_at.is.null,metrics_checked_at.lt.${stale}`)
    .order("metrics_checked_at", { ascending: true, nullsFirst: true })
    .limit(5);
  for (const p of data ?? []) await refreshMetrics(p.id).catch((e) => console.error("[metrics] refresh failed", p.id, e));
}
