import { PageHeader } from "@/components/ui/page-header";
import { NewGraphic } from "@/components/graphics/new-graphic";
import { FORMAT_IDS, TEMPLATE_IDS, type FormatId, type TemplateId } from "@/core/graphics/design";
import { authorize, requireWorkspace } from "@/lib/session";
import { loadPropertyOptions } from "@/lib/members";
import { loadBrandKit } from "@/lib/ai";
import { loadCompositionData } from "@/lib/creative/composition";

export const metadata = { title: "Nowa grafika" };

export default async function NewGraphicPage({ searchParams }: { searchParams: Promise<{ property?: string; format?: string }> }) {
  const ctx = await requireWorkspace();
  await authorize("editor");
  const sp = await searchParams;
  const properties = (await loadPropertyOptions(ctx)).map(({ photos: _p, ...p }) => p);
  // Brand Memory: a template the office chose to prefer is preselected (explicit memory only).
  const kit = await loadBrandKit(ctx);
  const memory = kit.memory;
  const composition = await loadCompositionData(ctx, properties.map((p) => p.id).slice(0, 100));
  const preferred = memory?.templates.find((t) => TEMPLATE_IDS.includes(t as TemplateId)) as TemplateId | undefined;
  const { data: saved } = await ctx.supabase.from("design_templates").select("id, name, base_template, format, created_at").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(60);
  return (
    <>
      <PageHeader eyebrow="Studio grafik" title="Nowa grafika" description="Dane i zdjęcia oferty wypełnią szablon automatycznie, w kolorach i fontach Twojej marki. Zdjęcia nie są modyfikowane przez AI." />
      <NewGraphic saved={(saved ?? []).filter((t) => FORMAT_IDS.includes(t.format as FormatId) && TEMPLATE_IDS.includes(t.base_template as TemplateId)).map((t) => ({ id: t.id, name: t.name, format: t.format as FormatId, template: t.base_template as TemplateId }))} properties={properties} initialProperty={sp.property && properties.some((p) => p.id === sp.property) ? sp.property : null} initialFormat={FORMAT_IDS.includes(sp.format as FormatId) ? (sp.format as FormatId) : "portrait"} preferredTemplate={preferred ?? null} composition={composition} brandStyle={kit.style} />
    </>
  );
}
