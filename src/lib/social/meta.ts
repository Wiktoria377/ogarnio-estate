import "server-only";
import { createHmac } from "node:crypto";
import { encryptSecret } from "@/lib/crypto";
import { PLATFORMS } from "@/core/publishing/platforms";
import { META_FB_REQUIRED, META_IG_REQUIRED, META_SCOPES, callbackUrl, metaUrls } from "./config";
import { ERROR_MESSAGES, SocialError, retryAfter, socialFetch } from "./http";
import type { CheckOutcome, ConnectionHealth, DiscoveredAccount, GrantTokens, PlatformAdapter, PublishInput, PublishOutcome } from "./types";

/**
 * Meta Graph API (Facebook Pages + Instagram professional accounts).
 * Official flows only: Facebook Login for Business (OAuth code + state), page
 * tokens from /me/accounts, Pages API for posts, Instagram content publishing
 * (container → status → media_publish). Every call carries appsecret_proof.
 */
type GraphError = { error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean; error_user_msg?: string } };

const RATE_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80004, 80005, 80006]);

export function mapGraphError(status: number, body: unknown, headers: Headers): SocialError {
  const e = (body as GraphError)?.error ?? {};
  const code = e.code ?? 0;
  const sub = e.error_subcode ?? 0;
  const detail = `meta ${status} code=${code} sub=${sub}: ${(e.message ?? "").slice(0, 200)}`;
  if (code === 190 || code === 102 || status === 401) return new SocialError(ERROR_MESSAGES.token_expired, "token_expired", { status, detail });
  if (code === 10 || (code >= 200 && code < 300) || code === 3) return new SocialError(ERROR_MESSAGES.permission, "permission", { status, detail });
  if (RATE_CODES.has(code) || status === 429) return new SocialError(ERROR_MESSAGES.rate_limited, "rate_limited", { status, detail, retryable: true, retryAfterMs: retryAfter(headers, 15 * 60_000) });
  if (sub === 2207042 || code === 9) return new SocialError(ERROR_MESSAGES.publish_limit, "publish_limit", { status, detail, retryable: true, retryAfterMs: 3 * 3600_000 });
  if (code === 36003 || sub === 2207009) return new SocialError(ERROR_MESSAGES.aspect_ratio, "aspect_ratio", { status, detail });
  if (code === 9004 || code === 352 || code === 324 || [2207026, 2207003, 2207052, 2207004, 2207005, 2207006, 1363024].includes(sub)) return new SocialError(e.error_user_msg ? `${ERROR_MESSAGES.media_rejected} ${e.error_user_msg}` : ERROR_MESSAGES.media_rejected, "media_rejected", { status, detail });
  if (e.is_transient || code === 1 || code === 2 || status >= 500) return new SocialError(ERROR_MESSAGES.platform_down, "platform_down", { status, detail, retryable: true });
  if (code === 803 || status === 404) return new SocialError(ERROR_MESSAGES.not_found, "not_found", { status, detail });
  return new SocialError(e.error_user_msg ? `${ERROR_MESSAGES.bad_request} ${e.error_user_msg}` : ERROR_MESSAGES.bad_request, "bad_request", { status, detail });
}

function appSecret() {
  const s = process.env.META_APP_SECRET;
  if (!s) throw new SocialError("Integracja Meta nie jest skonfigurowana (META_APP_ID, META_APP_SECRET).", "permission");
  return s;
}

function proof(token: string) {
  return createHmac("sha256", appSecret()).update(token).digest("hex");
}

async function graphGet<T>(path: string, token: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams({ ...params, access_token: token, appsecret_proof: proof(token) });
  return (await socialFetch<T>(`${metaUrls().graph}/${path}?${q}`, { method: "GET" }, mapGraphError)).data;
}

async function graphPost<T>(path: string, token: string, params: Record<string, string>, opts: { write?: boolean; timeoutMs?: number } = {}) {
  const body = new URLSearchParams({ ...params, access_token: token, appsecret_proof: proof(token) });
  return (await socialFetch<T>(`${metaUrls().graph}/${path}`, { method: "POST", body, write: opts.write ?? true, timeoutMs: opts.timeoutMs }, mapGraphError)).data;
}

// ── OAuth ───────────────────────────────────────────────────────────────────
export function metaAuthorizeUrl(state: string, codeChallenge: string | null): string {
  const q = new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", redirect_uri: callbackUrl("meta"), state, response_type: "code" });
  if (process.env.META_CONFIG_ID) q.set("config_id", process.env.META_CONFIG_ID);
  else q.set("scope", META_SCOPES.join(","));
  // PKCE on Facebook Login is opt-in (META_OAUTH_PKCE=1) until Meta marks it generally available.
  if (codeChallenge) {
    q.set("code_challenge", codeChallenge);
    q.set("code_challenge_method", "S256");
  }
  return `${metaUrls().dialog}?${q}`;
}

export function metaUsesPkce() {
  return process.env.META_OAUTH_PKCE === "1";
}

export async function metaExchange(code: string, verifier: string | null): Promise<GrantTokens> {
  const { graph } = metaUrls();
  const q = new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", client_secret: appSecret(), redirect_uri: callbackUrl("meta"), code });
  if (verifier) q.set("code_verifier", verifier);
  const short = (await socialFetch<{ access_token: string }>(`${graph}/oauth/access_token?${q}`, { method: "GET" }, mapGraphError)).data;
  // Long-lived user token (~60 days); page tokens derived from it do not expire by time.
  const lq = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID ?? "", client_secret: appSecret(), fb_exchange_token: short.access_token });
  const long = (await socialFetch<{ access_token: string; expires_in?: number }>(`${graph}/oauth/access_token?${lq}`, { method: "GET" }, mapGraphError)).data;
  const perms = await graphGet<{ data: { permission: string; status: string }[] }>("me/permissions", long.access_token);
  return {
    accessToken: long.access_token,
    refreshToken: null,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
    refreshExpiresAt: null,
    scopes: perms.data.filter((p) => p.status === "granted").map((p) => p.permission),
  };
}

type PageRow = { id: string; name: string; access_token?: string; tasks?: string[]; picture?: { data?: { url?: string } }; instagram_business_account?: { id: string; username?: string; profile_picture_url?: string } };

export async function metaDiscover(tokens: GrantTokens): Promise<DiscoveredAccount[]> {
  const pages = await graphGet<{ data: PageRow[] }>("me/accounts", tokens.accessToken, {
    fields: "id,name,access_token,tasks,picture{url},instagram_business_account{id,username,profile_picture_url}",
    limit: "100",
  });
  const missingFb = META_FB_REQUIRED.filter((s) => !tokens.scopes.includes(s));
  const missingIg = META_IG_REQUIRED.filter((s) => !tokens.scopes.includes(s));
  const out: DiscoveredAccount[] = [];
  for (const p of pages.data ?? []) {
    const canPost = !p.tasks || p.tasks.includes("CREATE_CONTENT") || p.tasks.includes("MANAGE");
    const pageKey = `fb:${p.id}`;
    out.push({
      key: pageKey,
      platform: "facebook_page",
      external_id: p.id,
      name: p.name,
      username: null,
      avatar_url: p.picture?.data?.url?.startsWith("https://") ? p.picture.data.url : null,
      token_enc: p.access_token ? encryptSecret(p.access_token) : null,
      parent_key: null,
      status: !p.access_token ? "error" : missingFb.length || !canPost ? "limited" : "connected",
      missing_scopes: canPost ? missingFb : [...missingFb, "zadanie CREATE_CONTENT na stronie"],
      note: canPost ? null : "Twoja rola na tej stronie nie pozwala tworzyć postów.",
    });
    const ig = p.instagram_business_account;
    if (ig) {
      out.push({
        key: `ig:${ig.id}`,
        platform: "instagram",
        external_id: ig.id,
        name: ig.username ? `@${ig.username}` : `Instagram ${ig.id}`,
        username: ig.username ?? null,
        avatar_url: ig.profile_picture_url?.startsWith("https://") ? ig.profile_picture_url : null,
        token_enc: p.access_token ? encryptSecret(p.access_token) : null,
        parent_key: pageKey,
        status: !p.access_token ? "error" : missingIg.length ? "limited" : "connected",
        missing_scopes: missingIg,
        note: `Połączone przez stronę „${p.name}”.`,
      });
    }
  }
  return out;
}

// ── Publishing ──────────────────────────────────────────────────────────────
function igMediaParams(m: PublishInput["media"][number], extra: Record<string, string> = {}) {
  return m.mime.startsWith("video/") ? { media_type: extra.media_type ?? "VIDEO", video_url: m.url, ...extra } : { image_url: m.url, ...extra };
}

async function igContainerStatus(id: string, token: string) {
  return graphGet<{ status_code?: "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED"; status?: string }>(id, token, { fields: "status_code,status" });
}

async function igPermalink(mediaId: string, token: string) {
  try {
    const r = await graphGet<{ permalink?: string }>(mediaId, token, { fields: "permalink" });
    return r.permalink?.startsWith("https://") ? r.permalink : null;
  } catch {
    return null;
  }
}

async function fbPermalink(postId: string, token: string) {
  try {
    const r = await graphGet<{ permalink_url?: string }>(postId, token, { fields: "permalink_url" });
    return r.permalink_url?.startsWith("https://") ? r.permalink_url : null;
  } catch {
    return null;
  }
}

async function igPublishContainer(input: PublishInput, containerId: string): Promise<CheckOutcome> {
  const st = await igContainerStatus(containerId, input.token);
  if (st.status_code === "IN_PROGRESS") return { kind: "processing", containerId, externalId: null, checkAfterMs: 20_000 };
  if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
    return { kind: "failed", error: new SocialError(`${ERROR_MESSAGES.media_rejected}${st.status ? ` (${st.status.slice(0, 200)})` : ""}`, "media_rejected", { detail: `ig container ${st.status_code}` }) };
  }
  if (st.status_code === "PUBLISHED") {
    const found = await meta.findExisting(input, new Date(Date.now() - 48 * 3600_000));
    if (found) return { kind: "published", ...found };
  }
  // Daily API publishing quota (100 / 24 h).
  const limit = await graphGet<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(`${input.connection.external_id}/content_publishing_limit`, input.token, { fields: "quota_usage,config" }).catch(() => null);
  const q = limit?.data?.[0];
  if (q?.quota_usage != null && q.config?.quota_total != null && q.quota_usage >= q.config.quota_total) throw new SocialError(ERROR_MESSAGES.publish_limit, "publish_limit", { retryable: true, retryAfterMs: 3 * 3600_000 });
  const res = await graphPost<{ id: string }>(`${input.connection.external_id}/media_publish`, input.token, { creation_id: containerId });
  return { kind: "published", externalId: res.id, url: await igPermalink(res.id, input.token) };
}

async function igCarouselFromChildren(input: PublishInput, childIds: string[]): Promise<CheckOutcome> {
  for (const id of childIds) {
    const st = await igContainerStatus(id, input.token);
    if (st.status_code === "IN_PROGRESS") return { kind: "processing", containerId: `c:${childIds.join(",")}`, externalId: null, checkAfterMs: 20_000 };
    if (st.status_code === "ERROR" || st.status_code === "EXPIRED") return { kind: "failed", error: new SocialError(ERROR_MESSAGES.media_rejected, "media_rejected", { detail: `ig child ${st.status_code}` }) };
  }
  const parent = await graphPost<{ id: string }>(`${input.connection.external_id}/media`, input.token, { media_type: "CAROUSEL", children: childIds.join(","), caption: input.pub.caption }, { write: false });
  return { kind: "processing", containerId: parent.id, externalId: null, checkAfterMs: 3_000 };
}

export const meta: PlatformAdapter = {
  async publish(input) {
    const { pub, connection, token, media } = input;
    const page = connection.external_id;
    if (connection.platform === "facebook_page") {
      if (pub.format === "text") {
        const r = await graphPost<{ id: string }>(`${page}/feed`, token, { message: pub.caption, ...(pub.link_url ? { link: pub.link_url } : {}) });
        return { kind: "published", externalId: r.id, url: await fbPermalink(r.id, token) };
      }
      if (pub.format === "photo") {
        const r = await graphPost<{ id: string; post_id?: string }>(`${page}/photos`, token, { url: media[0]!.url, caption: pub.caption, published: "true" });
        const id = r.post_id ?? r.id;
        return { kind: "published", externalId: id, url: await fbPermalink(id, token) };
      }
      if (pub.format === "photo_set") {
        // Unpublished photo uploads are safe to repeat; only the final /feed call is a write.
        const ids: string[] = [];
        for (const m of media) ids.push((await graphPost<{ id: string }>(`${page}/photos`, token, { url: m.url, published: "false" }, { write: false })).id);
        const params: Record<string, string> = { message: pub.caption };
        ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
        const r = await graphPost<{ id: string }>(`${page}/feed`, token, params);
        return { kind: "published", externalId: r.id, url: await fbPermalink(r.id, token) };
      }
      if (pub.format === "video") {
        const r = await graphPost<{ id: string }>(`${page}/videos`, token, { file_url: media[0]!.url, description: pub.caption }, { timeoutMs: 60_000 });
        return { kind: "processing", containerId: r.id, externalId: null, checkAfterMs: 30_000 };
      }
    }
    if (connection.platform === "instagram") {
      if (pub.format === "photo") {
        const c = await graphPost<{ id: string }>(`${page}/media`, token, igMediaParams(media[0]!, { caption: pub.caption }), { write: false });
        const out = await igPublishContainer(input, c.id);
        if (out.kind === "failed") throw out.error;
        return out;
      }
      if (pub.format === "reel") {
        const c = await graphPost<{ id: string }>(`${page}/media`, token, igMediaParams(media[0]!, { media_type: "REELS", caption: pub.caption, share_to_feed: "true" }), { write: false, timeoutMs: 60_000 });
        return { kind: "processing", containerId: c.id, externalId: null, checkAfterMs: 30_000 };
      }
      if (pub.format === "carousel") {
        const ids: string[] = [];
        for (const m of media) ids.push((await graphPost<{ id: string }>(`${page}/media`, token, igMediaParams(m, { is_carousel_item: "true" }), { write: false })).id);
        const next = await igCarouselFromChildren(input, ids);
        if (next.kind === "failed") throw next.error;
        if (next.kind === "processing" && next.containerId && !next.containerId.startsWith("c:")) {
          const out = await igPublishContainer(input, next.containerId);
          if (out.kind === "failed") throw out.error;
          return out;
        }
        return next;
      }
    }
    throw new SocialError(`Format ${pub.format} nie jest obsługiwany na ${PLATFORMS[connection.platform].label}.`, "bad_request");
  },

  async checkStatus(input) {
    const cid = input.pub.external_container_id;
    if (!cid) return { kind: "failed", error: new SocialError("Brak identyfikatora przetwarzania z platformy.", "unknown") };
    if (input.connection.platform === "instagram") {
      if (cid.startsWith("c:")) {
        const next = await igCarouselFromChildren(input, cid.slice(2).split(","));
        if (next.kind !== "processing" || !next.containerId || next.containerId.startsWith("c:")) return next;
        return igPublishContainer(input, next.containerId);
      }
      return igPublishContainer(input, cid);
    }
    // Facebook video
    const v = await graphGet<{ status?: { video_status?: string; processing_phase?: { status?: string }; publishing_phase?: { status?: string } }; post_id?: string; permalink_url?: string }>(cid, input.token, { fields: "status,post_id,permalink_url" });
    const vs = v.status?.video_status;
    if (vs === "error" || v.status?.processing_phase?.status === "error") return { kind: "failed", error: new SocialError(`${ERROR_MESSAGES.media_rejected} Facebook nie przetworzył filmu.`, "media_rejected") };
    if (vs === "ready" && (v.status?.publishing_phase?.status ?? "complete") === "complete") {
      const id = v.post_id ?? cid;
      const url = v.permalink_url ? (v.permalink_url.startsWith("https://") ? v.permalink_url : `https://www.facebook.com${v.permalink_url}`) : await fbPermalink(id, input.token);
      return { kind: "published", externalId: id, url };
    }
    return { kind: "processing", containerId: cid, externalId: null, checkAfterMs: 30_000 };
  },

  async findExisting(input, since) {
    const caption = input.pub.caption.trim();
    const sinceSec = Math.floor(since.getTime() / 1000) - 120;
    if (input.connection.platform === "instagram") {
      const r = await graphGet<{ data: { id: string; caption?: string; timestamp?: string; permalink?: string }[] }>(`${input.connection.external_id}/media`, input.token, { fields: "id,caption,timestamp,permalink", limit: "25" });
      const hit = r.data.find((m) => (m.caption ?? "").trim() === caption && (!m.timestamp || Date.parse(m.timestamp) / 1000 >= sinceSec));
      return hit ? { externalId: hit.id, url: hit.permalink?.startsWith("https://") ? hit.permalink : null } : null;
    }
    const r = await graphGet<{ data: { id: string; message?: string; created_time?: string; permalink_url?: string }[] }>(`${input.connection.external_id}/published_posts`, input.token, { fields: "id,message,created_time,permalink_url", since: String(sinceSec), limit: "25" });
    const hit = r.data.find((p) => (p.message ?? "").trim() === caption);
    return hit ? { externalId: hit.id, url: hit.permalink_url?.startsWith("https://") ? hit.permalink_url : null } : null;
  },

  async health(connection, token): Promise<ConnectionHealth> {
    try {
      if (connection.platform === "instagram") {
        const r = await graphGet<{ username?: string }>(connection.external_id, token, { fields: "username" });
        return { status: "connected", missing_scopes: [], name: r.username ? `@${r.username}` : undefined };
      }
      const r = await graphGet<{ name?: string; tasks?: string[] }>(connection.external_id, token, { fields: "name" });
      return { status: "connected", missing_scopes: [], name: r.name };
    } catch (error) {
      if (error instanceof SocialError) {
        if (error.socialCode === "token_expired") return { status: "reauth_required", missing_scopes: [], message: error.message };
        if (error.socialCode === "permission") return { status: "limited", missing_scopes: [], message: error.message };
        if (error.retryable) return { status: connection.status, missing_scopes: connection.missing_scopes, message: error.message };
        return { status: "error", missing_scopes: [], message: error.message };
      }
      throw error;
    }
  },
};

export type { PublishOutcome };
