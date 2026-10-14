import "server-only";
import { decryptSecret, encryptSecret, pkcePair, randomToken, sha256 } from "@/lib/crypto";
import { AppError, dbError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, SocialConnectionRow } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import { PLATFORMS, type Provider } from "@/core/publishing/platforms";
import { callbackUrl, providerConfigured } from "./config";
import { SocialError } from "./http";
import { linkedin, linkedinAuthorizeUrl, linkedinDiscover, linkedinExchange, linkedinRefresh } from "./linkedin";
import { meta, metaAuthorizeUrl, metaDiscover, metaExchange, metaUsesPkce } from "./meta";
import type { DiscoveredAccount, PlatformAdapter } from "./types";

export function adapterFor(platform: SocialConnectionRow["platform"]): PlatformAdapter {
  const provider = PLATFORMS[platform].provider;
  if (provider === "meta") return meta;
  if (provider === "linkedin") return linkedin;
  throw new SocialError(PLATFORMS[platform].unavailableReason ?? "Platforma niedostępna.", "bad_request");
}

/** Step 1: one-time state (+ PKCE where the platform supports it) bound to user and office. */
export async function startOAuth(ctx: WorkspaceContext, provider: Provider): Promise<string> {
  if (provider === "tiktok") throw new AppError(PLATFORMS.tiktok.unavailableReason!, "unavailable", 409);
  if (!providerConfigured(provider)) throw new AppError(provider === "meta" ? "Integracja Meta wymaga konfiguracji: META_APP_ID i META_APP_SECRET na serwerze." : "Integracja LinkedIn wymaga konfiguracji: LINKEDIN_CLIENT_ID i LINKEDIN_CLIENT_SECRET na serwerze.", "unconfigured", 503);
  const state = randomToken(32);
  const pkce = provider === "meta" && metaUsesPkce() ? pkcePair() : null;
  const { error } = await createAdminClient().from("oauth_states").insert({
    state_hash: sha256(state),
    provider,
    workspace_id: ctx.workspace.id,
    user_id: ctx.userId,
    code_verifier_enc: pkce ? encryptSecret(pkce.verifier) : null,
    redirect_uri: callbackUrl(provider),
  });
  if (error) throw dbError(error);
  return provider === "meta" ? metaAuthorizeUrl(state, pkce?.challenge ?? null) : linkedinAuthorizeUrl(state);
}

/** Step 2 (callback): validates state, exchanges the code, discovers pages/accounts, stores a short-lived grant. */
export async function completeOAuth(ctx: WorkspaceContext, provider: Provider, state: string, code: string): Promise<string> {
  const admin = createAdminClient();
  // Atomic single use: only one request can flip used_at.
  const { data: st } = await admin
    .from("oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state_hash", sha256(state))
    .eq("provider", provider)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("*")
    .maybeSingle();
  if (!st) throw new AppError("Sesja łączenia konta wygasła lub została już użyta. Zacznij od nowa.", "bad_state", 400);
  if (st.user_id !== ctx.userId || st.workspace_id !== ctx.workspace.id) throw new AppError("Łączenie konta rozpoczęła inna osoba lub inne biuro.", "bad_state", 403);
  const verifier = st.code_verifier_enc ? decryptSecret(st.code_verifier_enc) : null;
  const tokens = provider === "meta" ? await metaExchange(code, verifier) : await linkedinExchange(code);
  const discovered: DiscoveredAccount[] = provider === "meta" ? await metaDiscover(tokens) : await linkedinDiscover(tokens);
  const { data: grant, error } = await admin
    .from("oauth_grants")
    .insert({
      provider,
      workspace_id: ctx.workspace.id,
      user_id: ctx.userId,
      user_token_enc: encryptSecret(tokens.accessToken),
      refresh_token_enc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      token_expires_at: tokens.expiresAt?.toISOString() ?? null,
      refresh_expires_at: tokens.refreshExpiresAt?.toISOString() ?? null,
      granted_scopes: tokens.scopes,
      discovered: discovered as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !grant) throw dbError(error);
  return grant.id;
}

export async function loadGrant(ctx: WorkspaceContext, grantId: string) {
  const { data } = await createAdminClient()
    .from("oauth_grants")
    .select("*")
    .eq("id", grantId)
    .eq("workspace_id", ctx.workspace.id)
    .eq("user_id", ctx.userId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) throw new AppError("Wybór kont wygasł. Połącz konto ponownie.", "grant_expired", 410);
  return { ...data, discovered: data.discovered as unknown as DiscoveredAccount[] };
}

/** Step 3: the user picks which discovered pages/accounts to connect. */
export async function connectSelected(ctx: WorkspaceContext, grantId: string, keys: string[]): Promise<number> {
  const grant = await loadGrant(ctx, grantId);
  const chosen = grant.discovered.filter((d) => keys.includes(d.key));
  if (!chosen.length) throw new AppError("Wybierz co najmniej jedno konto.", "bad_request");
  const admin = createAdminClient();
  // Parents (FB pages) first so Instagram accounts can reference them.
  chosen.sort((a, b) => Number(!!a.parent_key) - Number(!!b.parent_key));
  const idByKey = new Map<string, string>();
  for (const d of chosen) {
    let parentId: string | null = null;
    if (d.parent_key) {
      parentId = idByKey.get(d.parent_key) ?? null;
      if (!parentId) {
        const parent = grant.discovered.find((x) => x.key === d.parent_key);
        if (parent) {
          const { data: p } = await admin.from("social_connections").select("id").eq("workspace_id", ctx.workspace.id).eq("platform", parent.platform).eq("external_id", parent.external_id).maybeSingle();
          parentId = p?.id ?? null;
        }
      }
    }
    const { data: row, error } = await admin
      .from("social_connections")
      .upsert(
        {
          workspace_id: ctx.workspace.id,
          platform: d.platform,
          external_id: d.external_id,
          name: d.name.slice(0, 200),
          username: d.username,
          avatar_url: d.avatar_url,
          parent_id: parentId,
          status: d.status,
          capabilities: PLATFORMS[d.platform].formats.map((f) => f.format),
          granted_scopes: grant.granted_scopes,
          missing_scopes: d.missing_scopes,
          token_expires_at: d.token_enc ? null : grant.token_expires_at,
          last_sync_at: new Date().toISOString(),
          last_error: d.note && d.status !== "connected" ? d.note : null,
          connected_by: ctx.userId,
        },
        { onConflict: "workspace_id,platform,external_id" },
      )
      .select("id")
      .single();
    if (error || !row) throw dbError(error, "Nie udało się zapisać połączenia.");
    idByKey.set(d.key, row.id);
    const cred = await admin.from("social_credentials").upsert(
      {
        connection_id: row.id,
        workspace_id: ctx.workspace.id,
        access_token_enc: d.token_enc ?? grant.user_token_enc,
        refresh_token_enc: d.token_enc ? null : grant.refresh_token_enc,
        access_expires_at: d.token_enc ? null : grant.token_expires_at,
        refresh_expires_at: d.token_enc ? null : grant.refresh_expires_at,
        scopes: grant.granted_scopes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id" },
    );
    if (cred.error) throw dbError(cred.error);
  }
  await admin.from("oauth_grants").update({ used_at: new Date().toISOString(), user_token_enc: "", refresh_token_enc: null, discovered: [] }).eq("id", grant.id);
  return chosen.length;
}

/**
 * Safe disconnect: deletes the stored tokens, keeps the history. Publications
 * still waiting for this account are stopped and marked for the user's action.
 */
export async function disconnect(ctx: WorkspaceContext, connectionId: string) {
  const admin = createAdminClient();
  const { data: conn } = await admin.from("social_connections").select("id, name").eq("id", connectionId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!conn) throw new AppError("Nie znaleziono połączenia.", "not_found", 404);
  await admin.from("social_credentials").delete().eq("connection_id", conn.id);
  const { error } = await admin.from("social_connections").update({ status: "disconnected", last_error: null, token_expires_at: null }).eq("id", conn.id);
  if (error) throw dbError(error);
  await admin
    .from("publications")
    .update({ state: "action_required", error_code: "disconnected", error_message: "Konto zostało odłączone. Połącz je ponownie albo wybierz inne konto.", locked_at: null, locked_by: null })
    .eq("connection_id", conn.id)
    .in("state", ["scheduled", "queued"]);
  return conn.name;
}

/** Returns a usable access token; refreshes LinkedIn tokens when possible, flags re-authorization otherwise. */
export async function accessToken(connection: SocialConnectionRow): Promise<string> {
  const admin = createAdminClient();
  const { data: cred } = await admin.from("social_credentials").select("*").eq("connection_id", connection.id).maybeSingle();
  if (!cred) {
    await markConnection(connection.id, "reauth_required", "Brak zapisanej autoryzacji. Połącz konto ponownie.");
    throw new SocialError("Konto nie ma zapisanej autoryzacji. Połącz je ponownie.", "token_expired");
  }
  const expiresAt = cred.access_expires_at ? Date.parse(cred.access_expires_at) : null;
  if (expiresAt && expiresAt < Date.now() + 5 * 60_000) {
    const refreshable = cred.refresh_token_enc && (!cred.refresh_expires_at || Date.parse(cred.refresh_expires_at) > Date.now());
    if (PLATFORMS[connection.platform].provider === "linkedin" && refreshable) {
      try {
        const t = await linkedinRefresh(decryptSecret(cred.refresh_token_enc!));
        await admin
          .from("social_credentials")
          .update({ access_token_enc: encryptSecret(t.accessToken), refresh_token_enc: t.refreshToken ? encryptSecret(t.refreshToken) : cred.refresh_token_enc, access_expires_at: t.expiresAt?.toISOString() ?? null, refresh_expires_at: t.refreshExpiresAt?.toISOString() ?? cred.refresh_expires_at, updated_at: new Date().toISOString() })
          .eq("connection_id", connection.id);
        await admin.from("social_connections").update({ token_expires_at: t.expiresAt?.toISOString() ?? null }).eq("id", connection.id);
        return t.accessToken;
      } catch (error) {
        await logError("social_refresh", error, { workspaceId: connection.workspace_id, context: { connection: connection.id } });
      }
    }
    await markConnection(connection.id, "reauth_required", "Autoryzacja wygasła. Połącz konto ponownie.");
    throw new SocialError("Autoryzacja konta wygasła. Połącz konto ponownie.", "token_expired");
  }
  return decryptSecret(cred.access_token_enc);
}

export async function markConnection(id: string, status: SocialConnectionRow["status"], message: string | null) {
  await createAdminClient().from("social_connections").update({ status, last_error: message?.slice(0, 1000) ?? null, last_sync_at: new Date().toISOString() }).eq("id", id).neq("status", "disconnected");
}

/** Re-checks a connection against the platform (button "Sprawdź połączenie"). */
export async function checkConnection(ctx: WorkspaceContext, id: string) {
  const admin = createAdminClient();
  const { data: conn } = await admin.from("social_connections").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).neq("status", "disconnected").maybeSingle();
  if (!conn) throw new AppError("Nie znaleziono połączenia.", "not_found", 404);
  let token: string;
  try {
    token = await accessToken(conn);
  } catch (error) {
    if (error instanceof SocialError) return { status: "reauth_required" as const, message: error.message };
    throw error;
  }
  const h = await adapterFor(conn.platform).health(conn, token);
  await admin
    .from("social_connections")
    .update({ status: h.status, missing_scopes: h.missing_scopes.length ? h.missing_scopes : conn.missing_scopes, last_error: h.message ?? null, last_sync_at: new Date().toISOString(), ...(h.name ? { name: h.name.slice(0, 200) } : {}) })
    .eq("id", conn.id);
  return { status: h.status, message: h.message ?? null };
}
