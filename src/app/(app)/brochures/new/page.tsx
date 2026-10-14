import { PageHeader } from "@/components/ui/page-header";
import { NewBrochure } from "@/components/brochures/new-brochure";
import { BROCHURE_VARIANT_IDS, type BrochureVariant } from "@/core/brochures/model";
import { authorize, requireWorkspace } from "@/lib/session";
import { loadPropertyOptions } from "@/lib/members";

export const metadata = { title: "Nowa broszura" };

export default async function NewBrochurePage({ searchParams }: { searchParams: Promise<{ property?: string; variant?: string }> }) {
  const ctx = await requireWorkspace();
  await authorize("editor");
  const sp = await searchParams;
  const properties = (await loadPropertyOptions(ctx)).map(({ photos, ...p }) => ({ ...p, photoCount: photos.length }));
  return (
    <>
      <PageHeader eyebrow="Broszury PDF" title="Nowa broszura" description="Parametry, ceny i zdjęcia pochodzą z kart nieruchomości. Teksty możesz dopracować w edytorze." />
      <NewBrochure
        properties={properties}
        initialProperty={sp.property && properties.some((p) => p.id === sp.property) ? sp.property : null}
        initialVariant={BROCHURE_VARIANT_IDS.includes(sp.variant as BrochureVariant) ? (sp.variant as BrochureVariant) : "card"}
      />
    </>
  );
}
