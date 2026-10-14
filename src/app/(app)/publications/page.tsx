import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { PublicationList, type PublicationView } from "@/components/publishing/publication-list";
import { can } from "@/core/auth/permissions";
import { PLATFORMS, PUBLICATION_STATE } from "@/core/publishing/platforms";
import { socialMock } from "@/lib/social/config";
import { requireWorkspace } from "@/lib/session";
import type { PublicationState } from "@/lib/supabase/database.types";

export const metadata = { title: "Publikacje" };

const GROUPS: { id: string; label: string; states: PublicationState[] }[] = [
  { id: "attention", label: "Wymaga uwagi", states: ["pending_approval", "failed", "action_required", "draft"] },
  { id: "upcoming", label: "Zaplanowane i w toku", states: ["scheduled", "queued", "publishing", "processing"] },
  { id: "done", label: "Opublikowane i anulowane", states: ["published", "canceled"] },
];

export default async function PublicationsPage({ searchParams }: { searchParams: Promise<{ state?: string; platform?: string }> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  let q = ctx.supabase.from("publications").select("*").eq("workspace_id", ctx.workspace.id).order("scheduled_at", { ascending: true }).limit(300);
  if (sp.state && sp.state in PUBLICATION_STATE) q = q.eq("state", sp.state as PublicationState);
  const [{ data: pubs }, { data: conns }, { data: attempts }] = await Promise.all([
    q,
    ctx.supabase.from("social_connections").select("id, platform, name, status").eq("workspace_id", ctx.workspace.id),
    ctx.supabase.from("publication_attempts").select("publication_id, action, outcome, message, created_at").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(1000),
  ]);
  const connById = new Map((conns ?? []).map((c) => [c.id, c]));
  const userIds = [...new Set((pubs ?? []).flatMap((p) => [p.approved_by, p.requested_by]).filter(Boolean) as string[])];
  const { data: profiles } = userIds.length ? await ctx.supabase.from("profiles").select("id, full_name").in("id", userIds) : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name || "Członek zespołu"]));
  const views: PublicationView[] = (pubs ?? [])
    .filter((p) => !sp.platform || connById.get(p.connection_id)?.platform === sp.platform)
    .map((p) => {
      const c = connById.get(p.connection_id);
      return {
        id: p.id,
        state: p.state,
        platform: c?.platform ?? "facebook_page",
        account: c?.name ?? "Konto",
        accountStatus: c?.status ?? "disconnected",
        format: p.format,
        caption: p.caption,
        scheduledAt: p.scheduled_at,
        publishedAt: p.published_at,
        externalId: p.external_id,
        externalUrl: p.external_url,
        error: p.error_message,
        uncertain: p.uncertain,
        mediaCount: Array.isArray(p.media_spec) ? p.media_spec.length : 0,
        approvedBy: p.approved_by ? names.get(p.approved_by) ?? "Członek zespołu" : null,
        requestedBy: p.requested_by ? names.get(p.requested_by) ?? "Członek zespołu" : null,
        history: (attempts ?? []).filter((a) => a.publication_id === p.id).slice(0, 8).map((a) => ({ at: a.created_at, action: a.action, outcome: a.outcome, message: a.message })),
      };
    });

  return (
    <>
      <PageHeader
        title="Publikacje"
        description="Automatyczne publikacje na połączonych kontach. Post uznajemy za opublikowany dopiero po potwierdzeniu z platformy (z jej identyfikatorem)."
        actions={can(ctx.role, "publish.request") && <Button asChild><Link href="/publications/new"><Plus weight="bold" /> Nowa publikacja</Link></Button>}
      />
      {socialMock() && <p className="mb-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-[13px] text-warning" data-testid="social-mock-banner">Tryb testowy: publikacje trafiają do symulatora API, nie na prawdziwe konta.</p>}
      <form className="mb-4 flex flex-wrap gap-2 text-[12.5px]" method="get">
        <select name="state" defaultValue={sp.state ?? ""} aria-label="Filtr statusu" className="h-8 rounded-md border border-line bg-surface px-2">
          <option value="">Wszystkie statusy</option>
          {Object.entries(PUBLICATION_STATE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="platform" defaultValue={sp.platform ?? ""} aria-label="Filtr platformy" className="h-8 rounded-md border border-line bg-surface px-2">
          <option value="">Wszystkie platformy</option>
          {Object.values(PLATFORMS).filter((p) => p.available).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <Button size="sm" variant="secondary" type="submit">Filtruj</Button>
      </form>
      {views.length === 0 ? (
        <EmptyState icon={<Plus />} title="Brak publikacji" description="Utwórz publikację z materiału w bibliotece. Po akceptacji zostanie wysłana o wybranej godzinie." />
      ) : (
        GROUPS.map((g) => {
          const list = views.filter((v) => g.states.includes(v.state));
          if (!list.length) return null;
          return (
            <section key={g.id} className="mb-6">
              <h2 className="mb-2 text-[13px] font-semibold text-ink-2">{g.label} ({list.length})</h2>
              <PublicationList items={g.id === "done" ? [...list].reverse() : list} canApprove={can(ctx.role, "publish.approve")} canEdit={can(ctx.role, "publish.request")} />
            </section>
          );
        })
      )}
    </>
  );
}
