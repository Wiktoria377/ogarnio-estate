import { DownloadSimple } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SettingsNav } from "@/components/settings/settings-nav";
import { DeleteAccount, DeleteWorkspace } from "@/components/settings/forms";
import { requireWorkspace } from "@/lib/session";

export const metadata = { title: "Dane i prywatność" };

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-20 gap-4 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default async function PrivacyPage() {
  const ctx = await requireWorkspace();
  return (
    <>
      <PageHeader title="Ustawienia" description="Twoje dane, eksport i usunięcie konta." />
      <SettingsNav />
      <Card className="p-6 sm:p-8">
        <Section title="Twoje dane (RODO)" description="Pobierz kopię danych albo usuń konto. Operacje usunięcia wymagają hasła.">
          <div className="flex flex-col gap-6">
            <div>
              <Button variant="secondary" asChild><a href="/api/account/export" download><DownloadSimple /> Pobierz moje dane (JSON)</a></Button>
              <p className="mt-2 text-[12px] text-ink-3">Profil, biura, marka, oferty, materiały z historią wersji i Twoje użycie AI. Zdjęcia są wskazane ścieżkami.</p>
            </div>
            {ctx.role === "owner" && (
              <div className="rounded-md border border-danger/20 p-4">
                <p className="text-[13.5px] font-medium text-ink">Usuń biuro „{ctx.workspace.name}”</p>
                <p className="mt-1 mb-3 text-[12.5px] text-ink-3">Usuwa biuro, jego markę, oferty, zdjęcia i materiały. Twoje konto zostaje.</p>
                <DeleteWorkspace name={ctx.workspace.name} />
              </div>
            )}
            <div className="rounded-md border border-danger/20 p-4">
              <p className="text-[13.5px] font-medium text-ink">Usuń konto</p>
              <p className="mt-1 mb-3 text-[12.5px] text-ink-3">Trwale usuwa konto i biura, w których jesteś jedynym właścicielem.</p>
              <DeleteAccount />
            </div>
          </div>
        </Section>
        <Section title="Retencja danych" description="Jak długo przechowujemy dane (szczegóły w polityce prywatności).">
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
            <li>Oferty, materiały i pliki: do czasu usunięcia przez biuro lub usunięcia biura.</li>
            <li>Zapytania z formularzy stron ofert: 24 miesiące od ostatniej zmiany, potem automatyczne usunięcie (wraz z historią zapytania).</li>
            <li>Kliknięcia linków i wyświetlenia stron ofert: skróty bez adresów IP, 13 miesięcy.</li>
            <li>Statystyki postów z platform i dziennik użycia AI: 25 miesięcy.</li>
            <li>Dziennik błędów technicznych: 90 dni. Tymczasowe dane logowania OAuth i limity zapytań: do 2 dni.</li>
            <li>Usuwanie wykonuje automatyczne zadanie serwera co kilka godzin.</li>
          </ul>
        </Section>
      </Card>
    </>
  );
}
