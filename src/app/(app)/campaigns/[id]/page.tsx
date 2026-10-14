import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CampaignWorkspace, type AssetView } from "@/components/campaigns/campaign-workspace";
import type { JobItem } from "@/components/campaigns/job-progress";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import type { TextBody } from "@/core/marketing-engine/request";
import { variantToText } from "@/core/marketing-engine/schemas";
import type { StoredBrief } from "@/core/marketing-engine/director";
import { campaignQa } from "@/lib/campaign-qa";
import { JOB_COLUMNS } from "@/lib/jobs/queue";
import { canEdit, requireWorkspace } from "@/lib/session";
import { formatRelative } from "@/lib/utils";
import { CAMPAIGN_GOALS, CAMPAIGN_PLATFORMS, CAMPAIGN_STYLES, DELIVERABLES, DELIVERABLE_ORDER, campaignAudience, campaignOptionsSchema, type DeliverableId } from "@/verticals/real-estate/campaign";

export const metadata = { title: "Kampania" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireWorkspace();
  const { data: campaign } = await ctx.supabase.from("campaigns").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!campaign) notFound();

  const [{ data: property }, { data: links }, { data: jobs }, { data: brand }] = await Promise.all([
    campaign.property_id ? ctx.supabase.from("properties").select("*").eq("id", campaign.property_id).eq("workspace_id", ctx.workspace.id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.supabase.from("campaign_assets").select("deliverable, content_item_id").eq("campaign_id", id).eq("workspace_id", ctx.workspace.id),
    ctx.supabase.from("generation_jobs").select(JOB_COLUMNS).eq("campaign_id", id).eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: true }).limit(100),
    ctx.supabase.from("brand_profiles").select("target_audience").eq("workspace_id", ctx.workspace.id).maybeSingle(),
  ]);
  const itemIds = (links ?? []).map((l) => l.content_item_id).filter((x): x is string => !!x);
  const { data: items } = itemIds.length ? await ctx.supabase.from("content_items").select("id, kind, title, status, current_version, updated_at").in("id", itemIds).eq("workspace_id", ctx.workspace.id) : { data: [] };
  const { data: versions } = items?.length ? await ctx.supabase.from("content_versions").select("item_id, version, body").in("item_id", items.map((i) => i.id)).in("version", [...new Set(items.map((i) => i.current_version))]) : { data: [] };
  const { data: cover } = property ? await ctx.supabase.from("property_photos").select("storage_path").eq("property_id", property.id).eq("workspace_id", ctx.workspace.id).order("position").limit(1).maybeSingle() : { data: null };

  const bodyOf = (itemId: string) => {
    const it = items?.find((i) => i.id === itemId);
    return versions?.find((v) => v.item_id === itemId && v.version === it?.current_version)?.body ?? null;
  };
  const order = DELIVERABLE_ORDER.filter((d) => campaign.deliverables.includes(d));
  const assets: AssetView[] = order.map((d) => {
    const link = links?.find((l) => l.deliverable === d);
    const item = link?.content_item_id ? items?.find((i) => i.id === link.content_item_id) ?? null : null;
    let excerpt: string | null = null;
    let score: number | null = null;
    if (item?.kind === "text") {
      const body = bodyOf(item.id) as unknown as TextBody | null;
      const sel = body?.variants?.find((v) => v.id === body.selected) ?? body?.variants?.[0];
      if (sel) {
        excerpt = variantToText(sel.variant).slice(0, 360);
        score = sel.quality?.score ?? null;
      }
    }
    return { deliverable: d, label: DELIVERABLES[d].label, kind: DELIVERABLES[d].kind, item: item ? { id: item.id, kind: item.kind, title: item.title, status: item.status, version: item.current_version, updatedAt: item.updated_at } : null, excerpt, score };
  });

  const options = campaignOptionsSchema.parse(campaign.options ?? {});
  const brief = (campaign.brief as unknown as StoredBrief | null) ?? null;
  const qa = property
    ? campaignQa({ campaign, property, options, brief }, assets.filter((a) => a.item).map((a) => ({ deliverable: a.deliverable as DeliverableId, kind: a.item!.kind, body: bodyOf(a.item!.id) })))
    : [];
  const audience = campaignAudience(campaign.audience, brand?.target_audience ?? null).label;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/campaigns" className="hover:text-ink">Campaign Studio</Link>}
        title={campaign.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {property ? <Link href={`/properties/${property.id}`} className="font-medium text-ink-2 hover:text-accent-ink">{property.title}</Link> : <span>Nieruchomość usunięta</span>}
            <span>·</span>
            <span>{CAMPAIGN_GOALS[campaign.goal].label}</span>
            <span>·</span>
            <span suppressHydrationWarning>zmiana {formatRelative(campaign.updated_at)}</span>
            {campaign.status === "archived" && <Badge tone="muted">W archiwum</Badge>}
          </span>
        }
      />
      <CampaignWorkspace
        campaign={{ id: campaign.id, name: campaign.name, status: campaign.status, goal: CAMPAIGN_GOALS[campaign.goal].label, style: CAMPAIGN_STYLES[campaign.style].label, audience, platforms: campaign.platforms.map((p) => CAMPAIGN_PLATFORMS[p as keyof typeof CAMPAIGN_PLATFORMS] ?? p), cover: cover ? `/api/files/${cover.storage_path}` : null }}
        brief={brief}
        assets={assets}
        jobs={(jobs ?? []) as JobItem[]}
        qa={qa}
        editable={canEdit(ctx.role)}
      />
    </>
  );
}
