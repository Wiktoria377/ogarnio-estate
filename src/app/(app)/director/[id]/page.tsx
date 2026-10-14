import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Warning } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StrategyActions } from "@/components/director/strategy-actions";
import { formatCost } from "@/core/admin/costs";
import type { InsightFact } from "@/core/analytics/insights";
import { can } from "@/core/auth/permissions";
import { TEST_MODEL } from "@/core/ai/test-provider";
import { PLATFORMS } from "@/core/marketing-engine/taxonomy";
import type { SkillUsage } from "@/core/marketing-engine/skills/composer";
import { BUSINESS_GOALS, STRATEGY_PERIODS, type StrategyInput, type StrategyOutput } from "@/core/strategy/director";
import { getContentType } from "@/verticals/real-estate/content-types";
import { requireWorkspace } from "@/lib/session";
import { processCost } from "@/lib/strategy/service";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Strategia marketingowa" };

const STATUS = { draft: { label: "Szkic", tone: "muted" }, accepted: { label: "Zaakceptowana", tone: "success" }, archived: { label: "Archiwum", tone: "outline" } } as const;

/** The four kinds of statements are always visually distinct. */
const KIND = {
  data: { label: "Dane", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  conclusion: { label: "Wniosek", cls: "bg-success-soft text-success ring-success/25" },
  hypothesis: { label: "Hipoteza", cls: "bg-warning-soft text-warning ring-warning/25" },
  recommendation: { label: "Rekomendacja", cls: "bg-accent-soft text-accent-ink ring-accent/20" },
} as const;
function Kind({ k }: { k: keyof typeof KIND }) {
  return <span className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] font-semibold tracking-wide uppercase ring-1 ${KIND[k].cls}`} data-testid={`kind-${k}`}>{KIND[k].label}</span>;
}

function Section({ n, title, children, testid }: { n: number; title: string; children: React.ReactNode; testid: string }) {
  return (
    <Card className="p-0" data-testid={testid}>
      <CardHeader title={`${n}. ${title}`} />
      <div className="border-t border-line px-5 py-4 text-[13.5px] text-ink-2">{children}</div>
    </Card>
  );
}

export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const { data: row } = await ctx.supabase.from("marketing_strategies").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!row) notFound();
  const out = row.output as unknown as StrategyOutput;
  const input = row.input as unknown as StrategyInput & { audienceLabel?: string };
  const facts = row.data_snapshot as unknown as InsightFact[];
  const warnings = (row.warnings ?? []) as string[];
  const skills = (row.skills ?? []) as unknown as SkillUsage;
  const factLabel = new Map(facts.map((f) => [f.key, `${f.label}: ${f.value}`]));
  const { data: props } = input.propertyIds.length
    ? await ctx.supabase.from("properties").select("id, title").eq("workspace_id", ctx.workspace.id).in("id", input.propertyIds)
    : { data: [] as { id: string; title: string }[] };
  const propTitle = new Map((props ?? []).map((p) => [p.id, p.title]));
  const cost = await processCost(ctx, row.id);
  const editor = can(ctx.role, "content.edit");
  const canDelete = can(ctx.role, "brand.edit") || row.created_by === ctx.userId;
  const FactChips = ({ keys }: { keys: string[] }) =>
    keys.length ? (
      <span className="mt-1 flex flex-wrap gap-1">{keys.map((k) => <span key={k} className="rounded bg-sunken px-1.5 py-0.5 text-[11.5px] text-ink-3" title={factLabel.get(k)}>{factLabel.get(k) ?? k}</span>)}</span>
    ) : null;
  const plat = (p: string) => PLATFORMS[p as keyof typeof PLATFORMS]?.label ?? p;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/director" className="inline-flex items-center gap-1 hover:text-accent"><ArrowLeft size={12} />AI Marketing Director</Link>}
        title={row.title}
        description={`${BUSINESS_GOALS[input.goal]?.label ?? input.goal} · ${STRATEGY_PERIODS[input.periodDays as keyof typeof STRATEGY_PERIODS] ?? `${input.periodDays} dni`} · ${input.audienceLabel ?? input.audience} · ${input.channels.map(plat).join(", ")} · ${input.postsPerWeek}/tydz. · budżet reklamowy: ${input.adBudget ? `${input.adBudget} zł/mies.` : "brak"}`}
        actions={<div className="flex items-center gap-2"><Badge tone={STATUS[row.status].tone} data-testid="strategy-status">{STATUS[row.status].label}</Badge>{editor && <StrategyActions id={row.id} status={row.status} canDelete={canDelete} />}</div>}
      />
      <div className="flex flex-col gap-5">
        {row.model === TEST_MODEL && (
          <Card className="border-warning/40 bg-warning-soft p-4 text-[13px] text-warning" data-testid="test-provider-note">
            Strategia z dostawcy testowego (bez AI): sekcja danych jest prawdziwa, pozostałe treści są mechaniczne. Po skonfigurowaniu ANTHROPIC_API_KEY strategię przygotuje model.
          </Card>
        )}
        {warnings.length > 0 && (
          <Card className="p-4" data-testid="strategy-warnings">
            <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink"><Warning className="text-warning" />Kontrola strategii ({warnings.length})</p>
            <ul className="mt-2 list-disc pl-5 text-[13px] text-ink-2">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </Card>
        )}
        <Card className="flex flex-wrap items-center gap-3 p-4 text-[12.5px] text-ink-3">
          <span>Oznaczenia:</span><Kind k="data" /><Kind k="conclusion" /><Kind k="hypothesis" /><Kind k="recommendation" />
          <span>Prognozy wyników nie są gwarancją. Cele to kierunki z miernikiem.</span>
        </Card>

        <Section n={1} title="Diagnoza sytuacji" testid="sec-diagnosis">
          <p className="text-ink">{out.diagnosis.summary}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {out.diagnosis.findings.map((f, i) => <li key={i} className="flex gap-2"><Kind k="conclusion" /><span>{f.text}<FactChips keys={f.facts} /></span></li>)}
          </ul>
          <details className="mt-4 rounded-md border border-line" data-testid="strategy-data">
            <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-ink">Dane biura użyte w strategii ({facts.length}), policzone przez aplikację</summary>
            <table className="w-full border-t border-line text-[12.5px]">
              <tbody className="divide-y divide-line">
                {facts.map((f) => <tr key={f.key}><td className="w-16 px-3 py-1.5 align-top"><Kind k="data" /></td><td className="px-2 py-1.5 text-ink-2">{f.label}</td><td className="px-3 py-1.5 text-right font-medium text-ink tabular-nums">{f.value}</td></tr>)}
              </tbody>
            </table>
          </details>
        </Section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-0" data-testid="sec-conclusions">
            <CardHeader title="Wnioski z danych" />
            <ul className="flex flex-col gap-2 border-t border-line px-5 py-4 text-[13.5px] text-ink-2">
              {out.conclusions.length ? out.conclusions.map((c, i) => <li key={i} className="flex gap-2"><Kind k="conclusion" /><span>{c.text}<FactChips keys={c.facts} /></span></li>) : <li className="text-ink-3">Brak wniosków popartych danymi.</li>}
            </ul>
          </Card>
          <Card className="p-0" data-testid="sec-hypotheses">
            <CardHeader title="Hipotezy do sprawdzenia" />
            <ul className="flex flex-col gap-2 border-t border-line px-5 py-4 text-[13.5px] text-ink-2">
              {out.hypotheses.map((h, i) => <li key={i} className="flex gap-2"><Kind k="hypothesis" /><span>{h.text}<span className="mt-0.5 block text-[12.5px] text-ink-3">Jak sprawdzić: {h.verify}</span></span></li>)}
            </ul>
          </Card>
        </div>

        <Card className="p-0" data-testid="sec-recommendations">
          <CardHeader title="Rekomendacje" />
          <ul className="grid gap-3 border-t border-line p-5 md:grid-cols-2">
            {out.recommendations.map((r, i) => (
              <li key={i} className="rounded-md border border-line p-3.5 text-[13px] text-ink-2" data-testid="recommendation">
                <div className="flex items-start gap-2"><Kind k="recommendation" /><span className="font-medium text-ink">{r.what}</span></div>
                <dl className="mt-2 grid grid-cols-[88px_1fr] gap-x-2 gap-y-1">
                  <dt className="text-ink-3">Dlaczego</dt><dd>{r.why}</dd>
                  <dt className="text-ink-3">Dane</dt><dd>{r.data}<FactChips keys={r.facts} /></dd>
                  <dt className="text-ink-3">Działanie</dt><dd>{r.action}</dd>
                  <dt className="text-ink-3">Miernik</dt><dd>{r.metric}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </Card>

        <Section n={2} title="Cele marketingowe" testid="sec-goals">
          <ul className="flex flex-col gap-1.5">{out.goals.map((g, i) => <li key={i}><span className="font-medium text-ink">{g.goal}</span> · miernik: {g.metric} · horyzont: {g.horizon}</li>)}</ul>
        </Section>
        <Section n={3} title="Segmenty odbiorców" testid="sec-segments">
          <ul className="grid gap-3 md:grid-cols-2">{out.segments.map((s, i) => <li key={i} className="rounded-md border border-line p-3"><p className="font-medium text-ink">{s.name}</p><p className="mt-1">Potrzeba: {s.need}</p><p className="mt-1">Przekaz: {s.message}</p>{s.property_ids.length > 0 && <p className="mt-1 text-[12.5px] text-ink-3">Oferty: {s.property_ids.map((p) => propTitle.get(p) ?? "oferta").join(", ")}</p>}</li>)}</ul>
        </Section>
        <Section n={4} title="Główne komunikaty" testid="sec-messages">
          <ul className="flex flex-col gap-2">{out.key_messages.map((m, i) => <li key={i}><span className="font-medium text-ink">„{m.message}”</span> · {m.segment}<span className="block text-[12.5px] text-ink-3">Uwiarygodnienie: {m.proof}</span></li>)}</ul>
        </Section>
        <Section n={5} title="Filary contentowe" testid="sec-pillars">
          <ul className="grid gap-3 md:grid-cols-3">{out.pillars.map((p, i) => <li key={i} className="rounded-md border border-line p-3"><p className="flex justify-between font-medium text-ink"><span>{p.name}</span><span className="text-ink-3 tabular-nums">{p.share}%</span></p><p className="mt-1">{p.purpose}</p>{p.examples.length > 0 && <ul className="mt-1 list-disc pl-4 text-[12.5px] text-ink-3">{p.examples.map((e) => <li key={e}>{e}</li>)}</ul>}</li>)}</ul>
        </Section>
        <Section n={6} title="Pomysły na kampanie" testid="sec-campaigns">
          <ul className="flex flex-col gap-3">{out.campaign_ideas.map((c, i) => <li key={i}><p className="font-medium text-ink">{c.name} <span className="font-normal text-ink-3">· tydzień {c.week} · {c.format} · {c.channels.map(plat).join(", ")}</span></p><p className="mt-0.5">{c.idea}</p>{c.property_ids.length > 0 && <p className="text-[12.5px] text-ink-3">Oferty: {c.property_ids.map((p) => propTitle.get(p) ?? "oferta").join(", ")}</p>}</li>)}</ul>
        </Section>
        <Section n={7} title="Harmonogram działań" testid="sec-schedule">
          <ol className="flex flex-col gap-2">{out.schedule.map((w) => <li key={w.week}><span className="font-medium text-ink">Tydzień {w.week}:</span> {w.focus}{w.actions.length > 0 && <ul className="list-disc pl-5 text-[12.5px] text-ink-3">{w.actions.map((a) => <li key={a}>{a}</li>)}</ul>}</li>)}</ol>
        </Section>
        <Section n={8} title="Rekomendowane formaty" testid="sec-formats">
          <ul className="flex flex-col gap-1.5">{out.formats.map((f, i) => <li key={i}><span className="font-medium text-ink">{f.format}</span> · {plat(f.channel)}: {f.why}</li>)}</ul>
        </Section>
        <Section n={9} title="Propozycje CTA" testid="sec-ctas">
          <ul className="flex flex-col gap-1.5">{out.ctas.map((c, i) => <li key={i}><span className="font-medium text-ink">„{c.cta}”</span> · {c.when}</li>)}</ul>
        </Section>
        <Section n={10} title="Mierniki sukcesu" testid="sec-metrics">
          <ul className="flex flex-col gap-1.5">{out.metrics.map((m, i) => <li key={i}><span className="font-medium text-ink">{m.metric}</span> · {m.how} {m.available ? <Badge tone="success">Mierzone w Ogarnio</Badge> : <Badge tone="muted">Wymaga danych spoza aplikacji</Badge>}</li>)}</ul>
        </Section>
        <Section n={11} title="Wstępny zestaw materiałów do przygotowania" testid="sec-materials">
          {out.materials.length === 0 ? <p className="text-ink-3">Brak propozycji materiałów.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead><tr className="text-left text-[12px] text-ink-3"><th className="py-1.5 pr-2">Tydz.</th><th className="pr-2">Materiał</th><th className="pr-2">Kanał</th><th className="pr-2">Oferta / temat</th><th className="pr-2">Filar</th><th /></tr></thead>
                <tbody className="divide-y divide-line">
                  {out.materials.map((m, i) => {
                    const def = getContentType(m.content_type);
                    const q = new URLSearchParams({ type: m.content_type, platform: m.platform, topic: m.topic });
                    if (m.property_id) q.set("property", m.property_id);
                    return (
                      <tr key={i} data-testid="strategy-material">
                        <td className="py-2 pr-2 tabular-nums">{m.week}</td>
                        <td className="pr-2 text-ink">{def?.label ?? m.content_type}</td>
                        <td className="pr-2">{plat(m.platform)}</td>
                        <td className="pr-2">{m.property_id ? <span className="text-ink">{propTitle.get(m.property_id) ?? "oferta"}</span> : m.topic}</td>
                        <td className="pr-2 text-ink-3">{m.pillar}</td>
                        <td className="text-right">{editor && <Button asChild size="sm" variant="ghost"><Link href={`/studio/new?${q.toString()}`}>Przygotuj<ArrowRight /></Link></Button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {out.limitations.length > 0 && (
          <Card className="p-4 text-[13px] text-ink-2"><p className="font-medium text-ink">Ograniczenia</p><ul className="mt-1 list-disc pl-5">{out.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></Card>
        )}
        <Card className="p-4 text-[12.5px] text-ink-3" data-testid="strategy-meta">
          Wersja promptu: <code className="rounded bg-sunken px-1">{row.prompt_version}</code> · model: {row.model} · utworzono {formatDate(row.created_at)}
          {" · "}koszt procesu: {cost.calls} wywołań AI, {cost.input} tokenów wejścia, {cost.output} tokenów wyjścia
          {cost.currency && cost.cost.amount > 0 ? `, ok. ${formatCost(cost.cost, cost.currency)} (szacunek wg stawek administratora)` : ""}
          <details className="mt-2"><summary className="cursor-pointer">Kompetencje użyte w strategii ({skills.length})</summary><ul className="mt-1 list-disc pl-5">{skills.map((s) => <li key={s.id}>{s.name} <code>v{s.version}</code></li>)}</ul></details>
        </Card>
      </div>
    </>
  );
}
