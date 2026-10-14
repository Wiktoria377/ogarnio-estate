import { PageHeader } from "@/components/ui/page-header";
import { BrandNav } from "@/components/brand/brand-nav";
import { BrandIntelligence, type AnalysisItem, type ReferenceItem } from "@/components/brand/brand-intelligence";
import { BRAND_CONSENT_TEXT } from "@/lib/brand-intel/service";
import { canAdmin, loadBrand, requireWorkspace } from "@/lib/session";

export const metadata = { title: "Poznaj moją markę" };

export default async function BrandIntelligencePage() {
  const ctx = await requireWorkspace();
  const ws = ctx.workspace.id;
  const [brand, { data: analyses }, { data: refs }] = await Promise.all([
    loadBrand(ctx),
    ctx.supabase.from("brand_analyses").select("id, url, status, created_at, error_message, version_id, result").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(10),
    ctx.supabase.from("brand_references").select("id, kind, title, storage_path, text_content, extraction_note").eq("workspace_id", ws).order("created_at", { ascending: false }),
  ]);
  const versionIds = (analyses ?? []).map((a) => a.version_id).filter((x): x is string => !!x);
  const { data: versions } = versionIds.length ? await ctx.supabase.from("brand_profile_versions").select("id, status").in("id", versionIds) : { data: [] };
  const vStatus = new Map((versions ?? []).map((v) => [v.id, v.status]));

  const items: AnalysisItem[] = (analyses ?? []).map((a) => ({
    id: a.id,
    url: a.url,
    status: a.status,
    createdAt: a.created_at,
    error: a.error_message,
    versionId: a.version_id,
    versionStatus: a.version_id ? (vStatus.get(a.version_id) ?? null) : null,
    pagesRead: a.result && typeof a.result === "object" && "pagesRead" in a.result ? Number(a.result.pagesRead) : null,
  }));
  const references: ReferenceItem[] = (refs ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    chars: r.text_content?.length ?? 0,
    note: r.extraction_note,
    url: r.storage_path ? `/api/files/${r.storage_path}` : null,
  }));

  return (
    <>
      <PageHeader title="Poznaj moją markę" description="Podaj adres strony biura, a Ogarnio przygotuje propozycję profilu marki: kolory, czcionki, logo, ton komunikacji i typowe wezwania do działania. Każdy element ma oznaczony poziom pewności." />
      <BrandNav />
      <BrandIntelligence editable={canAdmin(ctx.role)} consentText={BRAND_CONSENT_TEXT} analyses={items} references={references} defaultUrl={brand.website ?? ""} />
    </>
  );
}
