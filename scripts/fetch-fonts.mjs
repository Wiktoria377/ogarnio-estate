// Downloads the curated, OFL-licensed font set used by the graphic engine and the UI.
// Google Fonts serves TrueType files to legacy user agents; the renderer (resvg) and
// the text measurer (opentype.js) both need TTF/OTF, so we fetch exactly those.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "assets", "fonts");

/** Keep in sync with src/core/brand/fonts.ts */
const FAMILIES = [
  ["Geist", [400, 500, 600, 700]],
  ["Geist Mono", [400, 500]],
  ["Instrument Serif", [400]],
  ["Manrope", [400, 500, 600, 700]],
  ["DM Sans", [400, 500, 600, 700]],
  ["Plus Jakarta Sans", [400, 500, 600, 700]],
  ["Montserrat", [400, 500, 600, 700]],
  ["Outfit", [400, 500, 600, 700]],
  ["Sora", [400, 500, 600, 700]],
  ["Space Grotesk", [400, 500, 600, 700]],
  ["Work Sans", [400, 500, 600, 700]],
  ["Playfair Display", [400, 500, 600, 700]],
  ["Cormorant Garamond", [400, 500, 600, 700]],
  ["Fraunces", [400, 500, 600, 700]],
  ["Lora", [400, 500, 600, 700]],
  ["DM Serif Display", [400]],
];

const slug = (s) => s.toLowerCase().replace(/\s+/g, "-");

await mkdir(outDir, { recursive: true });
for (const [family, weights] of FAMILIES) {
  for (const w of weights) {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${w}`;
    const css = await (await fetch(url, { headers: { "User-Agent": "Mozilla/4.0" } })).text();
    const m = css.match(/url\((https:[^)]+\.ttf)\)/);
    if (!m) throw new Error(`No TTF for ${family} ${w}`);
    const buf = Buffer.from(await (await fetch(m[1])).arrayBuffer());
    const file = path.join(outDir, `${slug(family)}-${w}.ttf`);
    await writeFile(file, buf);
    console.log(`${family} ${w}: ${(buf.length / 1024).toFixed(0)} KB`);
  }
}
