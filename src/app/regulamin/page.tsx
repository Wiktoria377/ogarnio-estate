import { LegalPage } from "@/components/site/legal-page";

export const metadata = { title: "Regulamin (projekt)", robots: { index: false, follow: true } };

export default function Terms() {
  return (
    <LegalPage title="Regulamin świadczenia usługi Ogarnio Estate" version="2026-10 (projekt)">
      <section><h2>1. Usługodawca</h2><p>Usługę świadczy [DO UZUPEŁNIENIA: firma, adres, NIP, KRS/CEIDG, e-mail kontaktowy].</p></section>
      <section><h2>2. Definicje i zakres usługi</h2><p>Ogarnio Estate to aplikacja internetowa do przygotowywania materiałów marketingowych dla biur nieruchomości: tekstów, grafik, wideo, broszur PDF, planowania i publikacji w połączonych serwisach społecznościowych oraz analityki. Usługa jest kierowana do przedsiębiorców. [DO UZUPEŁNIENIA: czy usługa jest dostępna dla konsumentów; jeśli tak, wymagane dodatkowe postanowienia.]</p></section>
      <section><h2>3. Konto, biuro i zespół</h2><ul><li>Założenie konta wymaga potwierdzenia adresu e-mail.</li><li>Właściciel biura odpowiada za nadawanie ról członkom zespołu.</li><li>[DO UZUPEŁNIENIA: zasady zawieszenia i usunięcia konta przez usługodawcę.]</li></ul></section>
      <section><h2>4. Okres próbny, plany i płatności</h2><ul><li>Nowe biuro otrzymuje okres próbny ([DO UZUPEŁNIENIA: liczba dni, obecnie 14]) bez podawania karty.</li><li>Plany i limity są opisane w cenniku. Płatności obsługuje Stripe. [DO UZUPEŁNIENIA: ceny netto/brutto, faktury, terminy, waluta.]</li><li>[DO UZUPEŁNIENIA: zasady zmiany planu, anulowania, zwrotów i skutki zaległej płatności.]</li></ul></section>
      <section><h2>5. Treści generowane przez AI</h2><p>Teksty i propozycje generuje model AI na podstawie danych wprowadzonych przez użytkownika. Użytkownik weryfikuje i zatwierdza materiały przed użyciem i odpowiada za ich zgodność z prawdą i przepisami (w tym o ochronie konsumentów i rynku nieruchomości). [DO UZUPEŁNIENIA: postanowienia o prawach do treści wygenerowanych.]</p></section>
      <section><h2>6. Zdjęcia i media użytkownika</h2><p>Przesyłając zdjęcia, logo i inne pliki, użytkownik oświadcza, że ma do nich prawa wystarczające do ich wykorzystania w materiałach marketingowych, a osoby widoczne na zdjęciach wyraziły na to zgodę. [DO UZUPEŁNIENIA: licencja dla usługodawcy w zakresie niezbędnym do świadczenia usługi.]</p></section>
      <section><h2>7. Publikacja w serwisach zewnętrznych</h2><p>Publikacja odbywa się przez oficjalne API serwisów (Meta, LinkedIn) po połączeniu konta przez użytkownika i zatwierdzeniu publikacji. Usługodawca nie odpowiada za zmiany zasad i dostępności tych serwisów. [DO UZUPEŁNIENIA.]</p></section>
      <section><h2>8. Dostępność, odpowiedzialność, reklamacje</h2><p>[DO UZUPEŁNIENIA: poziom dostępności, ograniczenia odpowiedzialności, tryb i termin reklamacji.]</p></section>
      <section><h2>9. Dane osobowe</h2><p>Zasady przetwarzania danych opisuje <a className="underline" href="/polityka-prywatnosci">polityka prywatności</a>. W zakresie danych klientów biura (np. zapytań z formularzy ofert) usługodawca działa jako podmiot przetwarzający. [DO UZUPEŁNIENIA: umowa powierzenia przetwarzania danych.]</p></section>
      <section><h2>10. Postanowienia końcowe</h2><p>[DO UZUPEŁNIENIA: prawo właściwe, sąd, zmiany regulaminu, data wejścia w życie.]</p></section>
    </LegalPage>
  );
}
