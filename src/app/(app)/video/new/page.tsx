import { PageHeader } from "@/components/ui/page-header";
import { NewVideo } from "@/components/video/new-video";
import { authorize, requireWorkspace } from "@/lib/session";
import { loadPropertyOptions } from "@/lib/members";

export const metadata = { title: "Nowe wideo" };

export default async function NewVideoPage({ searchParams }: { searchParams: Promise<{ property?: string }> }) {
  const ctx = await requireWorkspace();
  await authorize("editor");
  const sp = await searchParams;
  const properties = await loadPropertyOptions(ctx);
  return (
    <>
      <PageHeader eyebrow="Video Studio" title="Nowe wideo" description="Reels / TikTok z prawdziwych zdjęć oferty. Najpierw scenariusz do akceptacji, potem render MP4." />
      <NewVideo properties={properties} initialProperty={sp.property && properties.some((p) => p.id === sp.property && p.photos.length) ? sp.property : null} />
    </>
  );
}
