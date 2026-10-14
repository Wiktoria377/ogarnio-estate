import { FONTS, type FontDef } from "@/core/brand/fonts";
import type { BrandColors } from "@/core/brand/model";
import type { TraitConfidence } from "@/core/brand/profile";
import type { CssSignals } from "./css";

/** Deterministic interpretation of extracted signals, each with a confidence score. */

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function distance(a: string, b: string) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  // Weighted RGB ("redmean") distance: cheap and good enough to merge near shades.
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}

export function isNeutral(hex: string) {
  const [, s, l] = rgbToHsl(hexToRgb(hex));
  return s < 0.14 || l > 0.95 || l < 0.07;
}

export interface PaletteProposal {
  colors: Partial<BrandColors>;
  confidence: TraitConfidence;
  found: { hex: string; weight: number; roles: string[] }[];
}

/** Proposes brand colours from weighted CSS hits; near-identical shades are merged first. */
export function proposePalette(css: CssSignals, themeColor: string | null): PaletteProposal {
  const merged: { hex: string; weight: number; roles: Set<string> }[] = [];
  for (const hit of [...css.colors.values()].sort((a, b) => b.weight - a.weight)) {
    const near = merged.find((m) => distance(m.hex, hit.hex) < 40);
    if (near) {
      // A page background is a stronger signal than a stray near-white text colour.
      if (hit.roles.has("background") && !near.roles.has("background")) near.hex = hit.hex;
      near.weight += hit.weight;
      hit.roles.forEach((r) => near.roles.add(r));
    } else merged.push({ hex: hit.hex, weight: hit.weight, roles: new Set(hit.roles) });
  }
  merged.sort((a, b) => b.weight - a.weight);
  const theme = themeColor && /^#[0-9a-f]{6}$/i.test(themeColor.trim()) ? themeColor.trim().toUpperCase() : null;
  const chroma = merged.filter((m) => !isNeutral(m.hex));
  const rank = (m: (typeof merged)[number]) => m.weight + (m.roles.has("primary") ? 40 : 0) + (m.roles.has("button") ? 15 : 0) + (theme && distance(theme, m.hex) < 40 ? 30 : 0);
  const byBrand = [...chroma].sort((a, b) => rank(b) - rank(a));
  const primary = byBrand[0];
  const secondary = byBrand.find((m) => primary && distance(m.hex, primary.hex) > 90 && !m.roles.has("accent")) ?? merged.find((m) => isNeutral(m.hex) && rgbToHsl(hexToRgb(m.hex))[2] < 0.3);
  const accent = byBrand.find((m) => m !== primary && m !== secondary && (!primary || distance(m.hex, primary.hex) > 60));
  const light = merged.filter((m) => rgbToHsl(hexToRgb(m.hex))[2] > 0.9).sort((a, b) => (b.roles.has("background") ? 1 : 0) - (a.roles.has("background") ? 1 : 0) || b.weight - a.weight)[0];
  const dark = merged.filter((m) => rgbToHsl(hexToRgb(m.hex))[2] < 0.3).sort((a, b) => (b.roles.has("text") ? 1 : 0) - (a.roles.has("text") ? 1 : 0) || b.weight - a.weight)[0];

  const colors: Partial<BrandColors> = {};
  if (primary) colors.primary = primary.hex;
  if (secondary) colors.secondary = secondary.hex;
  if (accent) colors.accent = accent.hex;
  if (light) colors.background = light.hex;
  if (dark) colors.text = dark.hex;

  let score = 0;
  let source = "Nie znaleziono kolorów marki w arkuszach stylów.";
  if (primary) {
    if (css.variables.some((v) => distance(v.hex, primary.hex) < 40 && /primary|brand|main/.test(v.name))) {
      score = 0.85;
      source = `Kolor zdefiniowany na stronie jako zmienna marki (${css.variables.find((v) => distance(v.hex, primary.hex) < 40)!.name}).`;
    } else if (theme && distance(theme, primary.hex) < 40) {
      score = 0.75;
      source = "Kolor zgodny z kolorem motywu strony (theme-color).";
    } else if (primary.roles.has("button")) {
      score = 0.65;
      source = "Kolor przycisków i wezwań do działania na stronie.";
    } else {
      score = 0.45;
      source = "Najczęstszy kolor w arkuszach stylów (bez jednoznacznego oznaczenia).";
    }
  }
  return {
    colors,
    confidence: { score, source, evidence: merged.slice(0, 8).map((m) => `${m.hex} (${[...m.roles].join(", ")})`) },
    found: merged.slice(0, 12).map((m) => ({ hex: m.hex, weight: Math.round(m.weight), roles: [...m.roles] })),
  };
}

const SERIF_HINT = /serif|garamond|playfair|lora|merriweather|baskerville|times|georgia|cormorant|libre caslon|crimson|bodoni|didot|fraunces|prata|marcellus|cinzel|spectral|eb |noto serif|pt serif/i;
const DISPLAY_HINT = /display|dm serif|instrument|abril|bebas|anton|oswald/i;

function categoryOf(family: string): FontDef["category"] {
  if (/sans/i.test(family) && !/serif display/i.test(family)) return "sans";
  if (DISPLAY_HINT.test(family)) return "display";
  if (SERIF_HINT.test(family)) return "serif";
  return "sans";
}

export interface FontProposal {
  role: "heading" | "body";
  detected: string | null;
  fontId: string | null;
  available: boolean;
  confidence: TraitConfidence;
}

/** Maps a detected family to an app font: exact match if bundled, else the closest category. */
export function proposeFont(role: "heading" | "body", detected: string | null, declaredOnPage: boolean): FontProposal {
  if (!detected) return { role, detected: null, fontId: null, available: false, confidence: { score: 0, source: "Nie rozpoznano kroju pisma." } };
  const exact = FONTS.find((f) => f.family.toLowerCase() === detected.toLowerCase());
  if (exact) {
    return {
      role, detected, fontId: exact.id, available: true,
      confidence: { score: declaredOnPage ? 0.85 : 0.7, source: declaredOnPage ? `Font „${detected}” ładowany przez stronę i dostępny w aplikacji.` : `Font „${detected}” użyty w stylach strony i dostępny w aplikacji.` },
    };
  }
  const cat = categoryOf(detected);
  const fallback = role === "heading" ? (cat === "serif" ? "playfair-display" : cat === "display" ? "dm-serif-display" : "montserrat") : cat === "serif" ? "lora" : "manrope";
  return {
    role, detected, fontId: fallback, available: false,
    confidence: { score: 0.35, source: `Na stronie: „${detected}” (brak licencji w aplikacji). Proponowany zamiennik o podobnym charakterze.` },
  };
}

/** Picks heading/body families from CSS usage and font loading. */
export function detectFonts(css: CssSignals, googleFonts: string[]) {
  const loaded = new Set([...googleFonts, ...css.fontFaces].map((f) => f.toLowerCase()));
  const entries = [...css.fonts.entries()];
  const top = (key: "heading" | "body") => entries.filter(([, v]) => v[key] > 0).sort((a, b) => b[1][key] - a[1][key])[0]?.[0] ?? null;
  const any = entries.sort((a, b) => b[1].heading + b[1].body + b[1].other - (a[1].heading + a[1].body + a[1].other))[0]?.[0] ?? googleFonts[0] ?? null;
  const body = top("body") ?? any;
  const heading = top("heading") ?? (googleFonts.find((g) => g.toLowerCase() !== body?.toLowerCase()) ?? body);
  return {
    heading: proposeFont("heading", heading, !!heading && loaded.has(heading.toLowerCase())),
    body: proposeFont("body", body, !!body && loaded.has(body.toLowerCase())),
  };
}

// ── robots.txt ─────────────────────────────────────────────────────────────

export interface RobotsRules {
  groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[];
}

export function parseRobots(text: string): RobotsRules {
  const groups: RobotsRules["groups"] = [];
  let current: RobotsRules["groups"][number] | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/).slice(0, 2000)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") current.rules.push({ allow: key === "allow", path: value });
  }
  return { groups };
}

function matches(pattern: string, path: string) {
  if (!pattern) return false;
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);
  return re.test(path);
}

/** RFC 9309: the most specific group wins, then the longest matching rule (Allow wins ties). */
export function robotsAllows(rules: RobotsRules, agent: string, path: string): boolean {
  const a = agent.toLowerCase();
  const specific = rules.groups.filter((g) => g.agents.some((x) => x !== "*" && a.includes(x)));
  const group = specific.length ? specific : rules.groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of group)
    for (const r of g.rules) {
      if (!r.path && !r.allow) continue;
      if (matches(r.path, path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) best = { allow: r.allow, len: r.path.length };
    }
  return best ? best.allow : true;
}

// ── Text statistics ────────────────────────────────────────────────────────

const STOP = new Set(
  "biuro biura biurze biurem oraz które który która które ponieważ jednak również także bardzo każdy każda wszystko wszystkie przez przed między poniżej powyżej naszej naszego naszym nasze nasza nasi nasz państwa pana pani jesteśmy będzie można tylko więcej mniej około zobacz sprawdź kliknij strona strony stronie cookies polityka prywatności regulamin kontakt telefon email menu szukaj home oferta oferty ofert copyright wszelkie prawa zastrzeżone dzięki gdzie kiedy dlaczego który jakie jakiej swoje swoich naszych twoje twojego twojej".split(" "),
);

/** Content words used repeatedly on the site (evidence = count). */
export function characteristicWords(text: string, max = 12): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().match(/\p{L}{5,}/gu) ?? []) {
    if (STOP.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, max).map(([word, count]) => ({ word, count }));
}

export function offerPresentation(text: string): { prices: number; areas: number; rooms: number; summary: string | null } {
  const prices = (text.match(/\d[\d\s.,]{2,}\s?(zł|pln)(?!\p{L})/giu) ?? []).length;
  const areas = (text.match(/\d[\d.,]*\s?(m²|m2|mkw|m\.kw)/giu) ?? []).length;
  const rooms = (text.match(/\b\d\s?(pok\.|pokoje|pokoi|pokój)/gi) ?? []).length;
  if (prices + areas + rooms === 0) return { prices, areas, rooms, summary: null };
  const parts = [prices && `cena (${prices}×)`, areas && `metraż (${areas}×)`, rooms && `liczba pokoi (${rooms}×)`].filter(Boolean);
  return { prices, areas, rooms, summary: `Oferty na stronie pokazują: ${parts.join(", ")}.` };
}

/** Normalised substring check used to verify model "evidence" quotes against fetched text. */
export function quoteFound(quote: string, corpus: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[„”"'«»]/g, "").replace(/\s+/g, " ").trim();
  const q = norm(quote);
  return q.length >= 8 && norm(corpus).includes(q);
}

// ── Photo style ────────────────────────────────────────────────────────────

export interface PhotoStats {
  count: number;
  brightness: number;
  saturation: number;
  warmth: number;
  contrast: number;
}

/** Plain-language description of measured photo statistics (not an aesthetic judgement). */
export function describePhotos(s: PhotoStats | null): { text: string | null; confidence: TraitConfidence } {
  if (!s || s.count === 0) return { text: null, confidence: { score: 0, source: "Brak zdjęć do analizy na stronie." } };
  const light = s.brightness > 0.62 ? "jasne" : s.brightness < 0.4 ? "ciemne, nastrojowe" : "o średniej jasności";
  const sat = s.saturation > 0.38 ? "nasycone kolory" : s.saturation < 0.18 ? "stonowane, prawie neutralne kolory" : "naturalne kolory";
  const warm = s.warmth > 0.06 ? "ciepła tonacja" : s.warmth < -0.04 ? "chłodna tonacja" : "neutralna tonacja";
  const contrast = s.contrast > 0.26 ? "wysoki kontrast" : s.contrast < 0.16 ? "miękki kontrast" : "umiarkowany kontrast";
  return {
    text: `Zdjęcia ${light}, ${sat}, ${warm}, ${contrast}.`,
    confidence: { score: s.count >= 4 ? 0.6 : 0.4, source: `Zmierzone na ${s.count} zdjęciach ze strony (jasność, nasycenie, tonacja, kontrast).` },
  };
}
