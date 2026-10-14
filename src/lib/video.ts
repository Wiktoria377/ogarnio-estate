import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { BrandKit } from "@/core/brand/model";
import { fontById, nearestWeight } from "@/core/brand/fonts";
import { briefInstructions, type StoredBrief } from "@/core/marketing-engine/director";
import type { FactSheet } from "@/core/marketing-engine/facts";
import type { Goal } from "@/core/marketing-engine/taxonomy";
import { generateVideoScript } from "@/core/marketing-engine/video-script";
import { PHOTO_SCENES, VIDEO_STYLES, videoDesignSchema, type VideoDesign, type VideoLength } from "@/core/video/model";
import { reelPropsFrom, type ReelEnv } from "@/core/video/props";
import { timeline } from "@/remotion/timeline";
import type { ReelProps, ReelStyle } from "@/remotion/types";
import { createEngine, loadBrandKit } from "@/lib/ai";
import { addVersion } from "@/lib/content";
import { AppError } from "@/lib/errors";
import { pickPhotos, rankPropertyPhotos } from "@/lib/photos";
import { getStorage } from "@/lib/storage";
import type { WorkspaceContext } from "@/lib/session";
import type { CampaignStyle, PropertyRow } from "@/lib/supabase/database.types";
import { formatArea, formatPrice, plural } from "@/lib/utils";
import { floorLabel, propertyFactSheet } from "@/verticals/real-estate/property";

export interface VideoPhoto {
  id: string;
  storage_path: string;
  caption: string | null;
  is_visualization: boolean;
}

/** Campaign style → video style. */
export function videoStyleFor(style: CampaignStyle, brandStyle: BrandKit["style"]): ReelStyle {
  if (style === "premium") return "cinematic";
  if (style === "energetic") return "energetic";
  if (style === "expert") return "modern";
  if (style === "direct") return "minimal";
  if (style === "warm") return "editorial";
  return brandStyle === "luxury" ? "cinematic" : brandStyle === "modern_minimal" ? "minimal" : brandStyle === "bold_contemporary" ? "energetic" : brandStyle === "warm_lifestyle" ? "editorial" : "modern";
}

export async function loadVideoProperty(ctx: WorkspaceContext, propertyId: string) {
  const { data: property } = await ctx.supabase.from("properties").select("*").eq("id", propertyId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!property) throw new AppError("Nie znaleziono nieruchomości tego wideo.", "not_found", 404);
  const { data: photos } = await ctx.supabase.from("property_photos").select("id, storage_path, caption, is_visualization").eq("property_id", propertyId).eq("workspace_id", ctx.workspace.id).order("position");
  return { property, photos: (photos ?? []) as VideoPhoto[] };
}

/** Facts drawn on the parameters scene: always from the record. */
export function reelFacts(p: PropertyRow) {
  return {
    price: p.price != null ? `${formatPrice(p.price, p.currency)}${p.transaction_type === "rent" ? " / mies." : ""}` : "",
    params: [p.area_m2 != null ? formatArea(p.area_m2) : null, p.rooms != null ? `${p.rooms} ${plural(p.rooms, ["pokój", "pokoje", "pokoi"])}` : null, floorLabel(p.floor, p.total_floors)].filter((x): x is string => !!x),
    location: [p.district, p.city].filter(Boolean).join(" · "),
  };
}

/** Runs the AI script step and merges it into the design (texts only; photos and order stay). */
export async function writeScript(ctx: WorkspaceContext, design: VideoDesign, o: { property: PropertyRow; photos: VideoPhoto[]; facts?: FactSheet; goal?: Goal; instructions?: string; brand?: BrandKit }): Promise<VideoDesign> {
  const brand = o.brand ?? (await loadBrandKit(ctx));
  const engine = await createEngine(ctx, brand);
  const facts = o.facts ?? propertyFactSheet(o.property, o.photos);
  const index = new Map(o.photos.map((p, i) => [p.id, i]));
  const script = await generateVideoScript(engine, {
    facts,
    styleLabel: VIDEO_STYLES[design.style].label,
    lengthSec: design.length,
    goal: o.goal ?? "sales",
    scenes: design.scenes.map((s) => {
      const p = o.photos.find((x) => x.id === s.photoId);
      return { photoIndex: index.get(s.photoId) ?? 0, caption: p?.caption ?? null, isVisualization: !!p?.is_visualization };
    }),
    instructions: o.instructions ?? "",
  });
  return videoDesignSchema.parse({
    ...design,
    hook: script.hook,
    scenes: design.scenes.map((s, i) => ({ ...s, headline: script.scenes[i]?.headline ?? s.headline, subline: script.scenes[i]?.subline ?? s.subline })),
    cta: script.cta,
    caption: script.caption,
    gaps: script.gaps,
    warnings: script.warnings.slice(0, 20).map((w) => w.slice(0, 300)),
    scriptApproved: false,
    scriptSource: "ai",
  });
}

/** Initial design: best photos (sharpness, exposure, real photos before visualizations). */
export async function initialVideoDesign(ctx: WorkspaceContext, o: { propertyId: string; style: ReelStyle; length: VideoLength; photoIds?: string[] }): Promise<VideoDesign> {
  const n = PHOTO_SCENES[o.length];
  let ids = (o.photoIds ?? []).slice(0, n);
  if (ids.length < n) {
    const ranked = await rankPropertyPhotos(ctx, o.propertyId);
    if (!ranked.length) throw new AppError("Wideo powstaje ze zdjęć oferty. Dodaj co najmniej jedno zdjęcie w karcie nieruchomości.", "no_photos", 422);
    const best = pickPhotos(ranked, Math.max(n, ranked.length));
    for (const id of best) if (ids.length < n && !ids.includes(id)) ids.push(id);
    for (let i = 0; ids.length < n; i++) ids.push(best[i % best.length]!);
  }
  const motions = VIDEO_STYLES[o.style].motions;
  return videoDesignSchema.parse({ propertyId: o.propertyId, style: o.style, length: o.length, scenes: ids.map((photoId, i) => ({ photoId, motion: motions[i % motions.length] })) });
}

/** Campaign deliverable: draft with an AI script built from the campaign brief, waiting for approval. */
export async function createReelDraft(
  ctx: WorkspaceContext,
  a: { itemId: string; property: PropertyRow; facts: FactSheet; brief: StoredBrief; campaignStyle: CampaignStyle; goal: Goal; progress: (n: number) => Promise<void> },
): Promise<{ warnings: string[] }> {
  const brand = await loadBrandKit(ctx);
  const { photos } = await loadVideoProperty(ctx, a.property.id);
  const base = await initialVideoDesign(ctx, { propertyId: a.property.id, style: videoStyleFor(a.campaignStyle, brand.style), length: 15 });
  await a.progress(30);
  const design = await writeScript(ctx, base, { property: a.property, photos, facts: a.facts, goal: a.goal, instructions: briefInstructions(a.brief, "reel"), brand });
  await addVersion(ctx, a.itemId, design as unknown as Record<string, unknown>, "ai_generate", { operation: "Scenariusz z kampanii" });
  await a.progress(95);
  return { warnings: ["Scenariusz czeka na zatwierdzenie. Po akceptacji wyrenderuj MP4 w Video Studio.", ...design.warnings] };
}

function fontRef(id: string, weight: number) {
  const def = fontById(id);
  const w = nearestWeight(def, weight);
  return { file: `${def.id}-${w}.ttf`, family: `Brand ${def.family} ${w}` };
}

/**
 * Reel environment for the browser preview (Player): same-origin URLs for
 * photos, fonts, logo and the office's rights-confirmed music.
 */
export async function reelEnvForPlayer(ctx: WorkspaceContext, propertyId: string): Promise<ReelEnv> {
  const brand = await loadBrandKit(ctx);
  const { property, photos } = await loadVideoProperty(ctx, propertyId);
  const { data: music } = await ctx.supabase.from("media_assets").select("id, storage_path").eq("workspace_id", ctx.workspace.id).eq("kind", "audio");
  const hl = fontRef(brand.headingFont, 500);
  const hs = fontRef(brand.headingFont, 600);
  const b = fontRef(brand.bodyFont, 600);
  return {
    colors: brand.colors,
    heading: { light: { family: hl.family, src: `/api/fonts/${hl.file}` }, strong: { family: hs.family, src: `/api/fonts/${hs.file}` } },
    body: { family: b.family, src: `/api/fonts/${b.file}` },
    company: brand.companyName,
    contact: [brand.contact.phone, brand.contact.email, brand.contact.website].filter((x): x is string => !!x),
    facts: reelFactsFull(property),
    photos: Object.fromEntries(photos.map((p) => [p.id, { src: `/api/files/${p.storage_path}`, isVisualization: p.is_visualization }])),
    logo: brand.logoKey && (await getStorage(ctx.supabase).get(brand.logoKey).then(() => true, () => false)) ? `/api/files/${brand.logoKey}` : null,
    music: Object.fromEntries((music ?? []).map((m) => [m.id, `/api/files/${m.storage_path}`])),
  };
}

function reelFactsFull(p: PropertyRow): ReelEnv["facts"] {
  const f = reelFacts(p);
  return { ...f, priceValue: p.price };
}

/**
 * Props for the server render: assets are written to `dir` and referenced as
 * __BASE__/… (served to the headless browser on 127.0.0.1 by the render script).
 */
export async function buildRenderProps(ctx: WorkspaceContext, design: VideoDesign, dir: string): Promise<ReelProps> {
  const brand = await loadBrandKit(ctx);
  const { property, photos } = await loadVideoProperty(ctx, design.propertyId);
  const storage = getStorage(ctx.supabase);
  const byId = new Map(photos.map((p) => [p.id, p]));
  if (design.scenes.some((s) => !byId.has(s.photoId))) throw new AppError("Część zdjęć z tego wideo została usunięta z oferty. Wybierz inne zdjęcia w edytorze.", "photo_missing", 409);

  const fontDir = path.join(process.cwd(), "assets", "fonts");
  const light = design.style === "cinematic" || design.style === "minimal";
  const heading = fontRef(brand.headingFont, light ? 500 : 600);
  const body = fontRef(brand.bodyFont, 600);
  await writeFile(path.join(dir, "heading.ttf"), await readFile(path.join(fontDir, heading.file)));
  await writeFile(path.join(dir, "body.ttf"), await readFile(path.join(fontDir, body.file)));
  const headingRef = { family: heading.family, src: "__BASE__/heading.ttf" };

  const envPhotos: ReelEnv["photos"] = {};
  let n = 0;
  for (const id of new Set(design.scenes.map((s) => s.photoId))) {
    const p = byId.get(id)!;
    const name = `p${n++}.jpg`;
    // Headroom for camera moves; the crop follows the most salient area. No retouching.
    const jpg = await sharp(await storage.get(p.storage_path)).rotate().resize(1296, 2304, { fit: "cover", position: "attention" }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    await writeFile(path.join(dir, name), jpg);
    envPhotos[id] = { src: `__BASE__/${name}`, isVisualization: p.is_visualization };
  }
  let logo: string | null = null;
  if (brand.logoKey) {
    const data = await storage.get(brand.logoKey).catch(() => null);
    if (data) {
      await writeFile(path.join(dir, "logo.png"), await sharp(data).resize(1040, 340, { fit: "inside", withoutEnlargement: true }).png().toBuffer());
      logo = "__BASE__/logo.png";
    }
  }
  const music: ReelEnv["music"] = {};
  if (design.musicAssetId) {
    const { data: m } = await ctx.supabase.from("media_assets").select("storage_path, rights_confirmed_at").eq("id", design.musicAssetId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!m) throw new AppError("Wybrana muzyka została usunięta. Wybierz inny utwór lub wyłącz muzykę.", "music_missing", 409);
    const ext = path.extname(m.storage_path).toLowerCase();
    await writeFile(path.join(dir, `music${ext}`), await storage.get(m.storage_path));
    music[design.musicAssetId] = `__BASE__/music${ext}`;
  }
  return reelPropsFrom(design, {
    colors: brand.colors,
    heading: { light: headingRef, strong: headingRef },
    body: { family: body.family, src: "__BASE__/body.ttf" },
    company: brand.companyName,
    contact: [brand.contact.phone, brand.contact.email, brand.contact.website].filter((x): x is string => !!x),
    facts: reelFactsFull(property),
    photos: envPhotos,
    logo,
    music,
  });
}

/** Sanity check used in tests and by the editor: scene timing for a design. */
export function designTimeline(design: VideoDesign) {
  return timeline(design.length, design.scenes.length, design.showPrice || design.showParams);
}

export interface RenderOutcome {
  mp4: Buffer;
  poster: Buffer;
  durationMs: number;
}

/** Renders in a child process (scripts/render-video.mjs) and reports progress 0..1. */
export async function renderReelFiles(ctx: WorkspaceContext, design: VideoDesign, onProgress: (p: number) => Promise<void> | void, signal?: AbortSignal): Promise<RenderOutcome> {
  const dir = await mkdtemp(path.join(tmpdir(), "reel-"));
  try {
    const props = await buildRenderProps(ctx, design, dir);
    await writeFile(path.join(dir, "props.json"), JSON.stringify(props));
    // Allow-listed environment only: the renderer never sees server secrets.
    const pass = ["PATH", "HOME", "TMPDIR", "LANG", "NODE_ENV", "REMOTION_CONCURRENCY", "REMOTION_LICENSE_KEY", "FONTCONFIG_PATH", "XDG_CACHE_HOME"];
    const env = Object.fromEntries(pass.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]])) as NodeJS.ProcessEnv;
    env.REMOTION_BROWSER_EXECUTABLE = process.env.REMOTION_BROWSER_EXECUTABLE ?? "";
    const result = await new Promise<{ mp4: string; poster: string; durationMs: number }>((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(process.cwd(), "scripts", "render-video.mjs"), dir], { env, stdio: ["ignore", "pipe", "pipe"] });
      let done: { mp4: string; poster: string; durationMs: number } | null = null;
      let error = "";
      let buf = "";
      let last = 0;
      const timer = setTimeout(() => child.kill("SIGKILL"), 15 * 60_000);
      signal?.addEventListener("abort", () => child.kill("SIGKILL"));
      child.stdout.on("data", (chunk: Buffer) => {
        buf += chunk.toString();
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          try {
            const msg = JSON.parse(line) as { type: string; value?: number; message?: string; mp4?: string; poster?: string; durationMs?: number };
            if (msg.type === "progress" && typeof msg.value === "number" && msg.value - last >= 0.05) {
              last = msg.value;
              void onProgress(msg.value);
            } else if (msg.type === "done") done = { mp4: msg.mp4!, poster: msg.poster!, durationMs: msg.durationMs! };
            else if (msg.type === "error") error = msg.message ?? "";
          } catch {
            /* non-JSON output from libraries is ignored */
          }
        }
      });
      child.stderr.on("data", (c: Buffer) => {
        if (error.length < 2000) error += c.toString().slice(0, 500);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 && done) resolve(done);
        else reject(new Error(error.trim() || `render exited with code ${code}`));
      });
    });
    return { mp4: await readFile(result.mp4), poster: await readFile(result.poster), durationMs: result.durationMs };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function renderKeys(workspaceId: string, itemId: string) {
  const id = randomUUID();
  return { mp4: `${workspaceId}/renders/${itemId}/${id}.mp4`, poster: `${workspaceId}/renders/${itemId}/${id}.jpg` };
}
