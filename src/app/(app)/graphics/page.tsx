import Link from "next/link";
import { ImageSquare, Plus } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { canEdit, requireWorkspace } from "@/lib/session";
import { formatRelative } from "@/lib/utils";
import { t } from "@/i18n/pl";

export const metadata = { title: "Studio grafik" };

export default async function GraphicsPage() {
  const ctx = await requireWorkspace();
  const { data: items } = await ctx.supabase.from("content_items").select("id, title, status, updated_at, params").eq("workspace_id", ctx.workspace.id).eq("kind", "graphic").order("updated_at", { ascending: false }).limit(60);
  const editable = canEdit(ctx.role);
  return (
    <>
      <PageHeader
        title="Studio grafik"
        description="Posty 1:1 i 4:5, Stories i karuzele z danymi ofert, w kolorach i fontach marki. Eksport do PNG w pełnej rozdzielczości."
        actions={editable && <Button asChild><Link href="/graphics/new"><Plus weight="bold" /> Nowa grafika</Link></Button>}
      />
      {!items?.length ? (
        <EmptyState icon={<ImageSquare />} title="Nie masz jeszcze grafik" description="Wybierz ofertę, format i szablon. Teksty i zdjęcia wypełnią się same, a nagłówki dopiszesz z AI." action={editable ? <Button asChild><Link href="/graphics/new"><Plus weight="bold" /> Nowa grafika</Link></Button> : undefined} />
      ) : (
        <ul className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {items.map((g) => (
            <li key={g.id}>
              <Link href={`/graphics/${g.id}`} className="group block">
                <div className="aspect-[4/5] overflow-hidden rounded-lg border border-line bg-sunken shadow-xs transition-shadow group-hover:shadow-md">
                  <img src={`/api/graphics/${g.id}/export?thumb=1&v=${encodeURIComponent(g.updated_at)}`} alt="" loading="lazy" className="size-full object-contain" />
                </div>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-[13px] font-medium">{g.title}</span>
                  <Badge tone={g.status === "ready" ? "success" : g.status === "review" ? "warning" : "muted"}>{t.status[g.status]}</Badge>
                </div>
                <span className="text-[12px] text-ink-3">{formatRelative(g.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
