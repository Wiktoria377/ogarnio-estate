import "server-only";
import { serverEnv } from "@/lib/env";
import type { Provider } from "@/core/publishing/platforms";

/**
 * Official API endpoints and app credentials (server-only env):
 *   META_APP_ID, META_APP_SECRET            Meta app (Facebook Login for Business)
 *   META_CONFIG_ID                          optional: Login for Business configuration id
 *   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
 *   LINKEDIN_ORG_SCOPES=1                   request organization scopes (needs Community Management API approval)
 *
 * SOCIAL_API_MOCK=1 (never in production) points every base URL at the local
 * contract mock (tests/mocks/social-api.mjs). The UI then shows a visible
 * "symulowane API" banner: no simulated result can pass as a real one.
 */
export const META_GRAPH_VERSION = "v26.0";
export const LINKEDIN_VERSION = "202609";

export function socialMock(): string | null {
  const env = serverEnv();
  if (process.env.SOCIAL_API_MOCK !== "1" || env.NODE_ENV === "production") return null;
  return (process.env.SOCIAL_API_MOCK_URL || "http://127.0.0.1:4010").replace(/\/$/, "");
}

export function metaUrls() {
  const mock = socialMock();
  return {
    dialog: mock ? `${mock}/meta/dialog/oauth` : `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`,
    graph: mock ? `${mock}/meta/${META_GRAPH_VERSION}` : `https://graph.facebook.com/${META_GRAPH_VERSION}`,
  };
}

export function linkedinUrls() {
  const mock = socialMock();
  return {
    authorize: mock ? `${mock}/linkedin/oauth/v2/authorization` : "https://www.linkedin.com/oauth/v2/authorization",
    token: mock ? `${mock}/linkedin/oauth/v2/accessToken` : "https://www.linkedin.com/oauth/v2/accessToken",
    api: mock ? `${mock}/linkedin` : "https://api.linkedin.com",
  };
}

export function providerConfigured(provider: Provider): boolean {
  if (provider === "meta") return !!process.env.META_APP_ID && !!process.env.META_APP_SECRET;
  if (provider === "linkedin") return !!process.env.LINKEDIN_CLIENT_ID && !!process.env.LINKEDIN_CLIENT_SECRET;
  return false;
}

export function callbackUrl(provider: Provider): string {
  return `${serverEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/api/social/${provider}/callback`;
}

/** Base for signed public media links that platforms download from (must be reachable from the internet in production). */
export function publicMediaBase(): string {
  return (process.env.PUBLIC_MEDIA_BASE_URL || serverEnv().NEXT_PUBLIC_SITE_URL).replace(/\/$/, "");
}

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "read_insights",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
];
export const META_FB_REQUIRED = ["pages_show_list", "pages_manage_posts", "pages_read_engagement"];
export const META_IG_REQUIRED = ["instagram_basic", "instagram_content_publish"];

export function linkedinScopes(): string[] {
  const base = ["openid", "profile", "w_member_social"];
  return process.env.LINKEDIN_ORG_SCOPES === "1" ? [...base, "w_organization_social", "r_organization_social", "rw_organization_admin"] : base;
}
