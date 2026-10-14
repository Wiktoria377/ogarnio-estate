import "server-only";
import { z } from "zod";
import { can } from "@/core/auth/permissions";
import { MAX_IMPORT_ROWS } from "@/core/import/csv";
import {
  DIFF_FIELDS, autoMap, diffProperty, fingerprint, formatChangeValue, normalizeRecord, stableJson,
  IMPORT_FIELD_KEYS, type ColumnMapping, type FieldChange, type ImportField, type Issue,
} from "@/core/import/model";
import type { PropertyForm } from "@/verticals/real-estate/property";
import { decryptSecret, encryptSecret, sha256 } from "@/lib/crypto";
import { AppError, dbError } from "@/lib/errors";
import { validateExternalUrl } from "@/lib/net/safe-fetch";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ImportBatchRow, ImportRowRow, ImportSourceKind, Json, PropertyRow, PropertySourceRow } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import { CRM_ADAPTERS, fetchFeed, type CrmCredentials } from "./crm";
import { flattenRecords, type FlatTable } from "./feeds";
import { fetchAll } from "@/lib/supabase/fetch-all";

/**
 * Import pipeline shared by every source:
 *   records → staging (import_rows) → mapping + validation + duplicates (preview)
 *   → user selects rows → import (create / apply confirmed changes) → report.
 * Nothing is written to offers before the user confirms the preview, and
 * materials are never edited automatically: a confirmed price change marks the
 * offer's materials as outdated and (optionally) returns its scheduled
 * publications to approval.
 */

export const SOURCE_LABELS: Record<ImportSourceKind, string> = {
  csv: "Plik (CSV, XML, JSON)",
  feed_xml: "Feed XML",
  feed_json: "Feed JSON",
  asari: "ASARI CRM",
  esticrm: "EstiCRM",
};

export interface SourceConfig {
  url?: string;
  recordPath?: string;
  mapping?: ColumnMapping;
  authType?: "none" | "basic" | "bearer";
  defaultTransaction?: "sale" | "rent";
}

type Secret = { authValue?: string } & Partial<CrmCredentials>;

function cfg(source: Pick<PropertySourceRow, "config">): SourceConfig {
  return (source.config ?? {}) as SourceConfig;
}

function requireImport(ctx: WorkspaceContext) {
  if (!can(ctx.role, "import.run")) throw new AppError("Import ofert uruchamia właściciel lub administrator biura.", "forbidden", 403);
}

export async function loadSource(ctx: WorkspaceContext, id: string): Promise<PropertySourceRow> {
  const { data } = await createAdminClient().from("property_sources").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) throw new AppError("Nie znaleziono źródła ofert.", "not_found", 404);
  return data;
}

export async function ensureCsvSource(ctx: WorkspaceContext): Promise<PropertySourceRow> {
  requireImport(ctx);
  const admin = createAdminClient();
  const { data: existing } = await admin.from("property_sources").select("*").eq("workspace_id", ctx.workspace.id).eq("kind", "csv").maybeSingle();
  if (existing) return existing;
  const { data, error } = await admin.from("property_sources").insert({ workspace_id: ctx.workspace.id, kind: "csv", name: "Import z pliku", created_by: ctx.userId }).select("*").single();
  if (error || !data) {
    // Two parallel first imports: the partial unique index lets only one row in.
    const { data: again } = await admin.from("property_sources").select("*").eq("workspace_id", ctx.workspace.id).eq("kind", "csv").maybeSingle();
    if (again) return again;
    throw dbError(error);
  }
  return data;
}

export const sourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["feed_xml", "feed_json"]),
    name: z.string().trim().min(1, "Podaj nazwę źródła").max(120),
    url: z.string().trim().min(1, "Podaj adres feedu").max(2000),
    recordPath: z.string().trim().max(200).optional().default(""),
    authType: z.enum(["none", "basic", "bearer"]).default("none"),
    authValue: z.string().max(1000).optional().default(""),
    defaultTransaction: z.enum(["sale", "rent"]).default("sale"),
  }),
  z.object({
    kind: z.enum(["asari", "esticrm"]),
    name: z.string().trim().min(1, "Podaj nazwę źródła").max(120),
    account: z.string().trim().min(1, "Podaj identyfikator konta").max(200),
    token: z.string().trim().min(8, "Podaj token API").max(1000),
  }),
]);

export async function createSource(ctx: WorkspaceContext, input: z.input<typeof sourceSchema>): Promise<PropertySourceRow> {
  requireImport(ctx);
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane źródła.", "validation", 422);
  const d = parsed.data;
  let config: SourceConfig = {};
  let secret: Secret | null = null;
  if (d.kind === "feed_xml" || d.kind === "feed_json") {
    validateExternalUrl(d.url);
    if (d.authType !== "none" && !d.authValue) throw new AppError(d.authType === "basic" ? "Podaj login i hasło w formacie login:hasło." : "Podaj token dostępu.", "validation", 422);
    if (d.authType === "basic" && !d.authValue.includes(":")) throw new AppError("Dane Basic Auth podaj w formacie login:hasło.", "validation", 422);
    config = { url: d.url, recordPath: d.recordPath || undefined, authType: d.authType, defaultTransaction: d.defaultTransaction };
    if (d.authType !== "none") secret = { authValue: d.authValue };
  } else if (d.kind === "asari" || d.kind === "esticrm") {
    secret = { account: d.account, token: d.token };
  }
  const admin = createAdminClient();
  const { count } = await admin.from("property_sources").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).neq("kind", "csv");
  if ((count ?? 0) >= 10) throw new AppError("Możesz mieć maksymalnie 10 źródeł ofert.", "limit", 409);
  const { data, error } = await admin.from("property_sources").insert({ workspace_id: ctx.workspace.id, kind: d.kind, name: d.name, config: config as Json, created_by: ctx.userId }).select("*").single();
  if (error || !data) throw dbError(error);
  if (secret) {
    const { error: sErr } = await admin.from("property_source_secrets").insert({ source_id: data.id, workspace_id: ctx.workspace.id, secret_enc: encryptSecret(JSON.stringify(secret)) });
    if (sErr) {
      await admin.from("property_sources").delete().eq("id", data.id);
      throw dbError(sErr);
    }
  }
  return data;
}

export async function deleteSource(ctx: WorkspaceContext, id: string) {
  requireImport(ctx);
  const source = await loadSource(ctx, id);
  if (source.kind === "csv") throw new AppError("Źródła CSV nie usuwa się – to historia importów z plików.", "bad_request", 400);
  // Offers stay; they only lose the link to the source (source_id → null).
  const { error } = await createAdminClient().from("property_sources").delete().eq("id", source.id).eq("workspace_id", ctx.workspace.id);
  if (error) throw dbError(error);
}

async function loadSecret(source: PropertySourceRow): Promise<Secret | null> {
  const { data } = await createAdminClient().from("property_source_secrets").select("secret_enc").eq("source_id", source.id).maybeSingle();
  return data ? (JSON.parse(decryptSecret(data.secret_enc)) as Secret) : null;
}

/** Downloads records from a feed/CRM source (runs in the background job). */
export async function fetchSourceRecords(source: PropertySourceRow, progress: (p: number) => Promise<void>): Promise<FlatTable> {
  const c = cfg(source);
  const secret = await loadSecret(source);
  if (source.kind === "feed_xml" || source.kind === "feed_json") {
    const auth = c.authType && c.authType !== "none" && secret?.authValue ? { type: c.authType, value: secret.authValue } : null;
    const format = source.kind === "feed_xml" ? "xml" : "json";
    const text = await fetchFeed(c.url ?? "", format, auth);
    await progress(60);
    return flattenRecords(text, format, c.recordPath);
  }
  if (source.kind === "asari" || source.kind === "esticrm") {
    if (!secret?.account || !secret.token) throw new AppError("Brak danych dostępowych do CRM. Usuń źródło i dodaj je ponownie.", "no_credentials", 422);
    const adapter = CRM_ADAPTERS[source.kind];
    const baseUrl = (source.kind === "asari" ? process.env.ASARI_API_BASE : process.env.ESTICRM_API_BASE) || adapter.defaultBaseUrl;
    return adapter.fetchAll({ baseUrl, creds: { account: secret.account, token: secret.token }, signal: { progress } });
  }
  throw new AppError("Ten typ źródła importuje się z pliku.", "bad_request", 400);
}

export function presetMapping(source: Pick<PropertySourceRow, "kind" | "config">, headers: string[]): ColumnMapping {
  const saved = cfg(source).mapping ?? {};
  const auto = autoMap(headers);
  const preset: ColumnMapping = source.kind === "asari" || source.kind === "esticrm" ? CRM_ADAPTERS[source.kind].preset : {};
  const out: ColumnMapping = {};
  const used = new Set<string>();
  // Saved mapping (last confirmed by the user) → CRM preset → automatic proposal.
  for (const layer of [saved, preset]) for (const h of headers) if (!(h in out) && layer[h] && !used.has(layer[h]!)) { out[h] = layer[h]!; used.add(layer[h]!); }
  for (const h of headers) if (!(h in out)) out[h] = auto[h] && !used.has(auto[h]!) ? auto[h]! : "";
  for (const h of headers) if (out[h]) used.add(out[h]!);
  return out;
}

/** Creates a preview batch from records and analyses it. */
export async function stageRecords(ctx: WorkspaceContext, source: PropertySourceRow, table: { label: string; headers: string[]; records: Record<string, string>[] }): Promise<string> {
  requireImport(ctx);
  if (!table.records.length) throw new AppError("Źródło nie zwróciło żadnych ofert.", "empty", 422);
  if (table.records.length > MAX_IMPORT_ROWS) throw new AppError(`Za dużo ofert w jednym imporcie (maks. ${MAX_IMPORT_ROWS}).`, "too_many_rows", 422);
  const admin = createAdminClient();
  const mapping = presetMapping(source, table.headers);
  const { data: batch, error } = await admin
    .from("import_batches")
    .insert({ workspace_id: ctx.workspace.id, source_id: source.id, kind: source.kind, label: table.label.slice(0, 300), headers: table.headers.slice(0, 300), mapping: mapping as Json, options: { defaultTransaction: cfg(source).defaultTransaction ?? "sale" } as Json, total_rows: table.records.length, created_by: ctx.userId })
    .select("id")
    .single();
  if (error || !batch) throw dbError(error);
  for (let i = 0; i < table.records.length; i += 500) {
    const chunk = table.records.slice(i, i + 500).map((raw, j) => ({ batch_id: batch.id, workspace_id: ctx.workspace.id, row_number: i + j + 1, raw: raw as Json }));
    const { error: rErr } = await admin.from("import_rows").insert(chunk);
    if (rErr) {
      await admin.from("import_batches").delete().eq("id", batch.id);
      throw dbError(rErr, "Nie udało się zapisać wierszy importu.");
    }
  }
  await analyzeBatch(ctx, batch.id, mapping);
  return batch.id;
}

export async function loadBatch(ctx: WorkspaceContext, id: string): Promise<ImportBatchRow> {
  const { data } = await createAdminClient().from("import_batches").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) throw new AppError("Nie znaleziono importu.", "not_found", 404);
  return data;
}

async function allRows(batchId: string): Promise<ImportRowRow[]> {
  const admin = createAdminClient();
  const out: ImportRowRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("import_rows").select("*").eq("batch_id", batchId).order("row_number").range(from, from + 999);
    if (error) throw dbError(error);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return out;
  }
}

type Existing = Pick<PropertyRow, "id" | "title" | "source_id" | "external_ref" | "status" | (typeof DIFF_FIELDS)[number]>;

export interface RowAnalysis {
  data: PropertyForm | null;
  changes: FieldChange[];
  fingerprint: string | null;
  hash: string | null;
  matchTitle?: string;
}

const mappedFields = (mapping: ColumnMapping) => new Set(Object.values(mapping).filter(Boolean) as ImportField[]);

/** Mapping + validation + duplicate detection + diff for every row of a preview batch. */
export async function analyzeBatch(ctx: WorkspaceContext, batchId: string, mappingInput?: ColumnMapping, opts?: { defaultTransaction?: "sale" | "rent" }) {
  requireImport(ctx);
  const batch = await loadBatch(ctx, batchId);
  if (batch.status !== "preview") throw new AppError("Ten import został już wykonany.", "bad_state", 409);
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const h of batch.headers) {
    const t = mappingInput?.[h] ?? (batch.mapping as ColumnMapping)[h] ?? "";
    if (t && !IMPORT_FIELD_KEYS.includes(t)) continue;
    if (t && used.has(t) && t !== "photos" && t !== "features" && t !== "amenities" && t !== "description") throw new AppError(`Pole „${t}” jest przypisane do więcej niż jednej kolumny.`, "mapping_duplicate", 422);
    mapping[h] = t;
    if (t) used.add(t);
  }
  const options = { ...(batch.options as { defaultTransaction?: "sale" | "rent" }), ...opts };
  const admin = createAdminClient();
  const { data: props } = await fetchAll((lo, hi) => admin.from("properties").select(`id, title, source_id, external_ref, ${DIFF_FIELDS.join(", ")}`).eq("workspace_id", ctx.workspace.id).neq("status", "archived").order("id").range(lo, hi), 20000);
  const existing = (props ?? []) as unknown as Existing[];
  const byRef = new Map(existing.filter((p) => p.source_id === batch.source_id && p.external_ref).map((p) => [p.external_ref!, p]));
  const byPrint = new Map<string, Existing>();
  for (const p of existing) {
    const fp = fingerprint(p);
    if (fp && !byPrint.has(fp)) byPrint.set(fp, p);
  }
  const rows = await allRows(batchId);
  const matchedIds = rows.map((r) => r.match_property_id).filter(Boolean);
  const photoIds = [...new Set([...byRef.values()].map((p) => p.id))];
  const sourcePhotos = new Map<string, string[]>();
  if (photoIds.length || matchedIds.length) {
    const { data: ph } = await admin.from("property_photos").select("property_id, source_url").eq("workspace_id", ctx.workspace.id).not("source_url", "is", null);
    for (const p of ph ?? []) sourcePhotos.set(p.property_id, [...(sourcePhotos.get(p.property_id) ?? []), p.source_url!]);
  }
  const seenRef = new Map<string, number>();
  const seenPrint = new Map<string, number>();
  const mapped = mappedFields(mapping);
  const updates: ImportRowRow[] = [];
  const counts = { create: 0, update: 0, unchanged: 0, skip: 0, invalid: 0 };
  for (const row of rows) {
    const n = normalizeRecord(row.raw as Record<string, string>, mapping, { transaction_type: options.defaultTransaction });
    const issues: Issue[] = [...n.issues];
    const fp = n.data ? fingerprint(n.data) : null;
    const analysis: RowAnalysis = { data: n.data, changes: [], fingerprint: fp, hash: n.data ? sha256(stableJson({ data: n.data, photos: n.photoUrls })) : null };
    let action: ImportRowRow["action"] = "create";
    let match: Existing | undefined;
    let matchKind: ImportRowRow["match_kind"] = null;
    if (!n.data) action = "invalid";
    else {
      const dupRow = (n.externalRef && seenRef.get(n.externalRef)) || (fp && !n.externalRef && seenPrint.get(fp));
      if (dupRow) {
        action = "skip";
        matchKind = "file";
        issues.push({ field: "row", level: "warning", message: `Duplikat wiersza ${dupRow} w tym pliku – pominięto.` });
      } else if (n.externalRef && byRef.has(n.externalRef)) {
        match = byRef.get(n.externalRef)!;
        matchKind = "external_ref";
      } else if (fp && byPrint.has(fp)) {
        match = byPrint.get(fp)!;
        matchKind = "fingerprint";
      }
      if (n.externalRef) seenRef.set(n.externalRef, row.row_number);
      if (fp) seenPrint.set(fp, row.row_number);
      if (match) {
        analysis.matchTitle = match.title;
        analysis.changes = diffProperty(match, n.data, { mapped, currentPhotoUrls: sourcePhotos.get(match.id) ?? [], incomingPhotoUrls: n.photoUrls });
        if (matchKind === "external_ref") action = analysis.changes.length ? "update" : "unchanged";
        else {
          // Same address/size/rooms but no CRM number link: never merged silently.
          action = "skip";
          issues.push({ field: "row", level: "warning", message: `Możliwy duplikat oferty „${match.title}” (ta sama lokalizacja, metraż i liczba pokoi). Wybierz „Aktualizuj” albo „Utwórz nową”.` });
        }
      }
    }
    counts[action === "create" ? "create" : action === "update" ? "update" : action === "unchanged" ? "unchanged" : action === "invalid" ? "invalid" : "skip"]++;
    updates.push({ ...row, normalized: analysis as unknown as Json, issues: issues as unknown as Json, external_ref: n.externalRef, photo_urls: n.photoUrls, match_property_id: match?.id ?? null, match_kind: matchKind, action, selected: action === "create" || action === "update" });
  }
  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await admin.from("import_rows").upsert(updates.slice(i, i + 500), { onConflict: "id" });
    if (error) throw dbError(error, "Nie udało się zapisać analizy importu.");
  }
  await admin.from("import_batches").update({ mapping: mapping as Json, options: options as Json }).eq("id", batchId);
  return counts;
}

export async function setRowChoices(ctx: WorkspaceContext, batchId: string, choices: { id: string; selected: boolean; action?: "create" | "update" | "skip" }[]) {
  requireImport(ctx);
  const batch = await loadBatch(ctx, batchId);
  if (batch.status !== "preview") throw new AppError("Ten import został już wykonany.", "bad_state", 409);
  const admin = createAdminClient();
  const ids = choices.map((c) => c.id);
  const { data: rows } = await admin.from("import_rows").select("id, action, match_property_id, normalized").eq("batch_id", batchId).in("id", ids);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  for (const c of choices) {
    const r = byId.get(c.id);
    if (!r) continue;
    if (r.action === "invalid" && c.selected) throw new AppError("Wiersza z błędami nie można zaimportować. Popraw plik lub mapowanie.", "invalid_row", 422);
    let action = c.action ?? r.action;
    if (action === "update" && !r.match_property_id) throw new AppError("Ten wiersz nie ma pasującej oferty do aktualizacji.", "bad_request", 422);
    if (r.action === "invalid") action = "invalid";
    if (r.action === "unchanged" && !c.action) action = "unchanged";
    const selected = action === "skip" || action === "invalid" || action === "unchanged" ? false : c.selected;
    await admin.from("import_rows").update({ selected, action }).eq("id", c.id).eq("batch_id", batchId);
  }
}

export interface ImportOptions {
  pausePublications: boolean;
  photoRights: boolean;
}

/** Stale-material warning and optional return of scheduled publications to approval. */
async function handlePriceChange(ctx: WorkspaceContext, propertyId: string, change: FieldChange, opts: ImportOptions, sourceName: string) {
  const admin = createAdminClient();
  const reason = `Cena oferty zmieniła się z ${formatChangeValue("price", change.before)} na ${formatChangeValue("price", change.after)} (import: ${sourceName}). Sprawdź materiał przed publikacją.`.slice(0, 500);
  const { data: items } = await admin.from("content_items").update({ stale_reason: reason, stale_since: new Date().toISOString() }).eq("workspace_id", ctx.workspace.id).eq("property_id", propertyId).select("id");
  const itemIds = (items ?? []).map((i) => i.id);
  let paused = 0;
  if (opts.pausePublications && itemIds.length) {
    const { data: pubs } = await admin
      .from("publications")
      .update({ state: "pending_approval", approved_by: null, approved_at: null, approved_hash: null, media: [] as unknown as Json, requested_at: new Date().toISOString(), requested_by: ctx.userId, error_code: "price_changed", error_message: "Cena oferty zmieniła się po akceptacji. Sprawdź treść i zatwierdź ponownie.", updated_by: ctx.userId })
      .eq("workspace_id", ctx.workspace.id)
      .in("content_item_id", itemIds)
      .eq("state", "scheduled")
      .select("id, workspace_id, attempts, schedule_entry_id");
    paused = pubs?.length ?? 0;
    const { syncEntry, logAttempt } = await import("@/lib/publishing/service");
    for (const p of pubs ?? []) {
      await logAttempt(p, "request", "action_required", reason, ctx.userId, "price_changed").catch(() => {});
      await syncEntry(p.schedule_entry_id);
    }
  }
  return { materials: itemIds.length, paused };
}

export async function runImport(ctx: WorkspaceContext, batchId: string, opts: ImportOptions) {
  requireImport(ctx);
  const admin = createAdminClient();
  const batch = await loadBatch(ctx, batchId);
  const source = await loadSource(ctx, batch.source_id);
  const rows = (await allRows(batchId)).filter((r) => r.selected && (r.action === "create" || r.action === "update"));
  if (!rows.length) throw new AppError("Nie zaznaczono żadnych wierszy do importu.", "nothing_selected", 422);
  if (rows.some((r) => r.photo_urls.length) && !opts.photoRights) {
    const { data: me } = await admin.from("workspace_members").select("media_rights_ack_at").eq("workspace_id", ctx.workspace.id).eq("user_id", ctx.userId).maybeSingle();
    if (!me?.media_rights_ack_at) throw new AppError("Potwierdź, że biuro ma prawo używać zdjęć z tego źródła.", "rights_required", 409);
  }
  if (opts.photoRights) await ctx.supabase.rpc("acknowledge_media_rights", { p_ws: ctx.workspace.id });
  // Single run per batch (double click, two tabs): claim atomically.
  const { data: claimed } = await admin.from("import_batches").update({ status: "importing" }).eq("id", batchId).eq("workspace_id", ctx.workspace.id).eq("status", "preview").select("id");
  if (!claimed?.length) throw new AppError("Ten import jest już wykonywany albo został zakończony.", "bad_state", 409);

  const counts = { created: 0, updated: 0, skipped: 0, failed: 0, materials: 0, paused: 0 };
  const photoWork: { propertyId: string; urls: string[]; replace: boolean }[] = [];
  const now = new Date().toISOString();
  const mapped = mappedFields(batch.mapping as ColumnMapping);
  for (const row of rows) {
    const a = row.normalized as unknown as RowAnalysis;
    const result = async (r: ImportRowRow["result"], message: string | null, propertyId: string | null = null) => {
      await admin.from("import_rows").update({ result: r, result_message: message?.slice(0, 1000) ?? null, property_id: propertyId }).eq("id", row.id);
    };
    try {
      if (!a?.data) throw new AppError("Wiersz ma błędy walidacji.", "invalid_row", 422);
      if (row.action === "create") {
        const { data: created, error } = await ctx.supabase
          .from("properties")
          .insert({ ...a.data, agent_id: null, workspace_id: ctx.workspace.id, created_by: ctx.userId, source_id: source.id, external_ref: row.external_ref, external_hash: a.hash, last_synced_at: now })
          .select("id")
          .single();
        if (error?.code === "23505") throw new AppError("Oferta z tym numerem z CRM już istnieje (zaimportowana w międzyczasie).", "duplicate", 409);
        if (error || !created) throw dbError(error, "Nie udało się utworzyć oferty.");
        counts.created++;
        if (row.photo_urls.length) photoWork.push({ propertyId: created.id, urls: row.photo_urls, replace: false });
        await result("created", null, created.id);
        continue;
      }
      // update: re-read the offer and apply only fields that still differ (the user saw this diff in the preview)
      const { data: current } = await admin.from("properties").select(`id, title, source_id, external_ref, ${DIFF_FIELDS.join(", ")}`).eq("id", row.match_property_id!).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (!current) throw new AppError("Oferta do aktualizacji została usunięta.", "not_found", 404);
      const cur = current as unknown as Existing;
      const { data: ph } = await admin.from("property_photos").select("source_url").eq("property_id", cur.id).not("source_url", "is", null);
      const changes = diffProperty(cur, a.data, { mapped, currentPhotoUrls: (ph ?? []).map((p) => p.source_url!), incomingPhotoUrls: row.photo_urls });
      const patch: Record<string, unknown> = { external_hash: a.hash, last_synced_at: now };
      if (row.match_kind === "fingerprint") Object.assign(patch, { source_id: source.id, external_ref: row.external_ref });
      for (const c of changes) if (c.field !== "photos") patch[c.field] = c.after;
      const { error } = await ctx.supabase.from("properties").update(patch as Partial<Omit<PropertyRow, "price_per_m2">>).eq("id", cur.id).eq("workspace_id", ctx.workspace.id);
      if (error) throw dbError(error, "Nie udało się zaktualizować oferty.");
      if (changes.length) {
        const priceChange = changes.find((c) => c.field === "price");
        await admin.from("property_changes").insert({ workspace_id: ctx.workspace.id, property_id: cur.id, source_id: source.id, batch_id: batchId, changes: changes as unknown as Json, incoming: a.data as unknown as Json, incoming_hash: a.hash ?? "", photo_urls: row.photo_urls, status: "applied", price_changed: !!priceChange, decided_by: ctx.userId, decided_at: now });
        if (priceChange) {
          const r = await handlePriceChange(ctx, cur.id, priceChange, opts, source.name);
          counts.materials += r.materials;
          counts.paused += r.paused;
        }
        if (changes.some((c) => c.field === "photos")) photoWork.push({ propertyId: cur.id, urls: row.photo_urls, replace: true });
      }
      counts.updated++;
      await result("updated", changes.length ? `Zmieniono: ${changes.map((c) => c.field).join(", ")}` : null, cur.id);
    } catch (e) {
      counts.failed++;
      await result("failed", e instanceof AppError ? e.message : "Nieoczekiwany błąd.");
    }
  }
  const { count: skipped } = await admin.from("import_rows").select("id", { count: "exact", head: true }).eq("batch_id", batchId).is("result", null);
  counts.skipped = skipped ?? 0;
  await admin.from("import_rows").update({ result: "skipped" }).eq("batch_id", batchId).is("result", null);
  await admin.from("import_batches").update({ status: "completed", created_count: counts.created, updated_count: counts.updated, skipped_count: counts.skipped, error_count: counts.failed, finished_at: new Date().toISOString() }).eq("id", batchId);
  await admin.from("property_sources").update({ last_sync_at: new Date().toISOString(), status: "active", last_error: null, config: { ...cfg(source), mapping: batch.mapping } as Json }).eq("id", source.id);
  let photosQueued = false;
  if (photoWork.length) {
    const { enqueueJobs } = await import("@/lib/jobs/queue");
    await enqueueJobs(ctx, [{ kind: "import_photos", label: `Zdjęcia z importu: ${batch.label}`.slice(0, 160), payload: { batchId, work: photoWork }, dedupeKey: `import_photos:${batchId}` }]);
    photosQueued = true;
  }
  return { ...counts, photosQueued };
}

export async function discardBatch(ctx: WorkspaceContext, batchId: string) {
  requireImport(ctx);
  const { error } = await createAdminClient().from("import_batches").update({ status: "discarded" }).eq("id", batchId).eq("workspace_id", ctx.workspace.id).eq("status", "preview");
  if (error) throw dbError(error);
}

/** CSV error report (semicolon, UTF-8 BOM so Excel opens Polish characters correctly). */
export async function batchReportCsv(ctx: WorkspaceContext, batchId: string): Promise<string> {
  requireImport(ctx);
  await loadBatch(ctx, batchId);
  const rows = await allRows(batchId);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // CSV formula injection guard
    return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const ACTION: Record<string, string> = { create: "nowa oferta", update: "aktualizacja", skip: "pominięty", invalid: "błędy", unchanged: "bez zmian" };
  const RESULT: Record<string, string> = { created: "utworzono", updated: "zaktualizowano", skipped: "pominięto", failed: "błąd", change_pending: "czeka na decyzję" };
  const lines = [["Wiersz", "Numer oferty", "Tytuł", "Decyzja", "Wynik", "Błędy", "Ostrzeżenia", "Komunikat"].join(";")];
  for (const r of rows) {
    const issues = (r.issues as unknown as Issue[]) ?? [];
    const a = r.normalized as unknown as RowAnalysis | null;
    lines.push([r.row_number, r.external_ref ?? "", a?.data?.title ?? "", ACTION[r.action] ?? r.action, r.result ? RESULT[r.result] : "", issues.filter((i) => i.level === "error").map((i) => i.message).join(" | "), issues.filter((i) => i.level === "warning").map((i) => i.message).join(" | "), r.result_message ?? ""].map(esc).join(";"));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
