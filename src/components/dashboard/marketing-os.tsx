import Link from "next/link";
import { ArrowRight, Brain, Compass, Lightbulb, MagnifyingGlass, PaintBrushBroad, RocketLaunch } from "@phosphor-icons/react/dist/ssr";
import { RecommendationCard } from "@/components/recommendations/recommendation-card";
import { Card } from "@/components/ui/card";
import { can } from "@/core/auth/permissions";
import { loadRecommendations } from "@/lib/recommendations/service";
import type { WorkspaceContext } from "@/lib/session";
import { formatNumber, formatRelative } from "@/lib/utils";

const NO_DATA = "Brak danych";

/**
 * Dashboard sections of the marketing system. Every number is read from the
 * office's records at request time; a module with nothing yet says so.
 */
export async function MarketingOs({ ctx }: { ctx: WorkspaceContext }) {
  const ws = ctx.workspace.id;
  const sb = ctx.supabase;
  const [reco, strategy, profile, analysis, memory, suggested, graphics, run] = await Promise.all([
    loadRecommendations(ctx),
    sb.from("marketing_strategies").select("id, title, status, created_at").eq("workspace_id", ws).neq("status", "archived").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("brand_profiles").select("approved_version").eq("workspace_id", ws).maybeSingle(),
    sb.from("brand_analyses").select("status, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("brand_memory").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("level", "explicit").eq("status", "active"),
    sb.from("brand_memory").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("level", "suggested").eq("status", "active"),
    sb.from("content_items").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("kind", "graphic"),
    sb.from("autopilot_runs").select("id, title, status").eq("workspace_id", ws).neq("status", "archived").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const waiting = run.data
    ? (await sb.from("autopilot_items").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("run_id", run.data.id).eq("status", "ready")).count ?? 0
    : 0;
  const d = reco.data;
  const published4w = d.weekly.slice(0, 4).reduce((a, b) => a + b, 0);
  const withStats = d.publications.filter((p) => p.views !== null);
  const views = withStats.reduce((a, p) => a + (p.views ?? 0), 0);

  const overview = [
    { label: "Publikacje potwierdzone w 4 tygodniach", value: formatNumber(published4w) },
    { label: "Dni od ostatniej publikacji", value: d.lastPublicationDaysAgo === null ? NO_DATA : formatNumber(d.lastPublicationDaysAgo) },
    { label: "Wpisy w planerze na 14 dni", value: formatNumber(d.plannedNext14) },
    { label: `Zapytania w ${d.windowDays} dniach`, value: formatNumber(d.leadsInWindow) },
    { label: `Wyświetlenia (${withStats.length} publikacji ze statystykami)`, value: withStats.length ? formatNumber(views) : NO_DATA },
    { label: "Aktywne oferty bez publikacji", value: formatNumber(d.properties.filter((p) => p.publications === 0).length) },
  ];
  const modules = [
    {
      href: "/director", icon: Compass, title: "AI Marketing Director",
      state: strategy.data ? `${strategy.data.status === "accepted" ? "Zaakceptowana strategia" : "Szkic strategii"}: ${strategy.data.title}` : "Brak strategii. Zaproponuj strategię z danych biura.",
    },
    {
      href: "/brand/intelligence", icon: MagnifyingGlass, title: "Brand Intelligence",
      state: analysis.data?.status === "running" || analysis.data?.status === "queued" ? "Analiza strony w toku."
        : profile.data?.approved_version && profile.data.approved_version > 1 ? `Profil marki zatwierdzony (wersja ${profile.data.approved_version})`
        : analysis.data ? `Ostatnia analiza: ${analysis.data.status === "succeeded" ? "gotowa do przejrzenia" : analysis.data.status === "failed" ? "nieudana" : "w toku"}, ${formatRelative(analysis.data.created_at)}` : "Profil startowy z ustawień Brand Studio. Przeanalizuj stronę biura, aby go uzupełnić.",
    },
    { href: "/graphics", icon: PaintBrushBroad, title: "Creative Studio", state: graphics.count ? `Grafiki w bibliotece: ${formatNumber(graphics.count)}` : "Brak grafik. Utwórz pierwszą z oferty." },
    {
      href: run.data ? `/autopilot/${run.data.id}` : "/autopilot", icon: RocketLaunch, title: "Campaign Autopilot",
      state: run.data ? `${run.data.title}: ${waiting ? `${formatNumber(waiting)} materiałów czeka na akceptację` : run.data.status === "generating" ? "przygotowuję materiały" : "brak materiałów do akceptacji"}` : "Brak planu. Przygotuj marketing na najbliższy miesiąc.",
    },
    { href: "/brand/memory", icon: Brain, title: "Brand Memory", state: `Zapamiętane preferencje: ${formatNumber(memory.count ?? 0)}${suggested.count ? `, sugestie do przejrzenia: ${formatNumber(suggested.count)}` : ""}` },
  ];
  const editable = can(ctx.role, "content.edit");

  return (
    <>
      <section data-testid="dash-overview">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-ink">Marketing Overview</h2>
          <Link href="/analytics" className="text-[12.5px] text-ink-3 hover:text-ink">Analityka</Link>
        </div>
        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line p-0 sm:grid-cols-3 lg:grid-cols-6">
          {overview.map((o) => (
            <div key={o.label} className="bg-surface p-4">
              <p className="text-[20px] leading-none font-semibold text-ink tabular-nums">{o.value}</p>
              <p className="mt-1.5 text-[12px] text-ink-3">{o.label}</p>
            </div>
          ))}
        </Card>
      </section>

      <section data-testid="dash-recos">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink"><Lightbulb className="text-accent" /> Recommendations</h2>
          <Link href="/recommendations" className="text-[12.5px] text-ink-3 hover:text-ink">Wszystkie ({reco.items.length})</Link>
        </div>
        {reco.items.length ? (
          <ul className="grid gap-3 lg:grid-cols-3">
            {reco.items.slice(0, 3).map((r) => <li key={r.key}><RecommendationCard r={r} editable={editable} compact /></li>)}
          </ul>
        ) : (
          <Card className="px-4 py-6 text-center text-[13px] text-ink-3">Brak rekomendacji: dane biura nie wskazują teraz niczego do poprawy albo jest ich za mało.</Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[14px] font-semibold text-ink">Marketing biura</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {modules.map((m) => (
            <Link key={m.title} href={m.href} className="group flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 shadow-xs transition-shadow hover:shadow-sm" data-testid="dash-module">
              <span className="flex size-9 items-center justify-center rounded-md bg-accent-soft text-accent"><m.icon size={18} /></span>
              <span className="text-[13.5px] font-medium text-ink group-hover:text-accent-ink">{m.title}</span>
              <span className="line-clamp-3 text-[12.5px] text-ink-3">{m.state}</span>
              <ArrowRight size={13} className="mt-auto text-ink-4" />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
