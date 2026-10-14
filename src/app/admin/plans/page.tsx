import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PlanForm } from "@/components/admin/admin-forms";
import { formatMoney } from "@/core/admin/costs";
import { adminPage } from "@/lib/admin/access";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminPlans() {
  const admin = await adminPage();
  const { data: plans } = await createAdminClient().from("plans").select("*").order("sort");
  return (
    <div>
      <PageHeader title="Plany" description="Limity są egzekwowane w bazie danych przy każdej operacji. Zmiana ceny tutaj nie zmienia ceny w Stripe: najpierw utwórz nową cenę w Stripe i wpisz jej identyfikator. Każda zmiana wymaga powodu i trafia do dziennika." />
      <div className="flex flex-col gap-5">
        {(plans ?? []).map((p) => (
          <Card key={p.id}>
            <CardHeader title={`${p.name} (${p.id})`} description={`${formatMoney(p.price_minor / 100, p.currency)} / ${p.billing_interval === "year" ? "rok" : "miesiąc"} · ${p.price_tax_mode === "net" ? "netto" : p.price_tax_mode === "gross" ? "brutto" : "VAT nieokreślony"}`} />
            <CardBody><PlanForm plan={p} readOnly={admin.role !== "admin"} /></CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
