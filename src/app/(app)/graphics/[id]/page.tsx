import { qaFor } from "@/lib/qa-view";
import { notFound, redirect } from "next/navigation";
import { GraphicEditor } from "@/components/graphics/graphic-editor";
import { TEMPLATES, graphicDesignSchema, type TemplateId } from "@/core/graphics/design";
import { CREATIVE_DIRECTIONS, type CreativeDirection } from "@/core/creative/composition";
import { loadBrandKit } from "@/lib/ai";
import { canEdit, requireWorkspace } from "@/lib/session";
import { aiAvailability } from "@/lib/env";
import { factTexts } from "@/verticals/real-estate/graphics";

export const metadata = { title: "Grafika" };

export default async function GraphicPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ slide?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireWorkspace();
  const { data: item } = await ctx.supabase.from("content_items").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!item) notFound();
  if (item.kind !== "graphic") redirect(`/studio/${id}`);
  const { data: versions } = await ctx.supabase.from("content_versions").select("version, source, operation, created_at, body").eq("item_id", id).order("version", { ascending: false }).limit(50);
  const current = versions?.find((v) => v.version === item.current_version);
  const parsed = graphicDesignSchema.safeParse(current?.body);
  if (!current || !parsed.success) notFound();
  const design = parsed.data;
  const brand = await loadBrandKit(ctx);

  let property = null;
  let photos: { id: string; url: string; isVisualization: boolean; caption: string | null }[] = [];
  if (design.propertyId) {
    const { data: p } = await ctx.supabase.from("properties").select("*").eq("id", design.propertyId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    property = p;
    const { data: ph } = await ctx.supabase.from("property_photos").select("id, storage_path, is_visualization, caption").eq("property_id", design.propertyId).order("position");
    photos = (ph ?? []).map((x) => ({ id: x.id, url: `/api/files/${x.storage_path}`, isVisualization: x.is_visualization, caption: x.caption }));
  }
  // Creative variant set: the other directions made from the same source (or from this graphic).
  const params0 = (item.params ?? {}) as { variantSet?: string; direction?: string };
  const { data: sibs } = params0.variantSet
    ? await ctx.supabase.from("content_items").select("id, params").eq("workspace_id", ctx.workspace.id).eq("params->>variantSet", params0.variantSet).neq("id", item.id).limit(10)
    : await ctx.supabase.from("content_items").select("id, params").eq("workspace_id", ctx.workspace.id).eq("params->>variantOf", item.id).order("created_at", { ascending: false }).limit(10);
  const variants = (sibs ?? []).map((v) => {
    const pv = (v.params ?? {}) as { direction?: CreativeDirection; template?: TemplateId };
    return { id: v.id, label: pv.direction && pv.direction in CREATIVE_DIRECTIONS ? `Wariant ${CREATIVE_DIRECTIONS[pv.direction].label.toLowerCase()}` : "Wariant", note: pv.template && pv.template in TEMPLATES ? TEMPLATES[pv.template].label : "" };
  });
  const slide = Math.max(0, Math.min(design.slides.length - 1, Number(sp.slide ?? 0) || 0));

  return (
    <GraphicEditor
      key={item.id}
      item={{ id: item.id, title: item.title, status: item.status, propertyId: design.propertyId, propertyTitle: property?.title ?? null, updatedAt: item.updated_at, version: item.current_version }}
      design={design}
      photos={photos}
      facts={factTexts(property, brand)}
      brandColors={brand.colors}
      hasLogo={!!brand.logoKey}
      versions={(versions ?? []).map((v) => ({ version: v.version, source: v.source, operation: v.operation, createdAt: v.created_at }))}
      initialSlide={slide}
      editable={canEdit(ctx.role)}
      aiConfigured={aiAvailability().mode !== "unconfigured"}
      variants={variants}
      qa={qaFor(item)}
    />
  );
}
