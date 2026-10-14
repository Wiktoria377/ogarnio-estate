import "server-only";
import sharp from "sharp";
import { AppError } from "@/lib/errors";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

/** Detects the real type from magic bytes; the browser-declared type is not trusted. */
export function sniffImageType(buf: Buffer): AllowedMime | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export interface ProcessedImage {
  data: Buffer;
  mime: AllowedMime;
  ext: "jpg" | "png" | "webp";
  width: number;
  height: number;
}

/**
 * Validates and normalises an uploaded image: applies EXIF orientation, strips
 * all metadata (GPS location, device data: RODO), caps the resolution and
 * re-encodes. Re-encoding also neutralises polyglot/malformed files.
 */
export async function processUpload(file: File, purpose: "photo" | "logo" | "reference"): Promise<ProcessedImage> {
  if (file.size === 0) throw new AppError("Plik jest pusty.", "empty_file");
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError("Plik jest za duży (maks. 10 MB).", "too_large", 413);
  const input = Buffer.from(await file.arrayBuffer());
  const type = sniffImageType(input);
  if (!type) throw new AppError("Obsługiwane formaty to JPG, PNG i WebP.", "bad_type", 415);

  const maxEdge = purpose === "logo" ? 1200 : 2560;
  let pipeline = sharp(input, { limitInputPixels: 60_000_000, failOn: "error" }).rotate().resize({
    width: maxEdge,
    height: maxEdge,
    fit: "inside",
    withoutEnlargement: true,
  });

  try {
    const meta = await sharp(input, { limitInputPixels: 60_000_000 }).metadata();
    if (!meta.width || !meta.height) throw new Error("no dimensions");
    if (purpose === "photo" && Math.min(meta.width, meta.height) < 300)
      throw new AppError("Zdjęcie ma za niską rozdzielczość (min. 300 px na krótszym boku).", "too_small");
    const keepAlpha = purpose === "logo" && (meta.hasAlpha ?? false);
    pipeline = keepAlpha ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 86, mozjpeg: true });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return keepAlpha
      ? { data, mime: "image/png", ext: "png", width: info.width, height: info.height }
      : { data, mime: "image/jpeg", ext: "jpg", width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Nie udało się odczytać obrazu. Plik może być uszkodzony.", "bad_image", 422);
  }
}
