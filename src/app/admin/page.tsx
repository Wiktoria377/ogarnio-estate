import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { STATUS_LABEL, Stat, bytes } from "@/components/admin/stat";
import { formatCost, formatMoney } from "@/core/admin/costs";
import { adminPage } from "@/lib/admin/access";
import { budgetStates } from "@/lib/admin/costs";
import { costCurrency, overview } from "@/lib/admin/service";

export default async function AdminOverview() {
  await adminPage();
  const [o, budgets] = await Promise.all([overview(), budgetStates()]);
  const cur = costCurrency();
  const pct = (v: number | null) => (v == null ? "Brak danych" : `${String(v).replace(".", ",")}%`);
  const nf = (n: number) => new Intl.NumberFormat("pl-PL").format(n);
  return (
    <div>
      <PageHeader title="Przegląd platformy" description="Bieżący miesiąc kalendarzowy (Europe/Warsaw). Koszty to szacunki według stawek ustawionych w zakładce Koszty; rzeczywiste kwoty są na fakturach dostawców." />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Biura" value={o.offices} />
        <Stat label="Aktywne subskrypcje" value={o.activeSubscriptions} note="active + zaległa płatność" />
        <Stat label="MRR (cennik)" value={formatMoney(o.mrrMinor / 100, o.planCurrency)} note="ceny planów, bez rabatów i VAT" testId="admin-mrr" />
        <Stat label="Okresy próbne" value={o.trials} note={`${o.trialsEnding} kończy się w 7 dni`} />
        <Stat label="Wywołania AI" value={nf(o.ai.calls)} note={`${nf(o.ai.errors)} błędów/odrzuceń · ${nf(o.ai.tokens)} tokenów`} />
        <Stat label="Filmy wyrenderowane" value={o.renders.count} note={`${Math.round(o.renders.seconds / 60)} min renderowania`} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <Stat label="Koszt AI (szacunek)" value={formatCost(o.ai.cost, cur)} testId="admin-ai-cost" />
        <Stat label="Koszt renderowania (szacunek)" value={formatCost(o.renders.cost, cur)} />
        <Stat label="Miejsce na pliki" value={bytes(o.storage.bytes)} note={formatCost(o.storage.cost, cur) + " / mies."} />
        <Stat label="Koszt łącznie (szacunek)" value={formatCost(o.totalCost, cur)} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Aktywacja nowych biur" description={`Biura założone w ostatnich 30 dniach: ${o.activation.created}`} />
          <ul className="divide-y divide-line text-[13px]" data-testid="activation">
            {[["Ukończony onboarding", o.activation.onboarding], ["Dodana oferta", o.activation.property], ["Wygenerowany materiał", o.activation.content], ["Eksport lub publikacja", o.activation.exported]].map(([l, v]) => <li key={l as string} className="flex justify-between px-5 py-2"><span>{l}</span><span className="tabular-nums">{pct(v as number | null)}</span></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Subskrypcje według statusu" />
          <ul className="divide-y divide-line text-[13px]">
            {Object.entries(o.statuses).map(([s, n]) => <li key={s} className="flex justify-between px-5 py-2"><span>{STATUS_LABEL[s] ?? s}</span><span className="tabular-nums">{n}</span></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Budżety bezpieczeństwa" action={<Link href="/admin/costs" className="text-[12.5px] underline">Ustaw</Link>} />
          <ul className="divide-y divide-line text-[13px]" data-testid="budgets">
            {(["ai", "video_render"] as const).map((k) => {
              const b = budgets[k];
              return <li key={k} className="px-5 py-2"><span className="font-medium">{k === "ai" ? "AI" : "Renderowanie wideo"}</span>: {b ? `${formatCost(b.spent, b.currency)} z ${formatMoney(b.limit, b.currency)} (${String(b.pct).replace(".", ",")}%)${b.enabled ? "" : ", wyłączony"}${b.level === "exceeded" ? ", PRZEKROCZONY: operacje wstrzymane" : b.level === "alert" ? ", próg ostrzeżenia" : ""}` : "nie ustawiono (brak blokady)"}</li>;
            })}
          </ul>
        </Card>
      </div>
      <Card className="mt-5 overflow-x-auto">
        <CardHeader title="Zużycie AI według operacji" />
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead className="text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">Operacja</th><th className="px-2 py-2 font-medium">Wywołania</th><th className="px-2 py-2 font-medium">Błędy/odrzucenia</th><th className="px-2 py-2 font-medium">Tokeny</th><th className="px-2 py-2 font-medium">Koszt (szacunek)</th></tr></thead>
          <tbody className="divide-y divide-line">
            {o.byOperation.length ? o.byOperation.map((r) => <tr key={r.operation}><td className="px-5 py-2">{r.operation}</td><td className="px-2 py-2 tabular-nums">{nf(r.calls)}</td><td className="px-2 py-2 tabular-nums">{nf(r.errors)}</td><td className="px-2 py-2 tabular-nums">{nf(r.tokens)}</td><td className="px-2 py-2">{formatCost(r.cost, cur)}</td></tr>) : <tr><td colSpan={5} className="px-5 py-3 text-ink-3">Brak wywołań w tym miesiącu.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
