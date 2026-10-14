import "server-only";
import { METRIC_LABELS, METRIC_KEYS, formatMetric } from "@/core/analytics/metrics";
import { INSIGHTS_SYSTEM, INSIGHTS_VERSION, checkInsights, factsPrompt, insightSchema, type InsightFact, type Insights } from "@/core/analytics/insights";
import { can } from "@/core/auth/permissions";
import { createEngine } from "@/lib/ai";
import { AppError, dbError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { WorkspaceContext } from "@/lib/session";
import type { AnalyticsReport } from "./service";

const nf = (n: number) => new Intl.NumberFormat("pl-PL").format(n);

/** The only material the model sees: computed numbers with "Brak danych" where unknown. */
export function reportFacts(r: AnalyticsReport): InsightFact[] {
  const facts: InsightFact[] = [
    { key: "publications", label: "Opublikowane posty", value: nf(r.publications.length), numbers: [r.publications.length] },
    { key: "clicks", label: "Kliknięcia linków śledzących (bez botów)", value: nf(r.clicks), numbers: [r.clicks] },
    { key: "page_views", label: "Wyświetlenia stron ofert", value: nf(r.pageViews), numbers: [r.pageViews] },
    { key: "leads", label: "Zapytania (leady)", value: nf(r.leads), numbers: [r.leads] },
    { key: "click_to_lead", label: "Zapytania na 100 kliknięć (%)", value: r.clickToLead == null ? "Brak danych" : `${String(r.clickToLead).replace(".", ",")}%`, numbers: r.clickToLead == null ? [] : [r.clickToLead] },
  ];
  for (const k of METRIC_KEYS) {
    const a = r.totals[k];
    facts.push({ key: `total_${k}`, label: `${METRIC_LABELS[k]} (suma z ${a.covered} z ${a.total} postów)`, value: formatMetric(a.value), numbers: a.value == null ? [a.covered, a.total] : [a.value, a.covered, a.total] });
  }
  for (const c of r.byChannel) {
    const key = `channel_${c.channel.toLowerCase().replace(/[^a-z]+/g, "_")}`;
    facts.push({ key, label: `Kanał ${c.channel}: posty / wyświetlenia / kliknięcia / zapytania`, value: `${c.publications} / ${formatMetric(c.views.value)} / ${c.clicks} / ${c.leads}`, numbers: [c.publications, c.clicks, c.leads, ...(c.views.value == null ? [] : [c.views.value])] });
  }
  for (const c of r.byCampaign.slice(0, 8)) {
    facts.push({ key: `campaign_${c.id.slice(0, 8)}`, label: `Kampania „${c.name}”: posty / kliknięcia / zapytania`, value: `${c.publications} / ${c.clicks} / ${c.leads}`, numbers: [c.publications, c.clicks, c.leads] });
  }
  if (r.mock) facts.push({ key: "simulator", label: "Uwaga", value: "Część statystyk pochodzi z symulatora API (dane testowe)", numbers: [] });
  return facts;
}

export async function generateInsights(ctx: WorkspaceContext, report: AnalyticsReport): Promise<{ insights: Insights; dropped: string[]; id: string }> {
  if (!can(ctx.role, "analytics.view") || ctx.role === "viewer") throw new AppError("Wnioski AI generuje właściciel, administrator, agent lub marketing.", "forbidden", 403);
  if (report.publications.length === 0 && report.clicks === 0 && report.leads === 0) throw new AppError("W tym okresie nie ma jeszcze danych do analizy (publikacji, kliknięć ani zapytań).", "no_data", 422);
  const facts = reportFacts(report);
  const engine = await createEngine(ctx);
  const period = `${report.from.slice(0, 10)} – ${report.to.slice(0, 10)}`;
  const res = await engine.provider.complete({ operation: "ai_insight", tier: "main", system: INSIGHTS_SYSTEM, user: factsPrompt(facts, period), schema: insightSchema, maxTokens: 2500, effort: "medium", testHint: { kind: "insights", facts } });
  const checked = checkInsights(res.data, facts);
  const { data, error } = await createAdminClient().from("analytics_insights").insert({ workspace_id: ctx.workspace.id, period_from: report.from, period_to: report.to, insights: checked.insights as unknown as Json, dropped: checked.dropped as unknown as Json, model: res.model.slice(0, 80), version: INSIGHTS_VERSION, created_by: ctx.userId }).select("id").single();
  if (error || !data) throw dbError(error);
  return { ...checked, id: data.id };
}
