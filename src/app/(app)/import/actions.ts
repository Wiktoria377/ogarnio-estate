"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { IMPORT_FIELD_KEYS, type ColumnMapping } from "@/core/import/model";
import { toActionError, type ActionResult } from "@/lib/errors";
import { enqueueJobs } from "@/lib/jobs/queue";
import { rateLimit } from "@/lib/observability";
import { authorizePerm } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeBatch, createSource, deleteSource, discardBatch, loadSource, runImport, setRowChoices, sourceSchema } from "@/lib/import/service";

const uuid = z.uuid();

export async function addSource(input: z.input<typeof sourceSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorizePerm("import.run");
    await rateLimit(`import-source:${ctx.userId}`, 20, 3600);
    const s = await createSource(ctx, input);
    revalidatePath("/import");
    return { ok: true, data: { id: s.id }, message: "Dodano źródło ofert. Dane dostępowe zapisano w postaci zaszyfrowanej." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeSource(id: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("import.run");
    await deleteSource(ctx, uuid.parse(id));
    revalidatePath("/import");
    return { ok: true, data: undefined, message: "Usunięto źródło. Zaimportowane oferty zostały w aplikacji." };
  } catch (error) {
    return toActionError(error);
  }
}

/** Starts a background download of the source; the result is a preview to confirm. */
export async function syncSource(id: string): Promise<ActionResult<{ jobId: string }>> {
  try {
    const ctx = await authorizePerm("import.run");
    await rateLimit(`import-sync:${ctx.workspace.id}`, 30, 3600, "Za dużo synchronizacji w ciągu godziny. Spróbuj później.");
    const source = await loadSource(ctx, uuid.parse(id));
    const [job] = await enqueueJobs(ctx, [{ kind: "import_fetch", label: `Pobieranie ofert: ${source.name}`.slice(0, 160), payload: { sourceId: source.id }, dedupeKey: `import_fetch:${source.id}` }]);
    return { ok: true, data: { jobId: job!.id }, message: "Pobieram oferty ze źródła…" };
  } catch (error) {
    return toActionError(error);
  }
}

export async function fetchJobStatus(jobId: string): Promise<ActionResult<{ status: string; progress: number; error: string | null; batchId: string | null }>> {
  try {
    const ctx = await authorizePerm("import.run");
    const { data } = await createAdminClient().from("generation_jobs").select("status, progress, error_message, result").eq("id", uuid.parse(jobId)).eq("workspace_id", ctx.workspace.id).in("kind", ["import_fetch", "import_photos"]).maybeSingle();
    if (!data) return { ok: false, error: "Nie znaleziono zadania." };
    return { ok: true, data: { status: data.status, progress: data.progress, error: data.error_message, batchId: (data.result as { batchId?: string } | null)?.batchId ?? null } };
  } catch (error) {
    return toActionError(error);
  }
}

const mappingSchema = z.record(z.string().max(300), z.union([z.enum(IMPORT_FIELD_KEYS as [string, ...string[]]), z.literal("")]));

export async function remap(batchId: string, mapping: ColumnMapping, defaultTransaction: "sale" | "rent"): Promise<ActionResult<{ create: number; update: number; unchanged: number; skip: number; invalid: number }>> {
  try {
    const ctx = await authorizePerm("import.run");
    const m = mappingSchema.parse(mapping) as ColumnMapping;
    const counts = await analyzeBatch(ctx, uuid.parse(batchId), m, { defaultTransaction: z.enum(["sale", "rent"]).parse(defaultTransaction) });
    revalidatePath(`/import/${batchId}`);
    return { ok: true, data: counts, message: "Przeliczono podgląd z nowym mapowaniem." };
  } catch (error) {
    return toActionError(error);
  }
}

const choiceSchema = z.array(z.object({ id: z.uuid(), selected: z.boolean(), action: z.enum(["create", "update", "skip"]).optional() })).max(5000);

export async function chooseRows(batchId: string, choices: z.input<typeof choiceSchema>): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("import.run");
    await setRowChoices(ctx, uuid.parse(batchId), choiceSchema.parse(choices));
    revalidatePath(`/import/${batchId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Bulk (de)selection of all rows with a given action. */
export async function selectGroup(batchId: string, action: "create" | "update", selected: boolean): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("import.run");
    const id = uuid.parse(batchId);
    const admin = createAdminClient();
    const { data: batch } = await admin.from("import_batches").select("status").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (batch?.status !== "preview") return { ok: false, error: "Ten import został już wykonany." };
    await admin.from("import_rows").update({ selected }).eq("batch_id", id).eq("action", z.enum(["create", "update"]).parse(action));
    revalidatePath(`/import/${batchId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function executeImport(batchId: string, opts: { pausePublications: boolean; photoRights: boolean }): Promise<ActionResult<Awaited<ReturnType<typeof runImport>>>> {
  try {
    const ctx = await authorizePerm("import.run");
    await rateLimit(`import-run:${ctx.workspace.id}`, 30, 3600);
    const r = await runImport(ctx, uuid.parse(batchId), { pausePublications: !!opts.pausePublications, photoRights: !!opts.photoRights });
    revalidatePath(`/import/${batchId}`);
    revalidatePath("/properties");
    const parts = [`utworzono ${r.created}`, `zaktualizowano ${r.updated}`, r.failed ? `błędy ${r.failed}` : null].filter(Boolean);
    return { ok: true, data: r, message: `Import zakończony: ${parts.join(", ")}.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function discard(batchId: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("import.run");
    await discardBatch(ctx, uuid.parse(batchId));
    revalidatePath("/import");
    return { ok: true, data: undefined, message: "Odrzucono podgląd importu." };
  } catch (error) {
    return toActionError(error);
  }
}
