import { PHOTO_ANALYSIS_VERSION, type PhotoReport } from "@/core/creative/photos";
import { itemHref } from "@/lib/routes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FrameCorners, ImageSquare, Megaphone, Note, PencilSimple, Sparkle, SquareHalf, Stack, TextAa } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DIFF_LABELS, formatChangeValue, type FieldChange } from "@/core/import/model";
import { PublicPageToggle } from "@/components/analytics/public-page-toggle";
import { PhotoManager } from "@/components/properties/photo-manager";
import { DeletePropertyButton } from "@/components/properties/delete-property";
import { requireWorkspace } from "@/lib/session";
import { canEditProperty } from "@/core/auth/permissions";
import { PROPERTY_STATUSES, PROPERTY_TYPES, TRANSACTIONS } from "@/verticals/real-estate/labels";
import { propertyFactSheet } from "@/verticals/real-estate/property";
import { REAL_ESTATE_CONTENT_TYPES } from "@/verticals/real-estate/content-types";
import { FORMATS } from "@/core/graphics/design";
import { formatRelative } from "@/lib/utils";
import { t } from "@/i18n/pl";

export const metadata = { title: "Nieruchomość" };

const QUICK = ["description_apartment", "property_sales_post", "property_sales_carousel", "property_meta_ad", "property_reels_script", "short_listing"];
const FORMAT_ICONS = { square: SquareHalf, portrait: FrameCorners, story: ImageSquare, carousel: Stack, stories: Stack } as const;

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; onboarding?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const created = sp.created === "1";
  const onboarding = sp.onboarding === "1";
  const ctx = await requireWorkspace();
  const { data: p } = await ctx.supabase.from("properties").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!p) notFound();
  const [{ data: photos }, { data: items }, { data: source }, { data: changes }] = await Promise.all([
    ctx.supabase.from("property_photos").select("id, storage_path, width, height, is_visualization, position, analysis").eq("property_id", id).order("position"),
    ctx.supabase.from("content_items").select("id, title, kind, content_type, status, updated_at, stale_reason").eq("property_id", id).order("updated_at", { ascending: false }).limit(20),
    p.source_id ? ctx.supabase.from("property_sources").select("name, kind").eq("id", p.source_id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.supabase.from("property_changes").select("id, changes, created_at, status").eq("property_id", id).order("created_at", { ascending: false }).limit(5),
  ]);
  const sheet = propertyFactSheet(p, photos ?? []);
  const editable = canEditProperty(ctx.role, ctx.userId, p);
  const st = PROPERTY_STATUSES[p.status];
  const quick = QUICK.map((k) => REAL_ESTATE_CONTENT_TYPES.find((d) => d.id === (p.property_type === "house" && k === "description_apartment" ? "description_house" : k))!).filter(Boolean);
  const all = REAL_ESTATE_CONTENT_TYPES.filter((d) => d.property === "required" && !quick.includes(d));

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/properties" className="hover:text-ink">Nieruchomości</Link>}
        title={p.title}
        description={`${PROPERTY_TYPES[p.property_type]} · ${TRANSACTIONS[p.transaction_type]}${p.city ? ` · ${[p.district, p.city].filter(Boolean).join(", ")}` : ""}`}
        actions={editable && (
          <>
            <DeletePropertyButton id={p.id} title={p.title} />
            <Button asChild variant="secondary"><Link href={`/properties/${p.id}/edit`}><PencilSimple /> Edytuj dane</Link></Button>
          </>
        )}
      />
      {created && (
        <div className="mb-6 rounded-lg border border-success/20 bg-success-soft px-4 py-3 text-[13.5px] text-success" role="status">
          Oferta zapisana. Dodaj zdjęcia, a potem wygeneruj materiały z panelu po prawej.
          {onboarding && <> <Link href="/welcome" className="font-medium underline underline-offset-2">Wróć do kreatora startowego</Link></>}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Zdjęcia" description={`${photos?.length ?? 0} z 40`} />
            <CardBody>
              <PhotoManager propertyId={p.id} editable={editable} initial={(photos ?? []).map((ph) => ({ id: ph.id, url: `/api/files/${ph.storage_path}`, width: ph.width, height: ph.height, is_visualization: ph.is_visualization, analysis: (ph.analysis as unknown as PhotoReport | null)?.version === PHOTO_ANALYSIS_VERSION ? (ph.analysis as unknown as PhotoReport) : null }))} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Dane oferty" description="Tylko te informacje mogą pojawić się w materiałach jako fakty." action={<Badge tone={st.tone === "success" ? "success" : st.tone === "warning" ? "warning" : "muted"} dot>{st.label}</Badge>} />
            <CardBody>
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {sheet.facts.map((f) => (
                  <div key={f.key} className="flex justify-between gap-4 border-b border-line pb-2.5 text-[13.5px]">
                    <dt className="text-ink-3">{f.label}</dt>
                    <dd className="text-right font-medium text-ink">{f.value}</dd>
                  </div>
                ))}
              </dl>
              {p.description && <p className="mt-5 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{p.description}</p>}
            </CardBody>
          </Card>
          {(source || (changes?.length ?? 0) > 0) && (
            <Card data-testid="property-sync">
              <CardHeader title="Synchronizacja z CRM" description={source ? `${source.name}${p.external_ref ? ` · nr ${p.external_ref}` : ""}${p.last_synced_at ? ` · ostatnio ${formatRelative(p.last_synced_at)}` : ""}` : "Źródło zostało usunięte"} />
              {changes?.length ? (
                <ul className="divide-y divide-line text-[12.5px]">
                  {changes.map((c) => (
                    <li key={c.id} className="px-5 py-2.5">
                      <span className="text-ink-4">{formatRelative(c.created_at)}:</span>{" "}
                      {(c.changes as unknown as FieldChange[]).map((x) => `${DIFF_LABELS[x.field]} ${formatChangeValue(x.field, x.before)} → ${formatChangeValue(x.field, x.after)}`).join("; ")}
                    </li>
                  ))}
                </ul>
              ) : (
                <CardBody className="text-[13px] text-ink-3">Brak zastosowanych zmian z CRM.</CardBody>
              )}
            </Card>
          )}
          <Card>
            <CardHeader title="Materiały tej oferty" action={<Button asChild variant="ghost" size="sm"><Link href={`/library?property=${p.id}`}>Biblioteka <ArrowRight /></Link></Button>} />
            {items?.length ? (
              <ul className="divide-y divide-line">
                {items.map((it) => (
                  <li key={it.id}>
                    <Link href={itemHref(it)} className="flex items-center gap-3 px-5 py-3 hover:bg-sunken/60">
                      {it.kind === "graphic" ? <ImageSquare size={18} className="text-ink-3" /> : <Note size={18} className="text-ink-3" />}
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{it.title}</span>
                      {it.stale_reason && <Badge tone="warning" title={it.stale_reason} data-testid="stale-badge">Nieaktualny</Badge>}
                      <Badge tone={it.status === "ready" ? "success" : it.status === "review" ? "warning" : "muted"}>{t.status[it.status]}</Badge>
                      <span className="hidden text-[12px] text-ink-4 sm:inline">{formatRelative(it.updated_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody className="text-[13.5px] text-ink-3">Jeszcze nie ma materiałów dla tej oferty.</CardBody>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-8 lg:self-start">
          <Card>
            <CardHeader title="Strona oferty z formularzem" description="Publiczny adres do linków śledzących i zbierania zapytań." />
            <CardBody>
              <PublicPageToggle propertyId={p.id} enabled={p.public_enabled} editable={editable} url={p.public_enabled && p.public_slug ? `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/o/${p.public_slug}` : null} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Sparkle size={16} weight="fill" className="text-accent" /> Generuj materiały</span>} description="Dane i zdjęcia tej oferty wypełnią się same." />
            <CardBody className="flex flex-col gap-1.5 p-3">
              <Link href={`/campaigns/new?property=${p.id}`} className="mb-1.5 flex items-center gap-3 rounded-lg border border-accent/25 bg-accent-soft/60 px-3 py-2.5 text-accent-ink transition-colors hover:bg-accent-soft">
                <Megaphone size={18} weight="fill" />
                <span className="flex-1"><span className="block text-[13.5px] font-semibold">Stwórz kampanię</span><span className="block text-[12px] opacity-80">Posty, grafiki, Reels, reklamy, PDF i plan</span></span>
                <ArrowRight size={14} />
              </Link>
              {quick.map((d) => (
                <Link key={d.id} href={`/studio/new?type=${d.id}&property=${p.id}`} className="group flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-sunken">
                  <TextAa size={17} className="text-ink-3 group-hover:text-accent" />
                  <span className="flex-1 text-[13.5px] text-ink">{d.label}</span>
                  <ArrowRight size={14} className="text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
              <details className="group/more">
                <summary className="cursor-pointer list-none rounded-md px-2.5 py-2 text-[13px] text-ink-3 hover:bg-sunken hover:text-ink">Więcej rodzajów treści ({all.length})</summary>
                <div className="flex flex-col">
                  {all.map((d) => (
                    <Link key={d.id} href={`/studio/new?type=${d.id}&property=${p.id}`} className="rounded-md px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-sunken hover:text-ink">{d.label}</Link>
                  ))}
                </div>
              </details>
            </CardBody>
            <div className="border-t border-line p-3">
              <div className="px-2.5 pb-2 text-[12px] font-medium text-ink-3">Grafika z ofertą</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(FORMATS) as (keyof typeof FORMATS)[]).map((f) => {
                  const Icon = FORMAT_ICONS[f];
                  return (
                    <Link key={f} href={`/graphics/new?property=${p.id}&format=${f}`} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-2 text-[12.5px] text-ink-2 transition-colors hover:border-accent/40 hover:bg-accent-soft/40 hover:text-ink">
                      <Icon size={16} className="text-ink-3" />
                      {FORMATS[f].label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
