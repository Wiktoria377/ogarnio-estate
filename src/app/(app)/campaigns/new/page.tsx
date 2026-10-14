import { PageHeader } from "@/components/ui/page-header";
import { AiStatusNotice } from "@/components/studio/ai-status";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { getQuota } from "@/lib/ai";
import { getRenderQuota } from "@/lib/jobs/queue";
import { loadPropertyOptions } from "@/lib/members";
import { authorize, loadBrand, requireWorkspace } from "@/lib/session";
import { formatPrice } from "@/lib/utils";
import { todayWarsaw } from "@/core/planner/time";

export const metadata = { title: "Nowa kampania" };

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ property?: string }> }) {
  const ctx = await requireWorkspace();
  await authorize("editor");
  const sp = await searchParams;
  const [options, brand, quota, render] = await Promise.all([loadPropertyOptions(ctx), loadBrand(ctx), getQuota(ctx), getRenderQuota(ctx)]);
  const ids = options.map((p) => p.id);
  const { data: prices } = ids.length ? await ctx.supabase.from("properties").select("id, price, currency, transaction_type").in("id", ids).eq("workspace_id", ctx.workspace.id) : { data: [] };
  const priceOf = new Map((prices ?? []).map((p) => [p.id, p]));
  const properties = options.map(({ photos, ...p }) => {
    const pr = priceOf.get(p.id);
    return { ...p, photoCount: photos.length, price: pr?.price ?? null, priceLabel: pr?.price != null ? `${formatPrice(pr.price, pr.currency)}${pr.transaction_type === "rent" ? " / mies." : ""}` : null };
  });
  return (
    <>
      <PageHeader eyebrow="Campaign Studio" title="Nowa kampania" description="Jedna nieruchomość, kompletna kampania: AI Marketing Director przygotuje brief, a potem spójne posty, grafiki, wideo, reklamy, broszurę i harmonogram." />
      <AiStatusNotice />
      <CampaignWizard
        properties={properties}
        initialProperty={sp.property && properties.some((p) => p.id === sp.property) ? sp.property : null}
        brandAudience={brand.target_audience}
        quota={{ used: quota.used, limit: quota.limit, renderUsed: render.used, renderLimit: render.limit }}
        today={todayWarsaw()}
      />
    </>
  );
}
