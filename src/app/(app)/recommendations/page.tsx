import { Lightbulb } from "@phosphor-icons/react/dist/ssr";
import { RecommendationCard, RestoreButton } from "@/components/recommendations/recommendation-card";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/core/auth/permissions";
import { loadRecommendations } from "@/lib/recommendations/service";
import { requireWorkspace } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Rekomendacje" };

export default async function RecommendationsPage() {
  const ctx = await requireWorkspace();
  const view = await loadRecommendations(ctx);
  const editable = can(ctx.role, "content.edit");
  return (
    <>
      <PageHeader
        title="Rekomendacje"
        description="Propozycje usprawnień liczone z danych Twojego biura: oferty, materiały, publikacje potwierdzone przez platformy, statystyki, kliknięcia i zapytania. Każda pokazuje podstawę, użyte dane, możliwe działanie i rezultat do zmierzenia."
      />
      <div className="flex flex-col gap-6">
        <p className="text-[12.5px] text-ink-3" data-testid="reco-meta">
          Reguły w wersji {view.version}, bez kosztu AI. Rekomendacje opisują to, co widać w danych, i nie przesądzają o przyczynach. Gdy danych brakuje, rekomendacja się nie pojawia.
        </p>
        {view.items.length === 0 ? (
          <EmptyState icon={<Lightbulb />} title="Brak rekomendacji" description="W danych biura nie ma teraz sytuacji, które wymagałyby działania, albo danych jest za mało, żeby coś rzetelnie zaproponować." />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2" data-testid="reco-list">
            {view.items.map((r) => <li key={r.key}><RecommendationCard r={r} editable={editable} /></li>)}
          </ul>
        )}
        {view.gaps.length > 0 && (
          <Card className="p-0" data-testid="reco-gaps">
            <CardHeader title="Czego dane jeszcze nie pokazują" description="Te braki ograniczają rekomendacje. Nie zastępujemy ich szacunkami." />
            <ul className="flex list-disc flex-col gap-1 border-t border-line px-5 py-4 pl-9 text-[13px] text-ink-2">
              {view.gaps.map((g) => <li key={g}>{g}</li>)}
            </ul>
          </Card>
        )}
        {view.hidden.length > 0 && (
          <Card className="p-0" data-testid="reco-hidden">
            <CardHeader title="Ukryte" description="Wrócą automatycznie po podanej dacie, jeśli dane nadal będą wskazywać tę samą sytuację." />
            <ul className="flex flex-col divide-y divide-line border-t border-line">
              {view.hidden.map((h) => (
                <li key={h.key} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13px]">
                  <span className="text-ink-2">{h.title} <span className="text-ink-3">· {h.status === "done" ? "zrobione" : "nie teraz"}, do {formatDate(h.until)}</span></span>
                  {editable && <RestoreButton recoKey={h.key} />}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
