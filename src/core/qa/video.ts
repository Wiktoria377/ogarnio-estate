import type { VideoDesign } from "@/core/video/model";
import { TRANSITION, timeline, type Segment } from "@/remotion/timeline";
import { REEL_FPS, REEL_HEIGHT, REEL_WIDTH, SAFE } from "@/remotion/types";
import { fmt, type QaCheck } from "./types";

/**
 * Video QA: on-screen texts vs the time each scene is visible (reading speed),
 * text length vs the frame, duration and scene timing, safe zones of
 * Reels/TikTok, motion and photo resolution, music length, and the exported
 * file itself (ffprobe: codec, size, frame rate, duration, audio, faststart).
 */
export interface ProbeResult {
  codec: string | null;
  pixFmt: string | null;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  audioCodec: string | null;
  /** moov atom before mdat (playback can start before the whole file loads). */
  faststart: boolean | null;
  sizeBytes: number;
}

export interface VideoQaInput {
  design: VideoDesign;
  /** Pixel size of each scene photo (by photoId). */
  photos: Map<string, { width: number; height: number }>;
  musicDurationMs: number | null;
  /** Latest MP4 of the current version, if rendered. */
  probe: ProbeResult | null;
  renderedVersion: number | null;
  currentVersion: number;
}

/** Characters per second a viewer reads comfortably on a phone (Polish on-screen text). */
export const READING_CPS = 15;
const HEADLINE_SIZE: Record<VideoDesign["style"], number> = { cinematic: 84, modern: 80, energetic: 92, minimal: 72, editorial: 88 };
const MOTION_STRENGTH: Record<VideoDesign["style"], number> = { cinematic: 0.1, modern: 0.14, energetic: 0.2, minimal: 0.14, editorial: 0.14 };
/** Platform guidance for 9:16 (Reels/TikTok UI): minimum bands kept free of text. */
const PLATFORM_SAFE = { top: 220, bottom: 380, right: 120 };

export function estimateLines(text: string, sizePx: number, upper: boolean, width = REEL_WIDTH - SAFE.left - SAFE.right): number {
  if (!text.trim()) return 0;
  const charW = sizePx * (upper ? 0.62 : 0.52);
  const perLine = Math.max(1, Math.floor(width / charW));
  let lines = 1;
  let len = 0;
  for (const w of text.trim().split(/\s+/)) {
    if (len && len + 1 + w.length > perLine) { lines++; len = w.length; } else len += (len ? 1 : 0) + w.length;
  }
  return lines;
}

export function sceneSeconds(seg: Segment): number {
  return Math.max(0, (seg.duration - TRANSITION) / REEL_FPS);
}

export function videoQa(input: VideoQaInput): QaCheck[] {
  const d = input.design;
  const out: QaCheck[] = [];
  const segs = timeline(d.length, d.scenes.length, d.showPrice || d.showParams);
  const photoSegs = segs.filter((s) => s.kind === "photo");
  const upper = d.style === "energetic";

  // ── On-screen texts (subtitles) vs scene time ─────────────────────────
  let anyText = false;
  d.scenes.forEach((sc, i) => {
    const seg = photoSegs[i];
    if (!seg) return;
    const isHook = i === 0 && !!d.hook;
    const headline = isHook ? d.hook : sc.headline;
    const sub = isHook ? sc.headline || sc.subline : sc.subline;
    const chars = (headline + " " + sub).trim().length;
    if (chars) anyText = true;
    const visible = sceneSeconds(seg);
    const need = chars / READING_CPS + 0.6;
    const where = `Scena ${i + 1}`;
    if (chars && need > visible) out.push({ area: "Napisy", code: "reading_time", severity: need > visible * 1.4 ? "problem" : "warning", where, message: "Napis za długi na czas sceny: widz nie zdąży go przeczytać.", measured: `${chars} znaków, ok. ${fmt(Math.round(need * 10) / 10)} s czytania, scena ${fmt(Math.round(visible * 10) / 10)} s`, fix: `Skróć napis do ok. ${Math.max(10, Math.floor((visible - 0.6) * READING_CPS))} znaków albo wydłuż film.`, method: "estimate" });
    const size = isHook ? (upper ? 96 : HEADLINE_SIZE[d.style] + 14) : HEADLINE_SIZE[d.style];
    const lines = estimateLines(headline, size, upper) + estimateLines(sub, 44, false);
    if (lines > 5) out.push({ area: "Napisy", code: "too_many_lines", severity: "warning", where, message: "Napis zajmie dużą część kadru.", measured: `ok. ${lines} linii`, fix: "Skróć nagłówek lub podpis sceny.", method: "estimate" });
  });
  if (!anyText) out.push({ area: "Napisy", code: "no_text", severity: "info", message: "Sceny ze zdjęciami nie mają napisów. Większość osób ogląda Reels bez dźwięku.", fix: "Dodaj krótki nagłówek przynajmniej do pierwszej sceny.", method: "rule" });
  else if (!out.some((c) => c.area === "Napisy")) out.push({ area: "Napisy", code: "ok", severity: "ok", message: `Napisy mieszczą się w czasie scen (przy ${READING_CPS} znakach na sekundę).`, method: "estimate" });
  if (d.cta.trim().length > 40) out.push({ area: "Napisy", code: "cta_long", severity: "warning", where: "Plansza końcowa", message: "Długie CTA na planszy końcowej.", measured: `${d.cta.trim().length} znaków`, fix: "Skróć CTA do 2–4 słów.", method: "rule" });

  // ── Duration and scene sync ───────────────────────────────────────────
  const totalFrames = Math.round(d.length * REEL_FPS);
  const end = segs[segs.length - 1]!;
  const gaps = segs.slice(1).filter((s, i) => s.from > segs[i]!.from + segs[i]!.duration);
  if (end.from + end.duration !== totalFrames || gaps.length) out.push({ area: "Synchronizacja", code: "timeline", severity: "problem", message: "Sceny nie wypełniają całego filmu.", fix: "Zapisz film ponownie, żeby przeliczyć sceny.", method: "rule" });
  else out.push({ area: "Synchronizacja", code: "timeline_ok", severity: "ok", message: `Sceny wypełniają ${d.length} s bez przerw (przejścia ${fmt(TRANSITION / REEL_FPS)} s).`, method: "rule" });
  const shortest = Math.min(...photoSegs.map(sceneSeconds));
  if (shortest < 1.5) out.push({ area: "Płynność", code: "short_scene", severity: "warning", message: "Bardzo krótkie sceny: ruch kamery będzie gwałtowny.", measured: `${fmt(Math.round(shortest * 10) / 10)} s`, fix: "Wydłuż film albo zmniejsz liczbę scen.", method: "rule" });
  for (let i = 1; i < d.scenes.length; i++) {
    if (d.scenes[i]!.photoId === d.scenes[i - 1]!.photoId) out.push({ area: "Płynność", code: "same_photo", severity: "info", where: `Sceny ${i}–${i + 1}`, message: "To samo zdjęcie w dwóch kolejnych scenach.", fix: "Wybierz inne zdjęcie albo dodaj więcej zdjęć oferty.", method: "rule" });
  }
  if (d.musicAssetId) {
    if (input.musicDurationMs == null) out.push({ area: "Synchronizacja", code: "music_unknown", severity: "info", message: "Nie znam długości ścieżki muzycznej.", method: "rule" });
    else if (input.musicDurationMs < d.length * 1000 - 200) out.push({ area: "Synchronizacja", code: "music_short", severity: "warning", message: "Muzyka jest krótsza niż film: końcówka będzie bez dźwięku.", measured: `${fmt(Math.round(input.musicDurationMs / 100) / 10)} s muzyki, film ${d.length} s`, fix: "Wybierz dłuższą ścieżkę albo skróć film.", method: "rule" });
    else out.push({ area: "Synchronizacja", code: "music_ok", severity: "ok", message: "Muzyka trwa co najmniej tyle co film.", method: "rule" });
  }

  // ── Safe zones (layout constants vs platform guidance) ────────────────
  if (SAFE.top < PLATFORM_SAFE.top || SAFE.bottom < PLATFORM_SAFE.bottom || SAFE.right < PLATFORM_SAFE.right)
    out.push({ area: "Strefy bezpieczne", code: "safe_zone", severity: "problem", message: "Napisy mogą wejść pod interfejs Reels/TikTok.", method: "rule" });
  else out.push({ area: "Strefy bezpieczne", code: "safe_ok", severity: "ok", message: "Napisy poza strefami interfejsu Reels/TikTok.", measured: `wolne pasy: góra ${SAFE.top} px, dół ${SAFE.bottom} px, prawa ${SAFE.right} px`, method: "rule" });

  // ── Photos: resolution vs 1080×1920 with camera motion ────────────────
  const zoom = 1 + MOTION_STRENGTH[d.style];
  const upscaled = d.scenes.map((sc, i) => ({ i, p: input.photos.get(sc.photoId) })).filter((x) => x.p).map((x) => ({ i: x.i, f: Math.max(REEL_WIDTH / x.p!.width, REEL_HEIGHT / x.p!.height) * zoom })).filter((x) => x.f > 1.6);
  for (const u of upscaled) out.push({ area: "Płynność", code: "upscaled", severity: u.f > 2.5 ? "problem" : "warning", where: `Scena ${u.i + 1}`, message: "Zdjęcie mocno powiększane w pionowym kadrze z ruchem kamery: może być nieostre.", measured: `${fmt(Math.round(u.f * 10) / 10)}×`, fix: "Użyj zdjęcia w wyższej rozdzielczości, najlepiej pionowego.", method: "measurement" });
  if (!out.some((c) => c.area === "Płynność")) out.push({ area: "Płynność", code: "ok", severity: "ok", message: `Sceny od ${fmt(Math.round(shortest * 10) / 10)} s, zdjęcia wystarczającej rozdzielczości.`, method: "rule" });

  // ── Exported file ─────────────────────────────────────────────────────
  if (!input.probe) out.push({ area: "Eksport", code: "not_rendered", severity: "info", message: "Film nie został jeszcze wyrenderowany do MP4.", fix: "Zatwierdź scenariusz i wyrenderuj MP4, żeby sprawdzić plik.", method: "rule" });
  else {
    const p = input.probe;
    const issues: QaCheck[] = [];
    if (input.renderedVersion !== null && input.renderedVersion !== input.currentVersion) issues.push({ area: "Eksport", code: "stale", severity: "warning", message: "Plik MP4 pochodzi ze starszej wersji filmu.", measured: `wersja ${input.renderedVersion}, bieżąca ${input.currentVersion}`, fix: "Wyrenderuj film ponownie.", method: "rule" });
    if (p.codec !== "h264") issues.push({ area: "Eksport", code: "codec", severity: "problem", message: "Kodek wideo inny niż H.264.", measured: p.codec ?? "brak", method: "measurement" });
    if (p.pixFmt && p.pixFmt !== "yuv420p") issues.push({ area: "Eksport", code: "pix_fmt", severity: "warning", message: "Format pikseli może nie odtwarzać się na wszystkich telefonach.", measured: p.pixFmt, method: "measurement" });
    if (p.width !== REEL_WIDTH || p.height !== REEL_HEIGHT) issues.push({ area: "Eksport", code: "size", severity: "problem", message: "Rozdzielczość inna niż 1080×1920.", measured: `${p.width}×${p.height}`, method: "measurement" });
    if (Math.abs(p.fps - REEL_FPS) > 0.5) issues.push({ area: "Eksport", code: "fps", severity: "warning", message: "Inna liczba klatek niż 30 na sekundę.", measured: `${fmt(p.fps)} kl./s`, method: "measurement" });
    if (Math.abs(p.durationSec - d.length) > 0.3) issues.push({ area: "Eksport", code: "duration", severity: "problem", message: "Długość pliku różni się od długości filmu.", measured: `${fmt(Math.round(p.durationSec * 10) / 10)} s zamiast ${d.length} s`, method: "measurement" });
    if (d.musicAssetId && !p.audioCodec) issues.push({ area: "Eksport", code: "no_audio", severity: "problem", message: "Wybrano muzykę, ale plik nie ma ścieżki audio.", method: "measurement" });
    if (p.faststart === false) issues.push({ area: "Eksport", code: "faststart", severity: "info", message: "Plik nie jest zoptymalizowany do odtwarzania w sieci (faststart).", method: "measurement" });
    out.push(...(issues.length ? issues : [{ area: "Eksport", code: "ok", severity: "ok" as const, message: "Plik MP4 zgodny z wymaganiami Reels/TikTok.", measured: `H.264 ${p.pixFmt ?? ""}, ${p.width}×${p.height}, ${fmt(p.fps)} kl./s, ${fmt(Math.round(p.durationSec * 10) / 10)} s${p.audioCodec ? `, audio ${p.audioCodec}` : ""}, ${fmt(Math.round(p.sizeBytes / 104857.6) / 10)} MB`, method: "measurement" as const }]));
  }
  if (!d.scriptApproved) out.push({ area: "Scenariusz", code: "not_approved", severity: "info", message: "Scenariusz nie jest zatwierdzony.", method: "rule" });
  return out;
}
