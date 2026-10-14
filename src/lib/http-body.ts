import "server-only";
import { AppError } from "@/lib/errors";

/**
 * Reads a request body with a hard byte cap while streaming, so a missing or
 * false Content-Length (chunked upload) cannot make the server buffer more.
 */
export async function readBodyLimited(req: Request, maxBytes: number, tooLarge = "Plik jest za duży."): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new AppError(tooLarge, "too_large", 413);
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new AppError(tooLarge, "too_large", 413);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** multipart/form-data with the same streamed cap. */
export async function readFormDataLimited(req: Request, maxBytes: number, tooLarge?: string): Promise<FormData> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) throw new AppError("Nieprawidłowy format przesyłania.", "bad_request", 400);
  const body = await readBodyLimited(req, maxBytes, tooLarge);
  try {
    return await new Response(body as BodyInit, { headers: { "content-type": type } }).formData();
  } catch {
    throw new AppError("Nie udało się odczytać przesłanego pliku.", "bad_request", 400);
  }
}
