import "server-only";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { profileSnapshotSchema, type ProfileSnapshot } from "@/core/brand/profile";
import { AppError, dbError } from "@/lib/errors";
import { assertWorkerAvailable, enqueueJobs } from "@/lib/jobs/queue";
import { validateExternalUrl } from "@/lib/net/safe-fetch";
import { rateLimit } from "@/lib/observability";
import { getStorage } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";

export const BRAND_CONSENT_VERSION = "2026-10-brand-v1";
export const BRAND_CONSENT_TEXT =
  "Potwierdzam, że strona należy do mojego biura lub mam zgodę jej właściciela na jej analizę. Zgadzam się na jednorazowe pobranie publicznie dostępnych treści tej strony (do 5 podstron, arkusze stylów, logo i kilka zdjęć) w celu przygotowania propozycji profilu marki. Ogarnio respektuje robots.txt i nie omija ograniczeń dostępu.";

export const startAnalysisSchema = z.object({
  url: z.string().trim().min(4).max(500),
  consent: z.literal(true, { error: "Potwierdź zgodę na analizę strony." }),
  useReferences: z.boolean().default(true),
});

function normaliseUrl(raw: string) {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return validateExternalUrl(withScheme).toString();
}

export async function startAnalysis(ctx: WorkspaceContext, input: z.input<typeof startAnalysisSchema>) {
  const parsed = startAnalysisSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane.", "validation");
  const url = normaliseUrl(parsed.data.url);
  assertWorkerAvailable();
  await rateLimit(`brand-analysis:${ctx.workspace.id}`, 5, 3600, "Możesz uruchomić do 5 analiz strony na godzinę.");
  const { count } = await ctx.supabase.from("brand_analyses").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).in("status", ["queued", "running"]);
  if ((count ?? 0) > 0) throw new AppError("Analiza strony już trwa. Poczekaj na jej wynik.", "analysis_running", 409);
  const { data: a, error } = await ctx.supabase
    .from("brand_analyses")
    .insert({ workspace_id: ctx.workspace.id, url, consent_text: BRAND_CONSENT_TEXT, consent_version: BRAND_CONSENT_VERSION, consented_by: ctx.userId, use_references: parsed.data.useReferences })
    .select("id")
    .single();
  if (error || !a) throw dbError(error, "Nie udało się rozpocząć analizy.");
  const [job] = await enqueueJobs(ctx, [{ kind: "brand_analysis", label: `Analiza marki: ${new URL(url).host}`, payload: { analysisId: a.id }, dedupeKey: `brand-analysis:${a.id}` }]);
  await createAdminClient().from("brand_analyses").update({ job_id: job?.id ?? null }).eq("id", a.id);
  return a.id;
}

/** Logo ids in a snapshot must exist in this office (an old version may point to a deleted file). */
async function sanitise(ctx: WorkspaceContext, snap: ProfileSnapshot): Promise<ProfileSnapshot> {
  const ids = [snap.logo_asset_id, ...snap.extended.logo_variants.map((v) => v.asset_id)].filter((x): x is string => !!x);
  if (!ids.length) return snap;
  const { data } = await ctx.supabase.from("brand_assets").select("id").eq("workspace_id", ctx.workspace.id).in("id", ids);
  const ok = new Set((data ?? []).map((r) => r.id));
  return {
    ...snap,
    logo_asset_id: snap.logo_asset_id && ok.has(snap.logo_asset_id) ? snap.logo_asset_id : null,
    extended: { ...snap.extended, logo_variants: snap.extended.logo_variants.filter((v) => ok.has(v.asset_id)) },
  };
}

export function parseSnapshot(input: unknown): ProfileSnapshot {
  const r = profileSnapshotSchema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new AppError(`Popraw profil: ${issue?.path.join(".") || "dane"}: ${issue?.message ?? "nieprawidłowa wartość"}.`, "validation");
  }
  return r.data;
}

function parseSnapshotLoose(value: unknown): { logo_asset_id: string | null } {
  const v = value as { logo_asset_id?: unknown } | null;
  return { logo_asset_id: typeof v?.logo_asset_id === "string" ? v.logo_asset_id : null };
}

async function draftOf(ctx: WorkspaceContext, versionId: string) {
  const { data } = await ctx.supabase.from("brand_profile_versions").select("*").eq("id", versionId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) throw new AppError("Nie znaleziono wersji profilu.", "not_found", 404);
  return data;
}

/** A logo picked from the analysed site becomes a regular logo asset once approved. */
async function promoteLogo(ctx: WorkspaceContext, assetId: string | null) {
  if (!assetId) return;
  await createAdminClient().from("brand_assets").update({ kind: "logo", label: "Logo (ze strony www)" }).eq("id", assetId).eq("workspace_id", ctx.workspace.id).eq("kind", "reference").eq("label", "Logo ze strony www (propozycja)");
}

export async function saveDraft(ctx: WorkspaceContext, versionId: string, snapshot: unknown) {
  const d = await draftOf(ctx, versionId);
  if (d.status !== "draft") throw new AppError("Ta wersja nie jest już szkicem.", "not_draft", 409);
  const snap = await sanitise(ctx, parseSnapshot(snapshot));
  const { error } = await ctx.supabase.from("brand_profile_versions").update({ snapshot: snap as unknown as Json }).eq("id", versionId).eq("status", "draft");
  if (error) throw dbError(error);
  return snap;
}

export async function approveDraft(ctx: WorkspaceContext, versionId: string, snapshot?: unknown) {
  const snap = snapshot === undefined ? parseSnapshotLoose((await draftOf(ctx, versionId)).snapshot) : await saveDraft(ctx, versionId, snapshot);
  const { data, error } = await ctx.supabase.rpc("approve_brand_version", { p_version: versionId });
  if (error) {
    if (error.message.includes("not_draft")) throw new AppError("Ta wersja została już zatwierdzona lub odrzucona.", "not_draft", 409);
    throw dbError(error, "Nie udało się zatwierdzić profilu.");
  }
  await promoteLogo(ctx, snap?.logo_asset_id ?? null);
  return data as number;
}

export async function discardDraft(ctx: WorkspaceContext, versionId: string) {
  const d = await draftOf(ctx, versionId);
  if (d.status !== "draft") throw new AppError("Ta wersja nie jest szkicem.", "not_draft", 409);
  const { error } = await ctx.supabase.from("brand_profile_versions").update({ status: "discarded", decided_by: ctx.userId, decided_at: new Date().toISOString() }).eq("id", versionId).eq("status", "draft");
  if (error) throw dbError(error);
}

/** Restores an old version as the binding profile (a new version is created, history is kept). */
export async function restoreVersion(ctx: WorkspaceContext, version: number) {
  const { data: v } = await ctx.supabase.from("brand_profile_versions").select("snapshot, status").eq("workspace_id", ctx.workspace.id).eq("version", version).maybeSingle();
  if (!v || v.status === "draft") throw new AppError("Nie znaleziono tej wersji profilu.", "not_found", 404);
  const snap = await sanitise(ctx, parseSnapshot(v.snapshot));
  const { data: id, error } = await createAdminClient().rpc("create_brand_draft", {
    p_ws: ctx.workspace.id, p_source: "restore", p_snapshot: snap as unknown as Json, p_confidence: {}, p_analysis: null,
    p_note: `Przywrócono wersję ${version}`, p_author: ctx.userId, p_restored_from: version,
  });
  if (error || !id) throw dbError(error, "Nie udało się przywrócić wersji.");
  return approveDraft(ctx, id);
}

/** Direct edit of the binding profile (owner/admin): saved and recorded as a new approved version. */
export async function saveProfile(ctx: WorkspaceContext, snapshot: unknown, note = "Edycja profilu marki") {
  const snap = await sanitise(ctx, parseSnapshot(snapshot));
  const { logo_asset_id, extended, ...rest } = snap;
  const { error } = await ctx.supabase.from("brand_profiles").update({ ...rest, logo_asset_id, extended: extended as unknown as Json, updated_by: ctx.userId }).eq("workspace_id", ctx.workspace.id);
  if (error) throw dbError(error);
  return recordVersion(ctx, note);
}

export async function recordVersion(ctx: WorkspaceContext, note: string) {
  const { data, error } = await ctx.supabase.rpc("record_brand_version", { p_ws: ctx.workspace.id, p_source: "manual", p_note: note });
  if (error) throw dbError(error, "Nie udało się zapisać historii profilu.");
  return data as number;
}

// ── Reference materials ────────────────────────────────────────────────────

export const textReferenceSchema = z.object({
  kind: z.enum(["post", "description"]),
  title: z.string().trim().min(1, "Podaj tytuł").max(160),
  text: z.string().trim().min(20, "Wklej co najmniej 20 znaków").max(20_000, "Maksymalnie 20 000 znaków"),
});

const MAX_REFERENCES = 30;

async function assertReferenceRoom(ctx: WorkspaceContext) {
  const { count } = await ctx.supabase.from("brand_references").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
  if ((count ?? 0) >= MAX_REFERENCES) throw new AppError(`Możesz dodać do ${MAX_REFERENCES} materiałów referencyjnych.`, "limit", 409);
}

export async function addTextReference(ctx: WorkspaceContext, input: z.input<typeof textReferenceSchema>) {
  const p = textReferenceSchema.safeParse(input);
  if (!p.success) throw new AppError(p.error.issues[0]?.message ?? "Nieprawidłowe dane.", "validation");
  await assertReferenceRoom(ctx);
  const { error } = await ctx.supabase.from("brand_references").insert({ workspace_id: ctx.workspace.id, kind: p.data.kind, title: p.data.title, text_content: p.data.text, created_by: ctx.userId });
  if (error) throw dbError(error);
}

const run = promisify(execFile);
const MAX_PDF = 15 * 1024 * 1024;

/**
 * PDF reference: magic bytes checked, text extracted by poppler's pdftotext in a
 * temp dir with a time limit (first 30 pages). The PDF is never rendered or executed.
 */
export async function addPdfReference(ctx: WorkspaceContext, file: File, title: string) {
  if (file.size === 0) throw new AppError("Plik jest pusty.", "empty_file");
  if (file.size > MAX_PDF) throw new AppError("Plik PDF jest za duży (maks. 15 MB).", "too_large", 413);
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new AppError("To nie jest plik PDF.", "bad_type", 415);
  await assertReferenceRoom(ctx);
  const dir = await mkdtemp(path.join(tmpdir(), "oe-pdf-"));
  let text = "";
  let note: string | null = null;
  let pages: number | null = null;
  try {
    const src = path.join(dir, "in.pdf");
    await writeFile(src, buf);
    try {
      const { stdout } = await run("pdftotext", ["-l", "30", "-enc", "UTF-8", "-q", src, "-"], { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
      text = stdout.replace(/\f/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      pages = (stdout.match(/\f/g) ?? []).length || null;
      if (text.length < 50) note = "Nie znaleziono tekstu (PDF może zawierać tylko obrazy). Plik zapisano, ale nie zostanie użyty w analizie tonu.";
      if (text.length > 60_000) {
        text = text.slice(0, 60_000);
        note = "Użyto pierwszych 60 000 znaków tekstu.";
      }
    } catch {
      note = "Nie udało się odczytać tekstu z PDF (plik uszkodzony, zaszyfrowany lub narzędzie pdftotext niedostępne na serwerze).";
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const key = `${ctx.workspace.id}/brand/refs/${randomUUID()}.pdf`;
  const storage = getStorage(ctx.supabase);
  await storage.put(key, buf, "application/pdf");
  const { error } = await ctx.supabase.from("brand_references").insert({
    workspace_id: ctx.workspace.id, kind: "pdf", title: title.trim().slice(0, 160) || file.name.slice(0, 160) || "Dokument PDF", storage_path: key,
    mime_type: "application/pdf", size_bytes: buf.length, pages, text_content: text, extraction_note: note, created_by: ctx.userId,
  });
  if (error) {
    await storage.remove([key]).catch(() => {});
    throw dbError(error, "Nie udało się zapisać pliku.");
  }
  return { note };
}

export async function deleteReference(ctx: WorkspaceContext, id: string) {
  const { data, error } = await ctx.supabase.from("brand_references").delete().eq("id", id).eq("workspace_id", ctx.workspace.id).select("storage_path").maybeSingle();
  if (error) throw dbError(error);
  if (data?.storage_path) await getStorage(ctx.supabase).remove([data.storage_path]).catch(() => {});
}
