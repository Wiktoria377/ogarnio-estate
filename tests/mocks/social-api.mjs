#!/usr/bin/env node
/**
 * CONTRACT MOCK of the Meta Graph API and LinkedIn REST API, for automated
 * tests only. It is NOT the real platform and its numbers are NOT real data.
 *
 * It implements the subset of endpoints Ogarnio Estate calls, with the same
 * request shapes and error formats as the official docs (Graph API v26.0,
 * LinkedIn Posts API 202609), so the integration code is exercised end to end
 * without real accounts. It downloads every image_url / video_url it receives
 * (like Meta does), so signed public media links are tested for real.
 *
 * The app uses it only with SOCIAL_API_MOCK=1 outside production, and then
 * shows a visible "symulowane API" banner.
 *
 *   node tests/mocks/social-api.mjs            (port 4010, or MOCK_PORT)
 *   POST /__control {"fail": "token_expired" | "rate_limited" | "timeout_after_create" | "reject_media" | "server_error", "times": 1}
 *   GET  /__state   → recorded posts
 *   POST /__reset
 *   POST /__seed    {"fbPosts": ["5550001_1"], "igMedia": ["1789..."]} → posts known to the mock (for statistics tests)
 * Insights endpoints return SIMULATED numbers (derived from the post id), only to
 * exercise the metrics code path; the app labels them as simulator data.
 */
import { createHmac } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4010);
const APP_SECRET = process.env.META_APP_SECRET || "mock-meta-secret";
const BASE = `http://127.0.0.1:${PORT}`;

let seq = 1000;
/** Deterministic SIMULATED metric seed (not real data). */
function fakeNumber(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 1000;
}
const id = () => String(++seq);
let state;
function reset() {
  state = {
    fbPosts: [], // {id, page, message, created_time, attached?}
    photos: new Map(), // id -> {url, published}
    videos: new Map(), // id -> {checks, post_id}
    containers: new Map(), // id -> {ig, type, children, caption, status, checks, mediaId}
    igMedia: [], // {id, ig, caption, timestamp}
    liPosts: [], // {id, author, commentary, createdAt, images}
    liImages: new Map(), // urn -> {uploaded}
    fetched: [], // media URLs downloaded
    fail: null,
    failTimes: 0,
    calls: [],
  };
}
reset();

function takeFail(kind) {
  if (state.fail === kind && state.failTimes > 0) {
    state.failTimes--;
    if (state.failTimes === 0) state.fail = null;
    return true;
  }
  return false;
}

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};
const graphErr = (res, status, code, message, sub) => json(res, status, { error: { message, type: "OAuthException", code, ...(sub ? { error_subcode: sub } : {}), fbtrace_id: "MOCK" } });

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function fetchMedia(url, expectVideo) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const type = r.headers.get("content-type") || "";
    const buf = Buffer.from(await r.arrayBuffer());
    state.fetched.push({ url, status: r.status, type, bytes: buf.length });
    if (!r.ok) return false;
    if (expectVideo) return type === "video/mp4" && buf.length > 0;
    return type === "image/jpeg" && buf[0] === 0xff && buf[1] === 0xd8;
  } catch {
    state.fetched.push({ url, status: 0 });
    return false;
  }
}

function consentPage(res, title, redirect) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:sans-serif;max-width:520px;margin:60px auto">
<p style="background:#fff3cd;padding:12px;border-radius:6px"><b>SYMULATOR TESTOWY</b>: to nie jest prawdziwa strona platformy.</p>
<h1>${title}</h1><p>Aplikacja Ogarnio Estate prosi o dostęp do publikacji.</p>
<a id="allow" href="${redirect}" style="display:inline-block;padding:10px 18px;background:#1a73e8;color:#fff;border-radius:6px;text-decoration:none">Zezwól</a>
<a id="deny" href="${redirect.replace(/code=[^&]+/, "error=access_denied&error_reason=user_denied")}" style="margin-left:12px">Anuluj</a></body>`);
}

function checkProof(params) {
  const token = params.get("access_token");
  const proof = params.get("appsecret_proof");
  if (!token) return "missing access_token";
  if (proof !== createHmac("sha256", APP_SECRET).update(token).digest("hex")) return "bad appsecret_proof";
  return null;
}

async function meta(req, res, url, path) {
  if (path === "/dialog/oauth") {
    const q = url.searchParams;
    if (!q.get("state") || !q.get("redirect_uri")) return graphErr(res, 400, 100, "missing state/redirect_uri");
    const target = new URL(q.get("redirect_uri"));
    target.searchParams.set("code", "MOCK_META_CODE");
    target.searchParams.set("state", q.get("state"));
    return consentPage(res, "Meta (symulator): Zaloguj się przez Facebooka", target.toString());
  }
  const m = path.match(/^\/v26\.0\/(.+)$/);
  if (!m) return graphErr(res, 404, 803, "unknown path");
  const p = m[1];
  const body = req.method === "POST" ? new URLSearchParams((await readBody(req)).toString()) : url.searchParams;
  const params = req.method === "POST" ? body : url.searchParams;

  if (p === "oauth/access_token") {
    if (params.get("client_secret") !== APP_SECRET) return graphErr(res, 400, 1, "bad client secret");
    if (params.get("grant_type") === "fb_exchange_token") return json(res, 200, { access_token: "MOCK_LONG_USER_TOKEN", token_type: "bearer", expires_in: 5184000 });
    if (params.get("code") !== "MOCK_META_CODE") return graphErr(res, 400, 100, "invalid code", 36007);
    return json(res, 200, { access_token: "MOCK_SHORT_USER_TOKEN", token_type: "bearer", expires_in: 3600 });
  }
  const proofErr = checkProof(params);
  if (proofErr) return graphErr(res, 400, 100, proofErr);
  if (takeFail("token_expired")) return graphErr(res, 401, 190, "Error validating access token: Session has expired", 463);
  if (takeFail("rate_limited")) return graphErr(res, 400, 4, "Application request limit reached");
  if (takeFail("server_error")) return graphErr(res, 500, 2, "Service temporarily unavailable");
  state.calls.push(`${req.method} ${p}`);

  if (p === "me/permissions") return json(res, 200, { data: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights", "business_management", "instagram_basic", "instagram_content_publish", "instagram_manage_insights"].map((permission) => ({ permission, status: "granted" })) });
  if (p === "me/accounts") return json(res, 200, { data: [{ id: "5550001", name: "Biuro Testowe (symulator)", access_token: "MOCK_PAGE_TOKEN_5550001", tasks: ["ANALYZE", "ADVERTISE", "MODERATE", "CREATE_CONTENT", "MANAGE"], instagram_business_account: { id: "17841400000000001", username: "biuro.testowe.symulator" } }] });

  const [obj, edge] = p.split("/");
  const page = obj === "5550001";
  const ig = obj === "17841400000000001";

  // Insights (SIMULATED numbers derived from the id; real values only come from Meta).
  const fbPost = state.fbPosts.find((x) => x.id === obj);
  const igPost = state.igMedia.find((x) => x.id === obj);
  if (edge === "insights" && req.method === "GET") {
    if (!fbPost && !igPost) return graphErr(res, 400, 100, "Unsupported get request", 33);
    const n = fakeNumber(obj);
    const values = fbPost
      ? { post_media_view: 300 + n, post_total_media_view_unique: 200 + Math.round(n / 2) }
      : { views: 500 + n, reach: 350 + Math.round(n / 2), likes: 20 + (n % 30), comments: n % 7, shares: n % 5, saved: n % 9, total_interactions: 20 + (n % 30) + (n % 7) + (n % 5) + (n % 9) };
    const wanted = (params.get("metric") ?? "").split(",");
    return json(res, 200, { data: wanted.filter((k) => k in values).map((name) => ({ name, period: "lifetime", values: [{ value: values[name] }] })) });
  }
  if (fbPost && !edge && req.method === "GET" && (params.get("fields") ?? "").includes("reactions")) {
    const n = fakeNumber(obj);
    return json(res, 200, { id: obj, reactions: { data: [], summary: { total_count: 15 + (n % 20) } }, comments: { data: [], summary: { total_count: n % 6 } }, shares: { count: n % 4 } });
  }

  if (page && edge === "feed" && req.method === "POST") {
    const post = { id: `5550001_${id()}`, message: params.get("message") || "", created_time: new Date().toISOString(), attached: [...params.keys()].filter((k) => k.startsWith("attached_media")).length };
    state.fbPosts.push(post);
    if (takeFail("timeout_after_create")) return; // never answers: the client times out
    return json(res, 200, { id: post.id });
  }
  if (page && edge === "photos" && req.method === "POST") {
    const ok = await fetchMedia(params.get("url"), false);
    if (!ok || takeFail("reject_media")) return graphErr(res, 400, 324, "Missing or invalid image file");
    const pid = id();
    const published = params.get("published") !== "false";
    state.photos.set(pid, { published });
    if (!published) return json(res, 200, { id: pid });
    const post = { id: `5550001_${id()}`, message: params.get("caption") || "", created_time: new Date().toISOString() };
    state.fbPosts.push(post);
    return json(res, 200, { id: pid, post_id: post.id });
  }
  if (page && edge === "videos" && req.method === "POST") {
    const ok = await fetchMedia(params.get("file_url"), true);
    if (!ok) return graphErr(res, 400, 352, "Unsupported video format");
    const vid = id();
    state.videos.set(vid, { checks: 0, post_id: `5550001_${id()}`, description: params.get("description") || "" });
    return json(res, 200, { id: vid });
  }
  if (page && edge === "published_posts") {
    const since = Number(params.get("since") || 0) * 1000;
    return json(res, 200, { data: state.fbPosts.filter((x) => Date.parse(x.created_time) >= since).reverse().map((x) => ({ id: x.id, message: x.message, created_time: x.created_time, permalink_url: `https://mock.social.invalid/fb/${x.id}` })) });
  }
  if (ig && edge === "media" && req.method === "POST") {
    const cid = id();
    const type = params.get("media_type") || "IMAGE";
    if (type === "CAROUSEL") {
      const children = (params.get("children") || "").split(",").filter(Boolean);
      if (children.length < 2 || children.some((c) => state.containers.get(c)?.status !== "FINISHED")) return graphErr(res, 400, 100, "Invalid children", 2207004);
      state.containers.set(cid, { type, children, caption: params.get("caption") || "", status: "FINISHED", checks: 0 });
      return json(res, 200, { id: cid });
    }
    const video = type === "REELS" || type === "VIDEO";
    const ok = await fetchMedia(params.get(video ? "video_url" : "image_url"), video);
    if (takeFail("reject_media")) return graphErr(res, 400, 9004, "Only photo or video can be accepted as media type.", 2207026);
    state.containers.set(cid, { type, caption: params.get("caption") || "", status: ok ? (video ? "IN_PROGRESS" : "FINISHED") : "ERROR", checks: 0 });
    return json(res, 200, { id: cid });
  }
  if (ig && edge === "media_publish" && req.method === "POST") {
    const c = state.containers.get(params.get("creation_id"));
    if (!c || c.status !== "FINISHED") return graphErr(res, 400, 9007, "Media ID is not available", 2207027);
    const media = { id: id(), caption: c.caption, timestamp: new Date().toISOString() };
    state.igMedia.push(media);
    c.status = "PUBLISHED";
    c.mediaId = media.id;
    if (takeFail("timeout_after_create")) return;
    return json(res, 200, { id: media.id });
  }
  if (ig && edge === "media") return json(res, 200, { data: [...state.igMedia].reverse().map((x) => ({ ...x, permalink: `https://mock.social.invalid/ig/${x.id}` })) });
  if (ig && edge === "content_publishing_limit") return json(res, 200, { data: [{ quota_usage: state.igMedia.length, config: { quota_total: 100, quota_duration: 86400 } }] });
  if (ig && !edge) return json(res, 200, { id: obj, username: "biuro.testowe.symulator" });
  if (page && !edge) return json(res, 200, { id: obj, name: "Biuro Testowe (symulator)" });

  if (!edge && state.containers.has(obj)) {
    const c = state.containers.get(obj);
    c.checks++;
    if (c.status === "IN_PROGRESS" && c.checks >= 2) c.status = "FINISHED";
    return json(res, 200, { id: obj, status_code: c.status, status: c.status === "ERROR" ? "Error: media could not be fetched from URI" : c.status });
  }
  if (!edge && state.videos.has(obj)) {
    const v = state.videos.get(obj);
    v.checks++;
    const ready = v.checks >= 2;
    if (ready && !state.fbPosts.find((x) => x.id === v.post_id)) state.fbPosts.push({ id: v.post_id, message: v.description, created_time: new Date().toISOString() });
    return json(res, 200, { id: obj, status: { video_status: ready ? "ready" : "processing", publishing_phase: { status: ready ? "complete" : "not_started" } }, ...(ready ? { post_id: v.post_id, permalink_url: `https://mock.social.invalid/fb-video/${obj}` } : {}) });
  }
  if (!edge && state.igMedia.find((x) => x.id === obj)) return json(res, 200, { id: obj, permalink: `https://mock.social.invalid/ig/${obj}` });
  if (!edge && state.fbPosts.find((x) => x.id === obj)) return json(res, 200, { id: obj, permalink_url: `https://mock.social.invalid/fb/${obj}` });
  return graphErr(res, 404, 803, `Unknown object ${obj}`);
}

async function linkedin(req, res, url, path) {
  const liErr = (status, message, code) => json(res, status, { status, message, code: code || "ERROR", serviceErrorCode: 100 });
  if (path === "/oauth/v2/authorization") {
    const q = url.searchParams;
    const target = new URL(q.get("redirect_uri"));
    target.searchParams.set("code", "MOCK_LI_CODE");
    target.searchParams.set("state", q.get("state"));
    return consentPage(res, "LinkedIn (symulator): Zezwól aplikacji", target.toString());
  }
  if (path === "/oauth/v2/accessToken") {
    const p = new URLSearchParams((await readBody(req)).toString());
    if (p.get("grant_type") === "authorization_code" && p.get("code") !== "MOCK_LI_CODE") return json(res, 400, { error: "invalid_grant" });
    return json(res, 200, { access_token: "MOCK_LI_TOKEN", expires_in: 5184000, scope: "openid,profile,w_member_social" });
  }
  if (path.startsWith("/upload/") && req.method === "PUT") {
    const urn = `urn:li:image:${path.split("/").pop()}`;
    const body = await readBody(req);
    if (!state.liImages.has(urn) || body.length === 0) return liErr(400, "bad upload");
    state.liImages.get(urn).uploaded = body.length;
    res.writeHead(201);
    return res.end();
  }
  const auth = req.headers.authorization || "";
  if (auth !== "Bearer MOCK_LI_TOKEN") return liErr(401, "Invalid access token", "INVALID_ACCESS_TOKEN");
  if (takeFail("token_expired")) return liErr(401, "The token used in the request has expired", "EXPIRED_ACCESS_TOKEN");
  if (takeFail("rate_limited")) return liErr(429, "Too many requests", "TOO_MANY_REQUESTS");
  if (takeFail("server_error")) return liErr(503, "Service unavailable");
  if (path === "/v2/userinfo") return json(res, 200, { sub: "mockMember123", name: "Jan Testowy (symulator)" });
  if (path.startsWith("/rest/") && req.headers["linkedin-version"] !== "202609") return liErr(426, "LinkedIn-Version header required");
  if (path === "/rest/images" && url.searchParams.get("action") === "initializeUpload") {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    if (!body.initializeUploadRequest?.owner) return liErr(422, "owner required");
    const n = id();
    state.liImages.set(`urn:li:image:${n}`, { uploaded: 0 });
    return json(res, 200, { value: { uploadUrl: `${BASE}/linkedin/upload/${n}`, image: `urn:li:image:${n}`, uploadUrlExpiresAt: Date.now() + 3600000 } });
  }
  if (path === "/rest/posts" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    const imgs = body.content?.media ? [body.content.media.id] : (body.content?.multiImage?.images || []).map((x) => x.id);
    if (imgs.some((u) => !state.liImages.get(u)?.uploaded)) return liErr(422, "Image asset not uploaded");
    if (!body.author || body.lifecycleState !== "PUBLISHED") return liErr(422, "invalid post");
    const urn = `urn:li:share:${id()}`;
    state.liPosts.push({ id: urn, author: body.author, commentary: body.commentary, createdAt: Date.now(), images: imgs.length });
    if (takeFail("timeout_after_create")) return;
    res.writeHead(201, { "x-restli-id": urn });
    return res.end();
  }
  if (path === "/rest/posts" && req.method === "GET") return json(res, 200, { elements: state.liPosts.filter((p) => p.author === url.searchParams.get("author")).reverse() });
  if (path === "/rest/organizationalEntityShareStatistics" && req.method === "GET") {
    const ids = decodeURIComponent(url.search).match(/urn:li:(?:share|ugcPost):[A-Za-z0-9]+/g) ?? [];
    return json(res, 200, { elements: ids.map((id) => { const n = fakeNumber(id); return { share: id, totalShareStatistics: { impressionCount: 400 + n, uniqueImpressionsCount: 250 + Math.round(n / 2), clickCount: 10 + (n % 25), likeCount: 12 + (n % 15), commentCount: n % 5, shareCount: n % 3, engagement: 0.04 } }; }) });
  }
  return liErr(404, "not found");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, BASE);
    const path = url.pathname;
    if (path === "/__control" && req.method === "POST") {
      const b = JSON.parse((await readBody(req)).toString() || "{}");
      state.fail = b.fail || null;
      state.failTimes = b.times ?? 1;
      return json(res, 200, { ok: true });
    }
    if (path === "/__seed" && req.method === "POST") {
      const b = JSON.parse((await readBody(req)).toString() || "{}");
      for (const id of b.fbPosts ?? []) state.fbPosts.push({ id, message: "seed", created_time: new Date().toISOString(), attached: 0 });
      for (const id of b.igMedia ?? []) state.igMedia.push({ id, caption: "seed" });
      return json(res, 200, { ok: true });
    }
    if (path === "/__reset" && req.method === "POST") {
      reset();
      return json(res, 200, { ok: true });
    }
    if (path === "/__state") return json(res, 200, { fbPosts: state.fbPosts, igMedia: state.igMedia, liPosts: state.liPosts, fetched: state.fetched, calls: state.calls.slice(-200) });
    if (path.startsWith("/meta")) return await meta(req, res, url, path.slice(5));
    if (path.startsWith("/linkedin")) return await linkedin(req, res, url, path.slice(9));
    json(res, 404, { error: "unknown" });
  } catch (e) {
    json(res, 500, { error: String(e) });
  }
});
server.listen(PORT, "127.0.0.1", () => console.log(`[social-mock] CONTRACT MOCK listening on ${BASE} (not a real platform)`));
