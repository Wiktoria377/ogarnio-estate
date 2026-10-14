import { notFound, redirect } from "next/navigation";
import { BrochureEditor } from "@/components/brochures/brochure-editor";
import { brochureDesignSchema } from "@/core/brochures/model";
import { loadPropertyOptions } from "@/lib/members";
import { canEdit, requireWorkspace } from "@/lib/session";

export const metadata = { title: "Broszura" };

export default async function BrochurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const { data: item } = await ctx.supabase.from("content_items").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!item) notFound();
  if (item.kind !== "document") redirect(`/studio/${id}`);
  const { data: versions } = await ctx.supabase.from("content_versions").select("version, source, operation, created_at, body").eq("item_id", id).order("version", { ascending: false }).limit(30);
  const current = versions?.find((v) => v.version === item.current_version);
  const parsed = brochureDesignSchema.safeParse(current?.body);
  if (!current || !parsed.success) notFound();
  const { data: props } = await ctx.supabase.from("properties").select("id, description, features, amenities").in("id", parsed.data.propertyIds).eq("workspace_id", ctx.workspace.id);
  const options = await loadPropertyOptions(ctx);
  return (
    <BrochureEditor
      key={item.id}
      item={{ id: item.id, title: item.title, status: item.status, updatedAt: item.updated_at, version: item.current_version }}
      design={parsed.data}
      properties={options}
      sources={Object.fromEntries((props ?? []).map((p) => [p.id, { description: p.description ?? "", highlights: [...p.features, ...p.amenities].slice(0, 6) }]))}
      versions={(versions ?? []).map((v) => ({ version: v.version, operation: v.operation, source: v.source, createdAt: v.created_at }))}
      editable={canEdit(ctx.role)}
    />
  );
}
