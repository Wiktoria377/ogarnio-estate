import { LegalPage } from "@/components/site/legal-page";

export const metadata = { title: "OgarnioEstateBot", robots: { index: false, follow: false } };

/** Linked from the analyser's User-Agent so site owners can see who fetched their pages and how to block it. */
export default function BotInfo() {
  return (
    <LegalPage title="OgarnioEstateBot" version="1.0">
      <section><h2>Czym jest</h2><p>OgarnioEstateBot jednorazowo odczytuje publiczną stronę biura nieruchomości, gdy użytkownik Ogarnio Estate uruchomi funkcję „Poznaj moją markę” i potwierdzi, że strona należy do jego biura lub ma zgodę jej właściciela.</p></section>
      <section><h2>Co pobiera</h2><ul><li>plik robots.txt (zawsze jako pierwszy),</li><li>do 5 podstron (strona główna, „o nas”, oferty, kontakt),</li><li>arkusze stylów z tej samej domeny, logo i kilka zdjęć.</li></ul><p>Nie loguje się, nie wypełnia formularzy, nie omija ograniczeń dostępu (odpowiedzi 401/403 kończą odczyt danej podstrony) i nie uruchamia skryptów strony.</p></section>
      <section><h2>Jak zablokować</h2><p>Bot respektuje robots.txt. Aby zablokować go całkowicie, dodaj:</p><pre className="rounded bg-sunken p-3 text-[13px]">User-agent: OgarnioEstateBot{"\n"}Disallow: /</pre></section>
    </LegalPage>
  );
}
