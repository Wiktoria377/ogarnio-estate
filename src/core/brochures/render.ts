import "server-only";
import path from "node:path";
import sharp from "sharp";
import type { BrandKit } from "@/core/brand/model";
import { mix, readableOn, luminance } from "@/core/brand/color";
import { fontById, nearestWeight } from "@/core/brand/fonts";
import { loadFont } from "@/core/graphics/fonts";
import type { PropertyRow } from "@/lib/supabase/database.types";
import { formatArea, formatPrice, plural } from "@/lib/utils";
import { floorLabel, propertyFactSheet } from "@/verticals/real-estate/property";
import { PROPERTY_TYPES, TRANSACTIONS } from "@/verticals/real-estate/labels";
import { BROCHURE_VARIANTS, type BrochureDesign } from "./model";

export interface BrochurePhoto {
  id: string;
  data: Buffer;
  isVisualization: boolean;
  caption: string | null;
}
export interface BrochureProperty {
  row: PropertyRow;
  photos: BrochurePhoto[];
}
export interface BrochureInput {
  design: BrochureDesign;
  brand: BrandKit;
  logo: Buffer | null;
  properties: BrochureProperty[];
  /** "Stan na" date printed on every brochure (prices change). */
  asOf: string;
}
export interface BrochureResult {
  pdf: Buffer;
  pages: number;
  warnings: string[];
}

type PDFDoc = PDFKit.PDFDocument;
type Kind = "heading" | "body";
interface TextStyle {
  kind: Kind;
  weight?: number;
  size: number;
  min?: number;
  color: string;
  opacity?: number;
  lineGap?: number;
  align?: "left" | "center" | "right" | "justify";
  tracking?: number;
  upper?: boolean;
}

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const A4: [number, number] = [595.28, 841.89];
const DISCLAIMER = "Materiał ma charakter informacyjny i nie stanowi oferty w rozumieniu art. 66 Kodeksu cywilnego. Dane według stanu na dzień wydruku.";

/** Facts shown in brochure tables, always from the current record. */
function factRows(p: PropertyRow, showPrice: boolean) {
  const keys = ["property_type", "transaction", "market", "location", "area", "rooms", "floor", "year_built", ...(showPrice ? ["price", "price_per_m2"] : [])];
  return propertyFactSheet(p).facts.filter((f) => keys.includes(f.key)).map((f) => ({ key: f.key, label: f.label, value: f.value }));
}
function priceText(p: PropertyRow) {
  return p.price != null ? `${formatPrice(p.price, p.currency)}${p.transaction_type === "rent" ? " / mies." : ""}` : null;
}
function where(p: PropertyRow) {
  return [p.show_street ? p.street : null, p.district, p.city].filter(Boolean).join(", ");
}
function keyParams(p: PropertyRow) {
  return [p.area_m2 != null ? formatArea(p.area_m2) : null, p.rooms != null ? `${p.rooms} ${plural(p.rooms, ["pokój", "pokoje", "pokoi"])}` : null, floorLabel(p.floor, p.total_floors)].filter(Boolean).join("  ·  ");
}

class Brochure {
  readonly doc: PDFDoc;
  readonly warnings: string[] = [];
  readonly c: BrandKit["colors"];
  readonly accent: string;
  private registered = new Set<string>();
  private imageCache = new Map<string, Buffer>();
  W = A4[0];
  H = A4[1];
  readonly M = 42;

  constructor(
    PDFDocument: new (o: PDFKit.PDFDocumentOptions) => PDFDoc,
    readonly input: BrochureInput,
    title: string,
  ) {
    this.doc = new PDFDocument({ size: A4, margin: 0, autoFirstPage: false, bufferPages: true, info: { Title: title, Author: input.brand.companyName, Creator: "OGARNIO ESTATE", Subject: BROCHURE_VARIANTS[input.design.variant].label } });
    this.c = input.brand.colors;
    const pick = input.design.accent === "secondary" ? this.c.secondary : input.design.accent === "accent" ? this.c.accent : this.c.primary;
    // Accent must stay legible as text on the light page background.
    this.accent = luminance(pick) > 0.6 ? mix(pick, "#000000", 0.45) : pick;
  }

  page(landscape = false) {
    const size: [number, number] = landscape ? [A4[1], A4[0]] : A4;
    this.doc.addPage({ size, margin: 0 });
    this.W = size[0];
    this.H = size[1];
    this.doc.rect(0, 0, this.W, this.H).fill(this.c.background);
  }

  /** Registers the brand font (or a fallback that has every glyph of `text`) and selects it. */
  font(kind: Kind, weight: number, text: string): string {
    const preferred = kind === "heading" ? this.input.brand.headingFont : this.input.brand.bodyFont;
    let id = preferred;
    const f = loadFont(id, weight);
    const missing = [...new Set(text.replace(/\s/g, ""))].some((ch) => f.charToGlyphIndex(ch) === 0);
    if (missing) id = "manrope";
    const def = fontById(id);
    const key = `${def.id}-${nearestWeight(def, weight)}`;
    if (!this.registered.has(key)) {
      this.doc.registerFont(key, path.join(FONT_DIR, `${key}.ttf`));
      this.registered.add(key);
    }
    this.doc.font(key);
    return key;
  }

  private prep(text: string, st: TextStyle) {
    return st.upper ? text.toLocaleUpperCase("pl-PL") : text;
  }
  private opts(st: TextStyle, w: number, size: number): PDFKit.Mixins.TextOptions {
    return { width: w, align: st.align ?? "left", lineGap: (st.lineGap ?? 0.3) * size, characterSpacing: st.tracking ? st.tracking * size : 0 };
  }
  measure(text: string, st: TextStyle, w: number, size = st.size) {
    const t = this.prep(text, st);
    this.font(st.kind, st.weight ?? 400, t);
    this.doc.fontSize(size);
    return this.doc.heightOfString(t, this.opts(st, w, size));
  }
  widthOf(text: string, st: TextStyle, size = st.size) {
    const t = this.prep(text, st);
    this.font(st.kind, st.weight ?? 400, t);
    this.doc.fontSize(size);
    return this.doc.widthOfString(t, { characterSpacing: st.tracking ? st.tracking * size : 0 });
  }

  /**
   * Draws text inside a box: shrinks down to `min`, and only then shortens at a
   * sentence or word boundary (with a warning). Nothing is ever clipped.
   */
  box(text: string, x: number, y: number, w: number, h: number, st: TextStyle, o: { valign?: "top" | "center" | "bottom"; label?: string } = {}): number {
    let t = text.trim();
    if (!t) return 0;
    let size = st.size;
    const min = st.min ?? st.size;
    while (size > min && this.measure(t, st, w, size) > h) size = Math.max(min, size - 0.5);
    if (this.measure(t, st, w, size) > h) {
      const sentences = t.split(/(?<=[.!?])\s+/);
      while (sentences.length > 1 && this.measure(sentences.join(" "), st, w, size) > h) sentences.pop();
      t = sentences.join(" ");
      if (this.measure(t, st, w, size) > h) {
        const words = t.split(/\s+/);
        while (words.length > 1 && this.measure(`${words.join(" ")}…`, st, w, size) > h) words.pop();
        t = `${words.join(" ")}…`;
      }
      this.warnings.push(`${o.label ?? "Tekst"}: skrócony, aby zmieścił się w układzie (pełna treść jest w danych materiału).`);
    }
    const height = this.measure(t, st, w, size);
    const ty = o.valign === "center" ? y + (h - height) / 2 : o.valign === "bottom" ? y + h - height : y;
    this.draw(t, x, ty, w, { ...st, size });
    return height;
  }

  draw(text: string, x: number, y: number, w: number, st: TextStyle) {
    const t = this.prep(text, st);
    this.font(st.kind, st.weight ?? 400, t);
    this.doc.fontSize(st.size).fillColor(st.color, st.opacity ?? 1);
    this.doc.text(t, x, y, { ...this.opts(st, w, st.size), lineBreak: true });
    this.doc.fillOpacity(1);
  }

  /** Long text that continues on new pages instead of being cut. */
  flow(text: string, frame: { x: number; y: number; w: number; bottom: number }, st: TextStyle, newPage: () => { x?: number; y: number; bottom: number }): number {
    let y = frame.y;
    let bottom = frame.bottom;
    let x = frame.x;
    const paras = text.split(/\n{1,}/).map((p) => p.trim()).filter(Boolean);
    for (const para of paras) {
      let rest = para;
      while (rest) {
        const h = this.measure(rest, st, frame.w);
        if (y + h <= bottom) {
          this.draw(rest, x, y, frame.w, st);
          y += h + st.size * 0.8;
          rest = "";
          break;
        }
        const words = rest.split(/\s+/);
        let lo = 0;
        let hi = words.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (this.measure(words.slice(0, mid).join(" "), st, frame.w) <= bottom - y) lo = mid;
          else hi = mid - 1;
        }
        if (lo > 0) this.draw(words.slice(0, lo).join(" "), x, y, frame.w, st);
        rest = words.slice(lo).join(" ");
        const next = newPage();
        ({ y, bottom } = next);
        x = next.x ?? frame.x;
      }
    }
    return y;
  }

  async photo(p: BrochurePhoto | undefined, x: number, y: number, w: number, h: number, o: { radius?: number; label?: boolean } = {}) {
    const d = this.doc;
    if (!p) {
      d.save().rect(x, y, w, h).fill(mix(this.c.primary, this.c.background, 0.88)).restore();
      return;
    }
    const pw = Math.round(w * 2.4);
    const ph = Math.round(h * 2.4);
    const key = `${p.id}:${pw}x${ph}`;
    let jpg = this.imageCache.get(key);
    if (!jpg) {
      jpg = await sharp(p.data).rotate().resize(pw, ph, { fit: "cover", position: "attention" }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
      this.imageCache.set(key, jpg);
    }
    d.save();
    if (o.radius) d.roundedRect(x, y, w, h, o.radius).clip();
    d.image(jpg, x, y, { width: w, height: h });
    d.restore();
    if (p.isVisualization && this.input.design.labelVisualizations && o.label !== false) this.pill("WIZUALIZACJA", x + 8, y + h - 24, "#141218", "#FFFFFF", 0.75);
  }

  pill(text: string, x: number, y: number, bg: string, fg: string, bgOpacity = 1) {
    const st: TextStyle = { kind: "body", weight: 700, size: 7.5, color: fg, tracking: 0.08 };
    const w = this.widthOf(text, st) + 14;
    this.doc.save().roundedRect(x, y, w, 16, 8).fillColor(bg, bgOpacity).fill().restore();
    this.draw(text, x + 7, y + 4.4, w, st);
    return w;
  }

  async logo(x: number, y: number, maxW: number, maxH: number, o: { align?: "left" | "right"; color?: string; plate?: boolean } = {}) {
    const d = this.doc;
    if (this.input.logo) {
      const meta = await sharp(this.input.logo).metadata();
      const ratio = (meta.width ?? 1) / (meta.height ?? 1);
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      const png = await sharp(this.input.logo).resize(Math.round(w * 3), Math.round(h * 3), { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      const lx = o.align === "right" ? x + maxW - w : x;
      if (o.plate) d.save().roundedRect(lx - 8, y - 6, w + 16, h + 12, 6).fillColor("#FFFFFF", 0.95).fill().restore();
      d.image(png, lx, y, { width: w, height: h });
      return;
    }
    const st: TextStyle = { kind: "heading", weight: 600, size: Math.min(16, maxH * 0.8), min: 9, color: o.color ?? this.c.text };
    const name = this.input.brand.companyName;
    let size = st.size;
    while (size > 9 && this.widthOf(name, st, size) > maxW) size -= 0.5;
    const w = this.widthOf(name, st, size);
    const lx = o.align === "right" ? x + maxW - w : x;
    if (o.plate) d.save().roundedRect(lx - 8, y - 6, w + 16, size * 1.3 + 12, 6).fillColor("#FFFFFF", 0.95).fill().restore();
    this.draw(name, lx, y, w + 2, { ...st, size, color: o.plate ? this.c.text : st.color });
  }

  rule(x: number, y: number, w: number, color = this.accent, weight = 1) {
    this.doc.save().moveTo(x, y).lineTo(x + w, y).lineWidth(weight).strokeColor(color).stroke().restore();
  }

  contactLines(): string[] {
    const a = this.input.design.agent;
    const b = this.input.brand.contact;
    return [a.name, a.phone || b.phone, a.email || b.email, b.website, b.address].filter((x): x is string => !!x && !!x.trim());
  }

  /** Bottom-of-page footer on every page: company, "stan na", page numbers, disclaimer. */
  footers(skipFirst: boolean, skipLast = true) {
    const range = this.doc.bufferedPageRange();
    const total = range.count;
    for (let i = range.start; i < range.start + total; i++) {
      if ((skipFirst && i === 0) || (skipLast && i === range.start + total - 1)) continue;
      this.doc.switchToPage(i);
      const W = this.doc.page.width;
      const H = this.doc.page.height;
      const st: TextStyle = { kind: "body", weight: 500, size: 7, color: mix(this.c.text, this.c.background, 0.45) };
      this.rule(this.M, H - 34, W - 2 * this.M, mix(this.c.text, this.c.background, 0.82), 0.6);
      this.draw(`${this.input.brand.companyName}  ·  stan na ${this.input.asOf}`, this.M, H - 26, W / 2, st);
      this.draw(`${i + 1} / ${total}`, W - this.M - 60, H - 26, 60, { ...st, align: "right" });
    }
  }
}

// ------------------------------------------------------------------ variants

function highlightsOf(d: BrochureDesign, p: PropertyRow) {
  const list = d.highlights.map((h) => h.trim()).filter(Boolean);
  return list.length ? list : [...p.features, ...p.amenities].slice(0, 6);
}
function introOf(d: BrochureDesign, p: PropertyRow) {
  return (d.intro.trim() || p.description || "").trim();
}
function titleOf(d: BrochureDesign, p: PropertyRow) {
  return d.title.trim() || p.title;
}

async function factsTable(b: Brochure, p: PropertyRow, x: number, y: number, w: number, maxH: number, size = 9.5) {
  const rows = factRows(p, b.input.design.showPrice);
  const label: TextStyle = { kind: "body", weight: 500, size, color: mix(b.c.text, b.c.background, 0.4) };
  const value: TextStyle = { kind: "body", weight: 600, size, color: b.c.text, align: "right" };
  const rowH = Math.min(size * 2.3, maxH / Math.max(1, rows.length));
  rows.forEach((r, i) => {
    const ry = y + i * rowH;
    b.draw(r.label, x, ry + (rowH - size * 1.25) / 2, w * 0.48, label);
    b.box(r.value, x + w * 0.46, ry + (rowH - size * 1.25) / 2, w * 0.54, rowH, { ...value, min: size - 2.5 }, { label: r.label });
    if (i < rows.length - 1) b.rule(x, ry + rowH, w, mix(b.c.text, b.c.background, 0.88), 0.5);
  });
  return rows.length * rowH;
}

function bullets(b: Brochure, items: string[], x: number, y: number, w: number, maxH: number, size = 10) {
  const st: TextStyle = { kind: "body", weight: 500, size, min: size - 2, color: b.c.text, lineGap: 0.25 };
  let cy = y;
  for (const it of items) {
    const h = b.measure(it, st, w - 16);
    if (cy + h > y + maxH) {
      b.warnings.push("Część atutów nie zmieściła się na stronie i została pominięta.");
      break;
    }
    b.doc.save().circle(x + 3.5, cy + size * 0.62, 2.6).fill(b.accent).restore();
    b.draw(it, x + 16, cy, w - 16, st);
    cy += h + size * 0.75;
  }
  return cy - y;
}

async function renderCard(b: Brochure) {
  const { design } = b.input;
  const prop = b.input.properties[0]!;
  const p = prop.row;
  b.page();
  const { M, W } = b;
  // Header: logo + document type.
  await b.logo(M, 30, 170, 30);
  b.draw("KARTA OFERTY", W - M - 160, 38, 160, { kind: "body", weight: 700, size: 8, color: b.accent, tracking: 0.18, align: "right" });
  b.rule(M, 70, W - 2 * M);
  // Photos: hero + up to two below.
  const heroH = 210;
  await b.photo(prop.photos[0], M, 84, W - 2 * M, heroH, { radius: 4 });
  const small = prop.photos.slice(1, 3);
  const smallH = 74;
  const gap = 8;
  if (small.length) {
    const sw = (W - 2 * M - gap * (small.length - 1)) / small.length;
    for (let i = 0; i < small.length; i++) await b.photo(small[i], M + i * (sw + gap), 84 + heroH + gap, sw, smallH, { radius: 4 });
  }
  let y = 84 + heroH + (small.length ? gap + smallH : 0) + 22;
  // Title + location + price.
  const priceTxt = design.showPrice ? priceText(p) : null;
  const priceW = priceTxt ? Math.min(190, b.widthOf(priceTxt, { kind: "heading", weight: 600, size: 20, color: b.accent }) + 6) : 0;
  const th = b.box(titleOf(design, p), M, y, W - 2 * M - priceW - 16, 54, { kind: "heading", weight: 600, size: 20, min: 13, color: b.c.text, lineGap: 0.1 }, { label: "Tytuł" });
  if (priceTxt) {
    b.box(priceTxt, W - M - priceW, y, priceW, 28, { kind: "heading", weight: 600, size: 20, min: 12, color: b.accent, align: "right" }, { label: "Cena" });
    if (p.price_per_m2 != null) b.draw(`${Math.round(p.price_per_m2).toLocaleString("pl-PL")} ${p.currency === "PLN" ? "zł" : p.currency}/m²`, W - M - priceW, y + 28, priceW, { kind: "body", weight: 500, size: 8.5, color: mix(b.c.text, b.c.background, 0.4), align: "right" });
  }
  y += Math.max(th, 30) + 6;
  const loc = [`${PROPERTY_TYPES[p.property_type]} · ${TRANSACTIONS[p.transaction_type].toLowerCase()}`, where(p)].filter(Boolean).join(" · ");
  b.draw(loc, M, y, W - 2 * M, { kind: "body", weight: 500, size: 9, color: mix(b.c.text, b.c.background, 0.4) });
  y += 22;
  // Two columns: parameters | highlights + description.
  const colW = (W - 2 * M - 28) / 2;
  const footerTop = b.H - 108;
  const rows = factRows(p, design.showPrice).length;
  const tableH = Math.min(rows * 17, 180);
  b.draw("PARAMETRY", M, y, colW, { kind: "body", weight: 700, size: 7.5, color: b.accent, tracking: 0.16 });
  await factsTable(b, p, M, y + 16, colW, tableH, 8.8);
  const rx = M + colW + 28;
  const hl = highlightsOf(design, p);
  let hlH = 0;
  if (hl.length) {
    b.draw("ATUTY", rx, y, colW, { kind: "body", weight: 700, size: 7.5, color: b.accent, tracking: 0.16 });
    hlH = bullets(b, hl.slice(0, 6), rx, y + 16, colW, tableH, 9);
  }
  const iy = y + 16 + Math.max(tableH, hlH) + 16;
  const intro = introOf(design, p);
  if (intro && footerTop - iy > 30) {
    b.draw("OPIS", M, iy, W - 2 * M, { kind: "body", weight: 700, size: 7.5, color: b.accent, tracking: 0.16 });
    b.box(intro.replace(/\n+/g, " "), M, iy + 15, W - 2 * M, footerTop - iy - 22, { kind: "body", size: 8.8, min: 7.4, color: b.c.text, lineGap: 0.35, align: "justify" }, { label: "Opis" });
  }
  // Contact band.
  const by = b.H - 96;
  b.doc.save().rect(0, by, W, 96).fill(b.c.primary).restore();
  const on = readableOn(b.c.primary);
  b.draw("Zapraszamy na prezentację", M, by + 18, 260, { kind: "heading", weight: 600, size: 14, color: on });
  b.box(b.contactLines().join("  ·  "), M, by + 40, W - 2 * M - 150, 26, { kind: "body", weight: 500, size: 9, min: 7.5, color: on }, { label: "Kontakt" });
  await b.logo(W - M - 130, by + 20, 130, 30, { align: "right", plate: true });
  b.box(DISCLAIMER, M, by + 70, W - 2 * M, 18, { kind: "body", size: 6.3, min: 5.5, color: on, opacity: 0.75 });
  if (prop.photos.some((x) => x.isVisualization)) b.warnings.push("Część zdjęć to wizualizacje: są oznaczone na broszurze.");
}

async function renderPremium(b: Brochure) {
  const { design } = b.input;
  const prop = b.input.properties[0]!;
  const p = prop.row;
  // 1. Cover.
  b.page();
  const { M } = b;
  let W = b.W;
  let H = b.H;
  await b.photo(prop.photos[0], 0, 0, W, H, { label: false });
  const d = b.doc;
  const grad = d.linearGradient(0, H * 0.42, 0, H);
  grad.stop(0, "#0E0D12", 0).stop(0.55, "#0E0D12", 0.6).stop(1, "#0E0D12", 0.9);
  d.rect(0, H * 0.42, W, H * 0.58).fill(grad);
  const top = d.linearGradient(0, 0, 0, 140);
  top.stop(0, "#0E0D12", 0.55).stop(1, "#0E0D12", 0);
  d.rect(0, 0, W, 140).fill(top);
  if (prop.photos[0]?.isVisualization && design.labelVisualizations) b.pill("WIZUALIZACJA", W - M - 90, 44, "#141218", "#FFFFFF", 0.75);
  await b.logo(M, 40, 180, 36, { color: "#FFFFFF" });
  const loc = where(p);
  b.draw([PROPERTY_TYPES[p.property_type], TRANSACTIONS[p.transaction_type].toLowerCase(), loc].filter(Boolean).join("  ·  ").toLocaleUpperCase("pl-PL"), M, H - 300, W - 2 * M, { kind: "body", weight: 600, size: 8.5, color: "#FFFFFF", tracking: 0.16 });
  b.box(titleOf(design, p), M, H - 280, W - 2 * M, 120, { kind: "heading", weight: 500, size: 40, min: 22, color: "#FFFFFF", lineGap: 0.05 }, { label: "Tytuł", valign: "bottom" });
  if (design.subtitle.trim()) b.box(design.subtitle, M, H - 150, W - 2 * M, 44, { kind: "body", size: 12, min: 9, color: "#FFFFFF", opacity: 0.9 }, { label: "Podtytuł" });
  const kp = keyParams(p);
  const priceTxt = design.showPrice ? priceText(p) : null;
  b.rule(M, H - 96, W - 2 * M, "#FFFFFF", 0.6);
  if (kp) b.draw(kp, M, H - 80, W * 0.55, { kind: "body", weight: 600, size: 10.5, color: "#FFFFFF" });
  if (priceTxt) b.box(priceTxt, W / 2, H - 84, W / 2 - M, 26, { kind: "heading", weight: 600, size: 20, min: 12, color: "#FFFFFF", align: "right" }, { label: "Cena" });

  const sectionTitle = (eyebrow: string, title: string, y: number) => {
    b.draw(eyebrow.toLocaleUpperCase("pl-PL"), M, y, W - 2 * M, { kind: "body", weight: 700, size: 8, color: b.accent, tracking: 0.18 });
    b.box(title, M, y + 16, W - 2 * M, 60, { kind: "heading", weight: 500, size: 26, min: 16, color: b.c.text }, { label: "Nagłówek sekcji" });
    return y + 16 + b.measure(title, { kind: "heading", weight: 500, size: 26, color: b.c.text }, W - 2 * M) + 18;
  };

  // 2. About: photo + highlights + description (flows to more pages if long).
  b.page();
  W = b.W;
  H = b.H;
  await b.photo(prop.photos[1] ?? prop.photos[0], 0, 0, W, 300, { label: true });
  let y = sectionTitle("O nieruchomości", titleOf(design, p), 330);
  const hl = highlightsOf(design, p);
  if (hl.length) {
    const colW = (W - 2 * M - 20) / 2;
    const items = hl.slice(0, 6);
    const st: TextStyle = { kind: "body", weight: 600, size: 10, min: 8.5, color: b.c.text };
    let rowY = y;
    for (let i = 0; i < items.length; i += 2) {
      const pair = items.slice(i, i + 2);
      const h = Math.max(...pair.map((t) => b.measure(t, st, colW - 30))) + 6;
      pair.forEach((t, j) => {
        const x = M + j * (colW + 20);
        b.draw(String(i + j + 1).padStart(2, "0"), x, rowY, 24, { kind: "heading", weight: 600, size: 11, color: b.accent });
        b.draw(t, x + 30, rowY, colW - 30, st);
      });
      rowY += h + 8;
    }
    y = rowY + 10;
  }
  const intro = introOf(design, p);
  if (intro) {
    b.rule(M, y, 40);
    y += 16;
    b.flow(intro, { x: M, y, w: W - 2 * M, bottom: H - 56 }, { kind: "body", size: 10.5, color: b.c.text, lineGap: 0.45, align: "left" }, () => {
      b.page();
      return { y: 60, bottom: b.H - 56 };
    });
  } else b.warnings.push("Brak opisu nieruchomości: dodaj go w karcie oferty lub w polu „Opis” broszury.");

  // 3. Parameters + price.
  b.page();
  W = b.W;
  H = b.H;
  y = sectionTitle("Parametry", "Najważniejsze informacje", 60);
  const tableH = await factsTable(b, p, M, y, W - 2 * M, 360, 11);
  y += tableH + 30;
  if (priceTxt) {
    d.save().rect(M, y, W - 2 * M, 86).fill(mix(b.c.primary, b.c.background, 0.9)).restore();
    b.draw(p.transaction_type === "rent" ? "CZYNSZ NAJMU" : "CENA", M + 22, y + 18, 200, { kind: "body", weight: 700, size: 8, color: b.accent, tracking: 0.18 });
    b.box(priceTxt, M + 22, y + 32, W - 2 * M - 44, 40, { kind: "heading", weight: 600, size: 28, min: 16, color: b.c.text }, { label: "Cena" });
    y += 110;
  }
  if (prop.photos[2]) await b.photo(prop.photos[2], M, y, W - 2 * M, Math.min(260, H - y - 60), { radius: 4 });

  // 4. Gallery: one large + two small per page.
  const rest = prop.photos.slice(3, 12);
  for (let i = 0; i < rest.length; i += 3) {
    b.page();
    W = b.W;
    H = b.H;
    const group = rest.slice(i, i + 3);
    const top = 50;
    const bigH = group.length > 1 ? 400 : H - top - 70;
    await b.photo(group[0], M, top, W - 2 * M, bigH, { radius: 4 });
    if (group[0]?.caption) b.draw(group[0].caption, M, top + bigH + 6, W - 2 * M, { kind: "body", size: 8, color: mix(b.c.text, b.c.background, 0.4) });
    if (group.length > 1) {
      const sw = (W - 2 * M - 12) / 2;
      const sy = top + bigH + 26;
      const sh = H - sy - 70;
      for (let j = 1; j < group.length; j++) await b.photo(group[j], M + (j - 1) * (sw + 12), sy, sw, sh, { radius: 4 });
    }
  }

  // 5. Contact.
  b.page();
  W = b.W;
  H = b.H;
  d.save().rect(0, 0, W, H).fill(b.c.primary).restore();
  const on = readableOn(b.c.primary);
  await b.logo(M, 60, 200, 44, { plate: true });
  b.box("Umów prezentację nieruchomości", M, H * 0.36, W - 2 * M, 110, { kind: "heading", weight: 500, size: 34, min: 20, color: on }, { label: "CTA" });
  let cy = H * 0.36 + 130;
  for (const line of b.contactLines()) {
    b.draw(line, M, cy, W - 2 * M, { kind: "body", weight: 500, size: 13, color: on });
    cy += 22;
  }
  b.box(DISCLAIMER, M, H - 110, W - 2 * M, 30, { kind: "body", size: 7.5, min: 6, color: on, opacity: 0.75 });
  if (prop.photos.length < 3) b.warnings.push("Broszura premium wygląda najlepiej z co najmniej 4 zdjęciami.");
}

async function renderCatalog(b: Brochure) {
  const { design, properties, brand } = b.input;
  b.page();
  const { M } = b;
  const W = b.W;
  const H = b.H;
  const d = b.doc;
  // Cover: brand colour field + mosaic of the first offers' photos.
  d.save().rect(0, 0, W, H).fill(b.c.secondary).restore();
  const on = readableOn(b.c.secondary);
  const covers = properties.map((x) => x.photos[0]).filter((x): x is BrochurePhoto => !!x).slice(0, 4);
  const mh = H * 0.48;
  const g = 3;
  if (covers.length === 3) {
    await b.photo(covers[0], 0, 0, W * 0.6 - g / 2, mh, { label: false });
    await b.photo(covers[1], W * 0.6 + g / 2, 0, W * 0.4 - g / 2, mh / 2 - g / 2, { label: false });
    await b.photo(covers[2], W * 0.6 + g / 2, mh / 2 + g / 2, W * 0.4 - g / 2, mh / 2 - g / 2, { label: false });
  } else {
    const cols = Math.min(2, covers.length) || 1;
    const rows = Math.ceil(covers.length / 2) || 1;
    for (let i = 0; i < covers.length; i++) await b.photo(covers[i], (i % cols) * (W / cols + g / 2), Math.floor(i / cols) * (mh / rows + g / 2), W / cols - (cols > 1 ? g / 2 : 0), mh / rows - (rows > 1 ? g / 2 : 0), { label: false });
  }
  await b.logo(M, mh + 40, 200, 40, { plate: true });
  b.draw("KATALOG OFERT", M, mh + 110, W - 2 * M, { kind: "body", weight: 700, size: 9, color: on, tracking: 0.2, opacity: 0.85 });
  b.box(design.title.trim() || `Wybrane nieruchomości ${brand.companyName}`, M, mh + 128, W - 2 * M, 110, { kind: "heading", weight: 500, size: 36, min: 20, color: on, lineGap: 0.05 }, { label: "Tytuł" });
  if (design.subtitle.trim()) b.box(design.subtitle, M, mh + 250, W - 2 * M, 50, { kind: "body", size: 12, min: 9, color: on, opacity: 0.9 }, { label: "Podtytuł" });
  b.draw(`${properties.length} ${plural(properties.length, ["oferta", "oferty", "ofert"])}  ·  stan na ${b.input.asOf}`, M, H - 70, W - 2 * M, { kind: "body", weight: 600, size: 10, color: on });

  // Two offers per page.
  for (let i = 0; i < properties.length; i++) {
    if (i % 2 === 0) b.page();
    const prop = properties[i]!;
    const p = prop.row;
    const slotH = (b.H - 70 - 50) / 2;
    const y0 = 40 + (i % 2) * (slotH + 20);
    const pw = (W - 2 * M) * 0.47;
    await b.photo(prop.photos[0], M, y0, pw, slotH - 10, { radius: 4 });
    const x = M + pw + 22;
    const w = W - M - x;
    let y = y0 + 4;
    b.draw(`${PROPERTY_TYPES[p.property_type]} · ${TRANSACTIONS[p.transaction_type].toLowerCase()}`.toLocaleUpperCase("pl-PL"), x, y, w, { kind: "body", weight: 700, size: 7.5, color: b.accent, tracking: 0.14 });
    y += 16;
    y += b.box(p.title, x, y, w, 62, { kind: "heading", weight: 600, size: 17, min: 11, color: b.c.text, lineGap: 0.08 }, { label: `Tytuł oferty ${i + 1}` }) + 6;
    const loc = where(p);
    if (loc) {
      y += b.box(loc, x, y, w, 26, { kind: "body", weight: 500, size: 9, min: 7.5, color: mix(b.c.text, b.c.background, 0.4) }, { label: "Lokalizacja" }) + 10;
    }
    const pt = design.showPrice ? priceText(p) : null;
    if (pt) y += b.box(pt, x, y, w, 30, { kind: "heading", weight: 600, size: 19, min: 12, color: b.accent }, { label: "Cena" }) + 10;
    const kp = keyParams(p);
    if (kp) y += b.box(kp, x, y, w, 30, { kind: "body", weight: 600, size: 9.5, min: 8, color: b.c.text }, { label: "Parametry" }) + 12;
    const hl = [...p.features, ...p.amenities].slice(0, 3);
    if (hl.length) bullets(b, hl, x, y, w, y0 + slotH - 14 - y, 8.8);
    if (i % 2 === 0 && i + 1 < properties.length) b.rule(M, y0 + slotH + 5, W - 2 * M, mix(b.c.text, b.c.background, 0.85), 0.6);
  }
  // Contact page.
  b.page();
  b.doc.save().rect(0, 0, b.W, b.H).fill(b.c.primary).restore();
  const on2 = readableOn(b.c.primary);
  await b.logo(M, 60, 200, 44, { plate: true });
  b.box("Porozmawiajmy o nieruchomości dla Ciebie", M, b.H * 0.36, b.W - 2 * M, 110, { kind: "heading", weight: 500, size: 30, min: 18, color: on2 }, { label: "CTA" });
  let cy = b.H * 0.36 + 120;
  for (const line of b.contactLines()) {
    b.draw(line, M, cy, b.W - 2 * M, { kind: "body", weight: 500, size: 13, color: on2 });
    cy += 22;
  }
  b.box(DISCLAIMER, M, b.H - 110, b.W - 2 * M, 30, { kind: "body", size: 7.5, min: 6, color: on2, opacity: 0.75 });
}

async function renderPresentation(b: Brochure) {
  const { design } = b.input;
  const prop = b.input.properties[0]!;
  const p = prop.row;
  const M = 46;
  const head = (eyebrow: string, title: string) => {
    b.draw(eyebrow.toLocaleUpperCase("pl-PL"), M, 46, b.W / 2, { kind: "body", weight: 700, size: 8, color: b.accent, tracking: 0.18 });
    b.box(title, M, 62, b.W * 0.5 - M, 70, { kind: "heading", weight: 500, size: 26, min: 16, color: b.c.text }, { label: "Nagłówek slajdu" });
  };
  // 1. Title slide.
  b.page(true);
  let { W, H } = b;
  await b.photo(prop.photos[0], W * 0.5, 0, W * 0.5, H);
  await b.logo(M, 40, 160, 32);
  const client = design.clientName.trim();
  b.draw(client ? `PREZENTACJA DLA: ${client.toLocaleUpperCase("pl-PL")}` : "PREZENTACJA NIERUCHOMOŚCI", M, H * 0.34, W * 0.5 - 2 * M, { kind: "body", weight: 700, size: 8.5, color: b.accent, tracking: 0.16 });
  b.box(titleOf(design, p), M, H * 0.34 + 18, W * 0.5 - 2 * M, 130, { kind: "heading", weight: 500, size: 32, min: 18, color: b.c.text, lineGap: 0.05 }, { label: "Tytuł" });
  const loc = where(p);
  if (loc) b.draw(loc, M, H * 0.34 + 160, W * 0.5 - 2 * M, { kind: "body", weight: 500, size: 11, color: mix(b.c.text, b.c.background, 0.4) });
  b.draw([design.agent.name, b.input.asOf].filter(Boolean).join("  ·  "), M, H - 70, W * 0.5 - 2 * M, { kind: "body", weight: 500, size: 9, color: mix(b.c.text, b.c.background, 0.4) });

  // 2. Why this property.
  b.page(true);
  ({ W, H } = b);
  head("Dlaczego ta nieruchomość", "Najważniejsze atuty");
  const hl = highlightsOf(design, p);
  if (hl.length) bullets(b, hl.slice(0, 6), M, 150, W * 0.5 - M - 20, H - 220, 12);
  else b.warnings.push("Brak atutów: dodaj cechy w karcie oferty albo wpisz je w broszurze.");
  await b.photo(prop.photos[1] ?? prop.photos[0], W * 0.55, 46, W * 0.45 - M, H - 110, { radius: 4 });

  // 3. Parameters.
  b.page(true);
  ({ W, H } = b);
  head("Parametry", "Dane nieruchomości");
  await factsTable(b, p, M, 150, W * 0.5 - M - 20, H - 230, 11);
  const pt = design.showPrice ? priceText(p) : null;
  if (pt) {
    b.doc.save().rect(W * 0.55, 150, W * 0.45 - M, 110).fill(mix(b.c.primary, b.c.background, 0.9)).restore();
    b.draw(p.transaction_type === "rent" ? "CZYNSZ NAJMU" : "CENA", W * 0.55 + 22, 172, 200, { kind: "body", weight: 700, size: 8, color: b.accent, tracking: 0.18 });
    b.box(pt, W * 0.55 + 22, 190, W * 0.45 - M - 44, 44, { kind: "heading", weight: 600, size: 30, min: 16, color: b.c.text }, { label: "Cena" });
  }
  if (prop.photos[2]) await b.photo(prop.photos[2], W * 0.55, pt ? 280 : 150, W * 0.45 - M, H - (pt ? 280 : 150) - 64, { radius: 4 });

  // 4. Gallery (2×2).
  const gallery = prop.photos.slice(0, 4);
  if (gallery.length > 1) {
    b.page(true);
    ({ W, H } = b);
    const gw = (W - 2 * M - 12) / 2;
    const gh = (H - 2 * 40 - 12 - 24) / 2;
    for (let i = 0; i < gallery.length; i++) await b.photo(gallery[i], M + (i % 2) * (gw + 12), 40 + Math.floor(i / 2) * (gh + 12), gw, gh, { radius: 4 });
  }

  // 5. Description (flows).
  const intro = introOf(design, p);
  if (intro) {
    b.page(true);
    ({ W, H } = b);
    head("Opis", "O nieruchomości");
    const colW = (W - 2 * M - 30) / 2;
    // Two columns: left column first, then right, then a new slide.
    let col = 0;
    b.flow(intro, { x: M, y: 150, w: colW, bottom: H - 60 }, { kind: "body", size: 10.5, color: b.c.text, lineGap: 0.45 }, () => {
      col++;
      if (col % 2 === 1) return { x: M + colW + 30, y: 150, bottom: H - 60 };
      b.page(true);
      return { y: 60, bottom: b.H - 60 };
    });
  }

  // 6. Next steps + contact.
  b.page(true);
  ({ W, H } = b);
  head("Kolejne kroki", "Jak możemy działać dalej");
  const steps = design.nextSteps.map((s) => s.trim()).filter(Boolean);
  let y = 150;
  steps.forEach((s, i) => {
    b.doc.save().circle(M + 12, y + 10, 12).fill(b.accent).restore();
    b.draw(String(i + 1), M + 4, y + 4, 16, { kind: "body", weight: 700, size: 10, color: readableOn(b.accent), align: "center" });
    y += Math.max(26, b.box(s, M + 36, y + 2, W * 0.5 - M - 50, 50, { kind: "body", weight: 500, size: 12, min: 9.5, color: b.c.text }, { label: `Krok ${i + 1}` })) + 14;
  });
  b.doc.save().rect(W * 0.55, 46, W * 0.45 - M, H - 110).fill(b.c.primary).restore();
  const on = readableOn(b.c.primary);
  await b.logo(W * 0.55 + 26, 76, 160, 36, { plate: true });
  let cy = 150;
  for (const line of b.contactLines()) {
    b.box(line, W * 0.55 + 26, cy, W * 0.45 - M - 52, 22, { kind: "body", weight: 500, size: 12, min: 8, color: on });
    cy += 24;
  }
  b.box(DISCLAIMER, W * 0.55 + 26, H - 64 - 52, W * 0.45 - M - 52, 40, { kind: "body", size: 7, min: 6, color: on, opacity: 0.75 });
}

export async function renderBrochure(input: BrochureInput, title: string): Promise<BrochureResult> {
  const { default: PDFDocument } = await import("pdfkit");
  const b = new Brochure(PDFDocument, input, title);
  const chunks: Buffer[] = [];
  b.doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    b.doc.on("end", () => resolve());
    b.doc.on("error", reject);
  });
  switch (input.design.variant) {
    case "card":
      await renderCard(b);
      break;
    case "premium":
      await renderPremium(b);
      break;
    case "catalog":
      await renderCatalog(b);
      break;
    case "presentation":
      await renderPresentation(b);
      break;
  }
  const pages = b.doc.bufferedPageRange().count;
  if (input.design.variant !== "card") b.footers(true);
  for (const prop of input.properties) {
    if (!prop.photos.length) b.warnings.push(`„${prop.row.title}”: brak zdjęć, w ich miejscu jest kolor marki.`);
  }
  b.doc.end();
  await done;
  return { pdf: Buffer.concat(chunks), pages, warnings: [...new Set(b.warnings)] };
}
