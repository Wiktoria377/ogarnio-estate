import { FORMATS, type FormatId } from "@/core/graphics/design";

/**
 * Technical photo assessment (deterministic, from pixels and dimensions).
 * It informs the user and the composition choice; it never alters a photo and
 * never hides a defect of the property. Room categories need a vision model
 * and are not guessed here.
 */
export const PHOTO_ANALYSIS_VERSION = "photo-1.0.0";

export interface PhotoMeasurements {
  width: number;
  height: number;
  /** Mean luminance 0–1. */
  brightness: number;
  /** Standard deviation of luminance 0–1 (global contrast). */
  contrast: number;
  /** Edge energy 0–1 (Laplacian), higher = sharper. */
  sharpness: number;
  /** Up to 4 dominant colours (hex), most frequent first. */
  colors: string[];
  /** Salient point (0–1) found by the attention strategy, null if unknown. */
  focus: { x: number; y: number } | null;
}

export type Severity = "info" | "warning" | "problem";
export interface PhotoIssue {
  code: "low_resolution" | "very_low_resolution" | "dark" | "overexposed" | "low_contrast" | "blurry" | "extreme_ratio" | "crop_risk";
  severity: Severity;
  message: string;
}

export interface PhotoReport {
  version: string;
  width: number;
  height: number;
  megapixels: number;
  ratio: number;
  orientation: "landscape" | "portrait" | "square";
  brightness: number;
  contrast: number;
  sharpness: number;
  colors: string[];
  focus: { x: number; y: number } | null;
  /** Share of the photo kept when cover-cropped to each format (1 = whole photo). */
  crop: Record<FormatId, { kept: number; risk: "low" | "medium" | "high" }>;
  issues: PhotoIssue[];
  /** 0–100 technical score (not an aesthetic judgement). */
  score: number;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Share of the image area kept when cover-cropping a w×h photo into a box of the given aspect. */
export function keptShare(w: number, h: number, boxAspect: number): number {
  const a = w / h;
  return a > boxAspect ? boxAspect / a : a / boxAspect;
}

export function assessPhoto(m: PhotoMeasurements): PhotoReport {
  const ratio = m.width / Math.max(1, m.height);
  const orientation = ratio > 1.05 ? "landscape" : ratio < 0.95 ? "portrait" : "square";
  const issues: PhotoIssue[] = [];
  const long = Math.max(m.width, m.height);
  if (long < 800) issues.push({ code: "very_low_resolution", severity: "problem", message: `Bardzo mała rozdzielczość (${m.width}×${m.height}): na grafice 1080 px będzie nieostre.` });
  else if (long < 1600) issues.push({ code: "low_resolution", severity: "warning", message: `Rozdzielczość ${m.width}×${m.height}: wystarczy na post, może być za mała na pełnoekranowe Stories.` });
  if (m.brightness < 0.28) issues.push({ code: "dark", severity: "warning", message: "Zdjęcie jest ciemne. Lepiej użyć ujęcia z dziennym światłem." });
  if (m.brightness > 0.85) issues.push({ code: "overexposed", severity: "warning", message: "Zdjęcie jest prześwietlone: jasne partie mogą tracić szczegóły." });
  if (m.contrast < 0.12) issues.push({ code: "low_contrast", severity: "info", message: "Niski kontrast: zdjęcie może wyglądać płasko obok tekstu." });
  if (m.sharpness < 0.18) issues.push({ code: "blurry", severity: "warning", message: "Mało ostrych krawędzi: zdjęcie może być poruszone lub nieostre." });
  if (ratio > 2.2 || ratio < 0.45) issues.push({ code: "extreme_ratio", severity: "warning", message: "Nietypowe proporcje (np. panorama): w każdym formacie zostanie mocno przycięte." });

  const crop = {} as PhotoReport["crop"];
  for (const [id, f] of Object.entries(FORMATS) as [FormatId, (typeof FORMATS)[FormatId]][]) {
    const kept = keptShare(m.width, m.height, f.w / f.h);
    crop[id] = { kept: round(kept), risk: kept >= 0.75 ? "low" : kept >= 0.5 ? "medium" : "high" };
  }
  if (crop.story.risk === "high") issues.push({ code: "crop_risk", severity: "info", message: `W formacie Stories zostanie ok. ${Math.round(crop.story.kept * 100)}% zdjęcia. Sprawdź kadr przed publikacją.` });

  const res = Math.min(1, (m.width * m.height) / (1600 * 1067));
  const exposure = 1 - Math.min(1, Math.abs(m.brightness - 0.55) * 2.2);
  const penalty = issues.reduce((s, i) => s + (i.severity === "problem" ? 30 : i.severity === "warning" ? 10 : 2), 0);
  const score = Math.max(0, Math.min(100, Math.round(res * 30 + exposure * 25 + Math.min(1, m.sharpness / 0.5) * 30 + Math.min(1, m.contrast / 0.25) * 15 - penalty)));
  return {
    version: PHOTO_ANALYSIS_VERSION,
    width: m.width, height: m.height, megapixels: round((m.width * m.height) / 1e6, 1), ratio: round(ratio), orientation,
    brightness: round(m.brightness), contrast: round(m.contrast), sharpness: round(m.sharpness), colors: m.colors.slice(0, 4), focus: m.focus,
    crop, issues, score,
  };
}

/**
 * Proposed crop for a box (zoom 1): centred on the salient point, clamped so
 * the box stays inside the photo. Expressed as the renderer's fx/fy.
 */
export function proposeCrop(photo: { width: number; height: number; focus: { x: number; y: number } | null }, box: { w: number; h: number }): { fx: number; fy: number; kept: number } {
  const sc = Math.max(box.w / photo.width, box.h / photo.height);
  const sw = photo.width * sc;
  const sh = photo.height * sc;
  const f = photo.focus ?? { x: 0.5, y: 0.5 };
  // Keep the visible window inside the scaled photo.
  const minX = box.w / 2 / sw;
  const minY = box.h / 2 / sh;
  const fx = Math.min(1 - minX, Math.max(minX, f.x));
  const fy = Math.min(1 - minY, Math.max(minY, f.y));
  return { fx: round(fx, 3), fy: round(fy, 3), kept: round(keptShare(photo.width, photo.height, box.w / box.h)) };
}
