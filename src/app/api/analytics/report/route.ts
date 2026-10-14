import { NextResponse, type NextRequest } from "next/server";
import type { Insights } from "@/core/analytics/insights";
import { apiError } from "@/lib/api";
import { loadBrandKit } from "@/lib/ai";
import { buildReport } from "@/lib/analytics/service";
import { renderReportPdf } from "@/lib/analytics/report-pdf";
import { rateLimit } from "@/lib/observability";
import { authorizePerm } from "@/lib/session";

const PERIODS = new Set([30, 90, 365]);

/** Analytics report PDF for the last ?d= days (30/90/365), with the latest saved AI insights. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await authorizePerm("analytics.view");
    await rateLimit(`analytics_pdf:${ctx.userId}`, 30, 60, "Za dużo raportów w krótkim czasie. Odczekaj minutę.");
    const d = Number(req.nextUrl.searchParams.get("d") ?? 30);
    const days = PERIODS.has(d) ? d : 30;
    const to = new Date(Date.now() + 60_000);
    const from = new Date(to.getTime() - days * 86400_000);
    const [report, brand, { data: last }] = await Promise.all([
      buildReport(ctx, from, to),
      loadBrandKit(ctx),
      ctx.supabase.from("analytics_insights").select("insights, model, created_at, period_from, period_to").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const pdf = await renderReportPdf({
      report,
      office: brand.companyName || ctx.workspace.name,
      accent: brand.colors.primary,
      insights: last ? { insights: last.insights as unknown as Insights, model: last.model, createdAt: last.created_at, periodFrom: last.period_from, periodTo: last.period_to } : null,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="raport-${days}-dni-${new Date().toISOString().slice(0, 10)}.pdf"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
