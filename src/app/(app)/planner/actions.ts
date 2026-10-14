"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PLAN_LENGTHS, SCHEDULE_CHANNEL_IDS, SCHEDULE_STATUS_IDS, generatePlan, type PlanContent } from "@/core/planner/model";
import { isoToWarsaw, todayWarsaw, warsawToIso } from "@/core/planner/time";
import { AppError, dbError, toActionError, type ActionResult } from "@/lib/errors";
import { authorize, type WorkspaceContext } from "@/lib/session";
import { cancelPublication, editPublication } from "@/lib/publishing/service";

const IN_FLIGHT = ["queued", "publishing", "processing", "published"];
const FINAL = ["published", "canceled"];

/** Automatic publications attached to a planner entry (they own its status). */
async function autoPubs(ctx: WorkspaceContext, entryId: string) {
  const { data } = await ctx.supabase.from("publications").select("id, state, scheduled_at").eq("schedule_entry_id", entryId).eq("workspace_id", ctx.workspace.id);
  return (data ?? []).filter((p) => p.state !== "canceled");
}

/** Moving an entry moves its publications (approval kept: only the time changes). */
async function moveAutoPubs(ctx: WorkspaceContext, entryId: string, iso: string) {
  const pubs = await autoPubs(ctx, entryId);
  if (pubs.some((p) => IN_FLIGHT.includes(p.state))) throw new AppError("Publikacja z tego wpisu jest już wysyłana lub opublikowana: nie można zmienić terminu.", "in_flight", 409);
  for (const p of pubs) if (!FINAL.includes(p.state)) await editPublication(ctx, p.id, { scheduledAt: iso });
  return pubs.length;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Nieprawidłowa data.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Nieprawidłowa godzina.");
const MAX_PLAN_ENTRIES = 120;

const entrySchema = z.object({
  title: z.string().trim().min(1, "Podaj tytuł wpisu.").max(200),
  channel: z.enum(SCHEDULE_CHANNEL_IDS),
  date,
  time,
  status: z.enum(SCHEDULE_STATUS_IDS),
  notes: z.string().trim().max(1000).default(""),
  contentItemId: z.uuid().nullable().default(null),
  externalUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Link do publikacji musi zaczynać się od http(s)://." }).max(500)]).default(""),
});
export type EntryInput = z.input<typeof entrySchema>;

function revalidate() {
  revalidatePath("/planner");
}

async function assertItem(ctx: Awaited<ReturnType<typeof authorize>>, id: string | null) {
  if (!id) return;
  const { data } = await ctx.supabase.from("content_items").select("id").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) throw new AppError("Wybrany materiał nie istnieje w tym biurze.", "not_found", 404);
}

export async function createEntry(input: EntryInput): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize("editor");
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Uzupełnij wpis." };
    const e = parsed.data;
    await assertItem(ctx, e.contentItemId);
    const { data, error } = await ctx.supabase
      .from("schedule_entries")
      .insert({ workspace_id: ctx.workspace.id, title: e.title, channel: e.channel, scheduled_at: warsawToIso(e.date, e.time), status: e.status, notes: e.notes || null, content_item_id: e.contentItemId, external_url: e.externalUrl || null, published_at: e.status === "published" ? new Date().toISOString() : null, publish_provider: "manual", created_by: ctx.userId, updated_by: ctx.userId })
      .select("id")
      .single();
    if (error || !data) throw dbError(error, "Nie udało się dodać wpisu.");
    revalidate();
    return { ok: true, data: { id: data.id }, message: "Dodano wpis do planu" };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateEntry(id: string, input: EntryInput): Promise<ActionResult> {
  try {
    const ctx = await authorize("editor");
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Uzupełnij wpis." };
    const e = parsed.data;
    await assertItem(ctx, e.contentItemId);
    const { data: cur } = await ctx.supabase.from("schedule_entries").select("status, published_at, scheduled_at").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!cur) throw new AppError("Nie znaleziono wpisu.", "not_found", 404);
    const auto = await autoPubs(ctx, id);
    if (auto.length) {
      if (e.status !== cur.status) throw new AppError("Status tego wpisu wynika z automatycznych publikacji (zakładka Publikacje).", "auto_status", 409);
      const iso = warsawToIso(e.date, e.time);
      if (Date.parse(iso) !== Date.parse(cur.scheduled_at)) await moveAutoPubs(ctx, id, iso);
    }
    const publishedAt = e.status === "published" ? (cur.published_at ?? new Date().toISOString()) : null;
    const { error } = await ctx.supabase
      .from("schedule_entries")
      .update({ title: e.title, channel: e.channel, scheduled_at: warsawToIso(e.date, e.time), status: e.status, notes: e.notes || null, content_item_id: e.contentItemId, external_url: e.externalUrl || null, published_at: publishedAt, ...(auto.length ? {} : { publish_provider: "manual" as const }), updated_by: ctx.userId })
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error, "Nie udało się zapisać wpisu.");
    revalidate();
    return { ok: true, data: undefined, message: e.status === "published" && cur.status !== "published" ? "Oznaczono jako opublikowane" : "Zapisano wpis" };
  } catch (error) {
    return toActionError(error);
  }
}

/** Drag & drop in the calendar: new day, same time of day. */
export async function moveEntry(id: string, toDate: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("editor");
    if (!date.safeParse(toDate).success) return { ok: false, error: "Nieprawidłowa data." };
    const { data: cur } = await ctx.supabase.from("schedule_entries").select("scheduled_at").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!cur) throw new AppError("Nie znaleziono wpisu.", "not_found", 404);
    const iso = warsawToIso(toDate, isoToWarsaw(cur.scheduled_at).time);
    await moveAutoPubs(ctx, id, iso);
    const { error } = await ctx.supabase.from("schedule_entries").update({ scheduled_at: iso, updated_by: ctx.userId }).eq("id", id).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error, "Nie udało się przenieść wpisu.");
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setEntryStatus(id: string, status: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("editor");
    const s = z.enum(SCHEDULE_STATUS_IDS).safeParse(status);
    if (!s.success) return { ok: false, error: "Nieprawidłowy status." };
    if ((await autoPubs(ctx, id)).length) throw new AppError("Status tego wpisu wynika z automatycznych publikacji (zakładka Publikacje).", "auto_status", 409);
    const { error } = await ctx.supabase.from("schedule_entries").update({ status: s.data, published_at: s.data === "published" ? new Date().toISOString() : null, publish_provider: "manual", updated_by: ctx.userId }).eq("id", id).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error, "Nie udało się zmienić statusu.");
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteEntry(id: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("editor");
    const pubs = await autoPubs(ctx, id);
    if (pubs.some((p) => ["queued", "publishing", "processing"].includes(p.state))) throw new AppError("Publikacja z tego wpisu jest właśnie wysyłana. Spróbuj za chwilę.", "in_flight", 409);
    for (const p of pubs) if (!FINAL.includes(p.state)) await cancelPublication(ctx, p.id);
    const { error } = await ctx.supabase.from("schedule_entries").delete().eq("id", id).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error, "Nie udało się usunąć wpisu.");
    revalidate();
    return { ok: true, data: undefined, message: "Usunięto wpis" };
  } catch (error) {
    return toActionError(error);
  }
}

const planSchema = z.object({
  name: z.string().trim().min(2, "Podaj nazwę planu (min. 2 znaki).").max(160),
  startDate: date,
  days: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  postsPerWeek: z.number().int().min(1).max(14),
  channels: z.array(z.enum(SCHEDULE_CHANNEL_IDS)).min(1, "Wybierz co najmniej jeden kanał.").max(6),
  source: z.enum(["none", "campaign", "property"]).default("none"),
  sourceId: z.uuid().nullable().default(null),
});

/** 7/14/30-day plan: frequency × channels, materials assigned where they fit, ideas elsewhere. */
export async function createPlan(input: z.input<typeof planSchema>): Promise<ActionResult<{ id: string; entries: number }>> {
  try {
    const ctx = await authorize("editor");
    const parsed = planSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Uzupełnij plan." };
    const o = parsed.data;
    if (!PLAN_LENGTHS.includes(o.days)) return { ok: false, error: "Plan obejmuje 7, 14 lub 30 dni." };
    if (o.startDate < todayWarsaw()) return { ok: false, error: "Plan nie może zaczynać się w przeszłości." };
    if (o.source !== "none" && !o.sourceId) return { ok: false, error: o.source === "campaign" ? "Wybierz kampanię." : "Wybierz nieruchomość." };

    let content: PlanContent[] = [];
    let campaignId: string | null = null;
    if (o.source === "campaign") {
      const { data: c } = await ctx.supabase.from("campaigns").select("id").eq("id", o.sourceId!).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (!c) throw new AppError("Nie znaleziono kampanii.", "not_found", 404);
      campaignId = c.id;
      const { data: assets } = await ctx.supabase.from("campaign_assets").select("content_item_id").eq("campaign_id", c.id).eq("workspace_id", ctx.workspace.id).not("content_item_id", "is", null);
      const ids = (assets ?? []).map((a) => a.content_item_id!);
      if (ids.length) {
        const { data: items } = await ctx.supabase.from("content_items").select("id, kind, content_type, title, platform").in("id", ids).eq("workspace_id", ctx.workspace.id);
        content = (items ?? []).map((i) => ({ id: i.id, kind: i.kind, contentType: i.content_type, title: i.title, platform: i.platform }));
      }
    } else if (o.source === "property") {
      const { data: items } = await ctx.supabase.from("content_items").select("id, kind, content_type, title, platform").eq("property_id", o.sourceId!).eq("workspace_id", ctx.workspace.id).order("updated_at", { ascending: false }).limit(60);
      content = (items ?? []).map((i) => ({ id: i.id, kind: i.kind, contentType: i.content_type, title: i.title, platform: i.platform }));
    }
    // Schedules (e.g. "Harmonogram publikacji") are not publications themselves.
    content = content.filter((c) => !c.contentType.startsWith("schedule"));

    const planned = generatePlan({ startDate: o.startDate, days: o.days, postsPerWeek: o.postsPerWeek, channels: o.channels, content });
    if (planned.length > MAX_PLAN_ENTRIES) return { ok: false, error: `Plan miałby ${planned.length} wpisów (maks. ${MAX_PLAN_ENTRIES}). Zmniejsz częstotliwość.` };
    const { data: plan, error } = await ctx.supabase
      .from("schedule_plans")
      .insert({ workspace_id: ctx.workspace.id, campaign_id: campaignId, name: o.name, start_date: o.startDate, days: o.days, posts_per_week: o.postsPerWeek, channels: o.channels, created_by: ctx.userId })
      .select("id")
      .single();
    if (error || !plan) throw dbError(error, "Nie udało się zapisać planu.");
    const { error: e2 } = await ctx.supabase.from("schedule_entries").insert(
      planned.map((p) => ({ workspace_id: ctx.workspace.id, plan_id: plan.id, campaign_id: campaignId, content_item_id: p.contentItemId, title: p.title, channel: p.channel, scheduled_at: warsawToIso(p.date, p.time), status: p.status, notes: p.notes, publish_provider: "manual" as const, created_by: ctx.userId, updated_by: ctx.userId })),
    );
    if (e2) {
      await ctx.supabase.from("schedule_plans").delete().eq("id", plan.id);
      throw dbError(e2, "Nie udało się zapisać wpisów planu.");
    }
    revalidate();
    return { ok: true, data: { id: plan.id, entries: planned.length }, message: `Utworzono plan: ${planned.length} wpisów` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deletePlan(id: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("editor");
    const { error } = await ctx.supabase.from("schedule_plans").delete().eq("id", id).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error, "Nie udało się usunąć planu.");
    revalidate();
    return { ok: true, data: undefined, message: "Usunięto plan i jego wpisy" };
  } catch (error) {
    return toActionError(error);
  }
}
