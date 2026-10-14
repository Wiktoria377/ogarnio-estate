import { PageHeader } from "@/components/ui/page-header";
import { PropertyForm } from "@/components/properties/property-form";
import { EMPTY_PROPERTY } from "@/verticals/real-estate/form-values";
import { pagePerm } from "@/lib/session";
import { can, canEditProperty } from "@/core/auth/permissions";
import { loadAgents } from "@/lib/members";

export const metadata = { title: "Nowa nieruchomość" };

export default async function NewPropertyPage({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  const ctx = await pagePerm("property.create");
  const onboarding = (await searchParams).onboarding === "1";
  const agents = await loadAgents(ctx);
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow="Nieruchomości" title="Nowa nieruchomość" description="Zapisz parametry oferty. Zdjęcia dodasz w następnym kroku." />
      <PropertyForm id={null} initial={{ ...EMPTY_PROPERTY, agent_id: ctx.userId }} agents={agents} canAssign={can(ctx.role, "property.edit_any")} onboarding={onboarding} />
    </div>
  );
}
