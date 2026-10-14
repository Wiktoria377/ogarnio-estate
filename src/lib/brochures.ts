import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { BrandKit } from "@/core/brand/model";
import type { StoredBrief } from "@/core/marketing-engine/director";
import { brochureDesignSchema, type BrochureDesign, type BrochureVariant } from "@/core/brochures/model";
import { renderBrochure, type BrochureProperty } from "@/core/brochures/render";
import { todayWarsaw } from "@/core/planner/time";
import { loadBrandKit } from "@/lib/ai";
import { addVersion } from "@/lib/content";
import { AppError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import type { WorkspaceContext } from "@/lib/session";
import type { CampaignGoal, PropertyRow } from "@/lib/supabase/database.types";

const run = promisify(execFile);
const asOf = () => todayWarsaw().split("-").reverse().join(".");

/** Default editable fields for a new brochure (agent contact from Brand Studio). */
export function brochureDefaults(variant: BrochureVariant, properties: PropertyRow[], brand: BrandKit): BrochureDesign {
  const first = properties[0]!;
  return brochureDesignSchema.parse({
    variant,
    propertyIds: properties.map((p) => p.id),
    title: variant === "catalog" ? "" : first.title,
    intro: variant === "catalog" ? "" : (first.description ?? ""),
    highlights: variant === "catalog" ? [] : [...first.features, ...first.amenities].slice(0, 6),
    nextSteps: variant === "presentation" ? ["Prezentacja nieruchomości na miejscu", "Odpowiedzi na pytania i dokumenty", "Ustalenie dalszych kroków"] : [],
    agent: { name: "", phone: brand.contact.phone ?? "", email: brand.contact.email ?? "" },
  });
}

/** Loads the CURRENT property records and selected photos (this workspace only). */
export async function loadBrochureInput(ctx: WorkspaceContext, design: BrochureDesign, brand?: BrandKit) {
  const kit = brand ?? (await loadBrandKit(ctx));
  const { data: rows } = await ctx.supabase.from("properties").select("*").in("id", design.propertyIds).eq("workspace_id", ctx.workspace.id);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const missing = design.propertyIds.filter((id) => !byId.has(id));
  if (missing.length === design.propertyIds.length) throw new AppError("Nieruchomości z tej broszury zostały usunięte.", "not_found", 404);
  const { data: photoRows } = await ctx.supabase.from("property_photos").select("id, property_id, storage_path, is_visualization, caption, position").in("property_id", [...byId.keys()]).eq("workspace_id", ctx.workspace.id).order("position");
  const storage = getStorage(ctx.supabase);
  const properties: BrochureProperty[] = [];
  for (const id of design.propertyIds) {
    const row = byId.get(id);
    if (!row) continue;
    const all = (photoRows ?? []).filter((p) => p.property_id === id);
    const chosen = design.photoIds[id]?.length ? design.photoIds[id]!.map((pid) => all.find((p) => p.id === pid)).filter((p): p is NonNullable<typeof p> => !!p) : all;
    const photos = (
      await Promise.all(
        chosen.slice(0, design.variant === "catalog" ? 1 : 12).map(async (p) => {
          try {
            return { id: p.id, data: await storage.get(p.storage_path), isVisualization: p.is_visualization, caption: p.caption };
          } catch {
            return null;
          }
        }),
      )
    ).filter((x): x is NonNullable<typeof x> => !!x);
    properties.push({ row, photos });
  }
  const logo = kit.logoKey ? await storage.get(kit.logoKey).catch(() => null) : null;
  return { input: { design, brand: kit, logo, properties, asOf: asOf() }, missing };
}

export async function renderBrochureFor(ctx: WorkspaceContext, design: BrochureDesign, title: string) {
  const { input, missing } = await loadBrochureInput(ctx, design);
  const r = await renderBrochure(input, title);
  if (missing.length) r.warnings.unshift(`${missing.length} z wybranych nieruchomości zostało usuniętych i pominiętych.`);
  return r;
}

/**
 * PDF pages → PNG previews with poppler's pdftoppm. Returns null when the tool
 * is not installed (the editor then shows the PDF itself in an iframe).
 */
export async function pdfToPngs(pdf: Buffer, o: { dpi?: number; first?: number; last?: number } = {}): Promise<Buffer[] | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "brochure-"));
  try {
    const src = path.join(dir, "in.pdf");
    await writeFile(src, pdf);
    const args = ["-png", "-r", String(o.dpi ?? 60)];
    if (o.first) args.push("-f", String(o.first));
    if (o.last) args.push("-l", String(o.last));
    await run("pdftoppm", [...args, src, path.join(dir, "p")], { timeout: 30_000 });
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(dir)).filter((f) => f.startsWith("p") && f.endsWith(".png")).sort((a, b) => Number(a.match(/(\d+)\.png$/)?.[1]) - Number(b.match(/(\d+)\.png$/)?.[1]));
    return await Promise.all(files.map((f) => readFile(path.join(dir, f))));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Campaign deliverable: a brochure draft built from the brief (fact-checked) and the record. */
export async function createBrochureDraft(
  ctx: WorkspaceContext,
  a: { itemId: string; property: PropertyRow; brief: StoredBrief; campaignGoal: CampaignGoal; progress: (n: number) => Promise<void> },
): Promise<{ warnings: string[] }> {
  const brand = await loadBrandKit(ctx);
  const variant: BrochureVariant = a.campaignGoal === "premium" ? "premium" : "card";
  const base = brochureDefaults(variant, [a.property], brand);
  const points = a.brief.selling_points.map((s) => s.point.trim()).filter((s) => s && s.length <= 110);
  const design: BrochureDesign = {
    ...base,
    subtitle: a.brief.key_message.slice(0, 220),
    highlights: points.length >= 2 ? points.slice(0, 6) : base.highlights,
  };
  await a.progress(50);
  // Render once to surface layout warnings (missing photos, shortened text) on the job.
  const r = await renderBrochureFor(ctx, design, a.property.title);
  await addVersion(ctx, a.itemId, design as unknown as Record<string, unknown>, "ai_generate", { operation: "Broszura z kampanii" });
  await a.progress(95);
  return { warnings: r.warnings };
}
