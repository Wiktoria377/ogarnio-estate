import Link from "next/link";
import { FilePdf, Plus } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { BROCHURE_VARIANTS, type BrochureVariant } from "@/core/brochures/model";
import { canEdit, requireWorkspace } from "@/lib/session";
import { formatRelative } from "@/lib/utils";
import { t } from "@/i18n/pl";

export const metadata = { title: "Broszury PDF" };

export default async function BrochuresPage() {
  const ctx = await requireWorkspace();
  const { data: items } = await ctx.supabase.from("content_items").select("id, title, status, updated_at, params, content_type").eq("workspace_id", ctx.workspace.id).eq("kind", "document").order("updated_at", { ascending: false }).limit(60);
  const editable = canEdit(ctx.role);
  const variantOf = (p: unknown, ct: string): BrochureVariant | null => {
    const v = (p as { variant?: string } | null)?.variant ?? ct.replace(/^brochure_?/, "");
    return v in BROCHURE_VARIANTS ? (v as BrochureVariant) : null;
  };
  return (
    <>
      <PageHeader
        title="Broszury PDF"
        description="Karta oferty, broszura premium, katalog ofert i prezentacja dla klienta. Parametry i ceny zawsze z aktualnych danych nieruchomości."
        actions={editable && <Button asChild><Link href="/brochures/new"><Plus weight="bold" /> Nowa broszura</Link></Button>}
      />
      {!items?.length ? (
        <EmptyState icon={<FilePdf />} title="Nie masz jeszcze broszur" description="Wybierz rodzaj broszury i nieruchomości. Zdjęcia, parametry i kontakt wypełnią się z danych." action={editable ? <Button asChild><Link href="/brochures/new"><Plus weight="bold" /> Nowa broszura</Link></Button> : undefined} />
      ) : (
        <ul className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
          {items.map((b) => {
            const v = variantOf(b.params, b.content_type);
            return (
              <li key={b.id}>
                <Link href={`/brochures/${b.id}`} className="group block">
                  <div className={`overflow-hidden rounded-lg border border-line bg-sunken shadow-xs transition-shadow group-hover:shadow-md ${v === "presentation" ? "aspect-[297/210]" : "aspect-[210/297]"}`}>
                    <img src={`/api/brochures/${b.id}/thumb?v=${encodeURIComponent(b.updated_at)}`} alt="" loading="lazy" className="size-full object-contain" />
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-[13px] font-medium">{b.title}</span>
                    <Badge tone={b.status === "ready" ? "success" : b.status === "review" ? "warning" : "muted"}>{t.status[b.status]}</Badge>
                  </div>
                  <span className="text-[12px] text-ink-3">{v ? BROCHURE_VARIANTS[v].label : "Dokument"} · {formatRelative(b.updated_at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
