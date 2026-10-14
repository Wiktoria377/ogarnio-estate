import "server-only";
import { Resvg } from "@resvg/resvg-js";
import { zipSync } from "fflate";
import { renderSlideSvg, type RenderInput } from "./templates";

/** SVG → PNG. Text is already converted to paths, so no fonts are needed here. */
export function svgToPng(svg: string, width?: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: width ? { mode: "width", value: width } : { mode: "original" },
    font: { loadSystemFonts: false },
    imageRendering: 0,
    shapeRendering: 2,
  });
  return Buffer.from(resvg.render().asPng());
}

export async function renderSlidePng(input: RenderInput, index: number, width?: number) {
  const r = await renderSlideSvg(input, index);
  return { png: svgToPng(r.svg, width), warnings: r.warnings };
}

export async function renderAllSlides(input: RenderInput) {
  const out: { png: Buffer; warnings: string[] }[] = [];
  for (let i = 0; i < input.design.slides.length; i++) out.push(await renderSlidePng(input, i));
  return out;
}

/** Carousel export: one PNG per slide, numbered, in a ZIP. */
export async function renderZip(input: RenderInput, baseName: string): Promise<Buffer> {
  const slides = await renderAllSlides(input);
  const files: Record<string, Uint8Array> = {};
  slides.forEach((s, i) => {
    files[`${baseName}-${String(i + 1).padStart(2, "0")}.png`] = s.png;
  });
  return Buffer.from(zipSync(files, { level: 0 }));
}

export type RasterFormat = "png" | "jpg";

/** PNG → JPG at high quality (flattened on white; designs are always opaque). */
export async function toJpg(png: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  return sharp(png).flatten({ background: "#FFFFFF" }).jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
}

export async function renderSlideRaster(input: RenderInput, index: number, format: RasterFormat) {
  const { png, warnings } = await renderSlidePng(input, index);
  return { data: format === "jpg" ? await toJpg(png) : png, warnings };
}

/** Carousel export: one file per slide, numbered, in a ZIP. */
export async function renderZipAs(input: RenderInput, baseName: string, format: RasterFormat): Promise<Buffer> {
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < input.design.slides.length; i++) {
    const { data } = await renderSlideRaster(input, i, format);
    files[`${baseName}-${String(i + 1).padStart(2, "0")}.${format}`] = data;
  }
  return Buffer.from(zipSync(files, { level: 0 }));
}

/**
 * All slides as a PDF, one full-bleed page per slide at the native pixel size
 * (1 px = 1 pt), e.g. for sending a carousel to a client or a printer.
 */
export async function renderPdf(input: RenderInput, title: string): Promise<Buffer> {
  const { default: PDFDocument } = await import("pdfkit");
  const first = await renderSlideSvg(input, 0);
  const doc = new PDFDocument({ size: [first.width, first.height], margin: 0, autoFirstPage: false, info: { Title: title, Author: input.brand.companyName, Creator: "OGARNIO ESTATE" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });
  for (let i = 0; i < input.design.slides.length; i++) {
    const r = i === 0 ? first : await renderSlideSvg(input, i);
    const jpg = await toJpg(svgToPng(r.svg));
    doc.addPage({ size: [r.width, r.height], margin: 0 });
    doc.image(jpg, 0, 0, { width: r.width, height: r.height });
  }
  doc.end();
  await done;
  return Buffer.concat(chunks);
}
