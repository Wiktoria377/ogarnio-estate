import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/session";
import { getStorage } from "@/lib/storage";
import { apiError, assertSameOrigin } from "@/lib/api";
import { readFormDataLimited } from "@/lib/http-body";
import { AppError, dbError } from "@/lib/errors";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_TRACKS = 30;

/** Magic-byte sniffing; the browser-declared type is never trusted. */
function sniffAudio(b: Buffer): { mime: string; ext: string } | null {
  if (b.length < 12) return null;
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WAVE") return { mime: "audio/wav", ext: "wav" };
  if (b.toString("latin1", 4, 8) === "ftyp") return { mime: "audio/mp4", ext: "m4a" };
  if (b.toString("latin1", 0, 3) === "ID3") return { mime: "audio/mpeg", ext: "mp3" };
  if (b[0] === 0xff && (b[1]! & 0xf6) === 0xf0) return { mime: "audio/aac", ext: "aac" }; // ADTS
  if (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) return { mime: "audio/mpeg", ext: "mp3" }; // MPEG frame sync
  return null;
}

const meta = z.object({
  label: z.string().trim().min(1, "Podaj nazwę utworu.").max(160),
  rights: z.literal("yes", { error: "Potwierdź, że masz prawa do użycia utworu w materiałach reklamowych." }),
  rightsNote: z.string().trim().max(300).optional(),
});

/** Music for Reels: only files the office owns or licensed (confirmed on upload). */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES + 64 * 1024) throw new AppError("Plik jest za duży (maks. 15 MB).", "too_large", 413);
    const ctx = await authorize("editor");
    const form = await readFormDataLimited(req, MAX_AUDIO_BYTES + 64 * 1024, "Plik jest za duży (maks. 15 MB).");
    const parsed = meta.safeParse({ label: form.get("label"), rights: form.get("rights"), rightsNote: form.get("rightsNote") || undefined });
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane.", "bad_request");
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Nie wybrano pliku.", "no_file");
    if (file.size > MAX_AUDIO_BYTES) throw new AppError("Plik jest za duży (maks. 15 MB).", "too_large", 413);
    const data = Buffer.from(await file.arrayBuffer());
    const type = sniffAudio(data);
    if (!type) throw new AppError("Obsługujemy pliki MP3, M4A, WAV i AAC.", "bad_type", 415);
    const { count } = await ctx.supabase.from("media_assets").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
    if ((count ?? 0) >= MAX_TRACKS) throw new AppError(`Biblioteka muzyki mieści maks. ${MAX_TRACKS} utworów. Usuń nieużywane.`, "limit", 409);
    const key = `${ctx.workspace.id}/audio/${randomUUID()}.${type.ext}`;
    const storage = getStorage(ctx.supabase);
    await storage.put(key, data, type.mime);
    const { data: row, error } = await ctx.supabase
      .from("media_assets")
      .insert({ workspace_id: ctx.workspace.id, kind: "audio", storage_path: key, mime_type: type.mime, size_bytes: data.length, label: parsed.data.label, rights_confirmed_at: new Date().toISOString(), rights_note: parsed.data.rightsNote ?? null, created_by: ctx.userId })
      .select("id, label, storage_path, created_at")
      .single();
    if (error || !row) {
      await storage.remove([key]).catch(() => {});
      throw dbError(error, "Nie udało się zapisać utworu.");
    }
    return NextResponse.json({ track: { id: row.id, label: row.label, url: `/api/files/${row.storage_path}` } });
  } catch (error) {
    return apiError(error);
  }
}
