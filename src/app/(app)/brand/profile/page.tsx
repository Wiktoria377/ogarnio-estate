import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandNav } from "@/components/brand/brand-nav";
import { ProfileEditor } from "@/components/brand/profile-editor";
import { assetOptions, rowToSnapshot } from "@/lib/brand-intel/load";
import { canAdmin, loadBrand, requireWorkspace } from "@/lib/session";

export const metadata = { title: "Profil marki" };

export default async function BrandProfilePage() {
  const ctx = await requireWorkspace();
  const [brand, assets, { data: draft }] = await Promise.all([
    loadBrand(ctx),
    assetOptions(ctx),
    ctx.supabase.from("brand_profile_versions").select("id, version").eq("workspace_id", ctx.workspace.id).eq("status", "draft").order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const editable = canAdmin(ctx.role);
  return (
    <>
      <PageHeader
        title="Profil marki"
        description="Obowiązujący profil, którego używają generator tekstów, grafiki i kontrola jakości. Każdy zapis tworzy nową wersję w historii."
        actions={brand.approved_version ? <Badge tone="success" data-testid="approved-version">Wersja {brand.approved_version}</Badge> : undefined}
      />
      <BrandNav />
      {draft && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13.5px]">
          <span>Czeka propozycja profilu (wersja {draft.version}) z analizy strony.</span>
          <Button asChild size="sm" variant="secondary"><Link href={`/brand/versions/${draft.id}`}>Przejrzyj propozycję</Link></Button>
        </div>
      )}
      <ProfileEditor mode={editable ? "current" : "readonly"} initial={rowToSnapshot(brand)} assets={assets} editable={editable} />
    </>
  );
}
