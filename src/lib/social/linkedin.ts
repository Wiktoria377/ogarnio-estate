import "server-only";
import { LINKEDIN_VERSION, callbackUrl, linkedinScopes, linkedinUrls } from "./config";
import { ERROR_MESSAGES, SocialError, retryAfter, socialFetch } from "./http";
import type { ConnectionHealth, DiscoveredAccount, GrantTokens, PlatformAdapter, PublishInput } from "./types";

/**
 * LinkedIn: OAuth 2.0 authorization code (state; PKCE is only offered for native
 * apps), Posts API (/rest/posts) and Images API. Member posting uses the
 * self-serve "Share on LinkedIn" product; organization pages need the
 * Community Management API (approval by LinkedIn).
 */
type LiError = { message?: string; status?: number; serviceErrorCode?: number; code?: string };

export function mapLinkedinError(status: number, body: unknown, headers: Headers): SocialError {
  const e = (body ?? {}) as LiError;
  const detail = `linkedin ${status} ${e.code ?? ""} ${e.serviceErrorCode ?? ""}: ${(e.message ?? "").slice(0, 200)}`;
  if (status === 401) return new SocialError(ERROR_MESSAGES.token_expired, "token_expired", { status, detail });
  if (status === 403) return new SocialError(ERROR_MESSAGES.permission, "permission", { status, detail });
  if (status === 429) return new SocialError(ERROR_MESSAGES.rate_limited, "rate_limited", { status, detail, retryable: true, retryAfterMs: retryAfter(headers, 30 * 60_000) });
  if (status === 404) return new SocialError(ERROR_MESSAGES.not_found, "not_found", { status, detail });
  if (status >= 500) return new SocialError(ERROR_MESSAGES.platform_down, "platform_down", { status, detail, retryable: true });
  if (status === 422 && /image|media|asset/i.test(e.message ?? "")) return new SocialError(ERROR_MESSAGES.media_rejected, "media_rejected", { status, detail });
  return new SocialError(ERROR_MESSAGES.bad_request, "bad_request", { status, detail });
}

const restHeaders = (token: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${token}`,
  "LinkedIn-Version": LINKEDIN_VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
  ...extra,
});

export function linkedinAuthorizeUrl(state: string): string {
  const q = new URLSearchParams({ response_type: "code", client_id: process.env.LINKEDIN_CLIENT_ID ?? "", redirect_uri: callbackUrl("linkedin"), state, scope: linkedinScopes().join(" ") });
  return `${linkedinUrls().authorize}?${q}`;
}

type TokenResponse = { access_token: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string };

function toTokens(t: TokenResponse): GrantTokens {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
    refreshExpiresAt: t.refresh_token_expires_in ? new Date(Date.now() + t.refresh_token_expires_in * 1000) : null,
    scopes: (t.scope ?? "").split(/[ ,]+/).filter(Boolean),
  };
}

export async function linkedinExchange(code: string): Promise<GrantTokens> {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackUrl("linkedin"), client_id: process.env.LINKEDIN_CLIENT_ID ?? "", client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "" });
  const r = await socialFetch<TokenResponse>(linkedinUrls().token, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } }, mapLinkedinError);
  return toTokens(r.data);
}

/** Refresh tokens exist only for apps LinkedIn enabled for programmatic refresh. */
export async function linkedinRefresh(refreshToken: string): Promise<GrantTokens> {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: process.env.LINKEDIN_CLIENT_ID ?? "", client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "" });
  const r = await socialFetch<TokenResponse>(linkedinUrls().token, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } }, mapLinkedinError);
  return toTokens(r.data);
}

export async function linkedinDiscover(tokens: GrantTokens): Promise<DiscoveredAccount[]> {
  const { api } = linkedinUrls();
  const me = (await socialFetch<{ sub: string; name?: string; picture?: string }>(`${api}/v2/userinfo`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } }, mapLinkedinError)).data;
  const canMember = tokens.scopes.length === 0 || tokens.scopes.includes("w_member_social");
  const out: DiscoveredAccount[] = [
    {
      key: `li:person:${me.sub}`,
      platform: "linkedin_member",
      external_id: `urn:li:person:${me.sub}`,
      name: me.name || "Profil LinkedIn",
      username: null,
      avatar_url: me.picture?.startsWith("https://") ? me.picture : null,
      token_enc: null,
      parent_key: null,
      status: canMember ? "connected" : "limited",
      missing_scopes: canMember ? [] : ["w_member_social"],
      note: null,
    },
  ];
  if (tokens.scopes.includes("w_organization_social") || tokens.scopes.includes("rw_organization_admin")) {
    const acl = await socialFetch<{ elements?: { organization: string; role: string; state: string }[] }>(
      `${api}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
      { headers: restHeaders(tokens.accessToken) },
      mapLinkedinError,
    ).catch(() => null);
    for (const el of acl?.data.elements ?? []) {
      const id = el.organization.split(":").pop()!;
      const org = await socialFetch<{ localizedName?: string; vanityName?: string }>(`${api}/rest/organizations/${encodeURIComponent(id)}`, { headers: restHeaders(tokens.accessToken) }, mapLinkedinError).catch(() => null);
      const canPost = tokens.scopes.includes("w_organization_social");
      out.push({
        key: `li:org:${id}`,
        platform: "linkedin_org",
        external_id: el.organization,
        name: org?.data.localizedName || `Strona ${id}`,
        username: org?.data.vanityName ?? null,
        avatar_url: null,
        token_enc: null,
        parent_key: null,
        status: canPost ? "connected" : "limited",
        missing_scopes: canPost ? [] : ["w_organization_social"],
        note: null,
      });
    }
  }
  return out;
}

async function uploadImage(input: PublishInput, file: PublishInput["media"][number]): Promise<string> {
  const { api } = linkedinUrls();
  const init = await socialFetch<{ value: { uploadUrl: string; image: string } }>(
    `${api}/rest/images?action=initializeUpload`,
    { method: "POST", headers: restHeaders(input.token, { "Content-Type": "application/json" }), body: JSON.stringify({ initializeUploadRequest: { owner: input.connection.external_id } }) },
    mapLinkedinError,
  );
  const { uploadUrl, image } = init.data.value;
  if (!/^https?:\/\//.test(uploadUrl)) throw new SocialError("LinkedIn zwrócił nieprawidłowy adres wysyłki.", "unknown");
  await socialFetch<unknown>(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${input.token}`, "Content-Type": file.mime }, body: new Uint8Array(await file.read()), timeoutMs: 60_000 }, mapLinkedinError);
  return image;
}

const postUrl = (urn: string) => `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}`;

export const linkedin: PlatformAdapter = {
  async publish(input) {
    const { pub, connection } = input;
    if (!["text", "photo", "photo_set"].includes(pub.format)) throw new SocialError(`Format ${pub.format} nie jest obsługiwany na LinkedIn w tej wersji.`, "bad_request");
    // Image uploads are not posts: repeating them is harmless. The /rest/posts call is the write.
    const images: string[] = [];
    for (const m of input.media) images.push(await uploadImage(input, m));
    const body: Record<string, unknown> = {
      author: connection.external_id,
      // "little text" format: reserved characters must be escaped or the post is truncated.
      commentary: pub.caption.replace(/([\\(){}\[\]<>@|~_*#])/g, "\\$1"),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (images.length === 1) body.content = { media: { id: images[0] } };
    if (images.length > 1) body.content = { multiImage: { images: images.map((id) => ({ id })) } };
    const { api } = linkedinUrls();
    const r = await socialFetch<unknown>(`${api}/rest/posts`, { method: "POST", headers: restHeaders(input.token, { "Content-Type": "application/json" }), body: JSON.stringify(body), write: true }, mapLinkedinError);
    const urn = r.headers.get("x-restli-id") ?? r.headers.get("x-linkedin-id");
    if (!urn) throw new SocialError("LinkedIn nie zwrócił identyfikatora posta. Sprawdzimy, czy post powstał.", "unknown", { uncertain: true, retryable: true });
    return { kind: "published", externalId: urn, url: postUrl(urn) };
  },

  async checkStatus() {
    return { kind: "failed", error: new SocialError("LinkedIn publikuje synchronicznie: brak przetwarzania do sprawdzenia.", "unknown") };
  },

  async findExisting(input, since) {
    const { api } = linkedinUrls();
    const q = new URLSearchParams({ author: input.connection.external_id, q: "author", count: "20", sortBy: "LAST_MODIFIED" });
    const r = await socialFetch<{ elements?: { id: string; commentary?: string; createdAt?: number; publishedAt?: number }[] }>(`${api}/rest/posts?${q}`, { headers: restHeaders(input.token) }, mapLinkedinError);
    const strip = (s: string) => s.replace(/\\(.)/g, "$1").trim();
    const caption = input.pub.caption.trim();
    const hit = (r.data.elements ?? []).find((p) => strip(p.commentary ?? "") === caption && (p.createdAt ?? p.publishedAt ?? Date.now()) >= since.getTime() - 120_000);
    return hit ? { externalId: hit.id, url: postUrl(hit.id) } : null;
  },

  async health(connection, token): Promise<ConnectionHealth> {
    const { api } = linkedinUrls();
    try {
      await socialFetch<unknown>(`${api}/v2/userinfo`, { headers: { Authorization: `Bearer ${token}` } }, mapLinkedinError);
      return { status: connection.missing_scopes.length ? "limited" : "connected", missing_scopes: connection.missing_scopes };
    } catch (error) {
      if (error instanceof SocialError && error.socialCode === "token_expired") return { status: "reauth_required", missing_scopes: [], message: error.message };
      if (error instanceof SocialError && error.retryable) return { status: connection.status, missing_scopes: connection.missing_scopes, message: error.message };
      return { status: "error", missing_scopes: [], message: error instanceof Error ? error.message : "Błąd" };
    }
  },
};
