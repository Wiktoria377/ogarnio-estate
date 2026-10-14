import Link from "next/link";
import { House, Megaphone, Plus } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { canEdit, requireWorkspace } from "@/lib/session";
import { formatRelative } from "@/lib/utils";
import { CAMPAIGN_GOALS, DELIVERABLES, type DeliverableId } from "@/verticals/real-estate/campaign";

export const metadata = { title: "Campaign Studio" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireWorkspace();
  const archived = sp.archived === "1";
  const { data: campaigns } = await ctx.supabase.from("campaigns").select("id, name, goal, status, deliverables, property_id, updated_at").eq("workspace_id", ctx.workspace.id).eq("status", archived ? "archived" : "active").order("updated_at", { ascending: false }).limit(100);
  const ids = (campaigns ?? []).map((c) => c.id);
  const propIds = [...new Set((campaigns ?? []).map((c) => c.property_id).filter((x): x is string => !!x))];
  const [{ data: jobs }, { data: props }, { data: photos }] = await Promise.all([
    ids.length ? ctx.supabase.from("generation_jobs").select("campaign_id, kind, deliverable, status, created_at").in("campaign_id", ids).eq("workspace_id", ctx.workspace.id).order("created_at") : Promise.resolve({ data: [] }),
    propIds.length ? ctx.supabase.from("properties").select("id, title").in("id", propIds).eq("workspace_id", ctx.workspace.id) : Promise.resolve({ data: [] }),
    propIds.length ? ctx.supabase.from("property_photos").select("property_id, storage_path, position").in("property_id", propIds).eq("workspace_id", ctx.workspace.id).order("position") : Promise.resolve({ data: [] }),
  ]);
  const status = (id: string) => {
    const latest = new Map<string, string>();
    for (const j of jobs ?? []) if (j.campaign_id === id) latest.set(`${j.kind}:${j.deliverable ?? ""}`, j.status);
    const all = [...latest.values()];
    return { done: all.filter((s) => s === "succeeded").length, failed: all.filter((s) => s === "failed").length, active: all.filter((s) => s === "queued" || s === "running").length, total: all.length };
  };

  return (
    <>
      <PageHeader
        title="Campaign Studio"
        description="Jedna nieruchomość, kompletna kampania marketingowa: brief, posty, karuzela, Stories, Reels, reklamy, broszura i harmonogram."
        actions={
          <>
            <Button asChild variant="ghost"><Link href={archived ? "/campaigns" : "/campaigns?archived=1"}>{archived ? "Aktywne" : "Archiwum"}</Link></Button>
            {canEdit(ctx.role) && <Button asChild><Link href="/campaigns/new"><Plus weight="bold" /> Stwórz kampanię</Link></Button>}
          </>
        }
      />
      {!campaigns?.length ? (
        <EmptyState icon={<Megaphone size={22} />} title={archived ? "Brak kampanii w archiwum" : "Nie masz jeszcze kampanii"} description="Wybierz ofertę i cel, a AI Marketing Director przygotuje spójny zestaw materiałów." action={!archived && canEdit(ctx.role) ? <Button asChild><Link href="/campaigns/new"><Plus weight="bold" /> Stwórz kampanię</Link></Button> : undefined} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => {
            const st = status(c.id);
            const cover = photos?.find((p) => p.property_id === c.property_id);
            const prop = props?.find((p) => p.id === c.property_id);
            return (
              <li key={c.id}>
                <Link href={`/campaigns/${c.id}`} className="block h-full">
                  <Card className="flex h-full flex-col overflow-hidden p-0 transition-shadow hover:shadow-sm">
                    <div className="aspect-[16/9] bg-sunken">{cover ? <img src={`/api/files/${cover.storage_path}`} alt="" className="size-full object-cover" loading="lazy" /> : <div className="flex size-full items-center justify-center text-ink-4"><House size={26} /></div>}</div>
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <span className="line-clamp-2 text-[14px] font-semibold text-ink">{c.name}</span>
                      <span className="text-[12.5px] text-ink-3">{CAMPAIGN_GOALS[c.goal].label}{prop ? ` · ${prop.title}` : ""}</span>
                      <span className="line-clamp-1 text-[12px] text-ink-4">{c.deliverables.map((d) => DELIVERABLES[d as DeliverableId]?.label ?? d).join(" · ")}</span>
                      <span className="mt-auto flex items-center gap-2 pt-2 text-[12px] text-ink-3">
                        {st.active ? <Badge tone="accent" dot>W trakcie {st.done}/{st.total}</Badge> : st.failed ? <Badge tone="warning">{st.failed} do ponowienia</Badge> : <Badge tone="success">Gotowa</Badge>}
                        <span suppressHydrationWarning>{formatRelative(c.updated_at)}</span>
                      </span>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
