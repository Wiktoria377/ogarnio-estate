import { qaFor } from "@/lib/qa-view";
import { itemHref } from "@/lib/routes";
import { notFound, redirect } from "next/navigation";
import { TextEditor } from "@/components/studio/text-editor";
import { canEdit, requireWorkspace } from "@/lib/session";
import type { TextBody } from "@/core/marketing-engine/request";
import type { SkillUsage } from "@/core/marketing-engine/skills/composer";
import { getContentType } from "@/verticals/real-estate/content-types";
import { propertyFactSheet } from "@/verticals/real-estate/property";

export const metadata = { title: "Materiał" };

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const { data: item } = await ctx.supabase.from("content_items").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!item) notFound();
  if (item.kind !== "text") redirect(itemHref(item));
  const { data: versions } = await ctx.supabase.from("content_versions").select("version, source, operation, created_at, skills_used, model, body").eq("item_id", id).order("version", { ascending: false }).limit(50);
  const current = versions?.find((v) => v.version === item.current_version);
  if (!current) notFound();
  const skills = (versions?.find((v) => Array.isArray(v.skills_used) && v.skills_used.length > 0)?.skills_used ?? []) as unknown as SkillUsage;
  const model = versions?.find((v) => v.model)?.model ?? null;
  let facts: { label: string; value: string }[] = [];
  let propertyTitle: string | null = null;
  if (item.property_id) {
    const { data: p } = await ctx.supabase.from("properties").select("*").eq("id", item.property_id).maybeSingle();
    if (p) {
      facts = propertyFactSheet(p).facts.map((f) => ({ label: f.label, value: f.value }));
      propertyTitle = p.title;
    }
  }
  const def = getContentType(item.content_type);
  return (
    <TextEditor
      key={item.current_version}
      item={{ id: item.id, title: item.title, status: item.status, contentType: def?.label ?? item.content_type, platform: item.platform, propertyId: item.property_id, propertyTitle, updatedAt: item.updated_at, version: item.current_version }}
      body={current.body as unknown as TextBody}
      versions={(versions ?? []).map((v) => ({ version: v.version, source: v.source, operation: v.operation, createdAt: v.created_at }))}
      skills={skills}
      facts={facts}
      model={model}
      editable={canEdit(ctx.role)}
      qa={qaFor(item)}
    />
  );
}
