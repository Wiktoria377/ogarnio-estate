import Link from "next/link";
import { Books, ImageSquare, ListBullets, MagnifyingGlass, Note, Plus, SquaresFour } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Input, NativeSelect } from "@/components/ui/field";
import { LibraryItemActions } from "@/components/library/item-actions";
import type { TextBody } from "@/core/marketing-engine/request";
import { variantToText } from "@/core/marketing-engine/schemas";
import { FORMATS, type FormatId } from "@/core/graphics/design";
import { getContentType, REAL_ESTATE_CONTENT_TYPES } from "@/verticals/real-estate/content-types";
import { CONTENT_GROUPS } from "@/core/marketing-engine/content-types";
import { canEdit, requireWorkspace } from "@/lib/session";
import { cn, formatRelative } from "@/lib/utils";
import { t } from "@/i18n/pl";
import { itemHref } from "@/lib/routes";

export const metadata = { title: "Biblioteka" };

const PAGE = 48;
const STATUSES = ["draft", "review", "ready"] as const;
type Sp = { q?: string; kind?: string; status?: string; property?: string; group?: string; view?: string; page?: string; stale?: string };

function qs(sp: Sp, patch: Partial<Sp>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) u.set(k, String(v));
  const s = u.toString();
  return s ? `/library?${s}` : "/library";
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const ctx = await requireWorkspace();
  const editable = canEdit(ctx.role);
  const view = sp.view === "list" ? "list" : "grid";
  const page = Math.max(1, Number(sp.page) || 1);

  let query = ctx.supabase.from("content_items").select("id, title, kind, content_type, status, platform, property_id, current_version, updated_at, stale_reason", { count: "exact" }).eq("workspace_id", ctx.workspace.id);
  if (sp.kind === "text" || sp.kind === "graphic" || sp.kind === "video" || sp.kind === "document") query = query.eq("kind", sp.kind);
  if (STATUSES.includes(sp.status as (typeof STATUSES)[number])) query = query.eq("status", sp.status as (typeof STATUSES)[number]);
  if (sp.property && /^[0-9a-f-]{36}$/.test(sp.property)) query = query.eq("property_id", sp.property);
  if (sp.stale === "1") query = query.not("stale_reason", "is", null);
  if (sp.group && sp.group in CONTENT_GROUPS) query = query.in("content_type", REAL_ESTATE_CONTENT_TYPES.filter((d) => d.group === sp.group).map((d) => d.id));
  const q = sp.q?.trim().slice(0, 100);
  // Escape LIKE wildcards; PostgREST receives the value as a bound parameter.
  if (q) query = query.ilike("title", `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const { data: items, count } = await query.order("updated_at", { ascending: false }).range(0, page * PAGE - 1);

  const { data: properties } = await ctx.supabase.from("properties").select("id, title").eq("workspace_id", ctx.workspace.id).order("title").limit(300);
  const propTitle = new Map((properties ?? []).map((p) => [p.id, p.title]));

  // Current-version bodies of text items: headline + plain text for copy/export.
  const textItems = (items ?? []).filter((i) => i.kind === "text");
  const texts = new Map<string, { headline: string; text: string; variants: number }>();
  if (textItems.length) {
    const { data: versions } = await ctx.supabase.from("content_versions").select("item_id, version, body").in("item_id", textItems.map((i) => i.id)).in("version", [...new Set(textItems.map((i) => i.current_version))]);
    for (const it of textItems) {
      const v = versions?.find((x) => x.item_id === it.id && x.version === it.current_version);
      const body = v?.body as unknown as TextBody | undefined;
      const sel = body?.variants?.find((x) => x.id === body.selected) ?? body?.variants?.[0];
      if (sel) texts.set(it.id, { headline: variantToText(sel.variant).slice(0, 420), text: variantToText(sel.variant), variants: body!.variants.length });
    }
  }

  const label = (i: { kind: string; content_type: string }) => (i.kind === "graphic" ? FORMATS[i.content_type.replace("graphic_", "") as FormatId]?.label ?? "Grafika" : getContentType(i.content_type)?.label ?? i.content_type);
  const href = itemHref;
  const filtered = !!(q || sp.kind || sp.status || sp.property || sp.group || sp.stale);
  const tone = (s: string) => (s === "ready" ? "success" : s === "review" ? "warning" : "muted") as "success" | "warning" | "muted";

  return (
    <>
      <PageHeader
        title="Biblioteka"
        description="Wszystkie teksty i grafiki biura z historią wersji. Otwórz materiał, aby go edytować, skopiować lub wyeksportować."
        actions={editable && (
          <>
            <Button variant="secondary" asChild><Link href="/graphics/new"><ImageSquare /> Nowa grafika</Link></Button>
            <Button asChild><Link href="/studio/new"><Plus weight="bold" /> Nowy tekst</Link></Button>
          </>
        )}
      />
      <form action="/library" className="mb-5 flex flex-wrap items-center gap-2" role="search">
        <div className="relative min-w-56 flex-1">
          <MagnifyingGlass size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
          <Input name="q" defaultValue={q} placeholder="Szukaj po tytule" className="pl-9" aria-label="Szukaj po tytule" />
        </div>
        <NativeSelect name="kind" defaultValue={sp.kind ?? ""} className="w-36" aria-label="Rodzaj">
          <option value="">Teksty i grafiki</option>
          <option value="text">Teksty</option>
          <option value="graphic">Grafiki</option>
        </NativeSelect>
        <NativeSelect name="group" defaultValue={sp.group ?? ""} className="w-48" aria-label="Grupa treści">
          <option value="">Wszystkie grupy</option>
          {Object.entries(CONTENT_GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={sp.status ?? ""} className="w-40" aria-label="Status">
          <option value="">Każdy status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
        </NativeSelect>
        <NativeSelect name="property" defaultValue={sp.property ?? ""} className="w-52" aria-label="Nieruchomość">
          <option value="">Wszystkie nieruchomości</option>
          {(properties ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </NativeSelect>
        {view === "list" && <input type="hidden" name="view" value="list" />}
        <Button type="submit" variant="secondary">Filtruj</Button>
        {filtered && <Button variant="ghost" asChild><Link href={view === "list" ? "/library?view=list" : "/library"}>Wyczyść</Link></Button>}
        <div className="ml-auto flex rounded-md border border-line bg-surface p-0.5" role="group" aria-label="Widok">
          <Link href={qs(sp, { view: undefined, page: undefined })} aria-label="Siatka" aria-current={view === "grid"} className={cn("flex size-8 items-center justify-center rounded", view === "grid" ? "bg-sunken text-ink" : "text-ink-3 hover:text-ink")}><SquaresFour size={16} /></Link>
          <Link href={qs(sp, { view: "list", page: undefined })} aria-label="Lista" aria-current={view === "list"} className={cn("flex size-8 items-center justify-center rounded", view === "list" ? "bg-sunken text-ink" : "text-ink-3 hover:text-ink")}><ListBullets size={16} /></Link>
        </div>
      </form>

      {!items?.length ? (
        filtered ? (
          <EmptyState icon={<MagnifyingGlass />} title="Brak materiałów dla tych filtrów" description="Zmień filtry lub wyczyść wyszukiwanie." action={<Button variant="secondary" asChild><Link href="/library">Wyczyść filtry</Link></Button>} />
        ) : (
          <EmptyState icon={<Books />} title="Biblioteka jest pusta" description="Każdy wygenerowany tekst i każda grafika trafiają tutaj automatycznie, z historią wersji." action={editable ? <Button asChild><Link href="/studio/new"><Plus weight="bold" /> Stwórz pierwszy materiał</Link></Button> : undefined} />
        )
      ) : view === "grid" ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((i) => (
            <li key={i.id}>
              <Card className="group relative flex h-full flex-col overflow-hidden p-0">
                <Link href={href(i)} className="flex flex-1 flex-col">
                  {i.kind === "graphic" ? (
                    <div className="aspect-[4/3] overflow-hidden border-b border-line bg-sunken">
                      <img src={`/api/graphics/${i.id}/export?thumb=1&v=${encodeURIComponent(i.updated_at)}`} alt="" loading="lazy" className="size-full object-contain p-3" />
                    </div>
                  ) : (
                    <div className="aspect-[4/3] overflow-hidden border-b border-line bg-sunken/50 p-4">
                      <p className="line-clamp-6 text-[13px] leading-relaxed text-ink-2">{texts.get(i.id)?.headline || "Brak treści"}</p>
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-1 p-3.5 pr-11">
                    <span className="line-clamp-2 text-[13.5px] font-medium text-ink">{i.title}</span>
                    <span className="text-[12px] text-ink-3">{label(i)}{i.property_id && propTitle.get(i.property_id) ? ` · ${propTitle.get(i.property_id)}` : ""}</span>
                    <span className="mt-auto flex items-center gap-2 pt-2 text-[12px] text-ink-3">
                      <Badge tone={tone(i.status)}>{t.status[i.status]}</Badge>
                      {i.stale_reason && <Badge tone="warning" title={i.stale_reason} data-testid="stale-badge">Nieaktualny</Badge>}
                      v{i.current_version} · {formatRelative(i.updated_at)}
                    </span>
                  </div>
                </Link>
                <div className="absolute right-2 bottom-2.5">
                  <LibraryItemActions item={{ id: i.id, kind: i.kind, title: i.title, status: i.status, stale: !!i.stale_reason }} text={texts.get(i.id)?.text ?? null} editable={editable} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="border-b border-line text-[12px] text-ink-3">
              <tr><th className="px-4 py-2.5 font-medium">Tytuł</th><th className="px-3 py-2.5 font-medium">Rodzaj</th><th className="px-3 py-2.5 font-medium">Nieruchomość</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-3 py-2.5 font-medium">Wersja</th><th className="px-3 py-2.5 font-medium">Zmiana</th><th className="w-12" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((i) => (
                <tr key={i.id} className="hover:bg-sunken/50">
                  <td className="px-4 py-2.5"><Link href={href(i)} className="flex items-center gap-2 font-medium text-ink hover:text-accent-ink">{i.kind === "graphic" ? <ImageSquare size={15} className="shrink-0 text-ink-3" /> : <Note size={15} className="shrink-0 text-ink-3" />}<span className="line-clamp-1">{i.title}</span></Link></td>
                  <td className="px-3 py-2.5 text-ink-2">{label(i)}</td>
                  <td className="px-3 py-2.5 text-ink-3">{i.property_id ? propTitle.get(i.property_id) ?? "—" : "—"}</td>
                  <td className="px-3 py-2.5"><Badge tone={tone(i.status)}>{t.status[i.status]}</Badge>{i.stale_reason && <Badge tone="warning" title={i.stale_reason} className="ml-1" data-testid="stale-badge">Nieaktualny</Badge>}</td>
                  <td className="px-3 py-2.5 text-ink-3 tabular-nums">v{i.current_version}</td>
                  <td className="px-3 py-2.5 text-ink-3">{formatRelative(i.updated_at)}</td>
                  <td className="px-2 py-1.5"><LibraryItemActions item={{ id: i.id, kind: i.kind, title: i.title, status: i.status, stale: !!i.stale_reason }} text={texts.get(i.id)?.text ?? null} editable={editable} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {items && count != null && count > items.length && (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" asChild><Link href={qs(sp, { page: String(page + 1) })} scroll={false}>Pokaż więcej ({count - items.length})</Link></Button>
        </div>
      )}
      {items && items.length > 0 && <p className="mt-4 text-center text-[12px] text-ink-4">{items.length} z {count ?? items.length}</p>}
    </>
  );
}
