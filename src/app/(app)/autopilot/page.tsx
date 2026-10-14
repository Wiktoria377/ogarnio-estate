import Link from "next/link";
import { RocketLaunch } from "@phosphor-icons/react/dist/ssr";
import { AutopilotForm } from "@/components/autopilot/autopilot-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/core/auth/permissions";
import { addDays, todayWarsaw } from "@/core/planner/time";
import { getQuota } from "@/lib/ai";
import { requireWorkspace } from "@/lib/session";
import { formatDate, formatNumber } from "@/lib/utils";
import { fetchAll } from "@/lib/supabase/fetch-all";

export const metadata = { title: "Campaign Autopilot" };

const STATUS = { planned: { label: "Plan", tone: "muted" }, generating: { label: "Przygotowuję", tone: "accent" }, ready: { label: "Do akceptacji", tone: "warning" }, archived: { label: "Archiwum", tone: "outline" } } as const;

export default async function AutopilotPage() {
  const ctx = await requireWorkspace();
  const ws = ctx.workspace.id;
  const [{ data: props }, { data: photos }, { data: strategies }, { data: runs }, quota] = await Promise.all([
    ctx.supabase.from("properties").select("id, title, city, district, price, transaction_type").eq("workspace_id", ws).eq("status", "active").order("updated_at", { ascending: false }).limit(200),
    fetchAll((lo, hi) => ctx.supabase.from("property_photos").select("property_id").eq("workspace_id", ws).order("id").range(lo, hi), 5000),
    ctx.supabase.from("marketing_strategies").select("id, title").eq("workspace_id", ws).eq("status", "accepted").order("created_at", { ascending: false }).limit(20),
    ctx.supabase.from("autopilot_runs").select("id, title, status, created_at, ai_limit, ai_used").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(30),
    getQuota(ctx).catch(() => null),
  ]);
  const count = new Map<string, number>();
  for (const p of photos ?? []) count.set(p.property_id, (count.get(p.property_id) ?? 0) + 1);
  return (
    <>
      <PageHeader title="Campaign Autopilot" description="Plan publikacji na najbliższy okres, materiały przygotowane w limicie kosztów i kolejka akceptacji. Ty decydujesz, co trafia do planera." />
      <div className="flex flex-col gap-6">
        {can(ctx.role, "content.edit") && (
          <AutopilotForm
            startDate={addDays(todayWarsaw(), 1)}
            quotaLeft={quota ? Math.max(0, quota.limit - quota.used) : null}
            strategies={strategies ?? []}
            properties={(props ?? []).map((p) => ({ id: p.id, title: p.title, photos: count.get(p.id) ?? 0, detail: [p.transaction_type === "rent" ? "Najem" : "Sprzedaż", p.city, p.district, p.price ? `${formatNumber(p.price)} zł` : null].filter(Boolean).join(" · ") }))}
          />
        )}
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Plany marketingu</h2>
          {(runs ?? []).length === 0 ? (
            <EmptyState icon={<RocketLaunch />} title="Brak planów" description="Wybierz okres, platformy i filary, a autopilot ułoży plan publikacji." />
          ) : (
            <ul className="grid gap-2">
              {(runs ?? []).map((r) => (
                <li key={r.id}>
                  <Card className="flex flex-wrap items-center gap-3 p-4" data-testid="autopilot-run">
                    <Link href={`/autopilot/${r.id}`} className="min-w-0 flex-1 text-[14px] font-medium text-ink hover:text-accent">{r.title}</Link>
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    <span className="text-[12px] text-ink-3">AI: {r.ai_used}/{r.ai_limit}</span>
                    <span className="text-[12px] text-ink-3">{formatDate(r.created_at)}</span>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
