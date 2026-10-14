import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { profileSnapshotSchema, type ProfileSnapshot } from "@/core/brand/profile";
import { analyzeCss, analyzeStyleAttrs, emptySignals } from "@/core/brand-intel/css";
import { extractPage, pickSubpages, type PageExtract } from "@/core/brand-intel/html";
import { detectFonts, parseRobots, proposePalette, robotsAllows, rgbToHsl, type PhotoStats, type RobotsRules } from "@/core/brand-intel/signals";
import { assembleProposal, BRAND_ANALYSIS_VERSION, brandTraitsSchema, traitsPrompt, type BrandTraits } from "@/core/brand-intel/traits";
import { buildSystemPrompt } from "@/core/marketing-engine/prompt";
import { createEngine, guardAiQuota } from "@/lib/ai";
import { serverEnv } from "@/lib/env";
import { logError } from "@/lib/observability";
import { safeFetch, SafeFetchError } from "@/lib/net/safe-fetch";
import { processUpload } from "@/lib/storage/images";
import { getStorage } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { JobFailure, type JobHandler } from "@/lib/jobs/types";

/** Our crawler identity: robots.txt groups for "OgarnioEstateBot" (or "*") are honoured. */
export const BRAND_BOT = "OgarnioEstateBot";
export function botUserAgent() {
  // HTTP headers must be ASCII (no Polish diacritics here).
  return `${BRAND_BOT}/1.0 (+${serverEnv().NEXT_PUBLIC_SITE_URL}/bot; brand profile analysis requested by the site owner)`;
}

const LIMITS = { pages: 5, stylesheets: 6, cssBytes: 600_000, htmlBytes: 2_500_000, images: 6, imageBytes: 3_000_000, totalMs: 60_000 };

export interface PageLog {
  url: string;
  kind: "robots" | "page" | "css" | "image" | "logo";
  status: number | null;
  ok: boolean;
  note?: string;
}

class Crawl {
  readonly log: PageLog[] = [];
  readonly deadline = Date.now() + LIMITS.totalMs;
  robots: RobotsRules | null = null;
  constructor(readonly origin: string) {}

  allowed(url: string) {
    const u = new URL(url);
    return !this.robots || robotsAllows(this.robots, BRAND_BOT, `${u.pathname}${u.search}`);
  }

  async get(url: string, kind: PageLog["kind"], accept: string[], maxBytes: number) {
    if (Date.now() > this.deadline) {
      this.log.push({ url, kind, status: null, ok: false, note: "Przekroczony łączny czas analizy" });
      return null;
    }
    if (kind !== "robots" && !this.allowed(url)) {
      this.log.push({ url, kind, status: null, ok: false, note: "Zablokowane przez robots.txt (pominięte)" });
      return null;
    }
    try {
      const res = await safeFetch(url, { accept, maxBytes, timeoutMs: Math.min(12_000, this.deadline - Date.now()), userAgent: botUserAgent(), maxRedirects: 3 });
      const ok = res.status >= 200 && res.status < 300;
      // 401/403 mean the owner restricts access: we stop there, no attempt to get around it.
      const note = res.status === 401 || res.status === 403 ? "Dostęp ograniczony przez serwer (nie próbujemy go obejść)" : ok ? undefined : `HTTP ${res.status}`;
      this.log.push({ url: res.url, kind, status: res.status, ok, note });
      return ok ? res : null;
    } catch (error) {
      if (!(error instanceof SafeFetchError)) console.warn("[brand-analysis] fetch error", url, error);
      this.log.push({ url, kind, status: null, ok: false, note: error instanceof SafeFetchError ? error.message : "Błąd pobierania" });
      if (error instanceof SafeFetchError && ["blocked_ip", "blocked_host", "bad_scheme", "bad_port", "url_credentials", "bad_url"].includes(error.code) && kind === "page" && this.log.filter((l) => l.kind === "page").length === 1) throw error;
      return null;
    }
  }
}

function decode(body: Buffer, contentType: string) {
  const m = /charset=([\w-]+)/i.exec(contentType);
  const charset = (m?.[1] ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset === "utf8" ? "utf-8" : charset).decode(body);
  } catch {
    return body.toString("utf8");
  }
}

async function photoStats(buffers: Buffer[]): Promise<PhotoStats | null> {
  const rows: { b: number; s: number; w: number; c: number }[] = [];
  for (const buf of buffers) {
    try {
      const img = sharp(buf, { limitInputPixels: 40_000_000 }).resize(160, 160, { fit: "inside" }).removeAlpha();
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      if (info.width < 40 || info.height < 40) continue;
      let sumL = 0, sumS = 0, sumW = 0, sumL2 = 0;
      const n = info.width * info.height;
      for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        const [, s, l] = rgbToHsl([r, g, b]);
        sumL += l;
        sumL2 += l * l;
        sumS += s;
        sumW += (r - b) / 255;
      }
      const mean = sumL / n;
      rows.push({ b: mean, s: sumS / n, w: sumW / n, c: Math.sqrt(Math.max(0, sumL2 / n - mean * mean)) });
    } catch {
      /* not an image we can read: skipped */
    }
  }
  if (!rows.length) return null;
  const avg = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  return { count: rows.length, brightness: avg("b"), saturation: avg("s"), warmth: avg("w"), contrast: avg("c") };
}

/** Content photos: large images outside the header, not icons or logos. */
function contentImages(pages: PageExtract[]): string[] {
  const seen = new Set<string>();
  return pages
    .flatMap((p) => p.images)
    .filter((i) => !i.inHeader && !/logo|icon|sprite|avatar|flag|badge|\.svg(\?|$)/.test(`${i.hint} ${i.src}`) && (i.width === null || i.width >= 300))
    .map((i) => i.src)
    .filter((s) => (seen.has(s) ? false : (seen.add(s), true)))
    .slice(0, LIMITS.images);
}

export interface AnalysisResult {
  version: string;
  pagesRead: number;
  palette: { hex: string; weight: number; roles: string[] }[];
  fonts: { heading: string | null; body: string | null; headingAvailable: boolean; bodyAvailable: boolean };
  ctasOnSite: string[];
  photos: PhotoStats | null;
  logo: { assetId: string | null; source: string | null };
  traits: BrandTraits | null;
  traitsModel: string | null;
  notes: string[];
  references: number;
}

/** Keeps the analysis row in step with the job: final failures are visible on the analysis too. */
export const runBrandAnalysis: JobHandler = async (run) => {
  try {
    return await analyze(run);
  } catch (error) {
    const final = error instanceof JobFailure ? !error.retryable : run.job.attempts >= run.job.max_attempts;
    const admin = createAdminClient();
    const id = String((run.job.payload as { analysisId?: string }).analysisId ?? "");
    const { data } = await admin.from("brand_analyses").select("status").eq("id", id).maybeSingle();
    if (data && data.status !== "failed") {
      await admin
        .from("brand_analyses")
        .update(final ? { status: "failed", error_code: "job_failed", error_message: (error instanceof Error ? error.message : "Analiza nie powiodła się.").slice(0, 500), finished_at: new Date().toISOString() } : { status: "queued" })
        .eq("id", id);
    }
    throw error;
  }
};

const analyze: JobHandler = async ({ job, ctx, progress }) => {
  const admin = createAdminClient();
  const analysisId = String((job.payload as { analysisId?: string }).analysisId ?? "");
  const { data: a } = await admin.from("brand_analyses").select("*").eq("id", analysisId).eq("workspace_id", job.workspace_id).maybeSingle();
  if (!a) throw new JobFailure("Nie znaleziono analizy.", "not_found");
  await admin.from("brand_analyses").update({ status: "running" }).eq("id", a.id);
  const fail = async (message: string, code: string, pages: PageLog[]) => {
    await admin.from("brand_analyses").update({ status: "failed", error_code: code, error_message: message.slice(0, 500), pages: pages as unknown as Json, finished_at: new Date().toISOString() }).eq("id", a.id);
    return new JobFailure(message, code);
  };

  const start = new URL(a.url);
  const crawl = new Crawl(start.origin);
  const notes: string[] = [];

  // robots.txt: missing (4xx) = no restrictions; Disallow for our bot or "*" is respected.
  const robots = await crawl.get(`${start.origin}/robots.txt`, "robots", [], 300_000);
  if (robots) crawl.robots = parseRobots(decode(robots.body, robots.contentType));
  if (!crawl.allowed(start.toString())) throw await fail("Właściciel strony zablokował automatyczne odczytywanie tej strony w robots.txt. Uzupełnij profil ręcznie albo dodaj materiały referencyjne.", "robots_disallowed", crawl.log);

  let home;
  try {
    home = await crawl.get(start.toString(), "page", ["text/html", "application/xhtml"], LIMITS.htmlBytes);
  } catch (error) {
    throw await fail(error instanceof Error ? error.message : "Nie udało się pobrać strony.", "blocked", crawl.log);
  }
  if (!home) {
    const last = crawl.log.at(-1);
    throw await fail(last?.note ? `Nie udało się odczytać strony: ${last.note}.` : "Nie udało się odczytać strony.", "fetch_failed", crawl.log);
  }
  await progress(15);
  const pages: PageExtract[] = [extractPage(decode(home.body, home.contentType), home.url)];
  for (const sub of pickSubpages(pages[0]!, new URL(home.url).origin, LIMITS.pages - 1)) {
    const r = await crawl.get(sub, "page", ["text/html", "application/xhtml"], LIMITS.htmlBytes);
    if (r) pages.push(extractPage(decode(r.body, r.contentType), r.url));
  }
  await progress(35);

  // Stylesheets: same site only (no third-party CDNs), bounded count and size.
  const css = emptySignals();
  const origin = new URL(home.url).origin;
  const sheets = [...new Set(pages.flatMap((p) => p.stylesheets))].filter((h) => new URL(h).origin === origin).slice(0, LIMITS.stylesheets);
  for (const href of sheets) {
    const r = await crawl.get(href, "css", ["text/css", "text/plain"], LIMITS.cssBytes);
    if (r) analyzeCss(decode(r.body, r.contentType), css);
  }
  for (const p of pages) {
    for (const inline of p.inlineCss) analyzeCss(inline, css);
    analyzeStyleAttrs(p.styleAttrs, css);
  }
  const palette = proposePalette(css, pages[0]!.themeColor);
  const fonts = detectFonts(css, pages.flatMap((p) => p.googleFonts));
  await progress(50);

  // Photo style: measured on a few content images (downloaded, analysed, not stored).
  const imgs: Buffer[] = [];
  for (const src of contentImages(pages)) {
    const r = await crawl.get(src, "image", ["image/jpeg", "image/png", "image/webp"], LIMITS.imageBytes);
    if (r) imgs.push(r.body);
  }
  const photos = await photoStats(imgs);

  // Logo: the first candidate that is a real raster image becomes a reference asset (not the logo until approved).
  let logoAssetId: string | null = null;
  let logoSource: string | null = null;
  const storage = getStorage(admin as unknown as ServerSupabase);
  for (const src of pages[0]!.logoCandidates) {
    const r = await crawl.get(src, "logo", ["image/png", "image/jpeg", "image/webp"], 2_000_000);
    if (!r) continue;
    try {
      const img = await processUpload(new File([new Uint8Array(r.body)], "logo"), "logo");
      const key = `${ctx.workspace.id}/brand/${randomUUID()}.${img.ext}`;
      await storage.put(key, img.data, img.mime);
      const { data, error } = await admin
        .from("brand_assets")
        .insert({ workspace_id: ctx.workspace.id, kind: "reference", storage_path: key, mime_type: img.mime, size_bytes: img.data.length, width: img.width, height: img.height, label: "Logo ze strony www (propozycja)", created_by: ctx.userId })
        .select("id")
        .single();
      if (error || !data) {
        await storage.remove([key]).catch(() => {});
        notes.push("Nie zapisano logo ze strony (limit miejsca w planie lub błąd zapisu).");
        break;
      }
      logoAssetId = data.id;
      logoSource = `Obraz oznaczony jako logo na stronie: ${new URL(r.url).pathname}`;
      break;
    } catch {
      notes.push("Znaleziony plik logo nie jest obsługiwanym obrazem (JPG, PNG, WebP). Logo w SVG prześlij ręcznie jako PNG.");
    }
  }
  await progress(65);

  // Reference materials of the office (PDF text, sample posts, description).
  const { data: refs } = a.use_references
    ? await admin.from("brand_references").select("title, text_content").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(10)
    : { data: [] as { title: string; text_content: string }[] };
  const siteText = pages.map((p) => p.text).join("\n\n");
  const corpus = { site: siteText, references: (refs ?? []).map((r) => r.text_content).join("\n\n") };

  // Model step: tone, audiences, differentiators. Skipped (with a note) when there is no text.
  let traits: BrandTraits | null = null;
  let traitsModel: string | null = null;
  if (siteText.length + corpus.references.length >= 200) {
    await guardAiQuota(ctx);
    const engine = await createEngine(ctx);
    const res = await engine.provider.complete({
      operation: "brand_analysis",
      tier: "main",
      system: buildSystemPrompt(engine.brand.companyName, ""),
      user: traitsPrompt({
        url: home.url,
        title: pages[0]!.title,
        description: pages[0]!.description,
        headings: pages.flatMap((p) => p.headings.map((h) => h.text)),
        ctas: pages.flatMap((p) => p.ctas),
        siteText,
        references: (refs ?? []).map((r) => ({ title: r.title, text: r.text_content })),
      }),
      schema: brandTraitsSchema,
      effort: "medium",
      testHint: { kind: "brand_traits", headings: pages.flatMap((p) => p.headings.map((h) => h.text)), paragraphs: pages.flatMap((p) => p.paragraphs), ctas: pages.flatMap((p) => p.ctas), text: `${siteText}\n${corpus.references}` },
    });
    traits = res.data;
    traitsModel = res.model;
  } else notes.push("Strona zawiera za mało tekstu do analizy tonu i odbiorców.");
  await progress(85);

  const { data: current } = await admin.rpc("brand_profile_snapshot", { p_ws: ctx.workspace.id });
  const base = profileSnapshotSchema.safeParse(current);
  if (!base.success) throw await fail("Nie udało się odczytać bieżącego profilu marki.", "profile_invalid", crawl.log);
  const ctasOnSite = [...new Set(pages.flatMap((p) => p.ctas))];
  const proposal = assembleProposal({
    current: base.data as ProfileSnapshot,
    palette,
    fonts,
    logoAssetId,
    logoSource,
    traits,
    corpus,
    ctasOnSite,
    photos,
    contacts: { emails: [...new Set(pages.flatMap((p) => p.emails))], phones: [...new Set(pages.flatMap((p) => p.phones))] },
    url: home.url,
  });
  const final = profileSnapshotSchema.safeParse(proposal.snapshot);
  if (!final.success) {
    await logError("brand_analysis", new Error(`proposal_invalid: ${final.error.message}`), { workspaceId: ctx.workspace.id });
    throw await fail("Propozycja profilu nie przeszła walidacji. Spróbuj ponownie lub uzupełnij profil ręcznie.", "proposal_invalid", crawl.log);
  }

  const { data: versionId, error: vErr } = await admin.rpc("create_brand_draft", {
    p_ws: ctx.workspace.id,
    p_source: "analysis",
    p_snapshot: final.data as unknown as Json,
    p_confidence: proposal.confidence as unknown as Json,
    p_analysis: a.id,
    p_note: `Analiza ${new URL(home.url).host}`,
    p_author: ctx.userId,
  });
  if (vErr || !versionId) throw await fail("Nie udało się zapisać propozycji profilu.", "draft_failed", crawl.log);

  const result: AnalysisResult = {
    version: BRAND_ANALYSIS_VERSION,
    pagesRead: pages.length,
    palette: palette.found,
    fonts: { heading: fonts.heading.detected, body: fonts.body.detected, headingAvailable: fonts.heading.available, bodyAvailable: fonts.body.available },
    ctasOnSite: ctasOnSite.slice(0, 12),
    photos,
    logo: { assetId: logoAssetId, source: logoSource },
    traits,
    traitsModel,
    notes: [...notes, ...proposal.notes],
    references: refs?.length ?? 0,
  };
  await admin
    .from("brand_analyses")
    .update({ status: "succeeded", pages: crawl.log as unknown as Json, result: result as unknown as Json, version_id: versionId, finished_at: new Date().toISOString() })
    .eq("id", a.id);
  return { analysisId: a.id, versionId };
};
