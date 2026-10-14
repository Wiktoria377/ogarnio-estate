import { PLATFORMS, type Platform } from "@/core/marketing-engine/taxonomy";
import { PageHeader } from "@/components/ui/page-header";
import { StudioWizard } from "@/components/studio/wizard";
import { AiStatusNotice } from "@/components/studio/ai-status";
import { authorize, loadBrand, requireWorkspace } from "@/lib/session";
import { loadPropertyOptions } from "@/lib/members";

export const metadata = { title: "Nowy materiał" };

export default async function NewMaterialPage({ searchParams }: { searchParams: Promise<{ type?: string; property?: string; platform?: string; topic?: string }> }) {
  const ctx = await requireWorkspace();
  await authorize("editor");
  const sp = await searchParams;
  const [properties, brand] = await Promise.all([loadPropertyOptions(ctx), loadBrand(ctx)]);
  return (
    <>
      <PageHeader eyebrow="Studio treści" title="Nowy materiał" description="Wybierz rodzaj treści, kontekst i styl. Kreator dobierze kompetencje i sprawdzi jakość każdego wariantu." />
      <AiStatusNotice />
      <StudioWizard
        properties={properties.map(({ photos: _p, ...p }) => p)}
        initialType={sp.type ?? null}
        initialProperty={sp.property && properties.some((p) => p.id === sp.property) ? sp.property : null}
        brandAudience={brand.target_audience}
        initialPlatform={sp.platform && sp.platform in PLATFORMS ? (sp.platform as Platform) : null}
        initialTopic={(sp.topic ?? "").slice(0, 300)}
      />
    </>
  );
}
