"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Insights } from "@/core/analytics/insights";
import { aiErrorMessage } from "@/lib/ai";
import { buildReport, createTrackedLink, linkSchema, setPublicPage } from "@/lib/analytics/service";
import { generateInsights } from "@/lib/analytics/insights";
import { toActionError, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/observability";
import { authorizePerm } from "@/lib/session";
import { refreshMetrics } from "@/lib/social/metrics";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateReportInsights(days: number): Promise<ActionResult<{ insights: Insights; dropped: string[] }>> {
  try {
    const ctx = await authorizePerm("analytics.view");
    await rateLimit(`insights:${ctx.userId}`, 10, 3600, "Za dużo analiz w ciągu godziny.");
    const d = z.union([z.literal(30), z.literal(90), z.literal(365)]).parse(days);
    const to = new Date(Date.now() + 60_000);
    const report = await buildReport(ctx, new Date(to.getTime() - d * 86400_000), to);
    const r = await generateInsights(ctx, report);
    revalidatePath("/analytics");
    return { ok: true, data: { insights: r.insights, dropped: r.dropped }, message: "Przygotowano wnioski." };
  } catch (error) {
    const r = toActionError(error);
    return r.ok ? r : { ok: false, error: aiErrorMessage(error) };
  }
}

export async function createLink(input: z.input<typeof linkSchema>): Promise<ActionResult<{ shortUrl: string }>> {
  try {
    const ctx = await authorizePerm("content.edit");
    await rateLimit(`links:${ctx.userId}`, 60, 3600);
    const l = await createTrackedLink(ctx, input);
    revalidatePath("/analytics");
    return { ok: true, data: { shortUrl: l.shortUrl }, message: "Utworzono link." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function refreshPublicationMetrics(id: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("content.edit");
    await rateLimit(`metrics:${ctx.workspace.id}`, 60, 3600, "Za dużo odświeżeń statystyk. Spróbuj później.");
    const { data } = await createAdminClient().from("publications").select("id").eq("id", z.uuid().parse(id)).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!data) return { ok: false, error: "Nie znaleziono publikacji." };
    const r = await refreshMetrics(data.id);
    revalidatePath("/analytics");
    return r.ok ? { ok: true, data: undefined, message: r.message ?? "Pobrano statystyki." } : { ok: false, error: r.message ?? "Nie udało się pobrać statystyk." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function togglePublicPage(propertyId: string, enabled: boolean): Promise<ActionResult<{ slug: string | null }>> {
  try {
    const ctx = await authorizePerm("property.edit_assigned");
    const slug = await setPublicPage(ctx, z.uuid().parse(propertyId), !!enabled);
    revalidatePath(`/properties/${propertyId}`);
    return { ok: true, data: { slug }, message: enabled ? "Strona oferty jest publiczna." : "Wyłączono stronę oferty." };
  } catch (error) {
    return toActionError(error);
  }
}
