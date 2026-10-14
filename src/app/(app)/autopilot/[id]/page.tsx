import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { AutopilotQueue, type QueueItem } from "@/components/autopilot/autopilot-queue";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatCost } from "@/core/admin/costs";
import { TEST_MODEL } from "@/core/ai/test-provider";
import { AUTOPILOT_KINDS, AUTOPILOT_PLATFORMS, PILLARS, type AutopilotInput, type Pillar } from "@/core/autopilot/plan";
import { can } from "@/core/auth/permissions";
import type { TextBody } from "@/core/marketing-engine/request";
import { variantToText } from "@/core/marketing-engine/schemas";
import { isoToWarsaw } from "@/core/planner/time";
import type { QaReport } from "@/core/qa/types";
import { QA_VERSION } from "@/core/qa/types";
import { BUSINESS_GOALS, type BusinessGoal } from "@/core/strategy/director";
import { requireWorkspace } from "@/lib/session";
import { processCost } from "@/lib/strategy/service";

export const metadata = { title: "Plan marketingu" };

export default async function AutopilotRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const ws = ctx.workspace.id;
  const { data: run } = await ctx.supabase.from("autopilot_runs").select("*").eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (!run) notFound();
  const { data: items } = await ctx.supabase.from("autopilot_items").select("*").eq("run_id", id).eq("workspace_id", ws).order("position");
  const contentIds = (items ?? []).map((i) => i.content_item_id).filter((x): x is string => !!x);
  const propIds = [...new Set((items ?? []).map((i) => i.property_id).filter((x): x is string => !!x))];
  const [{ data: contents }, { data: props }, cost] = await Promise.all([
    contentIds.length ? ctx.supabase.from("content_items").select("id, kind, title, current_version, qa, qa_version, updated_at").eq("workspace_id", ws).in("id", contentIds) : Promise.resolve({ data: [] }),
    propIds.length ? ctx.supabase.from("properties").select("id, title").eq("workspace_id", ws).in("id", propIds) : Promise.resolve({ data: [] }),
    processCost(ctx, id),
  ]);
  const byId = new Map((contents ?? []).map((c) => [c.id, c]));
  const textIds = (contents ?? []).filter((c) => c.kind === "text");
  const { data: versions } = textIds.length
    ? await ctx.supabase.from("content_versions").select("item_id, version, body").eq("workspace_id", ws).in("item_id", textIds.map((c) => c.id))
    : { data: [] };
  const preview = new Map<string, string>();
  for (const v of versions ?? []) {
    const c = byId.get(v.item_id);
    if (!c || c.current_version !== v.version) continue;
    const body = v.body as unknown as TextBody;
    const sel = body.variants?.find((x) => x.id === body.selected) ?? body.variants?.[0];
    if (sel) preview.set(v.item_id, variantToText(sel.variant).slice(0, 420));
  }
  const propTitle = new Map((props ?? []).map((p) => [p.id, p.title]));
  const input = run.input as unknown as AutopilotInput;
  const rationale = (run.rationale ?? []) as string[];

  const queue: QueueItem[] = (items ?? []).map((i) => {
    const c = i.content_item_id ? byId.get(i.content_item_id) : undefined;
    const qa = c?.qa as unknown as QaReport | null;
    const when = isoToWarsaw(i.planned_at);
    return {
      id: i.id, position: i.position, kind: i.kind, kindLabel: AUTOPILOT_KINDS[i.kind].label, platform: AUTOPILOT_PLATFORMS[i.platform].label,
      pillar: PILLARS[i.pillar as Pillar]?.label ?? i.pillar, goal: BUSINESS_GOALS[i.goal as BusinessGoal]?.label ?? i.goal,
      property: i.property_id ? propTitle.get(i.property_id) ?? null : null, topic: i.topic, rationale: i.rationale, date: when.date, time: when.time,
      status: i.status, error: i.error, generations: i.generations,
      content: c ? {
        id: c.id, kind: c.kind, title: c.title, href: c.kind === "graphic" ? `/graphics/${c.id}` : `/studio/${c.id}`,
        thumb: c.kind === "graphic" ? `/api/graphics/${c.id}/export?thumb=1&v=${encodeURIComponent(c.updated_at)}` : null,
        preview: preview.get(c.id) ?? null,
        qa: qa?.version === QA_VERSION ? { ...qa.summary, stale: c.qa_version !== c.current_version } : null,
      } : null,
    };
  });
  const counts = queue.reduce<Record<string, number>>((m, q) => ({ ...m, [q.status]: (m[q.status] ?? 0) + 1 }), {});
  const testModel = cost.models.includes(TEST_MODEL);

  return (
    <>
      <Link href="/autopilot" className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft size={13} /> Campaign Autopilot</Link>
      <PageHeader title={run.title} description="Plan publikacji i kolejka akceptacji. Materiał trafia do planera dopiero po Twojej akceptacji; publikacja wymaga osobnego zatwierdzenia." />
      <div className="flex flex-col gap-6">
        <Card className="p-0" data-testid="autopilot-rationale">
          <CardHeader title="Uzasadnienie planu" description={`Wersja planu ${run.plan_version}. Liczby pochodzą z danych biura; „Brak danych” oznacza, że aplikacja ich nie ma.`} />
          <ul className="flex list-disc flex-col gap-1.5 border-t border-line px-5 py-4 pl-9 text-[13.5px] text-ink-2">
            {rationale.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Card>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3" data-testid="autopilot-meta">
          <Badge tone="neutral">Pozycje: {queue.length}</Badge>
          {Object.entries(counts).map(([k, v]) => <Badge key={k} tone="outline">{STATUS_LABEL[k] ?? k}: {v}</Badge>)}
          <span>Limit AI planu: {run.ai_used}/{run.ai_limit}</span>
          <span>· koszt procesu: {cost.calls} wywołań AI, {cost.input} tokenów wejścia, {cost.output} tokenów wyjścia{cost.currency && cost.cost.amount > 0 ? `, ok. ${formatCost(cost.cost, cost.currency)} (szacunek)` : ""}</span>
          {testModel && <span className="text-warning" data-testid="test-provider-note">Teksty z dostawcy testowego (bez klucza AI): składane mechanicznie z danych.</span>}
          <span>· okres: {input.days} dni od {input.startDate}</span>
        </div>
        <AutopilotQueue runId={run.id} items={queue} editable={can(ctx.role, "content.edit")} limitLeft={run.ai_limit - run.ai_used} archived={run.status === "archived"} />
      </div>
    </>
  );
}

const STATUS_LABEL: Record<string, string> = { proposed: "Do przygotowania", generating: "W przygotowaniu", ready: "Do akceptacji", failed: "Błąd", accepted: "Zaakceptowane", rejected: "Odrzucone", scheduled: "W planerze" };
