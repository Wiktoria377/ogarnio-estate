# Audyt wejściowy etapu 4

Data: 2026-10-13. Podstawa: przegląd kodu, baza danych (47 tabel, 14 migracji), `PROJECT_STATE.md`, `docs/SKILLS_AUDIT.md`, biblioteka `skills/` (80 plików .md) oraz wyniki testów z zamknięcia etapu 3 (unit 170, integracyjne 92, E2E 18, build bez błędów). Brief: `docs/ETAP4_BRIEF.md`.

## 1. Stan poprzednich etapów (zweryfikowany)

| Obszar | Stan faktyczny | Uwagi |
|---|---|---|
| Etap 1: konto, biuro, Brand Studio, oferty, Studio treści, grafiki, biblioteka | Działa, testy E2E przechodzą | Brand Studio to jeden wiersz `brand_profiles` bez historii |
| Etap 2: kampanie z briefem (director-2.0.0), kolejka zadań, 12 szablonów, PDF, wideo, planer | Działa (AI na dostawcy offline) | Jakość prawdziwego Claude nieoceniona: brak klucza |
| Etap 3: subskrypcje, zespół, publikacja, import, analityka, admin, strona | Działa w kodzie; zakup Stripe, prawdziwe konta social i statystyki platform zablokowane przez dostawców | Szczegóły: `docs/TEST_REPORT.md` |
| Atrapy interfejsu | Nie znaleziono (brak `href="#"`, „wkrótce”, przycisków bez działania) | TikTok oznaczony „Niedostępne”; zakup planu wyłączony bez kluczy Stripe (z komunikatem) |
| Nawigacja | Wszystkie trasy istnieją | `/import` bez pozycji w menu (dostępny z ofert) |

Ryzyko poza zakresem kodu: przy rejestracji użytkownik akceptuje regulamin, który jest projektem do uzupełnienia. Przed sprzedażą musi go zatwierdzić prawnik (już w `docs/DEPLOYMENT.md`).

## 2. Co istnieje, a czego brakuje względem briefu etapu 4

| Moduł briefu | Co już jest | Luka |
|---|---|---|
| Brand Intelligence | Pole `website` (tylko dane kontaktowe); bezpieczne pobieranie `src/lib/net/safe-fetch.ts` (SSRF, DNS, przekierowania, limity) | Brak analizy strony, ekstrakcji kolorów/fontów/logo/tonu, ocen pewności, zgody, robots.txt; brak przesyłania PDF i przykładowych postów |
| Brand Profile (10 elementów) | Kolory, 2 fonty, logo, styl marki, styl komunikacji, forma zwracania się, frazy preferowane/zakazane (tekst), grupa docelowa (tekst) | Brak: wariantów logo, stylu grafik, słów charakterystycznych jako listy, preferowanych CTA, grup odbiorców jako struktury, wytycznych; brak zatwierdzania, wersji i przywracania |
| Brand Memory | `content_versions` (źródło: AI/ręczna), `body.selected`, zatwierdzenia publikacji | Brak tabel pamięci, zdarzeń akceptacji/odrzucenia/poprawek, sugestii, wyłączania, usuwania, eksportu |
| AI Marketing Director | Brief kampanii jednej oferty (11 pól), kontrola liczb | Brak strategii biura („Zaproponuj mi strategię”), 11 sekcji, rozdzielenia dane/wnioski/hipotezy/rekomendacje, użycia danych analitycznych |
| Skills Engine | Rejestr z plików z walidacją frontmatter (`skillMetaSchema`), wersje semver, warstwy, punktowany dobór z budżetem tokenów, grupy wyłączne, zapis użytych skills przy materiale, katalog `/skills` | Brak: kontroli, że zmiana treści skilla podnosi wersję (blokada), oceny przydatności z decyzji użytkowników, testów jakości doboru dla zadań referencyjnych, skanera bezpieczeństwa instrukcji importowanych, skills dla nowych procesów (analiza marki, strategia, warianty kreatywne, autopilot) |
| Creative Engine | 12 szablonów; reguły wyboru szablonu tylko w kampaniach (`src/verticals/real-estate/templates.ts`); ocena zdjęć do automatycznego wyboru (ostrość, jasność, rozdzielczość, `src/lib/photos.ts`); kadr „attention” sharp i ręczny zoom/punkt ostrości | Wyniki analizy zdjęć niewidoczne dla użytkownika, brak kontrastu, orientacji, ryzyka kadrowania; brak propozycji kadru z przywróceniem; brak doboru kompozycji poza kampanią; brak 5 wariantów kreatywnych |
| Creative QC | Tekst: reguły deterministyczne (liczby, obietnice, klisze, CTA, limity) + recenzja AI; grafika: przepełnienie tekstu, marginesy, brak zdjęć; kampania: spójność | Brak: czytelności, jakości nagłówka/CTA jako ocen, typowych błędów językowych, kontrastu WCAG jako ostrzeżenia, nachodzenia elementów, zgodności z paletą; wideo: brak kontroli technicznej (czas, bezpieczne obszary, napisy, eksport ffprobe) |
| Campaign Autopilot | Planer z planami 7/14/30 dni, kampanie jednej oferty | Brak zbiorczego planu na miesiąc z kolejką akceptacji, limitem kosztu AI i decyzjami akceptuj/odrzuć/edytuj/ponów/zaplanuj |
| Rekomendacje | Wnioski AI do raportu analitycznego (etap 3) | Brak detektorów: częstotliwość, przerwy, nieużyte oferty, ponowna promocja, brak karuzeli, brak tematów edukacyjnych |
| Dashboard | Kafelki, szybkie akcje, ostatnie materiały, oferty | Brak sekcji z briefu (Marketing Overview, Director, Brand Intelligence, Creative Studio, Autopilot, Recommendations, Brand Memory) |
| Architektura AI | Warstwy częściowo: kontekst marki (`brandBlock`), fakty oferty (`FactSheet`), skills, brief, generacja z walidacją zod, render, QA, akceptacja publikacji; pomiar tokenów i kosztów (`ai_usage_events`, etap 3); wersja directora i skills zapisywana | Kontekst marki nie zawiera zatwierdzonego profilu ani pamięci; brak wersji promptów jako identyfikatora; brak kosztu per proces (np. jedna analiza, jeden autopilot) |
| Prywatność | Izolacja RLS, eksport danych, retencja `run_retention()` | Brak przełącznika pamięci, eksportu profilu marki, retencji nowych danych |

## 3. Decyzje projektowe na etap 4

- **Bez nowej aplikacji i bez przebudowy UI.** Nowe moduły wchodzą jako strony w istniejącej powłoce i sekcje pulpitu.
- **Warstwy AI** (brief, sekcja 11) mapuję na istniejący kod: Brand Context = zatwierdzona wersja profilu + aktywna pamięć jawna + wybrane przykłady; Property Context = `FactSheet`; Marketing Skills = rejestr; Campaign Brief = brief/strategia; Generation = `pipeline.ts` (wyjścia walidowane zod); Rendering = graphics/brochures/video; QA = reguły + raporty; Approval = statusy i kolejka.
- **Analiza strony**: tylko jawny URL podany przez użytkownika, z potwierdzoną zgodą; respektowanie `robots.txt` (Disallow dla naszego agenta = koniec); 401/403 = koniec, bez prób obejścia; do 5 stron tej samej domeny i do 6 arkuszy CSS; treść strony trafia do modelu jako ogrodzone dane. Parsowanie HTML: dodana zależność `parse5` (standardowy parser HTML5, używany m.in. przez jsdom); CSS: `postcss` (już w drzewie zależności Next).
- **Pewność**: dla cech technicznych liczona deterministycznie ze źródła (np. font z Google Fonts = wysoka, sama nazwa w CSS = średnia), dla cech z modelu ograniczona i obniżana, gdy cytat-dowód nie występuje w pobranej treści. Poniżej progu cecha jest „propozycją”.
- **Pamięć**: ustrukturyzowane wpisy (kategoria, treść, dowody) + selektywny wybór przykładów zaakceptowanych materiałów; bez trenowania modeli; pamięć sugerowana dopiero po powtórzeniu decyzji (pojedyncza poprawka = tylko propozycja „zapisz jako preferencję”).
- **Rozpoznawanie pomieszczeń**: wymaga modelu wizualnego (Claude z kluczem). Bez klucza funkcja pokazuje „niedostępne”, nie zgaduje.
- **Kadrowanie**: tylko propozycja punktu ostrości i przybliżenia (dane w projekcie), oryginał nienaruszony, przywracanie jednym kliknięciem; żadnego dorysowywania fragmentów.
- **Autopilot**: generuje wyłącznie szkice do kolejki akceptacji; akceptacja tworzy wpis w planerze, publikacja przechodzi istniejący proces zatwierdzania; brak kampanii płatnych; limit liczby generacji na uruchomienie i sprawdzenie limitu planu przed startem.
- **Rekomendacje**: detektory deterministyczne na danych z bazy; brak danych = brak rekomendacji z wyjaśnieniem, czego brakuje.

## 4. Ograniczenia środowiska testowego

- Brak `ANTHROPIC_API_KEY`: generacja i analiza tonu marki na dostawcy offline (deterministycznym, oznaczonym). Jakość prawdziwego modelu do oceny po podłączeniu klucza.
- Analiza stron testowana na lokalnej stronie wzorcowej (symulator, `tests/mocks/brand-site.mjs`) dopuszczonej przez `SAFE_FETCH_ALLOW_HOSTS` tylko poza produkcją.
- Brak modelu wizualnego: rozpoznawanie pomieszczeń nietestowalne bez klucza.
