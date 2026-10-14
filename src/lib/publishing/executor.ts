import "server-only";
import { hostname } from "node:os";
import { logError } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicationRow, SocialConnectionRow } from "@/lib/supabase/database.types";
import type { ServerSupabase } from "@/lib/supabase/server";
import { accessToken, adapterFor, markConnection } from "@/lib/social/connections";
import { SocialError } from "@/lib/social/http";
import type { CheckOutcome, PublishInput } from "@/lib/social/types";
import { mediaFiles } from "./media";
import { approvalHash, logAttempt, syncEntry } from "./service";

/**
 * Publication worker. Claims due publications atomically (claim_publications,
 * SKIP LOCKED) and drives them through the platform API.
 *
 * Duplicate protection:
 *  - attempt_started_at is written BEFORE the publish call; a crash or a lost
 *    response leaves the row "uncertain";
 *  - an uncertain publication is never re-sent until the platform has been
 *    checked for the post (findExisting / container status); if that check is
 *    not possible, the user decides (state action_required);
 *  - "published" is set only with the platform's id (DB check constraint).
 */
const WORKER = `${hostname()}:${process.pid}:pub`;
const BACKOFF_MS = [60_000, 5 * 60_000, 20 * 60_000, 60 * 60_000];

type Admin = ReturnType<typeof createAdminClient>;

async function save(admin: Admin, pub: PublicationRow, patch: Partial<PublicationRow>) {
  await admin.from("publications").update({ ...patch, locked_at: null, locked_by: null }).eq("id", pub.id).eq("locked_by", WORKER);
}

async function finishPublished(admin: Admin, pub: PublicationRow, externalId: string, url: string | null, how: string) {
  await save(admin, pub, { state: "published", external_id: externalId, external_url: url, published_at: new Date().toISOString(), uncertain: false, error_code: null, error_message: null, next_attempt_at: null });
  await logAttempt(pub, how === "verify" ? "verify_uncertain" : how === "check" ? "check_status" : "publish", how === "verify" ? "found" : "ok", `Potwierdzone przez platformę: ${externalId}`, null);
  await syncEntry(pub.schedule_entry_id);
}

async function handleFailure(admin: Admin, pub: PublicationRow, conn: SocialConnectionRow, error: unknown, action: "publish" | "check_status" | "verify_uncertain") {
  const e = error instanceof SocialError ? error : null;
  if (!e) await logError("publish", error, { workspaceId: pub.workspace_id, context: { publication: pub.id } });
  const message = e?.message ?? "Nieoczekiwany błąd podczas publikacji.";
  const code = e?.socialCode ?? "unknown";
  if (e?.opts.detail) console.warn("[publish]", pub.id, e.opts.detail);
  // Unknown outcome of a write: verify before anything else.
  const uncertain = action === "publish" && (!e || e.uncertain);
  if (uncertain) {
    await save(admin, pub, { state: "queued", uncertain: true, next_attempt_at: new Date(Date.now() + 60_000).toISOString(), error_code: code, error_message: `${message} Sprawdzamy na platformie, czy post powstał, zanim spróbujemy ponownie.` });
    await logAttempt(pub, action, "uncertain", message, null, code);
    return;
  }
  if (code === "token_expired" || code === "permission") {
    await markConnection(conn.id, code === "token_expired" ? "reauth_required" : "limited", message);
    await save(admin, pub, { state: "action_required", error_code: code, error_message: message });
    await logAttempt(pub, action, "action_required", message, null, code);
    await syncEntry(pub.schedule_entry_id);
    return;
  }
  if (e?.retryable && pub.attempts < pub.max_attempts) {
    const wait = e.opts.retryAfterMs ?? BACKOFF_MS[Math.min(pub.attempts, BACKOFF_MS.length - 1)]!;
    await save(admin, pub, { state: action === "check_status" ? "processing" : "queued", next_attempt_at: new Date(Date.now() + wait).toISOString(), error_code: code, error_message: `${message} Następna próba: ${new Date(Date.now() + wait).toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" })}.` });
    await logAttempt(pub, action, "retry", message, null, code);
    return;
  }
  // Definite rejection (media, aspect ratio, bad request) or retries exhausted.
  const final = e?.retryable ? "action_required" : "failed";
  await save(admin, pub, { state: final, error_code: code, error_message: e?.retryable ? `${message} Wyczerpano automatyczne ponowienia.` : message, uncertain: false });
  await logAttempt(pub, action, final === "failed" ? "failed" : "action_required", message, null, code);
  await syncEntry(pub.schedule_entry_id);
}

function applyCheck(admin: Admin, pub: PublicationRow, conn: SocialConnectionRow, out: CheckOutcome, how: "publish" | "check") {
  if (out.kind === "published") return finishPublished(admin, pub, out.externalId, out.url, how);
  if (out.kind === "processing") {
    return (async () => {
      await save(admin, pub, { state: "processing", external_container_id: out.containerId ?? pub.external_container_id, uncertain: false, next_attempt_at: new Date(Date.now() + out.checkAfterMs).toISOString(), error_code: null, error_message: null });
      await logAttempt(pub, how === "check" ? "check_status" : "publish", "processing", "Platforma przetwarza materiał.", null);
    })();
  }
  return handleFailure(admin, { ...pub, attempts: pub.max_attempts }, conn, out.error, how === "check" ? "check_status" : "publish");
}

export async function processPublication(pub: PublicationRow) {
  const admin = createAdminClient();
  const { data: conn } = await admin.from("social_connections").select("*").eq("id", pub.connection_id).maybeSingle();
  if (!conn || conn.status === "disconnected") {
    await save(admin, pub, { state: "action_required", error_code: "disconnected", error_message: "Konto zostało odłączone. Połącz je ponownie albo wybierz inne konto." });
    await syncEntry(pub.schedule_entry_id);
    return;
  }
  // Approved content must be unchanged.
  if (!pub.approved_at || pub.approved_hash !== approvalHash(pub)) {
    await save(admin, pub, { state: "action_required", error_code: "not_approved", error_message: "Treść publikacji różni się od zatwierdzonej. Zatwierdź ją ponownie." });
    await syncEntry(pub.schedule_entry_id);
    return;
  }
  const { data: lim } = await admin.rpc("workspace_limits", { p_ws: pub.workspace_id });
  if (lim?.[0]?.access !== "full") {
    await save(admin, pub, { state: "action_required", error_code: "plan_inactive", error_message: "Plan biura jest nieaktywny (koniec okresu próbnego lub problem z płatnością). Publikacja została wstrzymana." });
    await syncEntry(pub.schedule_entry_id);
    return;
  }
  let token: string;
  try {
    token = await accessToken(conn);
  } catch (error) {
    return handleFailure(admin, pub, conn, error, pub.state === "processing" ? "check_status" : "verify_uncertain");
  }
  const input: PublishInput = { connection: conn, token, pub, media: mediaFiles(pub, admin as unknown as ServerSupabase) };
  const adapter = adapterFor(conn.platform);

  if (pub.state === "processing") {
    try {
      return await applyCheck(admin, pub, conn, await adapter.checkStatus(input), "check");
    } catch (error) {
      return handleFailure(admin, pub, conn, error, "check_status");
    }
  }

  if (pub.uncertain) {
    try {
      // IG: the container (if any) tells us directly whether it was published.
      if (pub.external_container_id && conn.platform === "instagram") {
        const out = await adapter.checkStatus(input);
        if (out.kind !== "failed") return await applyCheck(admin, pub, conn, out, "check");
      }
      const found = await adapter.findExisting(input, new Date(pub.attempt_started_at ?? pub.scheduled_at));
      if (found) return await finishPublished(admin, pub, found.externalId, found.url, "verify");
      await logAttempt(pub, "verify_uncertain", "not_found", "Na platformie nie ma tego posta: można bezpiecznie ponowić.", null);
      pub = { ...pub, uncertain: false };
      await admin.from("publications").update({ uncertain: false }).eq("id", pub.id);
    } catch (error) {
      const e = error instanceof SocialError ? error : null;
      if (e?.retryable && pub.attempts < pub.max_attempts + 2) {
        await save(admin, pub, { next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(), error_message: "Nie udało się jeszcze sprawdzić, czy post powstał. Spróbujemy ponownie." });
        await logAttempt(pub, "verify_uncertain", "retry", e.message, null, e.socialCode);
        return;
      }
      await save(admin, pub, { state: "action_required", error_code: "unverified", error_message: "Nie udało się potwierdzić, czy post został opublikowany. Sprawdź konto na platformie: jeśli post jest, nic nie rób; jeśli go nie ma, potwierdź to i ponów publikację." });
      await logAttempt(pub, "verify_uncertain", "action_required", e?.message ?? "Weryfikacja niemożliwa.", null, e?.socialCode ?? "unknown");
      await syncEntry(pub.schedule_entry_id);
      return;
    }
  }

  // The actual write. Mark the attempt first: a crash from here on is "uncertain".
  const attempts = pub.attempts + 1;
  const startedAt = new Date().toISOString();
  const { data: marked } = await admin.from("publications").update({ state: "publishing", attempts, attempt_started_at: startedAt, uncertain: false }).eq("id", pub.id).eq("locked_by", WORKER).select("id");
  if (!marked?.length) return;
  pub = { ...pub, state: "publishing", attempts, attempt_started_at: startedAt };
  await syncEntry(pub.schedule_entry_id);
  try {
    const out = await adapter.publish(input);
    await applyCheck(admin, pub, conn, out, "publish");
  } catch (error) {
    await handleFailure(admin, pub, conn, error, "publish");
  }
}

let running = false;
let lastTick = 0;

/** Called from the job worker loop and /api/jobs/tick. */
export async function publishTick(minIntervalMs = 5_000): Promise<number> {
  if (running || Date.now() - lastTick < minIntervalMs) return 0;
  running = true;
  lastTick = Date.now();
  let n = 0;
  try {
    const { data, error } = await createAdminClient().rpc("claim_publications", { p_worker: WORKER, p_limit: 5, p_stale_seconds: 600 });
    if (error) {
      console.error("[publish] claim failed", error.message);
      return 0;
    }
    for (const pub of data ?? []) {
      n++;
      await processPublication(pub).catch((e) => logError("publish", e, { workspaceId: pub.workspace_id, context: { publication: pub.id } }));
    }
  } finally {
    running = false;
  }
  return n;
}
