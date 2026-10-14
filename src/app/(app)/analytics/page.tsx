import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { BarChart } from "@/components/analytics/bar-chart";
import { InsightsPanel, LinkForm, RefreshMetrics } from "@/components/analytics/analytics-actions";
import { METRIC_KEYS, METRIC_LABELS, NO_DATA, PLATFORM_METRICS, formatMetric } from "@/core/analytics/metrics";
import type { Insights } from "@/core/analytics/insights";
import { can } from "@/core/auth/permissions";
import { buildReport } from "@/lib/analytics/service";
import { pagePerm } from "@/lib/session";
import { socialMock } from "@/lib/social/config";

export const metadata = { title: "Analityka" };

const PERIODS = { "30": 30, "90": 90, "365": 365 } as const;
const PLATFORM_LABEL: Record<string, string> = { facebook_page: "Facebook", instagram: "Instagram", linkedin_org: "LinkedIn (strona)", linkedin_member: "LinkedIn (profil)", tiktok: "TikTok" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const ctx = await pagePerm("analytics.view");
  const sp = await searchParams;
  const days = PERIODS[(sp.d ?? "30") as keyof typeof PERIODS] ?? 30;
  const to = new Date(Date.now() + 60_000);
  const from = new Date(to.getTime() - days * 86400_000);
  const report = await buildReport(ctx, from, to);
  const [{ data: last }, { data: links }, { data: props }, { data: campaigns }] = await Promise.all([
    ctx.supabase.from("analytics_insights").select("id, insights, dropped, model, created_at, period_from, period_to").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ctx.supabase.from("tracked_links").select("id, slug, label, target, channel, utm_source, utm_medium, utm_campaign, created_at").eq("workspace_id", ctx.workspace.id).eq("archived", false).order("created_at", { ascending: false }).limit(30),
    ctx.supabase.from("properties").select("id, title, public_enabled").eq("workspace_id", ctx.workspace.id).neq("status", "archived").order("updated_at", { ascending: false }).limit(200),
    ctx.supabase.from("campaigns").select("id, name").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(100),
  ]);
  const editor = can(ctx.role, "content.edit");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const kpis = [
    { label: "Opublikowane posty", value: String(report.publications.length) },
    { label: "Wyświetlenia (platformy)", value: formatMetric(report.totals.views.value), note: report.totals.views.total ? `z ${report.totals.views.covered} z ${report.totals.views.total} postów` : null },
    { label: "Interakcje (platformy)", value: formatMetric(report.totals.interactions.value), note: report.totals.interactions.total ? `z ${report.totals.interactions.covered} z ${report.totals.interactions.total} postów` : null },
    { label: "Kliknięcia linków", value: String(report.clicks), note: "bez botów" },
    { label: "Wyświetlenia stron ofert", value: String(report.pageViews) },
    { label: "Zapytania", value: String(report.leads), note: report.clickToLead == null ? null : `${String(report.clickToLead).replace(".", ",")} na 100 kliknięć` },
  ];
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Analityka"
        description="Statystyki z oficjalnych API platform oraz własne pomiary: kliknięcia linków śledzących, wyświetlenia stron ofert i zapytania. Metryka, której platforma nie zwróciła, ma wartość „Brak danych”, nie zero."
        actions={<a href={`/api/analytics/report?d=${days}`} className="inline-flex h-9 items-center rounded-md border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-sunken">Raport PDF</a>}
      />
      <nav className="mb-4 flex gap-1" aria-label="Okres">
        {Object.keys(PERIODS).map((k) => <Link key={k} href={`/analytics?d=${k}`} className={`rounded-md px-2.5 py-1 text-[12.5px] ${String(days) === k ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-3 hover:bg-sunken"}`}>Ostatnie {k} dni</Link>)}
      </nav>
      {(report.mock || socialMock()) && <p className="mb-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-[13px] text-warning" data-testid="analytics-mock-banner">Tryb testowy: statystyki postów pochodzą z symulatora API i nie są prawdziwymi danymi.</p>}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4" data-testid="kpi">
            <p className="text-[12px] text-ink-3">{k.label}</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums" data-testid="kpi-value">{k.value}</p>
            {k.note && <p className="text-[11.5px] text-ink-4">{k.note}</p>}
          </Card>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold">Kliknięcia i zapytania tygodniowo</h2>
          <BarChart weeks={report.weeks} />
        </Card>
        <Card className="p-0">
          <h2 className="px-5 pt-4 text-[14px] font-semibold">Kanały</h2>
          <table className="mt-2 w-full text-left text-[13px]">
            <thead className="text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">Kanał</th><th className="px-2 py-2 font-medium">Posty</th><th className="px-2 py-2 font-medium">Wyświetlenia</th><th className="px-2 py-2 font-medium">Kliknięcia</th><th className="px-2 py-2 font-medium">Zapytania</th></tr></thead>
            <tbody className="divide-y divide-line">
              {report.byChannel.length ? report.byChannel.map((c) => (
                <tr key={c.channel} data-testid="channel-row"><td className="px-5 py-2">{c.channel}</td><td className="px-2 py-2 tabular-nums">{c.publications}</td><td className="px-2 py-2 tabular-nums">{formatMetric(c.views.value)}</td><td className="px-2 py-2 tabular-nums">{c.clicks}</td><td className="px-2 py-2 tabular-nums">{c.leads}</td></tr>
              )) : <tr><td colSpan={5} className="px-5 py-3 text-ink-3">Brak danych w tym okresie.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>

      <InsightsPanel days={days} last={last ? { insights: last.insights as unknown as Insights, dropped: (last.dropped as unknown as string[]) ?? [], model: last.model, createdAt: last.created_at } : null} canGenerate={ctx.role !== "viewer"} />

      <Card className="mt-5 overflow-x-auto p-0">
        <h2 className="px-5 pt-4 text-[14px] font-semibold">Publikacje</h2>
        <table className="mt-2 w-full min-w-[860px] text-left text-[12.5px]">
          <thead className="text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">Post</th>{METRIC_KEYS.map((k) => <th key={k} className="px-2 py-2 font-medium">{METRIC_LABELS[k].split(" (")[0]}</th>)}<th className="px-2 py-2" /></tr></thead>
          <tbody className="divide-y divide-line">
            {report.publications.length ? report.publications.map((p) => (
              <tr key={p.id} data-testid="pub-metrics">
                <td className="max-w-64 px-5 py-2"><span className="block truncate font-medium">{PLATFORM_LABEL[p.platform]} · {p.account}</span><span className="block truncate text-ink-3">{p.caption}</span>{!PLATFORM_METRICS[p.platform]?.keys.length && <span className="block text-[11.5px] text-ink-4">{PLATFORM_METRICS[p.platform]?.note}</span>}</td>
                {METRIC_KEYS.map((k) => <td key={k} className={`px-2 py-2 tabular-nums ${p.metrics?.[k] == null ? "text-ink-4" : ""}`}>{p.metrics?.[k] == null ? NO_DATA : formatMetric(p.metrics[k])}</td>)}
                <td className="px-2 py-2">{editor && PLATFORM_METRICS[p.platform]?.keys.length ? <RefreshMetrics id={p.id} /> : null}</td>
              </tr>
            )) : <tr><td colSpan={METRIC_KEYS.length + 2} className="px-5 py-3 text-ink-3">Brak opublikowanych postów w tym okresie.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="mt-5 p-5">
        <h2 className="text-[14px] font-semibold">Linki śledzące (UTM)</h2>
        <p className="mt-1 text-[12.5px] text-ink-3">Krótki link zlicza kliknięcia (bez przechowywania adresu IP) i dodaje parametry UTM. Dla strony oferty zapytania z formularza zostaną przypisane do linku.</p>
        {editor && <LinkForm properties={(props ?? []).map((p) => ({ id: p.id, title: p.title, public: p.public_enabled }))} campaigns={campaigns ?? []} />}
        {links?.length ? (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-[13px]">
            {links.map((l) => <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5" data-testid="tracked-link"><span className="font-medium">{l.label}</span><code className="rounded bg-sunken px-1.5 py-0.5 text-[12px]">{appUrl}/l/{l.slug}</code><span className="text-ink-3">{l.utm_source} / {l.utm_medium} / {l.utm_campaign}</span></li>)}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
