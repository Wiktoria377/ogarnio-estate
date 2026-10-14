import { PageHeader } from "@/components/ui/page-header";
import { BrandStudio } from "@/components/brand/brand-studio";
import { BrandNav } from "@/components/brand/brand-nav";
import { canAdmin, loadBrand, requireWorkspace } from "@/lib/session";
import { parseColors } from "@/core/brand/model";

export const metadata = { title: "Marka" };

export default async function BrandPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const ctx = await requireWorkspace();
  const brand = await loadBrand(ctx);
  const { data: assets } = await ctx.supabase.from("brand_assets").select("id, kind, storage_path, label, width, height").eq("workspace_id", ctx.workspace.id).order("created_at");
  const logo = assets?.find((a) => a.id === brand.logo_asset_id) ?? null;
  const references = (assets ?? []).filter((a) => a.kind === "reference");
  const welcome = (await searchParams).welcome === "1";
  return (
    <>
      <PageHeader
        eyebrow={welcome ? "Krok 2 z 2" : undefined}
        title="Brand Studio"
        description={
          welcome
            ? "Ustaw logo, kolory i sposób mówienia biura. Te ustawienia będą domyślnie używane we wszystkich tekstach i grafikach. Możesz je zmienić w dowolnym momencie."
            : "Tożsamość biura, z której korzystają generator treści i szablony grafik."
        }
      />
      {!welcome && <BrandNav />}
      <BrandStudio
        welcome={welcome}
        editable={canAdmin(ctx.role)}
        initial={{
          company_name: brand.company_name,
          tagline: brand.tagline ?? "",
          colors: parseColors(brand.colors),
          heading_font: brand.heading_font,
          body_font: brand.body_font,
          contact_email: brand.contact_email ?? "",
          contact_phone: brand.contact_phone ?? "",
          address: brand.address ?? "",
          website: brand.website ?? "",
          socials: { instagram: "", facebook: "", linkedin: "", tiktok: "", youtube: "", ...((brand.socials ?? {}) as Record<string, string>) },
          brand_style: brand.brand_style,
          personality: brand.personality ?? "",
          target_audience: brand.target_audience ?? "",
          communication_style: brand.communication_style,
          address_form: brand.address_form,
          emoji_policy: brand.emoji_policy,
          preferred_phrases: brand.preferred_phrases ?? "",
          avoided_phrases: brand.avoided_phrases ?? "",
        }}
        logo={logo ? { id: logo.id, url: `/api/files/${logo.storage_path}` } : null}
        references={references.map((r) => ({ id: r.id, url: `/api/files/${r.storage_path}`, label: r.label }))}
      />
    </>
  );
}
