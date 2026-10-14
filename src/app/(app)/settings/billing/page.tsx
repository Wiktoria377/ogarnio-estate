import { Check, Receipt, Warning } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsNav } from "@/components/settings/settings-nav";
import { UsageMeters } from "@/components/billing/usage-meters";
import { AwaitConfirmation, ChoosePlanButton, PortalButton, ReactivateButton } from "@/components/billing/billing-actions";
import { planLimitLines, priceLabel, SUBSCRIPTION_STATUS_LABEL } from "@/components/billing/plan-format";
import { accessMessage, getUsageSummary } from "@/lib/billing/usage";
import { stripeMode } from "@/lib/billing/stripe";
import { can } from "@/core/auth/permissions";
import { requireWorkspace } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Plan i płatności" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const owner = can(ctx.role, "billing.manage");
  const [usage, { data: plans }, { data: sub }, { data: invoices }] = await Promise.all([
    getUsageSummary(ctx),
    ctx.supabase.from("plans").select("*").order("sort"),
    ctx.supabase.from("workspace_subscriptions").select("provider, provider_customer_id, provider_subscription_id, status, provider_synced_at").eq("workspace_id", ctx.workspace.id).maybeSingle(),
    owner ? ctx.supabase.from("billing_invoices").select("*").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(24) : Promise.resolve({ data: [] }),
  ]);
  const mode = stripeMode();
  const hasStripeSub = !!sub?.provider_subscription_id && sub.provider === "stripe" && !["canceled", "incomplete_expired"].includes(sub.status);
  const confirmed = !!sub && sub.status === "active" && sub.provider === "stripe" && !!sub.provider_synced_at && Date.now() - new Date(sub.provider_synced_at).getTime() < 3600_000;
  const statusTone = usage.access === "full" ? (usage.status === "past_due" ? "warning" : "success") : "danger";

  return (
    <>
      <PageHeader title="Ustawienia" description="Plan, limity i płatności biura." />
      <SettingsNav />
      <div className="flex flex-col gap-5">
        {sp.checkout === "success" && <AwaitConfirmation confirmed={confirmed} />}
        {sp.checkout === "canceled" && <div role="status" className="rounded-md border border-line bg-sunken px-3 py-2.5 text-[13px] text-ink-2">Płatność została przerwana. Plan się nie zmienił.</div>}
        {mode === "unconfigured" && (
          <div role="alert" className="flex gap-2 rounded-md border border-warning/20 bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
            <Warning size={18} className="shrink-0" />
            <span>Płatności online wymagają konfiguracji: administrator Ogarnio musi ustawić klucze Stripe (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) i przypisać ceny do planów. Do tego czasu zakup planu jest niedostępny; okres próbny działa.</span>
          </div>
        )}
        {mode === "test" && <div className="rounded-md border border-line bg-sunken px-3 py-2 text-[12.5px] text-ink-3">Stripe działa w trybie testowym: płatności nie są prawdziwe (karty testowe Stripe).</div>}

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[12.5px] text-ink-3">Obecny plan</p>
              <p className="mt-0.5 text-[22px] font-semibold text-ink" data-testid="current-plan">{usage.planName}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone={statusTone} data-testid="subscription-status">{SUBSCRIPTION_STATUS_LABEL[usage.status] ?? usage.status}</Badge>
                {usage.status === "trialing" && usage.trialEndsAt && <span className="text-ink-3">do {formatDate(usage.trialEndsAt)}</span>}
                {usage.currentPeriodEnd && usage.status !== "trialing" && <span className="text-ink-3">{usage.cancelAtPeriodEnd ? "kończy się" : "odnawia się"} {formatDate(usage.currentPeriodEnd)}</span>}
              </div>
              {usage.access !== "full" && <p className="mt-2 max-w-xl text-[13px] text-danger" data-testid="access-message">{accessMessage(usage.accessReason)}</p>}
              {usage.cancelAtPeriodEnd && usage.access === "full" && <p className="mt-2 text-[13px] text-ink-2">Subskrypcja zakończy się z końcem okresu. Do tego czasu wszystko działa.</p>}
            </div>
            {owner && hasStripeSub && (
              <div className="flex flex-wrap gap-2">
                {usage.cancelAtPeriodEnd && <ReactivateButton />}
                <PortalButton flow="update">Zmień plan</PortalButton>
                <PortalButton flow="payment_method">Metoda płatności</PortalButton>
                {!usage.cancelAtPeriodEnd && <PortalButton flow="cancel" variant="ghost">Zrezygnuj</PortalButton>}
              </div>
            )}
          </div>
          <div className="mt-5">
            <UsageMeters usage={usage} />
          </div>
          {!owner && <p className="mt-4 text-[12.5px] text-ink-3">Planem i płatnościami zarządza właściciel biura.</p>}
        </Card>

        <section aria-labelledby="plans">
          <h2 id="plans" className="mb-3 text-[15px] font-semibold text-ink">Plany</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {(plans ?? []).filter((p) => p.is_public).map((p) => {
              const price = priceLabel(p);
              const current = usage.planId === p.id && usage.status !== "trialing";
              return (
                <Card key={p.id} className="flex flex-col p-5" data-testid={`plan-${p.id}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-[16px] font-semibold text-ink">{p.name}</h3>
                    {current && <Badge tone="accent">Twój plan</Badge>}
                  </div>
                  <p className="mt-1 text-[13px] text-ink-3">{p.description}</p>
                  <p className="mt-3"><span className="text-[26px] font-semibold text-ink">{price.amount}</span><span className="text-[13px] text-ink-3"> / {price.per}{price.tax}</span></p>
                  {price.note && <p className="text-[11.5px] text-ink-4">{price.note}</p>}
                  <ul className="mt-4 flex flex-1 flex-col gap-1.5 text-[13px] text-ink-2">
                    {planLimitLines(p).map((l) => (
                      <li key={l} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-accent" />{l}</li>
                    ))}
                  </ul>
                  <div className="mt-5">
                    {owner && !hasStripeSub && <ChoosePlanButton planId={p.id} label={`Wybierz ${p.name}`} disabled={mode === "unconfigured" || !p.stripe_price_id} />}
                    {owner && !hasStripeSub && mode !== "unconfigured" && !p.stripe_price_id && <p className="mt-1.5 text-[11.5px] text-ink-4">Plan nie ma jeszcze przypisanej ceny w Stripe.</p>}
                    {owner && hasStripeSub && !current && <PortalButton flow="update">Przejdź na {p.name}</PortalButton>}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {owner && (
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Receipt size={18} /> Historia płatności</h2>
            <p className="mt-1 text-[12.5px] text-ink-3">Faktury i potwierdzenia wystawia Stripe. Faktury VAT w KSeF wymagają osobnej integracji operatora (patrz dokumentacja wdrożenia).</p>
            <div className="mt-4 overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[520px] text-left text-[12.5px]">
                <thead className="border-b border-line text-ink-3"><tr><th className="px-3 py-2 font-medium">Data</th><th className="px-3 py-2 font-medium">Numer</th><th className="px-3 py-2 font-medium">Kwota</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium" /></tr></thead>
                <tbody className="divide-y divide-line">
                  {(invoices ?? []).map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2 text-ink-3">{formatDate(i.created_at)}</td>
                      <td className="px-3 py-2 text-ink">{i.number ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{new Intl.NumberFormat("pl-PL", { style: "currency", currency: i.currency }).format((i.status === "paid" ? i.amount_paid : i.amount_due) / 100)}</td>
                      <td className="px-3 py-2"><Badge tone={i.status === "paid" ? "success" : i.status === "open" ? "warning" : "muted"}>{({ paid: "Opłacona", open: "Do zapłaty", draft: "Szkic", void: "Anulowana", uncollectible: "Nieściągalna" } as Record<string, string>)[i.status]}</Badge></td>
                      <td className="px-3 py-2 text-right">{i.hosted_invoice_url && <a className="text-accent hover:underline" href={i.hosted_invoice_url} target="_blank" rel="noopener noreferrer">Pokaż</a>}</td>
                    </tr>
                  ))}
                  {!invoices?.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-ink-3">Brak płatności.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
