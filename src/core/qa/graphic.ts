import type { BrandKit } from "@/core/brand/model";
import { FORMATS, type GraphicDesign } from "@/core/graphics/design";
import type { LayoutElement } from "@/core/graphics/templates";
import { fmt, type QaCheck } from "./types";

/**
 * Graphic QA on the rendered slide: contrast measured on the actual pixels
 * under each text, font size, margins and platform safe zones, overlapping
 * elements, text cut by the layout, brand consistency, and photo proportions
 * (crop, upscaling). Deterministic; contrast over photos is an estimate.
 */
export interface RasterRGBA {
  width: number;
  height: number;
  /** RGBA, row-major. */
  data: Uint8Array | Buffer;
}

export interface SlideQaInput {
  index: number;
  layout: LayoutElement[];
  warnings: string[];
  raster: RasterRGBA;
  /** Rendered width/height of the slide in design pixels (raster may be smaller). */
  width: number;
  height: number;
  photoIds: string[];
}

export interface GraphicQaInput {
  design: GraphicDesign;
  brand: BrandKit;
  slides: SlideQaInput[];
  /** Pixel size of the stored photos (only this office's). */
  photos: Map<string, { width: number; height: number }>;
  /** Fact-check warnings for the slide texts and caption (generator rule layer). */
  factWarnings: string[];
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
export const relLum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Text vs background contrast inside a text box, from pixels: luminances are
 * split in two groups (Otsu); the smaller group is the glyphs, the larger the
 * background. Returns the ratio of their medians and how busy the background is.
 */
export function measureTextContrast(r: RasterRGBA, box: { x: number; y: number; w: number; h: number }, scale = 1): { ratio: number; busy: number } | null {
  const x0 = Math.max(0, Math.floor(box.x * scale));
  const y0 = Math.max(0, Math.floor(box.y * scale));
  const x1 = Math.min(r.width, Math.ceil((box.x + box.w) * scale));
  const y1 = Math.min(r.height, Math.ceil((box.y + box.h) * scale));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 40_000)));
  const lums: number[] = [];
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const i = (y * r.width + x) * 4;
    lums.push(relLum(r.data[i]!, r.data[i + 1]!, r.data[i + 2]!));
  }
  if (lums.length < 8) return null;
  // Otsu threshold on a 64-bin histogram.
  const bins = new Array<number>(64).fill(0);
  for (const l of lums) bins[Math.min(63, Math.floor(l * 64))]!++;
  let best = 0;
  let threshold = 32;
  const total = lums.length;
  const sumAll = bins.reduce((s, n, i) => s + n * i, 0);
  let wB = 0;
  let sumB = 0;
  for (let t = 0; t < 64; t++) {
    wB += bins[t]!;
    if (!wB || wB === total) continue;
    sumB += bins[t]! * t;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / (total - wB);
    const between = wB * (total - wB) * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = t + 1; }
  }
  const lo = lums.filter((l) => l < threshold / 64).sort((a, b) => a - b);
  const hi = lums.filter((l) => l >= threshold / 64).sort((a, b) => a - b);
  if (!lo.length || !hi.length) return { ratio: 1, busy: 0 };
  const [text, bg] = lo.length < hi.length ? [lo, hi] : [hi, lo];
  const med = (a: number[]) => a[Math.floor(a.length / 2)]!;
  // Background spread (10th–90th percentile): a busy photo under the text.
  const p = (a: number[], q: number) => a[Math.min(a.length - 1, Math.floor(a.length * q))]!;
  return { ratio: Math.round(contrast(med(text), med(bg)) * 10) / 10, busy: Math.round(contrast(p(bg, 0.1), p(bg, 0.9)) * 10) / 10 };
}

const area = (b: { w: number; h: number }) => Math.max(0, b.w) * Math.max(0, b.h);
function intersection(a: LayoutElement, b: LayoutElement) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
const normHex = (c: string) => c.trim().toUpperCase();

export function graphicQa(input: GraphicQaInput): QaCheck[] {
  const out: QaCheck[] = [];
  const f = FORMATS[input.design.format];
  const story = f.h / f.w > 1.5;
  const minContrast: { ratio: number; where: string } = { ratio: Infinity, where: "" };
  let minSize = Infinity;

  for (const s of input.slides) {
    const where = `Slajd ${s.index + 1}`;
    const scale = s.raster.width / s.width;
    const texts = s.layout.filter((e) => e.kind === "text");

    // Contrast (measured on pixels) and font size.
    for (const t of texts) {
      const m = measureTextContrast(s.raster, t, scale);
      if (m) {
        const large = (t.size ?? 0) >= 36;
        if (m.ratio < minContrast.ratio) { minContrast.ratio = m.ratio; minContrast.where = `${where}, ${t.label}`; }
        if (m.ratio < 3) out.push({ area: "Kontrast", code: "low_contrast", severity: "problem", where: `${where}, ${t.label}`, message: "Tekst słabo odcina się od tła.", measured: `${fmt(m.ratio)}:1`, fix: "Zmień kolor tekstu, dodaj podkład albo wybierz spokojniejszy fragment zdjęcia.", method: "measurement" });
        else if (m.ratio < 4.5 && !large) out.push({ area: "Kontrast", code: "weak_contrast", severity: "warning", where: `${where}, ${t.label}`, message: "Mały tekst o umiarkowanym kontraście.", measured: `${fmt(m.ratio)}:1`, fix: "Dla małego tekstu celuj w co najmniej 4,5:1: ciemniejszy lub jaśniejszy kolor, podkład.", method: "measurement" });
        if (m.busy > 6 && m.ratio < 7) out.push({ area: "Kontrast", code: "busy_background", severity: "info", where: `${where}, ${t.label}`, message: "Tło pod tekstem jest niejednolite (zdjęcie z detalami).", fix: "Przesuń kadr na spokojniejszy fragment lub użyj układu z panelem tekstu.", method: "estimate" });
      }
      if (t.size) {
        minSize = Math.min(minSize, t.size);
        if (t.size < 22) out.push({ area: "Typografia", code: "small_text", severity: t.size < 18 ? "problem" : "warning", where: `${where}, ${t.label}`, message: "Tekst może być nieczytelny na telefonie.", measured: `${fmt(t.size)} px przy szerokości ${f.w} px`, fix: "Skróć tekst, żeby układ mógł użyć większej czcionki.", method: "measurement" });
      }
    }

    // Margins and platform safe zones.
    for (const e of s.layout.filter((x) => x.kind === "text" || x.kind === "logo" || x.kind === "badge")) {
      const edge = Math.min(e.x, e.y, s.width - (e.x + e.w), s.height - (e.y + e.h));
      if (edge < 20) out.push({ area: "Marginesy", code: "edge", severity: edge < 0 ? "problem" : "warning", where: `${where}, ${e.label}`, message: edge < 0 ? "Element wychodzi poza grafikę." : "Element bardzo blisko krawędzi.", measured: `${fmt(Math.round(edge))} px`, fix: "Przesuń element do środka (co najmniej 24 px od krawędzi).", method: "measurement" });
      if (story && e.kind === "text" && (e.y < 220 || e.y + e.h > s.height - 300)) out.push({ area: "Strefy bezpieczne", code: "story_ui", severity: "warning", where: `${where}, ${e.label}`, message: "Tekst w strefie zasłanianej przez interfejs Stories/Reels.", fix: "Przesuń tekst między 250 px od góry a 340 px od dołu.", method: "measurement" });
    }

    // Overlapping elements.
    const solid = s.layout.filter((x) => x.kind === "text" || x.kind === "logo" || x.kind === "badge" || x.kind === "pager");
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i]!;
      const b = solid[j]!;
      const share = intersection(a, b) / Math.max(1, Math.min(area(a), area(b)));
      if (share > 0.08) {
        const bothText = a.kind === "text" && b.kind === "text";
        out.push({ area: "Nakładanie", code: "overlap", severity: bothText ? "problem" : "warning", where, message: `„${a.label}” nachodzi na „${b.label}”.`, measured: `${Math.round(share * 100)}% mniejszego elementu`, fix: "Przesuń jeden z elementów albo skróć tekst.", method: "measurement" });
      }
    }

    // Layout warnings from the renderer: cut text, missing photo, moved element.
    for (const w of s.warnings) {
      const cut = /skrócon/i.test(w);
      out.push({ area: cut ? "Ucięty tekst" : /zdjęci/i.test(w) ? "Zdjęcia" : "Układ", code: cut ? "text_cut" : "layout", severity: cut ? "problem" : "warning", where, message: w.replace(/^Slajd \d+: /, ""), fix: cut ? "Skróć tekst albo zmniejsz rozmiar elementu; pełna treść nie mieści się w układzie." : undefined, method: "rule" });
    }

    // Photo proportions: crop share and upscaling (pixelation).
    for (const e of s.layout.filter((x) => x.kind === "photo")) {
      const n = Number(e.key.replace("photo", "")) || 0;
      const id = s.photoIds[n] ?? s.photoIds[0];
      const p = id ? input.photos.get(id) : undefined;
      if (!p || !e.w || !e.h) continue;
      const zoom = input.design.slides[s.index]?.overrides?.[e.key]?.zoom ?? 1;
      const cover = Math.max(e.w / p.width, e.h / p.height) * zoom;
      const kept = (Math.min(p.width * cover, e.w) * Math.min(p.height * cover, e.h)) / (p.width * cover * p.height * cover);
      if (cover > 1.25) out.push({ area: "Zdjęcia", code: "upscaled", severity: cover > 2 ? "problem" : "warning", where, message: "Zdjęcie jest powiększane ponad swoją rozdzielczość, może być nieostre.", measured: `${fmt(Math.round(cover * 100) / 100)}×`, fix: "Użyj zdjęcia w większej rozdzielczości lub zmniejsz powiększenie.", method: "measurement" });
      if (kept < 0.5) out.push({ area: "Zdjęcia", code: "heavy_crop", severity: "info", where, message: `Widać ok. ${Math.round(kept * 100)}% zdjęcia.`, fix: "Sprawdź, czy kadr nie ucina ważnej części pomieszczenia; użyj „Zaproponuj kadr”.", method: "measurement" });
    }
  }

  if (minContrast.ratio !== Infinity && !out.some((c) => c.area === "Kontrast" && c.severity !== "info"))
    out.push({ area: "Kontrast", code: "contrast_ok", severity: "ok", message: "Teksty odcinają się od tła.", measured: `najniższy ${fmt(minContrast.ratio)}:1 (${minContrast.where})`, method: "measurement" });
  if (minSize !== Infinity && !out.some((c) => c.area === "Typografia"))
    out.push({ area: "Typografia", code: "size_ok", severity: "ok", message: "Wielkość tekstu czytelna na telefonie.", measured: `najmniejszy ${fmt(minSize)} px`, method: "measurement" });
  for (const a of ["Marginesy", "Nakładanie", "Ucięty tekst"]) if (!out.some((c) => c.area === a)) out.push({ area: a, code: "ok", severity: "ok", message: a === "Marginesy" ? "Elementy w bezpiecznych marginesach." : a === "Nakładanie" ? "Elementy nie nachodzą na siebie." : "Teksty mieszczą się w całości.", method: "measurement" });

  // Brand consistency.
  const palette = new Set([...Object.values(input.brand.colors).filter((c): c is string => typeof c === "string").map(normHex), "#FFFFFF", "#000000"]);
  const designColors = Object.entries(input.design.colors ?? {}).filter(([, v]) => v);
  const offPalette = designColors.filter(([, v]) => !palette.has(normHex(String(v))));
  const elementColors = input.design.slides.flatMap((s) => Object.values(s.overrides ?? {}).map((o) => o.color).filter((c): c is string => !!c));
  const offElements = [...new Set(elementColors.map(normHex))].filter((c) => !palette.has(c));
  const brandIssues: QaCheck[] = [];
  if (offPalette.length) brandIssues.push({ area: "Marka", code: "colors", severity: "warning", message: "Kolory grafiki spoza palety marki.", measured: offPalette.map(([, v]) => String(v)).join(", "), fix: "Przywróć kolory z Brand Studio.", method: "rule" });
  if (offElements.length) brandIssues.push({ area: "Marka", code: "element_colors", severity: "info", message: "Pojedyncze elementy mają kolor spoza palety marki.", measured: offElements.slice(0, 4).join(", "), fix: "Użyj koloru z palety albo zostaw świadomie.", method: "rule" });
  if (input.design.headingFont || input.design.bodyFont) brandIssues.push({ area: "Marka", code: "fonts", severity: "info", message: "Fonty grafiki zmienione względem Brand Studio.", fix: "Przywróć fonty marki, jeśli to nie był celowy wybór.", method: "rule" });
  if (!input.design.showLogo) brandIssues.push({ area: "Marka", code: "no_logo", severity: "warning", message: "Logo biura jest wyłączone.", fix: "Włącz logo w ustawieniach grafiki.", method: "rule" });
  else if (!input.brand.logoKey) brandIssues.push({ area: "Marka", code: "logo_missing", severity: "info", message: "Biuro nie ma logo w Brand Studio, na grafice jest nazwa biura.", fix: "Dodaj logo w Brand Studio.", method: "rule" });
  out.push(...(brandIssues.length ? brandIssues : [{ area: "Marka", code: "ok", severity: "ok" as const, message: "Kolory, fonty i logo zgodne z Brand Studio.", method: "rule" as const }]));

  // Facts in the slide texts.
  for (const w of input.factWarnings) out.push({ area: "Fakty", code: "fact", severity: "problem", message: w, fix: "Popraw tekst według karty oferty.", method: "rule" });
  if (!input.factWarnings.length) out.push({ area: "Fakty", code: "ok", severity: "ok", message: "Liczby na grafice zgodne z danymi oferty.", method: "rule" });
  return out;
}
