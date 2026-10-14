import type { Font, RenderOptions } from "opentype.js";

export interface TextStyle {
  font: Font;
  fallback: Font;
  /** Preferred (maximum) size in px. */
  size: number;
  /** Line height as a multiple of size. */
  lineHeight: number;
  /** Letter spacing in em. */
  tracking?: number;
  uppercase?: boolean;
  color: string;
  opacity?: number;
  /** Requested weight (used when the user swaps the font of an element). */
  weight?: number;
}

export interface FittedText {
  lines: string[];
  size: number;
  /** Height of the text block (lines × line box). */
  height: number;
  width: number;
  overflow: boolean;
  style: TextStyle;
}

const opts = (style: TextStyle): RenderOptions => ({ kerning: true, ...(style.tracking ? { letterSpacing: style.tracking } : {}) }) as RenderOptions;

function prepare(text: string, style: TextStyle): string {
  const t = text.replace(/[ \t]+/g, " ").trim();
  return style.uppercase ? t.toLocaleUpperCase("pl-PL") : t;
}

/** Splits text into runs drawable by the main font or the fallback. */
function runs(text: string, style: TextStyle): { font: Font; text: string }[] {
  const out: { font: Font; text: string }[] = [];
  for (const ch of text) {
    const font = ch === " " || style.font.charToGlyphIndex(ch) > 0 ? style.font : style.fallback;
    const last = out[out.length - 1];
    if (last && last.font === font) last.text += ch;
    else out.push({ font, text: ch });
  }
  return out;
}

export function measure(text: string, style: TextStyle, size = style.size): number {
  return runs(text, style).reduce((w, r) => w + r.font.getAdvanceWidth(r.text, size, opts(style)), 0);
}

/** Greedy word wrap that respects hard line breaks and splits over-long words. */
export function wrap(text: string, style: TextStyle, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of prepare(text, style).split(/\n+/)) {
    const words = para.trim().split(" ").filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, style, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word, style, size) <= maxWidth) {
        line = word;
        continue;
      }
      // A single word wider than the box: split by characters.
      let part = "";
      for (const ch of word) {
        if (measure(part + ch, style, size) > maxWidth && part) {
          lines.push(part);
          part = ch;
        } else part += ch;
      }
      line = part;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function ellipsize(line: string, style: TextStyle, size: number, maxWidth: number): string {
  let l = line;
  while (l.length > 1 && measure(`${l}…`, style, size) > maxWidth) l = l.slice(0, -1).trimEnd();
  return `${l.replace(/[,;:–-]$/, "")}…`;
}

/**
 * Finds the largest size (down to minSize) at which the text fits the box.
 * If it still does not fit, the text is cut with an ellipsis and flagged as
 * overflow, so the editor can warn the user. Text never leaves its box.
 */
export function fitText(
  text: string,
  style: TextStyle,
  maxWidth: number,
  maxHeight: number,
  o: { minSize?: number; maxLines?: number } = {},
): FittedText {
  const minSize = Math.min(style.size, o.minSize ?? Math.round(style.size * 0.55));
  const maxLines = o.maxLines ?? 99;
  const clean = prepare(text, style);
  if (!clean) return { lines: [], size: style.size, height: 0, width: 0, overflow: false, style };
  for (let size = style.size; size >= minSize; size = Math.max(minSize, size * 0.94)) {
    const lines = wrap(clean, style, size, maxWidth);
    const height = lines.length * size * style.lineHeight;
    if (lines.length <= maxLines && height <= maxHeight + 0.5) {
      return { lines, size, height, width: Math.max(...lines.map((l) => measure(l, style, size))), overflow: false, style };
    }
    if (size === minSize) break;
  }
  const size = minSize;
  const fitLines = Math.max(1, Math.min(maxLines, Math.floor(maxHeight / (size * style.lineHeight))));
  const lines = wrap(clean, style, size, maxWidth);
  const kept = lines.slice(0, fitLines);
  if (lines.length > fitLines) kept[kept.length - 1] = ellipsize(kept[kept.length - 1]!, style, size, maxWidth);
  return {
    lines: kept,
    size,
    height: kept.length * size * style.lineHeight,
    width: Math.max(...kept.map((l) => measure(l, style, size))),
    overflow: lines.length > fitLines,
    style,
  };
}

const n = (v: number) => (Math.round(v * 10) / 10).toString();

/** Serialises glyph outlines ourselves: opentype's toPathData can emit NaN for tiny decimals. */
function pathData(commands: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[]): string {
  let d = "";
  for (const c of commands) {
    if (c.type === "M" || c.type === "L") d += `${c.type}${n(c.x!)} ${n(c.y!)}`;
    else if (c.type === "Q") d += `Q${n(c.x1!)} ${n(c.y1!)} ${n(c.x!)} ${n(c.y!)}`;
    else if (c.type === "C") d += `C${n(c.x1!)} ${n(c.y1!)} ${n(c.x2!)} ${n(c.y2!)} ${n(c.x!)} ${n(c.y!)}`;
    else if (c.type === "Z") d += "Z";
  }
  return d;
}

/** Draws a fitted block as vector paths. y is the top of the block. */
export function drawText(f: FittedText, x: number, y: number, width: number, align: "left" | "center" | "right" = "left"): string {
  if (f.lines.length === 0) return "";
  const { style, size } = f;
  const box = size * style.lineHeight;
  const asc = style.font.ascender / style.font.unitsPerEm;
  const desc = -style.font.descender / style.font.unitsPerEm;
  const d: string[] = [];
  f.lines.forEach((line, i) => {
    const w = measure(line, style, size);
    let cx = align === "left" ? x : align === "center" ? x + (width - w) / 2 : x + width - w;
    const baseline = y + i * box + (box - (asc + desc) * size) / 2 + asc * size;
    for (const r of runs(line, style)) {
      d.push(pathData(r.font.getPath(r.text, cx, baseline, size, opts(style)).commands));
      cx += r.font.getAdvanceWidth(r.text, size, opts(style));
    }
  });
  const opacity = style.opacity !== undefined && style.opacity < 1 ? ` fill-opacity="${style.opacity}"` : "";
  return `<path d="${d.join(" ")}" fill="${style.color}"${opacity}/>`;
}

export interface ColumnItem {
  text: string;
  style: TextStyle;
  maxLines?: number;
  minSize?: number;
  /** Space after this item (px). */
  gap?: number;
  /** The flexible item takes the height left by the others (usually the headline). */
  flex?: boolean;
  align?: "left" | "center" | "right";
  /** Element key for the editor (text slot key). */
  key?: string;
}

export interface PlacedText {
  index: number;
  key?: string;
  svg: string;
  /** Box of the drawn text (actual line widths, honouring alignment). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fitted font size in px. */
  size: number;
}

export interface ColumnResult {
  svg: string;
  height: number;
  overflow: string[];
  /** Top y of each placed item, by index (for decorations). */
  tops: number[];
  fitted: FittedText[];
  placed: PlacedText[];
}

/**
 * Stacks text items in a column without overlaps: fixed items are fitted first,
 * the flex item gets the remaining height, and blocks are placed one under the
 * other using their measured heights. anchor=bottom aligns the stack to the
 * bottom of the region.
 */
export function layoutColumn(
  region: { x: number; y: number; w: number; h: number },
  items: ColumnItem[],
  anchor: "top" | "bottom" | "center" = "top",
): ColumnResult {
  const present = items.map((it) => ({ ...it, text: it.text.trim() }));
  const fitted: (FittedText | null)[] = present.map(() => null);
  let fixedHeight = 0;
  present.forEach((it, i) => {
    if (!it.text || it.flex) return;
    const f = fitText(it.text, it.style, region.w, region.h, { maxLines: it.maxLines, minSize: it.minSize });
    fitted[i] = f;
    fixedHeight += f.height + (it.gap ?? 0);
  });
  present.forEach((it, i) => {
    if (!it.text || !it.flex) return;
    const f = fitText(it.text, it.style, region.w, Math.max(it.style.size, region.h - fixedHeight - (it.gap ?? 0)), { maxLines: it.maxLines, minSize: it.minSize });
    fitted[i] = f;
  });
  // If fixed items alone overflow, shrink everything proportionally (rare: very long details).
  let total = present.reduce((sum, it, i) => sum + (fitted[i] ? fitted[i]!.height + (it.gap ?? 0) : 0), 0);
  const lastGap = (() => {
    for (let i = present.length - 1; i >= 0; i--) if (fitted[i]) return present[i]!.gap ?? 0;
    return 0;
  })();
  total -= lastGap;
  if (total > region.h) {
    const ratio = region.h / total;
    present.forEach((it, i) => {
      if (!fitted[i]) return;
      fitted[i] = fitText(it.text, { ...it.style, size: it.style.size * ratio }, region.w, (fitted[i]!.height) * ratio, { maxLines: it.maxLines, minSize: Math.round(it.style.size * ratio * 0.6) });
    });
    total = present.reduce((sum, it, i) => sum + (fitted[i] ? fitted[i]!.height + (it.gap ?? 0) : 0), 0) - lastGap;
  }
  let y = anchor === "top" ? region.y : anchor === "bottom" ? region.y + region.h - total : region.y + (region.h - total) / 2;
  const parts: string[] = [];
  const tops: number[] = [];
  const overflow: string[] = [];
  const placed: PlacedText[] = [];
  present.forEach((it, i) => {
    const f = fitted[i];
    tops[i] = y;
    if (!f) return;
    const align = it.align ?? "left";
    const svg = drawText(f, region.x, y, region.w, align);
    parts.push(svg);
    const bx = align === "left" ? region.x : align === "center" ? region.x + (region.w - f.width) / 2 : region.x + region.w - f.width;
    placed.push({ index: i, key: it.key, svg, x: bx, y, w: f.width, h: f.height, size: f.size });
    if (f.overflow) overflow.push(it.text.slice(0, 40));
    y += f.height + (it.gap ?? 0);
  });
  return { svg: parts.join(""), height: Math.min(total, region.h), overflow, tops, fitted: fitted.filter((f): f is FittedText => !!f), placed };
}
