import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { BrandNav } from "@/components/brand/brand-nav";
import { ProfileEditor } from "@/components/brand/profile-editor";
import { CONFIDENCE_LEVELS, diffSnapshots, type ConfidenceMap } from "@/core/brand/profile";
import type { AnalysisResult, PageLog } from "@/lib/brand-intel/analyze";
import { asSnapshot, assetOptions, rowToSnapshot } from "@/lib/brand-intel/load";
import { canAdmin, loadBrand, requireWorkspace } from "@/lib/session";

export const metadata = { title: "Propozycja profilu marki" };

const STATUS = { draft: "Propozycja do decyzji", approved: "Obowiązująca", superseded: "Archiwalna", discarded: "Odrzucona" } as const;
const KIND = { robots: "robots.txt", page: "Podstrona", css: "Arkusz stylów", image: "Zdjęcie", logo: "Logo" } as const;

export default async function BrandVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireWorkspace();
  const { data: v } = await ctx.supabase.from("brand_profile_versions").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!v) notFound();
  const [brand, assets, { data: analysis }] = await Promise.all([
    loadBrand(ctx),
    assetOptions(ctx),
    v.analysis_id ? ctx.supabase.from("brand_analyses").select("url, pages, result, created_at").eq("id", v.analysis_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const current = rowToSnapshot(brand);
  const snapshot = asSnapshot(v.snapshot, current);
  const result = (analysis?.result ?? null) as AnalysisResult | null;
  const pages = (Array.isArray(analysis?.pages) ? analysis.pages : []) as unknown as PageLog[];
  const isDraft = v.status === "draft";
  const changes = isDraft ? diffSnapshots(current, snapshot) : [];

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/brand/intelligence" className="hover:underline">Poznaj moją markę</Link>}
        title={`Profil marki: wersja ${v.version}`}
        description={isDraft ? "Sprawdź propozycję. Możesz poprawić każdy element przed zatwierdzeniem. Do czasu zatwierdzenia generator używa dotychczasowego profilu." : (v.note ?? undefined)}
        actions={<Badge tone={isDraft ? "warning" : v.status === "approved" ? "success" : "muted"}>{STATUS[v.status]}</Badge>}
      />
      <BrandNav />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <ProfileEditor mode={isDraft ? "draft" : "readonly"} versionId={v.id} initial={snapshot} confidence={(v.confidence ?? {}) as ConfidenceMap} assets={assets} editable={isDraft && canAdmin(ctx.role)} />
        <aside className="flex flex-col gap-4">
          {isDraft && (
            <Card className="p-4" data-testid="draft-changes">
              <h2 className="mb-2 text-[14px] font-semibold">Co zmieni zatwierdzenie</h2>
              {changes.length ? (
                <ul className="list-disc pl-4 text-[13px] text-ink-2">{changes.map((c) => <li key={c}>{c}</li>)}</ul>
              ) : (
                <p className="text-[13px] text-ink-3">Propozycja nie różni się od obowiązującego profilu.</p>
              )}
            </Card>
          )}
          <Card className="p-4">
            <h2 className="mb-2 text-[14px] font-semibold">Poziomy pewności</h2>
            <ul className="flex flex-col gap-1.5 text-[12.5px] text-ink-2">
              {CONFIDENCE_LEVELS.map((l) => (
                <li key={l.id}>
                  <span className="font-medium">{l.label}</span>
                  {l.min >= 0.5 ? ` (od ${Math.round(l.min * 100)}%)` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] leading-snug text-ink-3">Pewność to ocena, na ile cecha wynika wprost ze strony (np. kolor zapisany jako zmienna CSS marki). Ton i grupy docelowe są interpretacją i zawsze wymagają Twojej weryfikacji.</p>
          </Card>
          {result && (
            <Card className="p-4" data-testid="analysis-notes">
              <h2 className="mb-2 text-[14px] font-semibold">Uwagi z analizy</h2>
              <p className="mb-2 text-[12.5px] text-ink-3">{analysis?.url} · odczytane podstrony: {result.pagesRead}{result.traitsModel ? ` · model: ${result.traitsModel}` : ""}</p>
              {result.notes.length > 0 && <ul className="list-disc pl-4 text-[12.5px] text-ink-2">{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
              {result.ctasOnSite.length > 0 && <p className="mt-2 text-[12.5px] text-ink-2"><span className="font-medium">CTA na stronie: </span>{result.ctasOnSite.join(", ")}</p>}
            </Card>
          )}
          {pages.length > 0 && (
            <Card className="p-0">
              <CardHeader title="Pobrane zasoby" description="Co dokładnie odczytano ze strony." />
              <ul className="max-h-80 overflow-y-auto px-4 py-2 text-[12px]" data-testid="pages-log">
                {pages.map((p, i) => (
                  <li key={i} className="flex flex-col border-b border-line py-1.5 last:border-0">
                    <span className="truncate font-medium text-ink-2" title={p.url}>{KIND[p.kind]}: {p.url.replace(/^https?:\/\//, "")}</span>
                    <span className={p.ok ? "text-ink-3" : "text-warning"}>{p.status ? `HTTP ${p.status}` : ""}{p.note ? ` ${p.note}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
