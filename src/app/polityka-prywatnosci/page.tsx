import { LegalPage } from "@/components/site/legal-page";

export const metadata = { title: "Polityka prywatności (projekt)", robots: { index: false, follow: true } };

export default function Privacy() {
  return (
    <LegalPage title="Polityka prywatności Ogarnio Estate" version="2026-10 (projekt)">
      <section><h2>1. Administrator</h2><p>[DO UZUPEŁNIENIA: firma, adres, NIP, e-mail w sprawach danych osobowych; inspektor ochrony danych, jeśli wyznaczony].</p></section>
      <section><h2>2. Role w przetwarzaniu</h2><ul><li>Dane kont użytkowników, rozliczeń i formularza kontaktowego tej strony: administratorem jest operator Ogarnio Estate.</li><li>Dane klientów biura (np. zapytania z formularzy na stronach ofert): administratorem jest biuro nieruchomości, a operator przetwarza je w jego imieniu. [DO UZUPEŁNIENIA: umowa powierzenia.]</li></ul></section>
      <section><h2>3. Jakie dane i w jakim celu</h2><ul><li>Konto i zespół: imię, e-mail, rola; świadczenie usługi (art. 6 ust. 1 lit. b RODO).</li><li>Płatności: dane rozliczeniowe przetwarza Stripe; w aplikacji przechowujemy identyfikatory klienta i subskrypcji.</li><li>Formularz kontaktowy: imię, e-mail, nazwa biura, treść; odpowiedź na wiadomość na podstawie zgody.</li><li>Statystyki odwiedzin tej strony: tylko po zgodzie, bez adresu IP i bez narzędzi firm trzecich (skrót identyfikatora zmieniany codziennie).</li><li>Zapytania z formularzy ofert: dane podane przez osobę pytającą oraz treść i wersja zgody jako dowód.</li></ul></section>
      <section><h2>4. Okresy przechowywania</h2><ul><li>Zapytania z formularzy ofert: 24 miesiące od ostatniej zmiany.</li><li>Kliknięcia linków, wyświetlenia stron ofert i statystyki tej strony: 13 miesięcy.</li><li>Wiadomości z formularza kontaktowego: 12 miesięcy.</li><li>Statystyki postów i dziennik użycia AI: 25 miesięcy. Dziennik błędów: 90 dni.</li><li>Dane konta i biura: do usunięcia konta lub biura. [DO UZUPEŁNIENIA: okresy dla dokumentów rozliczeniowych wynikające z przepisów podatkowych.]</li></ul><p>Usuwanie po terminie wykonuje automatyczne zadanie serwera.</p></section>
      <section><h2>5. Odbiorcy i przekazywanie poza EOG</h2><p>Dostawcy: hosting i baza danych [DO UZUPEŁNIENIA], Anthropic (generowanie tekstów AI), Stripe (płatności), Meta i LinkedIn (publikacja na połączonych kontach), dostawca poczty e-mail [DO UZUPEŁNIENIA]. [DO UZUPEŁNIENIA: podstawy przekazania danych poza EOG.]</p><p>Danych klientów nie wykorzystujemy do trenowania własnych modeli.</p></section>
      <section><h2>6. Prawa osób</h2><p>Dostęp, sprostowanie, usunięcie, ograniczenie, przenoszenie, sprzeciw, wycofanie zgody, skarga do Prezesa UODO. Kopię danych konta pobierzesz w aplikacji (Ustawienia, Dane i prywatność), tam też usuniesz konto.</p></section>
      <section><h2>7. Pliki cookie</h2><p>Używamy plików cookie niezbędnych do logowania oraz pliku zapamiętującego decyzję o statystykach odwiedzin. Nie używamy plików cookie reklamowych.</p></section>
      <section><h2>8. Zmiany polityki</h2><p>[DO UZUPEŁNIENIA: data wejścia w życie i sposób informowania o zmianach.]</p></section>
    </LegalPage>
  );
}
