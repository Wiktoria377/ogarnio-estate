import "server-only";
import sharp from "sharp";
import type { BrandColors, BrandKit } from "@/core/brand/model";
import { contrastRatio, luminance, mix, readableOn } from "@/core/brand/color";
import { FORMATS, elementLabel, type ElementOverride, type GraphicDesign, type Slide, type TemplateId } from "./design";
import { fallbackFont, loadFont } from "./fonts";
import { drawText, fitText, layoutColumn, type ColumnItem, type ColumnResult, type TextStyle } from "./text";

export interface RenderPhoto {
  id: string;
  data: Buffer;
  isVisualization: boolean;
}

export interface RenderInput {
  design: GraphicDesign;
  brand: BrandKit;
  photos: Map<string, RenderPhoto>;
  logo: Buffer | null;
}

/** Selectable element on the canvas (for the interactive editor). */
export interface LayoutElement {
  key: string;
  kind: "text" | "photo" | "logo" | "badge" | "decor" | "pager";
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Font size in px for fitted text (used by the QA legibility check). */
  size?: number;
}

export interface SlideRender {
  svg: string;
  width: number;
  height: number;
  warnings: string[];
  layout: LayoutElement[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

interface Theme {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  ctaBg: string;
  ctaFg: string;
  headingUpper: boolean;
}

/** Accent that stays legible on the background (falls back to a lighter/darker brand tint). */
function legibleAccent(accent: string, bg: string): string {
  if (contrastRatio(accent, bg) >= 2.6) return accent;
  const towards = luminance(bg) < 0.3 ? "#FFFFFF" : "#000000";
  for (const t of [0.3, 0.5, 0.7]) {
    const c = mix(accent, towards, t);
    if (contrastRatio(c, bg) >= 2.6) return c;
  }
  return readableOn(bg);
}

function themeFor(template: TemplateId, c: BrandColors): Theme {
  const base = { bg: c.background, fg: c.text, muted: mix(c.text, c.background, 0.38), accent: legibleAccent(c.primary, c.background), ctaBg: c.primary, ctaFg: readableOn(c.primary), headingUpper: false };
  switch (template) {
    case "split":
      return { ...base, ctaBg: c.secondary, ctaFg: readableOn(c.secondary), headingUpper: true };
    case "pricetag":
      return { ...base, ctaBg: c.primary, ctaFg: readableOn(c.primary), headingUpper: true };
    case "arch": {
      const fg = readableOn(c.secondary, ["#F4EFE6", "#1B1A1F"]);
      return { bg: c.secondary, fg, muted: mix(fg, c.secondary, 0.35), accent: legibleAccent(c.accent, c.secondary), ctaBg: c.secondary, ctaFg: fg, headingUpper: false };
    }
    case "noir": {
      const bg = luminance(c.secondary) < 0.06 ? c.secondary : mix(c.secondary, "#0B0A0E", 0.72);
      const fg = "#F2EDE4";
      return { bg, fg, muted: mix(fg, bg, 0.42), accent: legibleAccent(c.accent, bg), ctaBg: bg, ctaFg: fg, headingUpper: false };
    }
    case "minimal":
    case "gallery":
      return { ...base, accent: c.text, ctaBg: template === "gallery" ? c.background : c.text, ctaFg: template === "gallery" ? c.text : readableOn(c.text) };
    case "lines":
      return { ...base, bg: mix(c.background, "#FFFFFF", 0.35), ctaBg: c.secondary, ctaFg: readableOn(c.secondary) };
    default:
      return base;
  }
}

/** Per-slide drawing context: overrides, layout boxes, warnings and image work. */
class Canvas {
  readonly W: number;
  readonly H: number;
  readonly P: number;
  readonly warnings: string[] = [];
  readonly defs: string[] = [];
  readonly layout: LayoutElement[] = [];
  private clipId = 0;
  readonly colors: BrandColors;
  readonly heading: string;
  readonly body: string;

  constructor(
    readonly input: RenderInput,
    readonly slide: Slide,
    readonly index: number,
    readonly total: number,
  ) {
    const f = FORMATS[input.design.format];
    this.W = f.w;
    this.H = f.h;
    this.P = 76;
    this.colors = { ...input.brand.colors, ...input.design.colors };
    this.heading = input.design.headingFont ?? input.brand.headingFont;
    this.body = input.design.bodyFont ?? input.brand.bodyFont;
  }

  get story() {
    return this.input.design.format === "story" || this.input.design.format === "stories";
  }
  get square() {
    return this.input.design.format === "square";
  }
  /** Story formats keep text out of the top 250 px and bottom 340 px (platform UI). */
  get safeTop() {
    return this.story ? 250 : this.P * 0.5;
  }
  get safeBottom() {
    return this.story ? 340 : this.P * 0.5;
  }
  text(key: string): string {
    if (this.ov(key).hidden) return "";
    return (this.slide.texts[key] ?? "").trim();
  }
  ov(key: string): ElementOverride {
    return this.slide.overrides?.[key] ?? {};
  }

  style(kind: "heading" | "body", size: number, color: string, o: Partial<TextStyle> & { weight?: number } = {}): TextStyle {
    const weight = o.weight ?? (kind === "heading" ? 500 : 400);
    return {
      font: loadFont(kind === "heading" ? this.heading : this.body, weight),
      fallback: fallbackFont(weight),
      size,
      lineHeight: o.lineHeight ?? (kind === "heading" ? 1.08 : 1.35),
      tracking: o.tracking,
      uppercase: o.uppercase,
      color,
      opacity: o.opacity,
      weight,
    };
  }

  /** Applies the user's per-element font, colour and size to a style. */
  styled(key: string, st: TextStyle): TextStyle {
    const o = this.ov(key);
    if (!o.font && !o.color && !o.scale) return st;
    return {
      ...st,
      font: o.font ? loadFont(o.font, st.weight ?? 400) : st.font,
      color: o.color ?? st.color,
      opacity: o.color ? undefined : st.opacity,
      size: st.size * (o.scale ?? 1),
    };
  }

  newClip(shape: string): string {
    const id = `c${this.index}_${this.clipId++}`;
    this.defs.push(`<clipPath id="${id}">${shape}</clipPath>`);
    return id;
  }

  /**
   * Wraps one element: hidden → nothing; dx/dy (and scale for non-text) →
   * transform, clamped so the element stays inside the safe margins.
   */
  el(key: string, kind: LayoutElement["kind"], svg: string, box: { x: number; y: number; w: number; h: number }, size?: number): string {
    const o = this.ov(key);
    if (o.hidden || !svg) return "";
    const s = kind === "text" || kind === "photo" ? 1 : (o.scale ?? 1);
    let dx = kind === "photo" ? 0 : (o.dx ?? 0);
    let dy = kind === "photo" ? 0 : (o.dy ?? 0);
    const w = box.w * s;
    const h = box.h * s;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    let x = cx - w / 2 + dx;
    let y = cy - h / 2 + dy;
    if ((dx || dy || s !== 1) && kind !== "decor") {
      const m = 24;
      const nx = clamp(x, m, Math.max(m, this.W - m - w));
      const ny = clamp(y, m, Math.max(m, this.H - m - h));
      if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) this.warnings.push(`Slajd ${this.index + 1}: element „${elementLabel(this.slide.kind, key)}” przesunięty do bezpiecznego marginesu.`);
      dx += nx - x;
      dy += ny - y;
      x = nx;
      y = ny;
    }
    this.layout.push({ key, kind, label: elementLabel(this.slide.kind, key), x: r1(x), y: r1(y), w: r1(w), h: r1(h), ...(size ? { size: r1(size * (kind === "text" ? 1 : s)) } : {}) });
    const tf = [dx || dy ? `translate(${r1(dx)} ${r1(dy)})` : "", s !== 1 ? `translate(${r1(cx)} ${r1(cy)}) scale(${s}) translate(${r1(-cx)} ${r1(-cy)})` : ""].filter(Boolean).join(" ");
    return tf ? `<g transform="${tf}">${svg}</g>` : svg;
  }

  /** Column of keyed text items; overrides are applied and each item becomes an element. */
  column(region: { x: number; y: number; w: number; h: number }, items: ColumnItem[], anchor: "top" | "bottom" | "center" = "top"): ColumnResult {
    const prepared = items.map((it) => (it.key ? { ...it, text: this.text(it.key) === "" && this.ov(it.key).hidden ? "" : it.text, style: this.styled(it.key, it.style) } : it));
    const col = layoutColumn(region, prepared, anchor);
    for (const o of col.overflow) this.warnings.push(`Slajd ${this.index + 1}: tekst „${o}…” został skrócony, żeby zmieścił się w układzie.`);
    const svg = col.placed.map((p) => (p.key ? this.el(p.key, "text", p.svg, p, p.size) : p.svg)).join("");
    return { ...col, svg };
  }

  /** Single fitted text element (outside a column). */
  textEl(key: string, st: TextStyle, x: number, y: number, w: number, h: number, o: { maxLines?: number; minSize?: number; align?: "left" | "center" | "right"; valign?: "top" | "center" | "bottom" } = {}) {
    const text = this.text(key);
    if (!text) return { svg: "", height: 0, width: 0 };
    const f = fitText(text, this.styled(key, st), w, h, { maxLines: o.maxLines, minSize: o.minSize });
    if (f.overflow) this.warnings.push(`Slajd ${this.index + 1}: tekst „${text.slice(0, 30)}…” skrócony.`);
    const ty = o.valign === "center" ? y + (h - f.height) / 2 : o.valign === "bottom" ? y + h - f.height : y;
    const align = o.align ?? "left";
    const bx = align === "left" ? x : align === "center" ? x + (w - f.width) / 2 : x + w - f.width;
    return { svg: this.el(key, "text", drawText(f, x, ty, w, align), { x: bx, y: ty, w: f.width, h: f.height }, f.size), height: f.height, width: f.width };
  }

  /**
   * Cover-cropped photo. Photos are never altered beyond crop and resize: the
   * default crop follows the most salient area; the user may zoom and pan.
   */
  async photo(n: number, x: number, y: number, w: number, h: number, o: { clip?: string; rx?: number; label?: { x: number; y: number } } = {}): Promise<string> {
    const key = `photo${n}`;
    const id = this.slide.photoIds[n] ?? this.slide.photoIds[0];
    const p = id ? this.input.photos.get(id) : undefined;
    const W = Math.max(1, Math.round(w));
    const H = Math.max(1, Math.round(h));
    const clip = o.clip ?? (o.rx ? this.newClip(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx}"/>`) : null);
    const clipAttr = clip ? ` clip-path="url(#${clip})"` : "";
    if (!p) {
      if (id) this.warnings.push("Nie znaleziono jednego ze zdjęć (mogło zostać usunięte).");
      else this.warnings.push(`Slajd ${this.index + 1}: brak zdjęcia.`);
      const fill = mix(this.colors.primary, this.colors.background, 0.82);
      return this.el(key, "photo", `<g${clipAttr}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/></g>`, { x, y, w, h });
    }
    const ov = this.ov(key);
    let jpg: Buffer;
    if (ov.zoom || ov.fx !== undefined || ov.fy !== undefined) {
      const meta = await sharp(p.data).metadata();
      const iw = meta.width ?? W;
      const ih = meta.height ?? H;
      const sc = Math.max(W / iw, H / ih) * (ov.zoom ?? 1);
      const sw = Math.max(W, Math.round(iw * sc));
      const sh = Math.max(H, Math.round(ih * sc));
      const left = clamp(Math.round((ov.fx ?? 0.5) * sw - W / 2), 0, sw - W);
      const top = clamp(Math.round((ov.fy ?? 0.5) * sh - H / 2), 0, sh - H);
      jpg = await sharp(p.data).resize(sw, sh).extract({ left, top, width: W, height: H }).jpeg({ quality: 88 }).toBuffer();
    } else {
      jpg = await sharp(p.data).resize(W, H, { fit: "cover", position: "attention" }).jpeg({ quality: 88 }).toBuffer();
    }
    let out = `<g${clipAttr}><image x="${x}" y="${y}" width="${W}" height="${H}" preserveAspectRatio="none" href="data:image/jpeg;base64,${jpg.toString("base64")}"/></g>`;
    out = this.el(key, "photo", out, { x, y, w, h });
    // The visualization label cannot be hidden or moved: it is a legal/ethical marker.
    if (out && p.isVisualization && this.input.design.labelVisualizations) out += this.pillSvg("Wizualizacja", o.label?.x ?? x + 24, o.label?.y ?? y + h - 24 - 44, "rgba(20,18,24,0.72)", "#FFFFFF", 20).svg;
    return out;
  }

  pillSvg(label: string, x: number, y: number, bg: string, fg: string, size = 22, align: "left" | "right" | "center" = "left", key?: string) {
    let st = this.style("body", size, fg, { weight: 700, uppercase: true, tracking: 0.08, lineHeight: 1 });
    if (key) st = this.styled(key, st);
    const f = fitText(label, st, this.W * 0.6, st.size * 1.2, { maxLines: 1 });
    const padX = st.size * 0.9;
    const h = st.size * 2;
    const w = f.width + padX * 2;
    const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    return { svg: `<rect x="${left}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${bg}"/>${drawText(f, left + padX, y + (h - f.height) / 2, f.width)}`, box: { x: left, y, w, h } };
  }

  /** The "badge" slot as a pill element. */
  badge(x: number, y: number, bg: string, fg: string, size = 22, align: "left" | "right" | "center" = "left"): string {
    const label = this.text("badge");
    if (!label) return "";
    const p = this.pillSvg(label, x, y, bg, fg, size, align, "badge");
    return this.el("badge", "badge", p.svg, p.box);
  }

  /** Brand logo, contained in the box; on dark or busy backgrounds it sits on a light plate. */
  async logo(x: number, y: number, maxW: number, maxH: number, o: { plate?: boolean; align?: "left" | "right" | "center"; color?: string } = {}): Promise<string> {
    if (!this.input.design.showLogo) return "";
    const align = o.align ?? "left";
    if (!this.input.logo) {
      // No logo uploaded: the office name set in the brand font.
      const color = o.plate ? this.colors.text : (o.color ?? this.colors.text);
      const f = fitText(this.input.brand.companyName, this.style("heading", 34, color, { weight: 600, lineHeight: 1 }), maxW, maxH, { maxLines: 1, minSize: 18 });
      const pad = o.plate ? 18 : 0;
      const bx = align === "right" ? x + maxW - f.width - pad * 2 : align === "center" ? x + (maxW - f.width) / 2 - pad : x;
      const plate = o.plate ? `<rect x="${bx}" y="${y}" width="${f.width + pad * 2}" height="${f.height + pad * 2}" rx="14" fill="${this.colors.background}"/>` : "";
      return this.el("logo", "logo", plate + drawText(f, bx + pad, y + pad, f.width), { x: bx, y, w: f.width + pad * 2, h: f.height + pad * 2 });
    }
    const meta = await sharp(this.input.logo).metadata();
    const ratio = (meta.width ?? 1) / (meta.height ?? 1);
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    const png = await sharp(this.input.logo).resize(Math.round(w * 2), Math.round(h * 2), { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const pad = o.plate ? 16 : 0;
    const lx = align === "right" ? x + maxW - w - pad * 2 : align === "center" ? x + (maxW - w) / 2 - pad : x;
    const plate = o.plate ? `<rect x="${lx}" y="${y}" width="${w + pad * 2}" height="${h + pad * 2}" rx="14" fill="#FFFFFF" fill-opacity="0.94"/>` : "";
    return this.el("logo", "logo", `${plate}<image x="${lx + pad}" y="${y + pad}" width="${w}" height="${h}" href="data:image/png;base64,${png.toString("base64")}"/>`, { x: lx, y, w: w + pad * 2, h: h + pad * 2 });
  }

  /** Decorative shapes (rules, frames, arrows) share one hideable element. */
  decor(svg: string): string {
    if (!svg || this.ov("decor").hidden) return "";
    if (!this.layout.some((l) => l.key === "decor")) this.layout.push({ key: "decor", kind: "decor", label: "Dekoracje", x: 0, y: 0, w: this.W, h: this.H });
    return svg;
  }

  /** "2 / 6" indicator on carousels. */
  pager(): string {
    if (this.total <= 1) return "";
    const p = this.pillSvg(`${this.index + 1} / ${this.total}`, this.W - this.P, this.story ? this.safeTop - 70 : this.P * 0.6, "rgba(20,18,24,0.55)", "#FFFFFF", 20, "right");
    return this.el("pager", "pager", p.svg, p.box);
  }

  swipeHint(color: string, y: number): string {
    if (this.total <= 1 || this.index !== 0) return "";
    const x2 = this.W - this.P;
    const x1 = x2 - 64;
    return this.decor(`<g stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M${x1} ${y}H${x2}"/><path d="M${x2 - 16} ${y - 14}L${x2} ${y}L${x2 - 16} ${y + 14}"/></g>`);
  }

  scrim(id: string, from: number, stops: [number, number][]) {
    this.defs.push(`<linearGradient id="${id}${this.index}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, a]) => `<stop offset="${o}" stop-color="#0E0D12" stop-opacity="${a}"/>`).join("")}</linearGradient>`);
    return `<rect x="0" y="${from}" width="${this.W}" height="${this.H - from}" fill="url(#${id}${this.index})"/>`;
  }
}

// ------------------------------------------------------------------ covers

function coverItems(c: Canvas, t: { fg: string; muted: string; accent: string }, o: { titleSize?: number; upper?: boolean; align?: "left" | "center"; titleFont?: "heading" | "body"; priceStyle?: TextStyle } = {}): ColumnItem[] {
  const align = o.align ?? "left";
  const titleKind = o.titleFont ?? "heading";
  return [
    { key: "eyebrow", text: c.text("eyebrow"), style: c.style("body", 24, t.accent, { weight: 600, uppercase: true, tracking: 0.14, lineHeight: 1.3 }), maxLines: 2, gap: 22, align },
    {
      key: "title",
      text: c.text("title"),
      style: c.style(titleKind, o.titleSize ?? (c.story ? 88 : 76), t.fg, o.upper ? { weight: 700, uppercase: true, lineHeight: 1.0, tracking: -0.01 } : { lineHeight: 1.06 }),
      maxLines: c.story ? 5 : 3,
      flex: true,
      gap: 26,
      align,
    },
    { key: "details", text: c.text("details"), style: c.style("body", 32, t.muted, { weight: 500 }), maxLines: 2, gap: 14, align },
    { key: "price", text: c.text("price"), style: o.priceStyle ?? c.style("body", 50, t.fg, { weight: 700, lineHeight: 1.15 }), maxLines: 1, align },
  ];
}

/** Region for text that respects Stories safe areas. */
function safeRegion(c: Canvas, r: { x: number; y: number; w: number; h: number }) {
  const top = Math.max(r.y, c.safeTop);
  const bottom = Math.min(r.y + r.h, c.H - c.safeBottom);
  return { x: r.x, y: top, w: r.w, h: Math.max(80, bottom - top) };
}

async function coverEditorial(c: Canvas): Promise<string> {
  const { W, H, P } = c;
  const t = themeFor("editorial", c.colors);
  const photoH = Math.round(H * (c.square ? 0.54 : c.story ? 0.56 : 0.58));
  const parts = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`, await c.photo(0, 0, 0, W, photoH)];
  parts.push(c.badge(P, c.story ? c.safeTop : P * 0.6, c.colors.primary, readableOn(c.colors.primary)));
  const footer = 64;
  const region = safeRegion(c, { x: P, y: photoH + P * 0.75, w: W - 2 * P, h: H - photoH - P * 0.75 - P * 0.7 - footer - 24 });
  parts.push(c.column(region, coverItems(c, t)).svg);
  const fy = Math.min(H - P * 0.7 - footer, c.H - c.safeBottom + 20);
  parts.push(await c.logo(P, fy, 280, footer));
  parts.push(c.swipeHint(t.fg, fy + footer / 2));
  return parts.join("");
}

async function coverFrame(c: Canvas): Promise<string> {
  const { W, H, P } = c;
  const t = themeFor("frame", c.colors);
  const inset = 36;
  const top = c.story ? c.safeTop - 60 : P;
  const parts = [await c.photo(0, 0, 0, W, H, { label: { x: P, y: top + (c.text("badge") ? 64 : 0) } }), c.decor(`<rect x="${inset}" y="${inset}" width="${W - 2 * inset}" height="${H - 2 * inset}" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="2"/>`)];
  parts.push(c.badge(P, top, c.colors.primary, readableOn(c.colors.primary)));
  parts.push(await c.logo(W - P - 300, top, 300, 64, { plate: true, align: "right" }));
  const pad = 48;
  const cardW = W - 2 * P;
  const maxH = H * (c.story ? 0.4 : 0.5);
  const bottom = c.story ? c.safeBottom : P;
  // Card: measure first, then place the column in absolute coordinates.
  const probe = layoutColumn({ x: 0, y: 0, w: cardW - 2 * pad, h: maxH - 2 * pad }, coverItems(c, t, { titleSize: c.story ? 72 : 62 }));
  const cardH = probe.height + 2 * pad;
  const y = H - bottom - cardH;
  parts.push(`<rect x="${P}" y="${y}" width="${cardW}" height="${cardH}" rx="6" fill="${t.bg}"/>`);
  parts.push(c.column({ x: P + pad, y: y + pad, w: cardW - 2 * pad, h: cardH - 2 * pad }, coverItems(c, t, { titleSize: c.story ? 72 : 62 })).svg);
  parts.push(c.swipeHint("#FFFFFF", y - 40));
  return parts.join("");
}

async function coverCorporate(c: Canvas): Promise<string> {
  const { W, H, P } = c;
  const t = themeFor("corporate", c.colors);
  const barH = c.square ? 210 : 250;
  const photoH = Math.round(H * (c.square ? 0.5 : c.story ? 0.5 : 0.52));
  const on = readableOn(c.colors.primary);
  const parts = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`, await c.photo(0, 0, 0, W, photoH)];
  // Parameter bar: details split into equal columns, price in its own cell.
  const cells = c.text("details").split("·").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const priceW = c.text("price") ? Math.round(W * 0.36) : 0;
  parts.push(`<rect x="0" y="${photoH}" width="${W}" height="${barH}" fill="${c.colors.primary}"/>`);
  if (priceW) parts.push(`<rect x="${W - priceW}" y="${photoH}" width="${priceW}" height="${barH}" fill="${c.colors.secondary}"/>`);
  const colW = (W - priceW - P) / Math.max(1, cells.length);
  if (!c.ov("details").hidden && cells.length) {
    const st = c.styled("details", c.style("body", 40, on, { weight: 700, lineHeight: 1.1 }));
    const svgs = cells.map((cell, i) => {
      const f = fitText(cell, st, colW - 28, barH - 70, { maxLines: 2, minSize: 22 });
      const x = P + i * colW;
      const div = i > 0 ? `<rect x="${x - 18}" y="${photoH + 50}" width="1.5" height="${barH - 100}" fill="${on}" fill-opacity="0.35"/>` : "";
      return div + drawText(f, x, photoH + (barH - f.height) / 2, colW - 28);
    });
    parts.push(c.el("details", "text", svgs.join(""), { x: P, y: photoH + 30, w: W - priceW - P * 1.3, h: barH - 60 }));
  }
  if (priceW) {
    parts.push(c.textEl("price", c.style("body", 50, readableOn(c.colors.secondary), { weight: 700, lineHeight: 1.1 }), W - priceW + 36, photoH, priceW - 72, barH, { maxLines: 2, minSize: 26, valign: "center" }).svg);
  }
  parts.push(c.badge(P, c.story ? c.safeTop : P * 0.6, c.colors.background, c.colors.text));
  const footer = 60;
  const region = safeRegion(c, { x: P, y: photoH + barH + P * 0.7, w: W - 2 * P, h: H - photoH - barH - P * 0.7 - P * 0.6 - footer - 20 });
  const items = coverItems(c, t, { titleFont: "body", titleSize: c.story ? 72 : 58 }).filter((i) => i.key === "eyebrow" || i.key === "title");
  items[1] = { ...items[1]!, style: c.style("body", c.story ? 72 : 58, t.fg, { weight: 700, lineHeight: 1.08, tracking: -0.01 }) };
  parts.push(c.column(region, items).svg);
  const fy = Math.min(H - P * 0.6 - footer, H - c.safeBottom + 10);
  parts.push(await c.logo(P, fy, 280, footer));
  parts.push(c.swipeHint(t.fg, fy + footer / 2));
  return parts.join("");
}

async function coverSplit(c: Canvas): Promise<string> {
  const { W, H, P } = c;
  const t = themeFor("split", c.colors);
  const blockH = Math.round(H * (c.story ? 0.44 : c.square ? 0.46 : 0.45));
  const on = readableOn(c.colors.primary);
  const parts = [`<rect width="${W}" height="${blockH}" fill="${c.colors.primary}"/>`, await c.photo(0, 0, blockH, W, H - blockH)];
  const items: ColumnItem[] = [
    { key: "eyebrow", text: c.text("eyebrow"), style: c.style("body", 24, on, { weight: 600, uppercase: true, tracking: 0.14, opacity: 0.8 }), maxLines: 1, gap: 20 },
    { key: "title", text: c.text("title"), style: c.style("body", c.story ? 96 : 84, on, { weight: 700, uppercase: true, lineHeight: 1.02, tracking: -0.015 }), maxLines: 4, flex: true },
  ];
  parts.push(c.column(safeRegion(c, { x: P, y: P * 0.9, w: W - 2 * P, h: blockH - P * 1.8 }), items, "bottom").svg);
  parts.push(c.badge(P, c.story ? c.safeTop - 70 : P * 0.6, c.colors.background, c.colors.text));
  // Price chip on the photo (measured, then drawn in place).
  const pad = 30;
  const chipItems: ColumnItem[] = [
    { key: "price", text: c.text("price"), style: c.style("body", 46, c.colors.text, { weight: 700, lineHeight: 1.1 }), maxLines: 1, gap: 8 },
    { key: "details", text: c.text("details"), style: c.style("body", 28, mix(c.colors.text, c.colors.background, 0.35), { weight: 500 }), maxLines: 2 },
  ];
  const probe = layoutColumn({ x: 0, y: 0, w: W * 0.62 - 2 * pad, h: 260 }, chipItems);
  if (probe.height > 0) {
    const chipW = Math.max(...probe.fitted.map((f) => f.width)) + 2 * pad;
    const chipH = probe.height + 2 * pad;
    const cy = H - (c.story ? c.safeBottom : P) - chipH;
    parts.push(`<rect x="${P}" y="${cy}" width="${chipW}" height="${chipH}" rx="4" fill="${t.bg}"/>`);
    parts.push(c.column({ x: P + pad, y: cy + pad, w: chipW - 2 * pad + 2, h: chipH - 2 * pad }, chipItems).svg);
  }
  parts.push(await c.logo(W - P - 260, blockH + P * 0.6, 260, 60, { plate: true, align: "right" }));
  return parts.join("");
}

async function coverPricetag(c: Canvas): Promise<string> {
  const { W, H, P } = c;
  const fill = c.colors.primary;
  const on = readableOn(fill);
  const parts = [await c.photo(0, 0, 0, W, H, { label: { x: P, y: H - P - 60 } })];
  parts.push(c.scrim("pt", 0, [[0, 0.35], [0.45, 0], [1, 0.15]]));
  // Title: each line on its own strip of brand colour (measured per line).
  const titleText = c.text("title");
  let y = c.story ? c.safeTop : P * 1.1;
  if (titleText) {
    const st = c.styled("title", c.style("body", c.story ? 96 : 84, on, { weight: 700, uppercase: true, lineHeight: 1.12, tracking: -0.01 }));
    const f = fitText(titleText, st, W - 2 * P - 40, c.story ? 620 : H * 0.42, { maxLines: 4, minSize: 44 });
    const box = f.size * st.lineHeight;
    const strips = f.lines.map((line, i) => {
      const lf = { ...f, lines: [line], width: 0, height: box };
      const lw = fitText(line, { ...st, size: f.size }, W, box, { maxLines: 1, minSize: f.size }).width;
      return `<rect x="${P - 14}" y="${y + i * (box + 10) - 4}" width="${lw + 28}" height="${box + 8}" fill="${fill}"/>${drawText(lf, P, y + i * (box + 10), lw)}`;
    });
    const h = f.lines.length * (box + 10);
    parts.push(c.el("title", "text", strips.join(""), { x: P - 14, y: y - 4, w: Math.min(W - 2 * P, f.width + 28), h }));
    y += h + 18;
  }
  const eyebrowStrip = c.text("eyebrow");
  if (eyebrowStrip && !c.ov("eyebrow").hidden) {
    const st = c.styled("eyebrow", c.style("body", 24, "#FFFFFF", { weight: 600, uppercase: true, tracking: 0.12, lineHeight: 1.2 }));
    const f = fitText(eyebrowStrip, st, W - 2 * P - 40, 80, { maxLines: 2, minSize: 18 });
    parts.push(c.el("eyebrow", "text", `<rect x="${P - 14}" y="${y - 10}" width="${f.width + 28}" height="${f.height + 20}" fill="#141218" fill-opacity="0.82"/>${drawText(f, P, y, f.width)}`, { x: P - 14, y: y - 10, w: f.width + 28, h: f.height + 20 }));
  }
  // Price sticker.
  const price = c.text("price");
  if (price) {
    const r = c.square ? 170 : 190;
    const cx = W - P - r + 10;
    const cy = H - (c.story ? c.safeBottom : P) - r - 30;
    const accent = c.colors.accent;
    const fg = readableOn(accent);
    const pf = fitText(price, c.styled("price", c.style("body", 52, fg, { weight: 700, lineHeight: 1.05 })), r * 1.5, r * 0.9, { maxLines: 1, minSize: 28 });
    const det = c.ov("details").hidden ? null : fitText(c.text("details"), c.style("body", 24, fg, { weight: 600, lineHeight: 1.15 }), r * 1.3, r * 0.5, { maxLines: 2, minSize: 16 });
    const total = pf.height + (det && det.lines.length ? det.height + 10 : 0);
    const ty = cy - total / 2;
    const sticker = `<g transform="rotate(-8 ${cx} ${cy})"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${accent}"/><circle cx="${cx}" cy="${cy}" r="${r - 14}" fill="none" stroke="${fg}" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="4 8"/>${drawText(pf, cx - r * 0.72, ty, r * 1.45, "center")}${det && det.lines.length ? drawText(det, cx - r * 0.65, ty + pf.height + 10, r * 1.3, "center") : ""}</g>`;
    parts.push(c.el("price", "badge", sticker, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }));
  }
  parts.push(c.badge(P, H - (c.story ? c.safeBottom : P) - 44, "#FFFFFF", "#141218"));
  parts.push(await c.logo(P, c.story ? c.safeTop - 110 : H - P - 60 - (c.text("badge") ? 70 : 0), 240, 56, { plate: true }));
  return parts.join("");
}

async function coverMinimal(c: Canvas): Promise<string> {
  const { W, H, P } = c;
  const top = H * (c.story ? 0.5 : 0.4);
  const parts = [await c.photo(0, 0, 0, W, H, { label: { x: P, y: (c.story ? c.safeTop : P * 0.6) + 116 } }), c.scrim("scrim", top - H * 0.12, [[0, 0], [0.3, 0.5], [0.6, 0.72], [1, 0.86]])];
  const white = { fg: "#FFFFFF", muted: "#FFFFFF", accent: "#FFFFFF" };
  const items = coverItems(c, white).map((it) => (it.key === "details" ? { ...it, style: { ...it.style, opacity: 0.82 } } : it));
  parts.push(c.column(safeRegion(c, { x: P, y: top + P * 0.6, w: W - 2 * P, h: H - top - P * 1.6 }), items, "bottom").svg);
  parts.push(await c.logo(P, c.story ? c.safeTop - 90 : P * 0.6, 260, 60, { plate: true }));
  parts.push(c.badge(W - P, (c.story ? c.safeTop - 90 : P * 0.6) + (c.total > 1 ? 64 : 0), "#FFFFFF", "#141218", 22, "right"));
  parts.push(c.swipeHint("#FFFFFF", H - P * 0.55));
  return parts.join("");
}

async function coverGallery(c: Canvas): Promise<string> {
  const { W, H, P } = c;
  const t = themeFor("gallery", c.colors);
  const m = c.square ? 110 : 120;
  const top = c.story ? c.safeTop - 40 : m;
  const photoH = Math.round(H * (c.square ? 0.48 : c.story ? 0.46 : 0.56));
  const parts = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`];
  parts.push(c.decor(`<rect x="${m - 18}" y="${top - 18}" width="${W - 2 * m + 36}" height="${photoH + 36}" fill="none" stroke="${t.fg}" stroke-opacity="0.12" stroke-width="1.5"/>`));
  parts.push(await c.photo(0, m, top, W - 2 * m, photoH));
  // Caption like a museum label: small caps line, title, thin rule, details · price.
  const y0 = top + photoH + (c.square ? 56 : 70);
  const region = safeRegion(c, { x: m, y: y0, w: W - 2 * m, h: H - y0 - (c.square ? 125 : 150) });
  const items: ColumnItem[] = [
    { key: "eyebrow", text: c.text("eyebrow"), style: c.style("body", 22, t.muted, { weight: 600, uppercase: true, tracking: 0.2 }), maxLines: 1, gap: 22, align: "center" },
    { key: "title", text: c.text("title"), style: c.style("heading", c.story ? 66 : 54, t.fg, { lineHeight: 1.12 }), maxLines: 3, flex: true, gap: 30, align: "center" },
    { key: "details", text: c.text("details"), style: c.style("body", 26, t.muted, { weight: 500, tracking: 0.04 }), maxLines: 2, gap: 12, align: "center" },
    { key: "price", text: c.text("price"), style: c.style("body", 34, t.fg, { weight: 600, tracking: 0.04 }), maxLines: 1, align: "center" },
  ];
  const col = c.column(region, items, "top");
  parts.push(col.svg);
  const ruleY = (col.tops[2] ?? 0) - 16;
  if (c.text("details") || c.text("price")) parts.push(c.decor(`<rect x="${W / 2 - 40}" y="${ruleY}" width="80" height="1.5" fill="${t.fg}" fill-opacity="0.4"/>`));
  parts.push(c.badge(W - m, top + 24, t.bg, t.fg, 20, "right"));
  parts.push(await c.logo(P, H - (c.story ? c.safeBottom - 40 : 110), W - 2 * P, 50, { align: "center" }));
  parts.push(c.swipeHint(t.fg, H - 70));
  return parts.join("");
}

async function coverArch(c: Canvas): Promise<string> {
  const { W, H, P } = c;
  const t = themeFor("arch", c.colors);
  const x0 = P * 1.25;
  const x1 = W - P * 1.25;
  const y0 = c.story ? c.safeTop - 60 : P * 1.1;
  const archH = H * (c.square ? 0.5 : c.story ? 0.46 : 0.54);
  const r = (x1 - x0) / 2;
  const y1 = y0 + Math.max(archH, r + 40);
  const shape = `<path d="M${x0} ${y0 + r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}L${x1} ${y1}L${x0} ${y1}Z"/>`;
  const clip = c.newClip(shape);
  const parts = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`, await c.photo(0, x0, y0, x1 - x0, y1 - y0, { clip })];
  parts.push(c.decor(`<path d="M${x0 - 14} ${y0 + r}A${r + 14} ${r + 14} 0 0 1 ${x1 + 14} ${y0 + r}L${x1 + 14} ${y1 + 14}L${x0 - 14} ${y1 + 14}Z" fill="none" stroke="${t.accent}" stroke-opacity="0.55" stroke-width="1.5"/>`));
  parts.push(c.badge(x1 - 24, y1 - 24 - 40, t.bg, t.fg, 20, "right"));
  const footer = 56;
  const region = safeRegion(c, { x: P, y: y1 + P * 0.65, w: W - 2 * P, h: H - y1 - P * 0.65 - P * 0.6 - footer - 20 });
  const items = coverItems(c, t, { align: "center", titleSize: c.story ? 80 : 66, priceStyle: c.style("heading", 46, t.accent, { weight: 500, lineHeight: 1.15 }) });
  parts.push(c.column(region, items, "center").svg);
  parts.push(await c.logo(P, Math.min(H - P * 0.6 - footer, H - c.safeBottom + 20), W - 2 * P, footer, { align: "center", plate: luminance(t.bg) < 0.35 && !!c.input.logo, color: t.fg }));
  return parts.join("");
}

async function coverNoir(c: Canvas): Promise<string> {
  const { W, H, P } = c;
  const t = themeFor("noir", c.colors);
  const photoH = Math.round(H * (c.square ? 0.62 : c.story ? 0.62 : 0.66));
  const parts = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`, await c.photo(0, 0, 0, W, photoH, { label: { x: P, y: (c.story ? c.safeTop : P) + 70 } })];
  c.defs.push(`<linearGradient id="nf${c.index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bg}" stop-opacity="0"/><stop offset="1" stop-color="${t.bg}" stop-opacity="1"/></linearGradient>`);
  parts.push(`<rect x="0" y="${photoH * 0.55}" width="${W}" height="${photoH * 0.45 + 2}" fill="url(#nf${c.index})"/>`);
  c.defs.push(`<linearGradient id="nt${c.index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bg}" stop-opacity="0.85"/><stop offset="1" stop-color="${t.bg}" stop-opacity="0"/></linearGradient>`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${(c.story ? c.safeTop : P) + 160}" fill="url(#nt${c.index})"/>`);
  const inset = 30;
  parts.push(c.decor(`<rect x="${inset}" y="${inset}" width="${W - 2 * inset}" height="${H - 2 * inset}" fill="none" stroke="${t.accent}" stroke-opacity="0.6" stroke-width="1.2"/><rect x="${inset + 10}" y="${inset + 10}" width="${W - 2 * inset - 20}" height="${H - 2 * inset - 20}" fill="none" stroke="${t.accent}" stroke-opacity="0.3" stroke-width="0.8"/>`));
  const region = safeRegion(c, { x: P * 1.4, y: photoH * 0.72, w: W - 2.8 * P, h: H - photoH * 0.72 - P * 1.9 });
  const items: ColumnItem[] = [
    { key: "eyebrow", text: c.text("eyebrow"), style: c.style("body", 21, t.accent, { weight: 500, uppercase: true, tracking: 0.32 }), maxLines: 1, gap: 26, align: "center" },
    { key: "title", text: c.text("title"), style: c.style("heading", c.story ? 78 : 64, t.fg, { weight: 400, lineHeight: 1.1 }), maxLines: 3, flex: true, gap: 28, align: "center" },
    { key: "details", text: c.text("details"), style: c.style("body", 24, t.muted, { weight: 500, uppercase: true, tracking: 0.18 }), maxLines: 2, gap: 18, align: "center" },
    { key: "price", text: c.text("price"), style: c.style("heading", 42, t.accent, { weight: 500 }), maxLines: 1, align: "center" },
  ];
  const col = c.column(region, items, "bottom");
  parts.push(col.svg);
  const ty = col.tops[1];
  if (ty !== undefined && c.text("title")) parts.push(c.decor(`<rect x="${W / 2 - 30}" y="${ty - 16}" width="60" height="1.2" fill="${t.accent}"/>`));
  parts.push(c.badge(W / 2, (c.story ? c.safeTop : P) + 66, t.bg, t.accent, 18, "center"));
  parts.push(await c.logo(W / 2 - 130, (c.story ? c.safeTop : P) - 10, 260, 56, { align: "center", plate: !!c.input.logo, color: t.fg }));
  return parts.join("");
}

async function coverMagazine(c: Canvas): Promise<string> {
  const { W, H, P } = c;
  const parts = [await c.photo(0, 0, 0, W, H, { label: { x: P, y: H - P - 60 } })];
  parts.push(c.scrim("mg", 0, [[0, 0.78], [c.story ? 0.4 : 0.48, 0.5], [0.62, 0.06], [0.74, 0.12], [1, 0.74]]));
  const top = c.story ? c.safeTop - 40 : P * 0.7;
  // Masthead line: office name (logo) + rule + eyebrow, like a magazine issue line.
  parts.push(await c.logo(P, top, 300, 52, { color: "#FFFFFF" }));
  parts.push(c.decor(`<rect x="${P}" y="${top + 74}" width="${W - 2 * P}" height="2" fill="#FFFFFF" fill-opacity="0.85"/>`));
  parts.push(c.textEl("eyebrow", c.style("body", 22, "#FFFFFF", { weight: 600, uppercase: true, tracking: 0.18 }), P, top + 90, W - 2 * P, 40, { maxLines: 1, align: "right" }).svg);
  parts.push(c.textEl("title", c.style("heading", c.story ? 120 : c.square ? 92 : 106, "#FFFFFF", { weight: 500, lineHeight: 0.98, tracking: -0.02 }), P, top + 150, W - 2 * P, H * (c.story ? 0.32 : 0.36), { maxLines: 3, minSize: 50 }).svg);
  // Bottom strip: details on the left, price tag on the right.
  const by = H - (c.story ? c.safeBottom : P) - 70;
  parts.push(c.textEl("details", c.style("body", 28, "#FFFFFF", { weight: 600, uppercase: true, tracking: 0.08 }), P, by, W * 0.52, 80, { maxLines: 2, valign: "bottom" }).svg);
  const price = c.text("price");
  if (price) {
    const st = c.styled("price", c.style("body", 40, readableOn(c.colors.primary), { weight: 700, lineHeight: 1 }));
    const f = fitText(price, st, W * 0.4, 60, { maxLines: 1, minSize: 24 });
    const w = f.width + 48;
    const x = W - P - w;
    parts.push(c.el("price", "badge", `<rect x="${x}" y="${by}" width="${w}" height="80" fill="${c.colors.primary}"/>${drawText(f, x + 24, by + (80 - f.height) / 2, f.width)}`, { x, y: by, w, h: 80 }));
  }
  parts.push(c.badge(P, by - 64, c.colors.accent, readableOn(c.colors.accent), 20));
  parts.push(c.swipeHint("#FFFFFF", by - 40));
  return parts.join("");
}

async function coverCollage(c: Canvas): Promise<string> {
  const { W, H, P } = c;
  const t = themeFor("collage", c.colors);
  const gap = 10;
  const areaH = Math.round(H * (c.square ? 0.6 : c.story ? 0.56 : 0.62));
  const bigW = Math.round((W - gap) * 0.64);
  const smallW = W - gap - bigW;
  const smallH = (areaH - gap) / 2;
  const parts = [
    `<rect width="${W}" height="${H}" fill="${t.bg}"/>`,
    await c.photo(0, 0, 0, bigW, areaH),
    await c.photo(1, bigW + gap, 0, smallW, smallH),
    await c.photo(2, bigW + gap, smallH + gap, smallW, smallH),
  ];
  if (c.slide.photoIds.length < 3) c.warnings.push("Szablon Kolaż wygląda najlepiej z trzema różnymi zdjęciami.");
  parts.push(c.badge(P * 0.6, c.story ? c.safeTop : P * 0.6, c.colors.primary, readableOn(c.colors.primary)));
  const footer = 60;
  const region = safeRegion(c, { x: P, y: areaH + P * 0.7, w: W - 2 * P, h: H - areaH - P * 0.7 - P * 0.6 - footer - 20 });
  parts.push(c.column(region, coverItems(c, t, { titleSize: c.story ? 78 : 60 })).svg);
  const fy = Math.min(H - P * 0.6 - footer, H - c.safeBottom + 10);
  parts.push(await c.logo(P, fy, 280, footer));
  parts.push(c.swipeHint(t.fg, fy + footer / 2));
  return parts.join("");
}

async function coverLines(c: Canvas): Promise<string> {
  const { W, H, P } = c;
  const t = themeFor("lines", c.colors);
  const leftW = Math.round(W * 0.36);
  const top = c.story ? c.safeTop - 40 : P;
  const photoH = Math.round(H * (c.story ? 0.5 : c.square ? 0.62 : 0.6));
  const parts = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`];
  // Architectural grid: thin lines aligned with the photo edges.
  const g = mix(t.fg, t.bg, 0.82);
  parts.push(c.decor(`<g stroke="${g}" stroke-width="1.2"><path d="M${leftW} 0V${H}"/><path d="M0 ${top}H${W}"/><path d="M0 ${top + photoH}H${W}"/><path d="M${W - P * 0.6} 0V${H}"/></g><rect x="${leftW - 5}" y="${top + photoH - 5}" width="10" height="10" fill="${c.colors.primary}"/>`));
  parts.push(await c.photo(0, leftW, top, W - leftW - P * 0.6, photoH));
  // Vertical eyebrow along the left edge.
  const eb = c.text("eyebrow");
  if (eb) {
    const st = c.styled("eyebrow", c.style("body", 22, t.accent, { weight: 600, uppercase: true, tracking: 0.22 }));
    const f = fitText(eb, st, photoH - 20, 40, { maxLines: 1, minSize: 14 });
    const x = P * 0.55;
    const y = top + photoH;
    parts.push(c.el("eyebrow", "text", `<g transform="rotate(-90 ${x} ${y})">${drawText(f, x, y, f.width)}</g>`, { x: x - 4, y: y - f.width, w: f.height + 8, h: f.width }));
  }
  parts.push(c.textEl("details", c.style("body", 28, t.muted, { weight: 500, lineHeight: 1.35 }), P * 1.3, top + 10, leftW - P * 1.6, photoH * 0.5, { maxLines: 4 }).svg);
  parts.push(c.textEl("price", c.style("body", 44, t.fg, { weight: 700, lineHeight: 1.1 }), P * 1.3, top + photoH - 150, leftW - P * 1.6, 130, { maxLines: 2, minSize: 26, valign: "bottom" }).svg);
  const footer = 56;
  const region = safeRegion(c, { x: P * 1.3, y: top + photoH + P * 0.6, w: W - P * 2.6, h: H - top - photoH - P * 1.2 - footer - 20 });
  parts.push(c.column(region, [{ key: "title", text: c.text("title"), style: c.style("heading", c.story ? 84 : 70, t.fg, { lineHeight: 1.04, tracking: -0.015 }), maxLines: 3, flex: true }]).svg);
  parts.push(c.badge(W - P * 0.6 - 20, top + 20, c.colors.primary, readableOn(c.colors.primary), 20, "right"));
  const fy = Math.min(H - P * 0.6 - footer, H - c.safeBottom + 10);
  parts.push(await c.logo(W - P - 260, fy, 260, footer, { align: "right" }));
  parts.push(c.swipeHint(t.fg, fy + footer / 2));
  return parts.join("");
}

const COVERS: Record<TemplateId, (c: Canvas) => Promise<string>> = {
  editorial: coverEditorial,
  magazine: coverMagazine,
  frame: coverFrame,
  corporate: coverCorporate,
  split: coverSplit,
  pricetag: coverPricetag,
  minimal: coverMinimal,
  gallery: coverGallery,
  arch: coverArch,
  noir: coverNoir,
  collage: coverCollage,
  lines: coverLines,
};

// ------------------------------------------------------------ inner slides

type PhotoMode = "bleed" | "inset" | "side" | "top";
const PHOTO_MODE: Record<TemplateId, PhotoMode> = {
  minimal: "bleed", frame: "bleed", noir: "bleed", pricetag: "bleed", magazine: "bleed",
  arch: "inset", gallery: "inset",
  lines: "side", corporate: "top", editorial: "top", collage: "top", split: "top",
};

function headingStyle(c: Canvas, t: Theme, size: number, color: string) {
  return t.headingUpper ? c.style("body", size, color, { weight: 700, uppercase: true, lineHeight: 1.05 }) : c.style("heading", size, color, {});
}

async function photoSlide(c: Canvas, t: Theme): Promise<string> {
  const { W, H, P } = c;
  const mode = PHOTO_MODE[c.input.design.template];
  if (mode === "bleed") {
    const parts = [await c.photo(0, 0, 0, W, H, { label: { x: P, y: c.story ? c.safeTop : P * 0.6 } }), c.scrim("ps", H * 0.4, [[0, 0], [1, 0.8]])];
    const col = c.column(safeRegion(c, { x: P, y: H * 0.45, w: W - 2 * P, h: H * 0.55 - P }), [
      { key: "title", text: c.text("title"), style: headingStyle(c, t, 58, "#FFFFFF"), maxLines: 3, gap: 20, flex: true },
      { key: "body", text: c.text("body"), style: c.style("body", 34, "#FFFFFF", { lineHeight: 1.4, opacity: 0.9 }), maxLines: 5 },
    ], "bottom");
    parts.push(col.svg);
    return parts.join("");
  }
  if (mode === "side" && !c.square) {
    const leftW = Math.round(W * 0.42);
    const parts = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`, await c.photo(0, leftW, 0, W - leftW, H)];
    parts.push(c.decor(`<rect x="${leftW - 3}" y="${H * 0.18}" width="6" height="${H * 0.12}" fill="${c.colors.primary}"/>`));
    parts.push(c.column(safeRegion(c, { x: P * 0.8, y: H * 0.18, w: leftW - P * 1.4, h: H * 0.7 }), [
      { key: "title", text: c.text("title"), style: headingStyle(c, t, 52, t.fg), maxLines: 4, gap: 26, flex: true },
      { key: "body", text: c.text("body"), style: c.style("body", 30, t.muted, { lineHeight: 1.42 }), maxLines: 9 },
    ]).svg);
    return parts.join("");
  }
  const inset = mode === "inset" ? P * 0.8 : 0;
  const photoH = Math.round(H * (c.square ? 0.56 : c.story ? 0.56 : 0.62));
  const parts = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`, await c.photo(0, inset, inset + (c.story ? c.safeTop - inset - 60 : 0), W - 2 * inset, photoH, { rx: inset ? 8 : 0 })];
  const textTop = photoH + inset + (c.story ? c.safeTop - inset - 60 : 0) + P * 0.7;
  parts.push(c.column(safeRegion(c, { x: P, y: textTop, w: W - 2 * P, h: H - textTop - P * 0.8 }), [
    { key: "title", text: c.text("title"), style: headingStyle(c, t, 58, t.fg), maxLines: 2, gap: 22, flex: true, align: mode === "inset" ? "center" : "left" },
    { key: "body", text: c.text("body"), style: c.style("body", 34, t.muted, { lineHeight: 1.4 }), maxLines: 5, align: mode === "inset" ? "center" : "left" },
  ]).svg);
  return parts.join("");
}

type ListMode = "numbers" | "cards" | "centered";
const LIST_MODE: Partial<Record<TemplateId, ListMode>> = { corporate: "cards", pricetag: "cards", split: "cards", gallery: "centered", arch: "centered", noir: "centered" };

async function featuresSlide(c: Canvas, t: Theme): Promise<string> {
  const { W, H, P } = c;
  const mode = LIST_MODE[c.input.design.template] ?? "numbers";
  const keys = ["item1", "item2", "item3", "item4", "item5"].filter((k) => c.text(k));
  const top0 = c.story ? c.safeTop : P * 1.6;
  const head = c.column({ x: P, y: top0, w: W - 2 * P, h: H * 0.24 }, [{ key: "title", text: c.text("title"), style: headingStyle(c, t, 64, t.fg), maxLines: 3, flex: true, align: mode === "centered" ? "center" : "left" }]);
  const bottom = c.story ? c.safeBottom : P;
  const avail = H - (top0 + head.height + P * 0.8) - bottom;
  const rowH = Math.min(c.story ? 210 : 170, avail / Math.max(keys.length, 1));
  const top = top0 + head.height + P * 0.8 + Math.max(0, (avail - rowH * keys.length) / 2.4);
  const parts = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`, head.svg];
  keys.forEach((key, i) => {
    const y = top + i * rowH;
    if (mode === "cards") {
      parts.push(`<rect x="${P}" y="${y + 8}" width="${W - 2 * P}" height="${rowH - 16}" rx="14" fill="${mix(c.colors.primary, t.bg, 0.9)}"/><rect x="${P}" y="${y + 8}" width="10" height="${rowH - 16}" rx="5" fill="${c.colors.primary}"/>`);
      parts.push(c.textEl(key, c.style("body", 36, t.fg, { weight: 600, lineHeight: 1.25 }), P + 44, y + 8, W - 2 * P - 72, rowH - 16, { maxLines: 2, minSize: 24, valign: "center" }).svg);
    } else if (mode === "centered") {
      parts.push(c.textEl(key, c.style("heading", 40, t.fg, { lineHeight: 1.2 }), P, y, W - 2 * P, rowH - 30, { maxLines: 2, minSize: 26, valign: "center", align: "center" }).svg);
      if (i < keys.length - 1) parts.push(c.decor(`<circle cx="${W / 2}" cy="${y + rowH - 8}" r="3" fill="${t.accent}"/>`));
    } else {
      const numW = 96;
      const num = fitText(String(i + 1).padStart(2, "0"), c.style("body", 30, t.accent, { weight: 700, lineHeight: 1 }), numW, rowH);
      const el = c.textEl(key, c.style("body", 38, t.fg, { weight: 500, lineHeight: 1.25 }), P + numW, y, W - 2 * P - numW, rowH - 36, { maxLines: 3, minSize: 26, valign: "center" });
      parts.push(drawText(num, P, y + (rowH - 36 - num.height) / 2, numW), el.svg);
      if (i < keys.length - 1) parts.push(c.decor(`<rect x="${P}" y="${y + rowH - 18}" width="${W - 2 * P}" height="1.5" fill="${t.fg}" fill-opacity="0.14"/>`));
    }
  });
  if (keys.length === 0) c.warnings.push(`Slajd ${c.index + 1}: dodaj przynajmniej jeden atut.`);
  return parts.join("");
}

async function factsSlide(c: Canvas, t: Theme): Promise<string> {
  const { W, H, P } = c;
  const rows = c
    .text("rows")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const at = l.indexOf(":");
      return at > 0 ? { label: l.slice(0, at).trim(), value: l.slice(at + 1).trim() } : { label: "", value: l };
    })
    .slice(0, 9);
  const tiles = c.input.design.template === "corporate" || c.input.design.template === "lines" || c.input.design.template === "pricetag";
  const hasPhoto = c.slide.photoIds.length > 0 && !c.ov("photo0").hidden;
  const photoTop = c.story ? c.safeTop - 80 : 0;
  const photoH = hasPhoto ? Math.round(H * (c.square ? 0.32 : c.story ? 0.3 : 0.34)) : 0;
  const parts = [`<rect width="${W}" height="${H}" fill="${t.bg}"/>`];
  if (hasPhoto) parts.push(await c.photo(0, 0, photoTop, W, photoH));
  const headTop = Math.max(photoTop + photoH + P * 0.7, c.story ? c.safeTop : 0);
  const head = c.column({ x: P, y: headTop, w: W - 2 * P, h: 160 }, [{ key: "title", text: c.text("title"), style: headingStyle(c, t, 54, t.fg), maxLines: 2, flex: true }]);
  parts.push(head.svg);
  const top = headTop + head.height + (head.height ? P * 0.5 : 0);
  const bottom = H - (c.story ? c.safeBottom : P);
  const valueStyle = c.styled("rows", c.style("body", tiles ? 40 : 34, t.fg, { weight: 700, lineHeight: 1.2 }));
  const labelStyle = c.style("body", tiles ? 24 : 30, t.muted, { weight: 500, lineHeight: 1.2, uppercase: tiles, tracking: tiles ? 0.08 : undefined });
  const svgs: string[] = [];
  if (tiles) {
    const cols = 2;
    const gap = 18;
    const tileW = (W - 2 * P - gap) / cols;
    const tileH = Math.min(170, (bottom - top - gap * 4) / Math.ceil(rows.length / cols));
    rows.forEach((r, i) => {
      const x = P + (i % cols) * (tileW + gap);
      const y = top + Math.floor(i / cols) * (tileH + gap);
      svgs.push(`<rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" rx="12" fill="${mix(c.colors.primary, t.bg, 0.92)}"/>`);
      const lab = fitText(r.label, labelStyle, tileW - 48, tileH * 0.35, { maxLines: 1, minSize: 14 });
      const val = fitText(r.value, valueStyle, tileW - 48, tileH * 0.5, { maxLines: 2, minSize: 20 });
      svgs.push(drawText(lab, x + 24, y + 24, tileW - 48), drawText(val, x + 24, y + 24 + lab.height + 10, tileW - 48));
      if (val.overflow) c.warnings.push(`Slajd ${c.index + 1}: wartość „${r.value.slice(0, 30)}” skrócona.`);
    });
  } else {
    const rowH = Math.min(104, (bottom - top) / Math.max(rows.length, 1));
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const half = (W - 2 * P) / 2;
      const lab = fitText(r.label, labelStyle, half - 20, rowH - 16, { maxLines: 2, minSize: 20 });
      const val = fitText(r.value, valueStyle, r.label ? half : W - 2 * P, rowH - 16, { maxLines: 2, minSize: 22 });
      if (val.overflow || lab.overflow) c.warnings.push(`Slajd ${c.index + 1}: wiersz „${(r.label || r.value).slice(0, 30)}” skrócony.`);
      svgs.push(drawText(lab, P, y + (rowH - lab.height) / 2, half - 20));
      svgs.push(drawText(val, r.label ? P + half : P, y + (rowH - val.height) / 2, r.label ? half : W - 2 * P, r.label ? "right" : "left"));
      svgs.push(`<rect x="${P}" y="${y + rowH - 1}" width="${W - 2 * P}" height="1.5" fill="${t.fg}" fill-opacity="0.12"/>`);
    });
  }
  if (rows.length) parts.push(c.el("rows", "text", svgs.join(""), { x: P, y: top, w: W - 2 * P, h: Math.max(40, bottom - top) }));
  else c.warnings.push(`Slajd ${c.index + 1}: brak parametrów do pokazania.`);
  return parts.join("");
}

async function ctaSlide(c: Canvas, t: Theme): Promise<string> {
  const { W, H, P } = c;
  const template = c.input.design.template;
  const fg = t.ctaFg;
  const parts = [`<rect width="${W}" height="${H}" fill="${t.ctaBg}"/>`];
  if (template === "gallery" || template === "noir" || template === "arch") {
    const m = 60;
    parts.push(c.decor(`<rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${template === "gallery" ? t.fg : t.accent}" stroke-opacity="0.35" stroke-width="1.5"/>`));
  }
  if (template === "lines" || template === "corporate") parts.push(c.decor(`<rect x="${P}" y="${c.story ? c.safeTop - 40 : P}" width="120" height="8" fill="${readableOn(t.ctaBg) === fg ? c.colors.accent : fg}"/>`));
  const footer = 64;
  const centered = template !== "lines" && template !== "corporate" && template !== "pricetag";
  const region = safeRegion(c, { x: P, y: P * 1.6, w: W - 2 * P, h: H - P * 1.6 - P - footer - 40 });
  parts.push(c.column(region, [
    { key: "title", text: c.text("title"), style: headingStyle(c, t, c.story ? 84 : 72, fg), maxLines: 4, gap: 32, flex: true, align: centered ? "center" : "left" },
    { key: "body", text: c.text("body"), style: c.style("body", 36, fg, { lineHeight: 1.4, opacity: 0.86 }), maxLines: 5, gap: 48, align: centered ? "center" : "left" },
    { key: "contact", text: c.text("contact"), style: c.style("body", 34, fg, { weight: 600, lineHeight: 1.45 }), maxLines: 4, align: centered ? "center" : "left" },
  ], centered ? "center" : "bottom").svg);
  const ly = Math.min(H - P - footer, H - c.safeBottom + 20);
  parts.push(await c.logo(P, ly, centered ? W - 2 * P : 300, footer, { plate: !!c.input.logo && luminance(t.ctaBg) < 0.5, color: fg, align: centered ? "center" : "left" }));
  return parts.join("");
}

export async function renderSlideSvg(input: RenderInput, index: number): Promise<SlideRender> {
  const slide = input.design.slides[index];
  if (!slide) throw new Error("slide out of range");
  const c = new Canvas(input, slide, index, input.design.slides.length);
  const t = themeFor(input.design.template, c.colors);
  let body: string;
  switch (slide.kind) {
    case "cover":
      body = await COVERS[input.design.template](c);
      break;
    case "photo":
      body = await photoSlide(c, t);
      break;
    case "features":
      body = await featuresSlide(c, t);
      break;
    case "facts":
      body = await factsSlide(c, t);
      break;
    case "cta":
      body = await ctaSlide(c, t);
      break;
  }
  const pager = slide.kind === "cover" ? "" : c.pager();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.W}" height="${c.H}" viewBox="0 0 ${c.W} ${c.H}"><title>${esc(input.brand.companyName)}</title><defs>${c.defs.join("")}</defs>${body}${pager}</svg>`;
  return { svg, width: c.W, height: c.H, warnings: [...new Set(c.warnings)], layout: c.layout };
}
