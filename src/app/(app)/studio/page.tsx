import Link from "next/link";
import { ArrowRight, Note, Plus } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AiStatusNotice } from "@/components/studio/ai-status";
import { CONTENT_GROUPS } from "@/core/marketing-engine/content-types";
import type { ContentGroup } from "@/core/marketing-engine/taxonomy";
import { REAL_ESTATE_CONTENT_TYPES, getContentType } from "@/verticals/real-estate/content-types";
import { canEdit, requireWorkspace } from "@/lib/session";
import { formatRelative } from "@/lib/utils";
import { t } from "@/i18n/pl";

export const metadata = { title: "Studio treści" };

export default async function StudioPage() {
  const ctx = await requireWorkspace();
  const { data: recent } = await ctx.supabase.from("content_items").select("id, title, content_type, status, updated_at").eq("workspace_id", ctx.workspace.id).eq("kind", "text").order("updated_at", { ascending: false }).limit(6);
  const editable = canEdit(ctx.role);
  return (
    <>
      <PageHeader
        title="Studio treści"
        description="40 rodzajów materiałów w czterech grupach. Każdy tekst powstaje z marki biura, danych oferty i dobranych kompetencji, a potem przechodzi kontrolę jakości."
        actions={editable && <Button asChild><Link href="/studio/new"><Plus weight="bold" /> Nowy materiał</Link></Button>}
      />
      <AiStatusNotice />
      {recent && recent.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-2">Ostatnio edytowane</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((r) => (
              <Link key={r.id} href={`/studio/${r.id}`} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-xs transition-shadow hover:shadow-sm">
                <Note size={18} className="shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{r.title}</span><span className="block text-[12px] text-ink-3">{getContentType(r.content_type)?.label ?? r.content_type} · {formatRelative(r.updated_at)}</span></span>
                <Badge tone={r.status === "ready" ? "success" : r.status === "review" ? "warning" : "muted"}>{t.status[r.status]}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="flex flex-col gap-10">
        {(Object.keys(CONTENT_GROUPS) as ContentGroup[]).map((g, i) => (
          <section key={g}>
            <div className="mb-3 flex items-baseline gap-3">
              <span className="font-display text-[22px] text-ink-4">{"ABCD"[i]}</span>
              <h2 className="text-[16px] font-semibold">{CONTENT_GROUPS[g].label}</h2>
              <span className="text-[13px] text-ink-3">{CONTENT_GROUPS[g].description}</span>
            </div>
            <Card className="grid divide-line sm:grid-cols-2 lg:grid-cols-3">
              {REAL_ESTATE_CONTENT_TYPES.filter((d) => d.group === g).map((d) => (
                <Link key={d.id} href={editable ? `/studio/new?type=${d.id}` : "#"} className="group flex items-start gap-3 border-b border-line p-4 transition-colors hover:bg-sunken/60 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+3)]:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-ink group-hover:text-accent-ink">{d.label}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{d.description}</span>
                  </span>
                  <ArrowRight size={14} className="mt-1 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}
