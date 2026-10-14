import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PropertyForm } from "@/components/properties/property-form";
import { pagePerm } from "@/lib/session";
import { can, canEditProperty } from "@/core/auth/permissions";
import { loadAgents } from "@/lib/members";
import { toFormValues } from "@/verticals/real-estate/form-values";

export const metadata = { title: "Edycja nieruchomości" };

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pagePerm("property.edit_assigned");
  const { data: p } = await ctx.supabase.from("properties").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!p || !canEditProperty(ctx.role, ctx.userId, p)) notFound();
  const agents = await loadAgents(ctx);
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow="Nieruchomości" title={`Edycja: ${p.title}`} />
      <PropertyForm id={p.id} initial={toFormValues(p)} agents={agents} canAssign={can(ctx.role, "property.edit_any")} />
    </div>
  );
}
