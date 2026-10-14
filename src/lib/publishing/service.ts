import "server-only";
import { z } from "zod";
import { can } from "@/core/auth/permissions";
import { CANCELABLE_STATES, PLATFORMS, defaultFormat, validatePublication } from "@/core/publishing/platforms";
import { sha256 } from "@/lib/crypto";
import { AppError, dbError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, PublicationFormat, PublicationMediaSpec, PublicationRow, ScheduleChannel, SocialPlatform } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import { mediaFacts, prepareMedia } from "./media";

/**
 * Publication lifecycle (server-only; every function re-checks the caller's
 * permission and filters by the active office):
 *
 *   draft → pending_approval → (approve) scheduled → queued → publishing
 *         → processing → published | failed | action_required
 *
 * Approval freezes caption, media and format (approved_hash). Any content change
 * afterwards sends the publication back to draft. Only the time can be moved
 * without a new approval.
 */
export const mediaSpecSchema = z
  .array(z.object({ source: z.enum(["graphic", "photo", "video"]), ref: z.uuid(), slide: z.number().int().min(0).max(9).optional() }))
  .max(20);

export const composeSchema = z.object({
  connectionIds: z.array(z.uuid()).min(1, "Wybierz co najmniej jedno konto.").max(10),
  title: z.string().trim().min(1, "Podaj tytuł wpisu.").max(200),
  caption: z.string().max(5000).default(""),
  captions: z.record(z.string(), z.string().max(5000)).default({}),
  formats: z.record(z.string(), z.enum(["text", "photo", "photo_set", "carousel", "video", "reel"])).default({}),
  linkUrl: z.url().startsWith("https://", "Link musi zaczynać się od https://").max(1000).nullable().default(null),
  media: mediaSpecSchema.default([]),
  scheduledAt: z.iso.datetime({ offset: true }),
  contentItemId: z.uuid().nullable().default(null),
  campaignId: z.uuid().nullable().default(null),
  submit: z.enum(["draft", "request", "approve"]).default("request"),
});
export type ComposeInput = z.input<typeof composeSchema>;

const CHANNEL: Record<SocialPlatform, ScheduleChannel> = { facebook_page: "facebook", instagram: "instagram", linkedin_org: "linkedin", linkedin_member: "linkedin", tiktok: "tiktok" };
const MIN_LEAD_MS = 60_000;
const MAX_AHEAD_MS = 180 * 86400_000;

export function approvalHash(p: Pick<PublicationRow, "connection_id" | "format" | "caption" | "link_url" | "media_spec" | "content_version">) {
  return sha256(JSON.stringify([p.connection_id, p.format, p.caption, p.link_url ?? null, p.media_spec, p.content_version ?? null]));
}

async function logAttempt(pub: Pick<PublicationRow, "id" | "workspace_id" | "attempts">, action: string, outcome: string, message: string | null, actor: string | null, errorCode: string | null = null) {
  await createAdminClient().from("publication_attempts").insert({ publication_id: pub.id, workspace_id: pub.workspace_id, attempt: pub.attempts, action: action as never, outcome: outcome as never, message: message?.slice(0, 1000) ?? null, actor, error_code: errorCode });
}

function checkTime(iso: string, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new AppError("Nieprawidłowa data publikacji.", "bad_time");
  if (t < now + MIN_LEAD_MS - 5_000) throw new AppError("Termin publikacji musi być co najmniej minutę w przyszłości.", "bad_time");
  if (t > now + MAX_AHEAD_MS) throw new AppError("Publikację można zaplanować najwyżej 180 dni naprzód.", "bad_time");
}

async function loadConnections(ctx: WorkspaceContext, ids: string[]) {
  const { data } = await ctx.supabase.from("social_connections").select("*").eq("workspace_id", ctx.workspace.id).in("id", ids);
  const rows = data ?? [];
  if (rows.length !== new Set(ids).size) throw new AppError("Nie znaleziono wybranego konta.", "not_found", 404);
  for (const c of rows) {
    if (!PLATFORMS[c.platform].available) throw new AppError(PLATFORMS[c.platform].unavailableReason!, "unavailable", 409);
    if (!["connected", "limited"].includes(c.status)) throw new AppError(`Konto „${c.name}” wymaga ponownej autoryzacji lub jest odłączone.`, "connection_state", 409);
  }
  return rows;
}

/** Creates one publication per selected account, linked to one planner entry. */
export async function composePublications(ctx: WorkspaceContext, raw: unknown) {
  if (!can(ctx.role, "publish.request")) throw new AppError("Twoja rola nie pozwala tworzyć publikacji.", "forbidden", 403);
  const parsed = composeSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Popraw dane publikacji.", "bad_request");
  const input = parsed.data;
  if (input.submit === "approve" && !can(ctx.role, "publish.approve")) throw new AppError("Publikacje zatwierdza właściciel, administrator lub osoba z rolą Marketing.", "forbidden", 403);
  checkTime(input.scheduledAt);
  const conns = await loadConnections(ctx, input.connectionIds);
  const facts = await mediaFacts(ctx, input.media);
  const plan = conns.map((c) => {
    const format = (input.formats[c.id] as PublicationFormat | undefined) ?? defaultFormat(c.platform, facts);
    const caption = input.captions[c.id] ?? input.caption;
    if (!format) return { c, format: null, caption, issues: [`${PLATFORMS[c.platform].short}: brak formatu dla wybranych plików (${PLATFORMS[c.platform].formats.map((f) => f.label).join(", ")}).`] };
    return { c, format, caption, issues: validatePublication(c.platform, format, caption, facts) };
  });
  const problems = plan.flatMap((p) => p.issues);
  if (problems.length) throw new AppError(problems.join(" "), "invalid_content", 422);

  let version: number | null = null;
  if (input.contentItemId) {
    const { data: item } = await ctx.supabase.from("content_items").select("current_version").eq("id", input.contentItemId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!item) throw new AppError("Nie znaleziono materiału.", "not_found", 404);
    version = item.current_version;
  }
  const admin = createAdminClient();
  const first = plan[0]!.c.platform;
  const { data: entry, error: entryErr } = await admin
    .from("schedule_entries")
    .insert({
      workspace_id: ctx.workspace.id,
      title: input.title,
      channel: CHANNEL[first],
      scheduled_at: new Date(input.scheduledAt).toISOString(),
      status: input.submit === "draft" ? "in_progress" : "for_approval",
      content_item_id: input.contentItemId,
      campaign_id: input.campaignId,
      publish_provider: PLATFORMS[first].provider === "meta" ? "meta" : "linkedin",
      notes: `Automatyczna publikacja: ${conns.map((c) => c.name).join(", ")}`.slice(0, 1000),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (entryErr || !entry) throw dbError(entryErr);
  const rows = plan.map((p) => ({
    workspace_id: ctx.workspace.id,
    connection_id: p.c.id,
    schedule_entry_id: entry.id,
    campaign_id: input.campaignId,
    content_item_id: input.contentItemId,
    content_version: version,
    format: p.format!,
    caption: p.caption,
    link_url: input.linkUrl,
    media_spec: input.media as unknown as Json,
    scheduled_at: new Date(input.scheduledAt).toISOString(),
    state: (input.submit === "draft" ? "draft" : "pending_approval") as PublicationRow["state"],
    requested_by: input.submit === "draft" ? null : ctx.userId,
    requested_at: input.submit === "draft" ? null : new Date().toISOString(),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  }));
  const { data: pubs, error } = await admin.from("publications").insert(rows).select("*");
  if (error || !pubs) throw dbError(error);
  for (const p of pubs) await logAttempt(p, input.submit === "draft" ? "prepare" : "request", "ok", input.submit === "draft" ? "Utworzono szkic." : "Wysłano do akceptacji.", ctx.userId);
  if (input.submit === "approve") for (const p of pubs) await approvePublication(ctx, p.id);
  return { entryId: entry.id, ids: pubs.map((p) => p.id) };
}

async function loadPub(ctx: WorkspaceContext, id: string) {
  const { data } = await createAdminClient().from("publications").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) throw new AppError("Nie znaleziono publikacji.", "not_found", 404);
  return data;
}

export async function requestApproval(ctx: WorkspaceContext, id: string) {
  if (!can(ctx.role, "publish.request")) throw new AppError("Twoja rola nie pozwala wysyłać publikacji do akceptacji.", "forbidden", 403);
  const pub = await loadPub(ctx, id);
  const { data, error } = await createAdminClient().from("publications").update({ state: "pending_approval", requested_by: ctx.userId, requested_at: new Date().toISOString(), updated_by: ctx.userId }).eq("id", pub.id).eq("state", "draft").select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new AppError("Do akceptacji można wysłać tylko szkic.", "bad_state", 409);
  await logAttempt(pub, "request", "ok", "Wysłano do akceptacji.", ctx.userId);
  await syncEntry(pub.schedule_entry_id);
}

/** Approval by an authorized user: validates again, freezes media, puts the post on the schedule. */
export async function approvePublication(ctx: WorkspaceContext, id: string) {
  if (!can(ctx.role, "publish.approve")) throw new AppError("Publikacje zatwierdza właściciel, administrator lub osoba z rolą Marketing.", "forbidden", 403);
  const admin = createAdminClient();
  const pub = await loadPub(ctx, id);
  if (!["draft", "pending_approval"].includes(pub.state)) throw new AppError("Ta publikacja nie czeka na akceptację.", "bad_state", 409);
  if (Date.parse(pub.scheduled_at) < Date.now() + 30_000) throw new AppError("Termin publikacji minął. Ustaw nowy termin przed akceptacją.", "bad_time", 409);
  const [conn] = await loadConnections(ctx, [pub.connection_id]);
  const spec = (pub.media_spec ?? []) as unknown as PublicationMediaSpec[];
  const issues = validatePublication(conn!.platform, pub.format, pub.caption, await mediaFacts(ctx, spec));
  if (issues.length) throw new AppError(issues.join(" "), "invalid_content", 422);
  if (pub.content_item_id && pub.content_version != null) {
    const { data: item } = await ctx.supabase.from("content_items").select("current_version, stale_reason").eq("id", pub.content_item_id).maybeSingle();
    if (item && item.current_version !== pub.content_version) throw new AppError("Materiał został zmieniony po przygotowaniu publikacji. Otwórz publikację i zapisz ją ponownie, aby użyć aktualnej wersji.", "stale_content", 409);
    if (item?.stale_reason) throw new AppError(`Materiał oznaczono jako nieaktualny: ${item.stale_reason} Popraw go albo w Bibliotece wybierz „Sprawdzone, treść aktualna”.`, "stale_material", 409);
  }
  await dropPreparedFiles(pub.id);
  const media = await prepareMedia(ctx, pub, spec);
  const { data, error } = await admin
    .from("publications")
    .update({ state: "scheduled", media: media as unknown as Json, approved_by: ctx.userId, approved_at: new Date().toISOString(), approved_hash: approvalHash(pub), attempts: 0, error_code: null, error_message: null, updated_by: ctx.userId })
    .eq("id", pub.id)
    .in("state", ["draft", "pending_approval"])
    .eq("updated_at", pub.updated_at)
    .select("id");
  if (error) throw dbError(error);
  if (!data?.length) {
    await dropPreparedFiles(pub.id);
    throw new AppError("Publikacja została w międzyczasie zmieniona. Odśwież stronę.", "conflict", 409);
  }
  await logAttempt(pub, "approve", "ok", `Zatwierdzono. Pliki przygotowane: ${media.length}.`, ctx.userId);
  await syncEntry(pub.schedule_entry_id);
}

async function dropPreparedFiles(pubId: string) {
  const admin = createAdminClient();
  const { data: files } = await admin.from("publication_files").select("id, storage_path").eq("publication_id", pubId);
  if (!files?.length) return;
  await getStorage(admin as never).remove(files.map((f) => f.storage_path)).catch(() => undefined);
  await admin.from("publication_files").delete().in("id", files.map((f) => f.id));
}

export const editSchema = z.object({
  caption: z.string().max(5000).optional(),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  format: z.enum(["text", "photo", "photo_set", "carousel", "video", "reel"]).optional(),
  media: mediaSpecSchema.optional(),
});

/** Edits: moving the time keeps the approval; any content change returns the post to draft. */
export async function editPublication(ctx: WorkspaceContext, id: string, raw: unknown) {
  if (!can(ctx.role, "publish.request")) throw new AppError("Twoja rola nie pozwala edytować publikacji.", "forbidden", 403);
  const patch = editSchema.parse(raw);
  const pub = await loadPub(ctx, id);
  if (!["draft", "pending_approval", "scheduled", "failed", "action_required"].includes(pub.state)) throw new AppError("Tej publikacji nie można już edytować (jest w trakcie publikacji lub opublikowana).", "bad_state", 409);
  if (patch.scheduledAt) checkTime(patch.scheduledAt);
  const contentChanged =
    (patch.caption !== undefined && patch.caption !== pub.caption) ||
    (patch.format !== undefined && patch.format !== pub.format) ||
    (patch.media !== undefined && JSON.stringify(patch.media) !== JSON.stringify(pub.media_spec));
  const next = { ...pub, caption: patch.caption ?? pub.caption, format: patch.format ?? pub.format, media_spec: (patch.media ?? pub.media_spec) as Json };
  if (contentChanged) {
    const { data: conn } = await ctx.supabase.from("social_connections").select("platform").eq("id", pub.connection_id).single();
    const issues = validatePublication(conn!.platform, next.format, next.caption, await mediaFacts(ctx, next.media_spec as unknown as PublicationMediaSpec[]));
    if (issues.length) throw new AppError(issues.join(" "), "invalid_content", 422);
  }
  const update: Partial<PublicationRow> = { updated_by: ctx.userId };
  if (patch.scheduledAt) update.scheduled_at = new Date(patch.scheduledAt).toISOString();
  if (contentChanged) Object.assign(update, { caption: next.caption, format: next.format, media_spec: next.media_spec, state: "draft", approved_by: null, approved_at: null, approved_hash: null, media: [] as unknown as Json, requested_at: null });
  const { data, error } = await createAdminClient().from("publications").update(update).eq("id", pub.id).eq("updated_at", pub.updated_at).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new AppError("Publikacja została w międzyczasie zmieniona. Odśwież stronę.", "conflict", 409);
  if (contentChanged) await dropPreparedFiles(pub.id);
  await logAttempt(pub, "prepare", "ok", contentChanged ? "Zmieniono treść: publikacja wróciła do szkicu i wymaga ponownej akceptacji." : "Zmieniono termin.", ctx.userId);
  await syncEntry(pub.schedule_entry_id, patch.scheduledAt);
  return { backToDraft: contentChanged };
}

export async function cancelPublication(ctx: WorkspaceContext, id: string) {
  if (!can(ctx.role, "publish.request")) throw new AppError("Twoja rola nie pozwala anulować publikacji.", "forbidden", 403);
  const pub = await loadPub(ctx, id);
  const admin = createAdminClient();
  // queued is cancelable only while no worker holds it (waiting for a retry).
  let q = admin.from("publications").update({ state: "canceled", updated_by: ctx.userId, locked_at: null, locked_by: null }).eq("id", pub.id);
  if (pub.state === "queued") q = q.eq("state", "queued").is("locked_at", null).eq("uncertain", false);
  else q = q.in("state", CANCELABLE_STATES);
  const { data, error } = await q.select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new AppError("Publikacja jest właśnie wysyłana lub już opublikowana: nie można jej anulować. Opublikowany post usuń bezpośrednio na platformie.", "bad_state", 409);
  await dropPreparedFiles(pub.id);
  await logAttempt(pub, "cancel", "ok", "Anulowano.", ctx.userId);
  await syncEntry(pub.schedule_entry_id);
}

/** Puts a failed / blocked publication back on the schedule (same approved content). */
export async function retryPublication(ctx: WorkspaceContext, id: string) {
  if (!can(ctx.role, "publish.approve")) throw new AppError("Ponowienie publikacji zatwierdza właściciel, administrator lub osoba z rolą Marketing.", "forbidden", 403);
  const pub = await loadPub(ctx, id);
  if (!["failed", "action_required"].includes(pub.state)) throw new AppError("Ponowić można tylko publikację z błędem.", "bad_state", 409);
  if (!pub.approved_at || pub.approved_hash !== approvalHash(pub)) throw new AppError("Treść różni się od zatwierdzonej. Zatwierdź publikację ponownie.", "not_approved", 409);
  if (pub.uncertain) throw new AppError("Nie wiadomo, czy poprzednia próba nie opublikowała posta. Sprawdź konto na platformie; jeśli posta nie ma, użyj „Potwierdzam, że posta nie ma”.", "uncertain", 409);
  await loadConnections(ctx, [pub.connection_id]);
  const at = new Date(Math.max(Date.now() + 5_000, Date.parse(pub.scheduled_at))).toISOString();
  const { data, error } = await createAdminClient().from("publications").update({ state: "scheduled", scheduled_at: at, attempts: 0, next_attempt_at: null, error_code: null, error_message: null, locked_at: null, locked_by: null, updated_by: ctx.userId }).eq("id", pub.id).in("state", ["failed", "action_required"]).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new AppError("Publikacja została w międzyczasie zmieniona.", "conflict", 409);
  await logAttempt(pub, "approve", "ok", "Ponowiono publikację.", ctx.userId);
  await syncEntry(pub.schedule_entry_id);
}

/** The user checked the platform and states the post does not exist: clears the uncertainty. */
export async function confirmNotPublished(ctx: WorkspaceContext, id: string) {
  if (!can(ctx.role, "publish.approve")) throw new AppError("Tę decyzję podejmuje właściciel, administrator lub osoba z rolą Marketing.", "forbidden", 403);
  const pub = await loadPub(ctx, id);
  if (pub.state !== "action_required" || !pub.uncertain) throw new AppError("Ta publikacja nie wymaga takiego potwierdzenia.", "bad_state", 409);
  const { error } = await createAdminClient().from("publications").update({ uncertain: false, updated_by: ctx.userId }).eq("id", pub.id).eq("state", "action_required");
  if (error) throw dbError(error);
  await logAttempt(pub, "verify_uncertain", "not_found", "Użytkownik potwierdził, że posta nie ma na platformie.", ctx.userId);
}

/** Planner entry mirrors its publications (published when all are published). */
export async function syncEntry(entryId: string | null, newTime?: string) {
  if (!entryId) return;
  const admin = createAdminClient();
  const { data: pubs } = await admin.from("publications").select("state, external_url, published_at, scheduled_at").eq("schedule_entry_id", entryId);
  const active = (pubs ?? []).filter((p) => p.state !== "canceled");
  if (!pubs?.length) return;
  let status: "idea" | "in_progress" | "for_approval" | "ready" | "published" = "ready";
  if (!active.length) status = "in_progress";
  else if (active.every((p) => p.state === "published")) status = "published";
  else if (active.some((p) => p.state === "draft")) status = "in_progress";
  else if (active.some((p) => p.state === "pending_approval")) status = "for_approval";
  const published = active.filter((p) => p.state === "published");
  const patch: Partial<import("@/lib/supabase/database.types").ScheduleEntryRow> = { status };
  if (status === "published") {
    patch.published_at = published.map((p) => p.published_at).sort().at(-1) ?? new Date().toISOString();
    patch.external_url = published.find((p) => p.external_url)?.external_url ?? null;
  }
  if (newTime) patch.scheduled_at = new Date(newTime).toISOString();
  await admin.from("schedule_entries").update(patch).eq("id", entryId);
}

export { logAttempt };
