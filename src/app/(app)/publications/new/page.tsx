import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/publishing/composer";
import { can } from "@/core/auth/permissions";
import { addDays, todayWarsaw } from "@/core/planner/time";
import { socialMock } from "@/lib/social/config";
import { pagePerm } from "@/lib/session";

export const metadata = { title: "Nowa publikacja" };

export default async function NewPublicationPage({ searchParams }: { searchParams: Promise<{ item?: string; campaign?: string; date?: string }> }) {
  const ctx = await pagePerm("publish.request");
  const sp = await searchParams;
  const ws = ctx.workspace.id;
  const [{ data: conns }, { data: items }, { data: props }, { data: campaigns }] = await Promise.all([
    ctx.supabase.from("social_connections").select("id, platform, name, avatar_url, status").eq("workspace_id", ws).in("status", ["connected", "limited"]).order("created_at"),
    ctx.supabase.from("content_items").select("id, title, kind, property_id").eq("workspace_id", ws).in("kind", ["text", "graphic", "video"]).neq("content_type", "schedule").order("updated_at", { ascending: false }).limit(200),
    ctx.supabase.from("properties").select("id, title").eq("workspace_id", ws).neq("status", "archived").order("updated_at", { ascending: false }).limit(200),
    ctx.supabase.from("campaigns").select("id, name").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(100),
  ]);
  const ids = (props ?? []).map((p) => p.id);
  const { data: photos } = ids.length ? await ctx.supabase.from("property_photos").select("id, property_id, storage_path, width, height").in("property_id", ids).order("position") : { data: [] };

  if (!conns?.length) {
    return (
      <div className="max-w-2xl">
        <PageHeader eyebrow="Publikacje" title="Nowa publikacja" />
        <Card className="p-6">
          <p className="text-[14px] font-medium">Najpierw połącz konto społecznościowe</p>
          <p className="mt-1 text-[13px] text-ink-3">Automatyczna publikacja działa na połączonych stronach Facebook, kontach Instagram i profilach LinkedIn. Bez połączenia możesz nadal planować wpisy w Planerze i publikować ręcznie.</p>
          <div className="mt-4 flex gap-2">
            {can(ctx.role, "social.manage") ? <Button asChild><Link href="/connections">Połącz konto</Link></Button> : <p className="text-[13px] text-ink-3">Konta łączy właściciel lub administrator biura.</p>}
            <Button asChild variant="secondary"><Link href="/planner">Planer</Link></Button>
          </div>
        </Card>
      </div>
    );
  }
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date >= todayWarsaw() ? sp.date : addDays(todayWarsaw(), 1);
  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow={<Link href="/publications" className="hover:text-ink">Publikacje</Link>} title="Nowa publikacja" description="Wybierz materiał, konta i termin. Każda publikacja przed wejściem do kolejki musi zostać zaakceptowana przez osobę uprawnioną." />
      {socialMock() && <p className="mb-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-[13px] text-warning" data-testid="social-mock-banner">Tryb testowy: publikacje trafiają do symulatora API, nie na prawdziwe konta.</p>}
      <Composer
        connections={conns.map((c) => ({ id: c.id, platform: c.platform, name: c.name, avatar: c.avatar_url, limited: c.status === "limited" }))}
        items={(items ?? []).map((i) => ({ id: i.id, title: i.title, kind: i.kind as "text" | "graphic" | "video", propertyId: i.property_id }))}
        properties={props ?? []}
        photos={(photos ?? []).map((p) => ({ id: p.id, propertyId: p.property_id, url: `/api/files/${p.storage_path}`, width: p.width, height: p.height }))}
        campaigns={campaigns ?? []}
        initialItem={sp.item && /^[0-9a-f-]{36}$/.test(sp.item) ? sp.item : null}
        initialCampaign={sp.campaign && /^[0-9a-f-]{36}$/.test(sp.campaign) ? sp.campaign : null}
        initialDate={date}
        canApprove={can(ctx.role, "publish.approve")}
      />
    </div>
  );
}
