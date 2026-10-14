import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse, type Font } from "opentype.js";
import { fontById, nearestWeight } from "@/core/brand/fonts";

const cache = new Map<string, Font>();
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

/** Loads a bundled static font instance. Text is rendered as vector paths, so
 * the measured width is exactly the drawn width (no renderer font fallback). */
export function loadFont(id: string, weight = 400): Font {
  const def = fontById(id);
  const w = nearestWeight(def, weight);
  const key = `${def.id}-${w}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const buf = readFileSync(path.join(FONT_DIR, `${key}.ttf`));
  const font = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  cache.set(key, font);
  return font;
}

/** Fallback for glyphs a display face lacks (e.g. "²" in Instrument Serif). */
export function fallbackFont(weight = 400): Font {
  return loadFont("manrope", weight);
}
