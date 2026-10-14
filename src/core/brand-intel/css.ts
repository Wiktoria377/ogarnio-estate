import postcss from "postcss";

/**
 * Colour and font signals from stylesheets (parsed with postcss, never
 * evaluated). Weights favour declarations that say something about the brand:
 * custom properties named primary/brand/accent, buttons, headings and links.
 */
export interface ColorHit {
  hex: string;
  weight: number;
  roles: Set<string>;
}

export interface CssSignals {
  colors: Map<string, ColorHit>;
  /** family → where it is used (heading/body/other) with counts */
  fonts: Map<string, { heading: number; body: number; other: number }>;
  fontFaces: string[];
  variables: { name: string; hex: string }[];
  parseErrors: number;
}

export function emptySignals(): CssSignals {
  return { colors: new Map(), fonts: new Map(), fontFaces: [], variables: [], parseErrors: 0 };
}

const NAMED: Record<string, string> = {
  white: "#FFFFFF", black: "#000000", red: "#FF0000", navy: "#000080", gold: "#FFD700", gray: "#808080", grey: "#808080",
  silver: "#C0C0C0", maroon: "#800000", green: "#008000", blue: "#0000FF", orange: "#FFA500", teal: "#008080", purple: "#800080",
};

function hex2(n: number) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${hex2(f(0) * 255)}${hex2(f(8) * 255)}${hex2(f(4) * 255)}`.toUpperCase();
}

/** All colours written in a CSS value, normalised to #RRGGBB (transparent ones skipped). */
export function colorsIn(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi)) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4) {
      if (h.length === 4 && h[3] === "0") continue;
      h = h.slice(0, 3).split("").map((c) => c + c).join("");
    } else if (h.length === 8) {
      if (parseInt(h.slice(6), 16) < 64) continue;
      h = h.slice(0, 6);
    }
    out.push(`#${h.toUpperCase()}`);
  }
  for (const m of value.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)/gi)) {
    const alpha = m[4] ? (m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])) : 1;
    if (alpha < 0.25) continue;
    out.push(`#${hex2(+m[1]!)}${hex2(+m[2]!)}${hex2(+m[3]!)}`.toUpperCase());
  }
  for (const m of value.matchAll(/hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)/gi)) {
    const alpha = m[4] ? (m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])) : 1;
    if (alpha < 0.25) continue;
    out.push(hslToHex(+m[1]!, +m[2]!, +m[3]!));
  }
  for (const m of value.matchAll(/(?:^|[\s,(])([a-z]+)(?=$|[\s,;)!])/gi)) {
    const n = NAMED[m[1]!.toLowerCase()];
    if (n) out.push(n);
  }
  return out;
}

const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "inherit", "initial", "unset", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica neue", "arial", "helvetica", "apple color emoji", "segoe ui emoji", "noto color emoji", "sans", "times new roman", "georgia"]);

export function fontFamilies(value: string): string[] {
  return value
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, "").trim())
    .filter((f) => f && !f.startsWith("var(") && f.length <= 60);
}

export function isGenericFont(family: string) {
  return GENERIC.has(family.toLowerCase());
}

function selectorRole(selector: string): "heading" | "body" | "button" | "link" | "other" {
  const s = selector.toLowerCase();
  if (/(^|[\s,>])h[1-3]\b|title|heading|hero/.test(s)) return "heading";
  if (/btn|button|cta/.test(s)) return "button";
  if (/(^|[\s,])(body|html|:root|p)\b/.test(s)) return "body";
  if (/(^|[\s,])a\b|link/.test(s)) return "link";
  return "other";
}

const VAR_BRAND = /(primary|brand|accent|main|secondary|theme|highlight)/i;

export function analyzeCss(css: string, into: CssSignals = emptySignals(), sourceWeight = 1): CssSignals {
  let root: postcss.Root;
  try {
    root = postcss.parse(css.slice(0, 1_500_000));
  } catch {
    into.parseErrors++;
    return into;
  }
  const add = (hex: string, w: number, role: string) => {
    const hit = into.colors.get(hex) ?? { hex, weight: 0, roles: new Set<string>() };
    hit.weight += w * sourceWeight;
    hit.roles.add(role);
    into.colors.set(hex, hit);
  };
  root.walkAtRules("font-face", (at) => {
    at.walkDecls("font-family", (d) => {
      const f = fontFamilies(d.value)[0];
      if (f) into.fontFaces.push(f);
    });
  });
  root.walkDecls((d) => {
    const prop = d.prop.toLowerCase();
    const parent = d.parent as postcss.Rule | undefined;
    const selector = parent && "selector" in parent ? parent.selector : "";
    if (prop.startsWith("--")) {
      const cs = colorsIn(d.value);
      if (cs.length === 1) {
        if (VAR_BRAND.test(prop)) {
          into.variables.push({ name: prop, hex: cs[0]! });
          add(cs[0]!, 6, /accent|highlight/i.test(prop) ? "accent" : /secondary/i.test(prop) ? "secondary" : "primary");
        } else add(cs[0]!, 1, "variable");
      }
      return;
    }
    if (prop === "font-family" || prop === "font") {
      const role = selectorRole(selector);
      const fams = fontFamilies(prop === "font" ? d.value.replace(/^.*?\d+(px|rem|em|%)(\/[\d.]+\w*)?\s+/, "") : d.value).filter((f) => !isGenericFont(f));
      const first = fams[0];
      if (first) {
        const e = into.fonts.get(first) ?? { heading: 0, body: 0, other: 0 };
        if (role === "heading") e.heading++;
        else if (role === "body") e.body++;
        else e.other++;
        into.fonts.set(first, e);
      }
      return;
    }
    if (!/color|background|border|fill|stroke|outline|box-shadow/.test(prop)) return;
    const role = selectorRole(selector);
    const isBg = prop.startsWith("background");
    for (const c of colorsIn(d.value)) {
      const w = role === "button" ? 4 : role === "heading" ? 2.5 : role === "link" ? 2.5 : role === "body" ? 2 : 1;
      add(c, w, role === "body" ? (isBg ? "background" : "text") : role === "button" && isBg ? "button" : role);
    }
  });
  return into;
}

/** Inline style="" attributes are weighted lower (often one-off content). */
export function analyzeStyleAttrs(attrs: string[], into: CssSignals) {
  return analyzeCss(attrs.map((a, i) => `.s${i}{${a}}`).join("\n"), into, 0.5);
}
