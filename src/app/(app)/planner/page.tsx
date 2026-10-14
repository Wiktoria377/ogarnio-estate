import { Planner, type PlannerEntry, type PlannerView } from "@/components/planner/planner";
import { PageHeader } from "@/components/ui/page-header";
import { monthGrid, weekDays } from "@/core/planner/model";
import { addDays, isoToWarsaw, todayWarsaw, warsawToIso } from "@/core/planner/time";
import { canEdit, requireWorkspace } from "@/lib/session";
import { PUBLICATION_STATE } from "@/core/publishing/platforms";

export const metadata = { title: "Planer" };

const VIEWS: PlannerView[] = ["month", "week", "list", "plans"];

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const view: PlannerView = VIEWS.includes(sp.view as PlannerView) ? (sp.view as PlannerView) : "month";
  const today = todayWarsaw();
  const anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const days = view === "month" ? monthGrid(anchor) : view === "week" ? weekDays(anchor) : null;
  const from = days ? days[0]! : view === "list" ? anchor : addDays(today, -60);
  const to = days ? addDays(days.at(-1)!, 1) : view === "list" ? addDays(anchor, 31) : addDays(today, 400);

  const [{ data: rows }, { data: items }, { data: campaigns }, { data: properties }, { data: plans }] = await Promise.all([
    ctx.supabase.from("schedule_entries").select("*").eq("workspace_id", ctx.workspace.id).gte("scheduled_at", warsawToIso(from, "00:00")).lt("scheduled_at", warsawToIso(to, "00:00")).order("scheduled_at").limit(1000),
    ctx.supabase.from("content_items").select("id, title, kind, content_type").eq("workspace_id", ctx.workspace.id).neq("content_type", "schedule").order("updated_at", { ascending: false }).limit(300),
    ctx.supabase.from("campaigns").select("id, name, created_at").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(100),
    ctx.supabase.from("properties").select("id, title").eq("workspace_id", ctx.workspace.id).neq("status", "archived").order("updated_at", { ascending: false }).limit(200),
    ctx.supabase.from("schedule_plans").select("*").eq("workspace_id", ctx.workspace.id).order("start_date", { ascending: false }).limit(50),
  ]);
  const entryIds = (rows ?? []).map((e) => e.id);
  const [{ data: pubs }, { data: conns }] = await Promise.all([
    entryIds.length ? ctx.supabase.from("publications").select("id, schedule_entry_id, connection_id, state, scheduled_at, caption, error_message").in("schedule_entry_id", entryIds).neq("state", "canceled") : Promise.resolve({ data: [] as never[] }),
    ctx.supabase.from("social_connections").select("id, name, platform, status").eq("workspace_id", ctx.workspace.id),
  ]);
  const connById = new Map((conns ?? []).map((c) => [c.id, c]));
  // Conflicts: same account within 30 minutes, account needing re-authorization, failures, overdue.
  const conflictOf = (p: NonNullable<typeof pubs>[number]): string | null => {
    const c = connById.get(p.connection_id);
    if (!c || c.status === "disconnected") return "Konto odłączone";
    if (c.status === "reauth_required" || c.status === "error") return `Konto „${c.name}” wymaga ponownej autoryzacji`;
    if (p.state === "failed" || p.state === "action_required") return p.error_message ?? "Błąd publikacji";
    if (["draft", "pending_approval"].includes(p.state) && Date.parse(p.scheduled_at) < Date.now()) return "Termin minął bez akceptacji";
    const near = (pubs ?? []).find((o) => o.id !== p.id && o.connection_id === p.connection_id && Math.abs(Date.parse(o.scheduled_at) - Date.parse(p.scheduled_at)) < 30 * 60_000);
    if (near) return `Dwie publikacje na „${c.name}” w odstępie poniżej 30 minut`;
    return null;
  };
  const itemById = new Map((items ?? []).map((i) => [i.id, i]));
  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c.name]));
  const toEntry = (e: NonNullable<typeof rows>[number]): PlannerEntry => {
    const w = isoToWarsaw(e.scheduled_at);
    const it = e.content_item_id ? itemById.get(e.content_item_id) : undefined;
    return { id: e.id, title: e.title, channel: e.channel, status: e.status, date: w.date, time: w.time, notes: e.notes ?? "", contentItemId: e.content_item_id, content: it ? { id: it.id, title: it.title, kind: it.kind } : null, campaign: e.campaign_id ? { id: e.campaign_id, name: campaignById.get(e.campaign_id) ?? "Kampania" } : null, planId: e.plan_id, externalUrl: e.external_url ?? "", publishedAt: e.published_at, campaignId: e.campaign_id,
      auto: (pubs ?? []).filter((p) => p.schedule_entry_id === e.id).map((p) => ({ id: p.id, state: p.state, stateLabel: PUBLICATION_STATE[p.state].label, account: connById.get(p.connection_id)?.name ?? "Konto", platform: connById.get(p.connection_id)?.platform ?? "facebook_page", caption: p.caption.slice(0, 600), conflict: conflictOf(p) })) };
  };

  return (
    <>
      <PageHeader title="Planer" description="Plan publikacji w mediach społecznościowych i kanałach biura. Wpisy z ikoną błyskawicy publikują się automatycznie na połączonych kontach po akceptacji; pozostałe publikujesz ręcznie i oznaczasz status." />
      <Planner
        view={view}
        anchor={anchor}
        today={today}
        days={days}
        entries={(rows ?? []).map(toEntry)}
        plans={(plans ?? []).map((p) => ({ id: p.id, name: p.name, startDate: p.start_date, days: p.days, postsPerWeek: p.posts_per_week, channels: p.channels, campaign: p.campaign_id ? { id: p.campaign_id, name: campaignById.get(p.campaign_id) ?? "Kampania" } : null }))}
        items={(items ?? []).map((i) => ({ id: i.id, title: i.title, kind: i.kind }))}
        campaigns={(campaigns ?? []).map((c) => ({ id: c.id, name: c.name }))}
        properties={properties ?? []}
        editable={canEdit(ctx.role)}
      />
    </>
  );
}
