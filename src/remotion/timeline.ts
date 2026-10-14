import { REEL_FPS } from "./types";

export const VIDEO_LENGTHS = [10, 15, 20, 30] as const;
export type VideoLength = (typeof VIDEO_LENGTHS)[number];

/** Number of photo scenes for each length (plus the parameters scene and the end screen). */
export const PHOTO_SCENES: Record<VideoLength, number> = { 10: 2, 15: 3, 20: 4, 30: 6 };

export interface Segment {
  kind: "photo" | "params" | "end";
  index: number;
  from: number;
  duration: number;
}

/** Overlap used by transitions (both segments are visible during it). */
export const TRANSITION = 12;

/**
 * Scene timing in frames. Photo scenes share the time left after the
 * parameters scene and the end screen; segments overlap by TRANSITION frames.
 */
export function timeline(lengthSec: number, photoScenes: number, withParams: boolean): Segment[] {
  const total = Math.round(lengthSec * REEL_FPS);
  const end = Math.round(2.5 * REEL_FPS);
  const params = withParams ? Math.round((lengthSec <= 10 ? 2.5 : 3) * REEL_FPS) : 0;
  const n = Math.max(1, photoScenes);
  const photoTotal = total - end - params + TRANSITION * (n + (withParams ? 1 : 0));
  const each = Math.floor(photoTotal / n);
  const out: Segment[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const d = i === n - 1 ? photoTotal - each * (n - 1) : each;
    out.push({ kind: "photo", index: i, from: at, duration: d });
    at += d - TRANSITION;
  }
  if (withParams) {
    out.push({ kind: "params", index: 0, from: at, duration: params + TRANSITION });
    at += params;
  }
  out.push({ kind: "end", index: 0, from: at, duration: total - at });
  return out;
}
