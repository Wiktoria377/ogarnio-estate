import Link from "next/link";
import { ArrowRight, Books, Buildings, House, ImageSquare, Note, PaintBrushBroad, Plus, Sparkle, TextAa } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AiStatusNotice } from "@/components/studio/ai-status";
import { getContentType } from "@/verticals/real-estate/content-types";
import { FORMATS, type FormatId } from "@/core/graphics/design";
import { getQuota, loadBrandKit } from "@/lib/ai";
import { canEdit, requireWorkspace } from "@/lib/session";
import { formatRelative } from "@/lib/utils";
import { t } from "@/i18n/pl";
import { itemHref } from "@/lib/routes";
import { getOnboarding } from "@/lib/onboarding";
import { can } from "@/core/auth/permissions";
import { MarketingOs } from "@/components/dashboard/marketing-os";

export const metadata = { title: "Pulpit" };

const SHORTCUTS = [
  { type: "description_apartment", hint: "Z danych oferty, bez dopisanych cech" },
  { type: "property_sales_post", hint: "Instagram i Facebook" },
  { type: "property_reels_script", hint: "Ujęcia, lektor, napisy" },
  { type: "owner_acquisition", hint: "Treści do właścicieli" },
  { type: "educational_post", hint: "Ekspercka wiedza biura" },
  { type: "property_meta_ad", hint: "Nagłówki i teksty reklam" },
];

function greeting(name: string) {
  const h = Number(new Intl.DateTimeFormat("pl-PL", { hour: "numeric", hour12: false, timeZone: "Europe/Warsaw" }).format(new Date()));
  const first = name.split(" ")[0] || name;
  return `${h < 5 || h >= 18 ? "Dobry wieczór" : "Dzień dobry"}, ${first}`;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const denied = (await searchParams).denied;
  const ctx = await requireWorkspace();
  const ws = ctx.workspace.id;
  const editable = canEdit(ctx.role);
  const [brand, props, items, ready, recent, recentProps, quota] = await Promise.all([
    loadBrandKit(ctx),
    ctx.supabase.from("properties").select("id", { count: "exact", head: true }).eq("workspace_id", ws).neq("status", "archived"),
    ctx.supabase.from("content_items").select("id", { count: "exact", head: true }).eq("workspace_id", ws),
    ctx.supabase.from("content_items").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", "ready"),
    ctx.supabase.from("content_items").select("id, title, kind, content_type, status, updated_at").eq("workspace_id", ws).order("updated_at", { ascending: false }).limit(6),
    ctx.supabase.from("properties").select("id, title, city, district, updated_at").eq("workspace_id", ws).neq("status", "archived").order("updated_at", { ascending: false }).limit(4),
    getQuota(ctx).catch(() => null),
  ]);
  const onboarding = can(ctx.role, "workspace.settings") && !ctx.workspace.onboarding_completed_at ? await getOnboarding(ctx) : null;
  const brandMissing = [!brand.logoKey && "logo", !brand.contact.phone && !brand.contact.email && "dane kontaktowe", !brand.communicationStyle && !brand.tagline && "styl komunikacji"].filter(Boolean) as string[];

  const stats = [
    { label: "Nieruchomości", value: props.count ?? 0, href: "/properties", icon: House },
    { label: "Materiały w bibliotece", value: items.count ?? 0, href: "/library", icon: Books },
    { label: "Gotowe do publikacji", value: ready.count ?? 0, href: "/library?status=ready", icon: Sparkle },
    ...(quota && quota.limit > 0 ? [{ label: "Generowania AI w tym miesiącu", value: `${quota.used} / ${quota.limit}`, href: "/settings#usage", icon: TextAa }] : []),
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
            {brand.logoKey ? <img src={`/api/files/${brand.logoKey}`} alt={`Logo ${ctx.workspace.name}`} className="size-full object-contain p-1.5" /> : <Buildings size={24} className="text-ink-3" />}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] text-ink-3">{ctx.workspace.name}</p>
            <h1 className="text-[26px] leading-tight font-semibold text-ink">{greeting(ctx.userName)}</h1>
          </div>
        </div>
        {editable && (
          <Button size="lg" asChild>
            <Link href="/studio/new"><Plus weight="bold" /> {t.nav.create}</Link>
          </Button>
        )}
      </header>

      <AiStatusNotice />
      {denied && <div className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13.5px] text-warning" role="alert" data-testid="permission-denied">Twoja rola w biurze nie daje dostępu do tej funkcji. Poproś właściciela biura o zmianę roli.</div>}

      {onboarding && !onboarding.completed && (
        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" data-testid="onboarding-resume">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Dokończ konfigurację biura</p>
            <p className="mt-0.5 text-[13px] text-ink-3">Ukończono {onboarding.doneCount} z {onboarding.total} kroków. Możesz wrócić w dowolnym momencie.</p>
            <div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={Math.round((onboarding.doneCount / onboarding.total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Postęp konfiguracji">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(onboarding.doneCount / onboarding.total) * 100}%` }} />
            </div>
          </div>
          <Button asChild variant="secondary"><Link href="/welcome">Kontynuuj <ArrowRight /></Link></Button>
        </Card>
      )}

      {editable && brandMissing.length > 0 && (
        <Link href="/brand" className="flex items-center gap-3 rounded-lg border border-accent/15 bg-accent-soft/60 px-4 py-3 text-[13.5px] text-accent-ink transition-colors hover:bg-accent-soft">
          <PaintBrushBroad size={18} className="shrink-0" />
          <span className="flex-1">Uzupełnij markę biura: {brandMissing.join(", ")}. Dzięki temu teksty i grafiki od razu będą w Twoim stylu.</span>
          <ArrowRight size={14} />
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-lg border border-line bg-surface p-4 shadow-xs transition-shadow hover:shadow-sm">
            <s.icon size={18} className="text-ink-3" />
            <p className="mt-3 text-[24px] leading-none font-semibold text-ink tabular-nums">{s.value}</p>
            <p className="mt-1.5 text-[12.5px] text-ink-3">{s.label}</p>
          </Link>
        ))}
      </section>

      <MarketingOs ctx={ctx} />

      {editable && (
        <section>
          <h2 className="mb-3 text-[14px] font-semibold text-ink">Szybkie akcje</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/studio/new", icon: TextAa, title: "Tekst marketingowy", desc: "Opis oferty, post, reklama, newsletter" },
              { href: "/graphics/new", icon: ImageSquare, title: "Grafika lub karuzela", desc: "Instagram, Stories, eksport PNG" },
              { href: "/properties/new", icon: House, title: "Dodaj nieruchomość", desc: "Parametry i zdjęcia oferty" },
              { href: "/brand", icon: PaintBrushBroad, title: "Brand Studio", desc: "Logo, kolory, fonty, ton marki" },
            ].map((a) => (
              <Link key={a.href} href={a.href} className="group flex items-start gap-3 rounded-lg border border-line bg-surface p-4 shadow-xs transition-shadow hover:shadow-sm">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent"><a.icon size={18} /></span>
                <span><span className="block text-[13.5px] font-medium text-ink group-hover:text-accent-ink">{a.title}</span><span className="block text-[12.5px] text-ink-3">{a.desc}</span></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-ink">Ostatnie materiały</h2>
            <Link href="/library" className="text-[12.5px] text-ink-3 hover:text-ink">Cała biblioteka</Link>
          </div>
          <Card className="divide-y divide-line p-0">
            {recent.data?.length ? (
              recent.data.map((r) => (
                <Link key={r.id} href={itemHref(r)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken/50">
                  {r.kind === "graphic" ? (
                    <img src={`/api/graphics/${r.id}/export?thumb=1&v=${encodeURIComponent(r.updated_at)}`} alt="" className="size-10 shrink-0 rounded border border-line bg-sunken object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded bg-sunken"><Note size={17} className="text-ink-3" /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{r.title}</span>
                    <span className="block text-[12px] text-ink-3">{r.kind === "graphic" ? FORMATS[r.content_type.replace("graphic_", "") as FormatId]?.label ?? "Grafika" : getContentType(r.content_type)?.label ?? r.content_type} · {formatRelative(r.updated_at)}</span>
                  </span>
                  <Badge tone={r.status === "ready" ? "success" : r.status === "review" ? "warning" : "muted"}>{t.status[r.status]}</Badge>
                </Link>
              ))
            ) : (
              <p className="px-4 py-8 text-center text-[13.5px] text-ink-3">Tu pojawią się Twoje teksty i grafiki. Zacznij od opisu oferty albo posta.</p>
            )}
          </Card>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-ink">Nieruchomości</h2>
            <Link href="/properties" className="text-[12.5px] text-ink-3 hover:text-ink">Wszystkie</Link>
          </div>
          <Card className="divide-y divide-line p-0">
            {recentProps.data?.length ? (
              recentProps.data.map((p) => (
                <Link key={p.id} href={`/properties/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken/50">
                  <House size={17} className="shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium text-ink">{p.title}</span><span className="block text-[12px] text-ink-3">{[p.district, p.city].filter(Boolean).join(", ") || "Bez lokalizacji"}</span></span>
                  <ArrowRight size={13} className="text-ink-4" />
                </Link>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-[13.5px] text-ink-3">Dodaj pierwszą ofertę, aby generować opisy i grafiki z jej danych.</p>
                {editable && <Button className="mt-3" size="sm" variant="secondary" asChild><Link href="/properties/new"><Plus /> Dodaj nieruchomość</Link></Button>}
              </div>
            )}
          </Card>
        </section>
      </div>

      {editable && (
        <section>
          <h2 className="mb-3 text-[14px] font-semibold text-ink">Skróty do popularnych treści</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SHORTCUTS.map((s) => {
              const def = getContentType(s.type);
              if (!def) return null;
              return (
                <Link key={s.type} href={`/studio/new?type=${s.type}`} className="group flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3.5 py-2.5 transition-colors hover:border-line-strong">
                  <span><span className="block text-[13px] font-medium text-ink group-hover:text-accent-ink">{def.label}</span><span className="block text-[12px] text-ink-3">{s.hint}</span></span>
                  <ArrowRight size={13} className="text-ink-4" />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
