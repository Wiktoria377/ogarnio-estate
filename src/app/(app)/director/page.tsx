import Link from "next/link";
import { Compass } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { StrategyForm } from "@/components/director/strategy-form";
import { can } from "@/core/auth/permissions";
import { AUDIENCE_PRESETS } from "@/verticals/real-estate/content-types";
import { loadBrand, requireWorkspace } from "@/lib/session";
import { formatDate, formatNumber } from "@/lib/utils";

export const metadata = { title: "AI Marketing Director" };

const STATUS = { draft: { label: "Szkic", tone: "muted" }, accepted: { label: "Zaakceptowana", tone: "success" }, archived: { label: "Archiwum", tone: "outline" } } as const;
const CHANNEL: Record<string, string> = { facebook_page: "facebook", instagram: "instagram", linkedin_org: "linkedin", linkedin_member: "linkedin", tiktok: "tiktok" };

export default async function DirectorPage() {
  const ctx = await requireWorkspace();
  const ws = ctx.workspace.id;
  const [brand, { data: props }, { data: strategies }, { data: conns }] = await Promise.all([
    loadBrand(ctx),
    ctx.supabase.from("properties").select("id, title, city, district, price, transaction_type").eq("workspace_id", ws).eq("status", "active").order("updated_at", { ascending: false }).limit(200),
    ctx.supabase.from("marketing_strategies").select("id, title, status, created_at, warnings, prompt_version, model").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(50),
    ctx.supabase.from("social_connections").select("platform, status").eq("workspace_id", ws),
  ]);
  const extended = (brand.extended ?? {}) as { audiences?: { name: string }[] };
  const audiences = [
    ...(extended.audiences ?? []).filter((a) => a.name).map((a) => ({ id: a.name.slice(0, 120), label: `${a.name} (z profilu marki)` })),
    ...Object.entries(AUDIENCE_PRESETS).map(([id, label]) => ({ id, label })),
  ];
  const connected = [...new Set((conns ?? []).filter((c) => c.status === "connected" || c.status === "limited").map((c) => CHANNEL[c.platform]).filter(Boolean))] as string[];
  const editor = can(ctx.role, "content.edit");
  return (
    <>
      <PageHeader title="AI Marketing Director" description="Strategia marketingowa biura oparta na Twoich danych. Każda strategia pokazuje, co wynika z danych, co jest hipotezą do sprawdzenia, a co rekomendacją." />
      <div className="flex flex-col gap-6">
        {editor && (
          <StrategyForm
            properties={(props ?? []).map((p) => ({ id: p.id, title: p.title, detail: [p.transaction_type === "rent" ? "Najem" : "Sprzedaż", p.city, p.district, p.price ? `${formatNumber(p.price)} zł` : null].filter(Boolean).join(" · ") }))}
            audiences={audiences}
            defaultChannels={connected}
          />
        )}
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Strategie biura</h2>
          {(strategies ?? []).length === 0 ? (
            <EmptyState icon={<Compass />} title="Brak strategii" description="Wybierz cel, okres i kanały, aby otrzymać pierwszą strategię opartą na danych biura." />
          ) : (
            <ul className="grid gap-2">
              {(strategies ?? []).map((s) => (
                <li key={s.id}>
                  <Card className="flex flex-wrap items-center gap-3 p-4" data-testid="strategy-row">
                    <Link href={`/director/${s.id}`} className="min-w-0 flex-1 text-[14px] font-medium text-ink hover:text-accent">{s.title}</Link>
                    <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                    {Array.isArray(s.warnings) && s.warnings.length > 0 && <Badge tone="warning">{s.warnings.length} uwag kontroli</Badge>}
                    <span className="text-[12px] text-ink-3">{formatDate(s.created_at)}</span>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
