# Raport testów, etap 4

Data: 2026-10-14. Środowisko: lokalny stos Supabase (PostgreSQL, GoTrue, PostgREST z limitem **1000 wierszy na zapytanie**, jak domyślnie w Supabase Cloud), Chromium (Playwright), `AI_TEST_PROVIDER=1` (deterministyczny dostawca offline, bez klucza Anthropic, oznaczony w interfejsie). Strona biura do analizy marki: lokalna strona testowa `tests/mocks/brand-site.mjs`. Platformy społecznościowe i CRM: symulatory kontraktu API z etapu 3.

Dane testowe są prawdziwymi rekordami w bazie (oferty, zdjęcia JPEG zapisane w magazynie plików, materiały z wersjami, publikacje i statystyki, kliknięcia, zapytania), a nie makietami w interfejsie. Grafiki są naprawdę renderowane (sharp), wideo to prawdziwy plik MP4 (ffmpeg) badany przez ffprobe, materiały autopilota tworzy działający worker kolejki zadań.

## Wyniki

| Zestaw | Polecenie | Wynik |
| --- | --- | --- |
| TypeScript strict | `npm run typecheck` | ✅ 0 błędów |
| Testy jednostkowe | `npm test` | ✅ 271/271 (16 plików; etap 3: 170) |
| Testy integracyjne (baza, RLS, działająca aplikacja, worker, symulatory) | `npm run test:integration` | ✅ 167/167 (15 plików; etap 3: 92) |
| E2E w przeglądarce, pełny przebieg | `npm run test:e2e` | ✅ 24/24 (15,4 min; etap 3: 18) |
| Build produkcyjny | `STORAGE_DRIVER=supabase npx next build` | ✅ bez błędów (113 tras) |

Nowe pliki testów etapu 4:
- jednostkowe: `brand-intel` 25, `brand-memory` 10, `skills-engine2` 19, `strategy` 8, `creative` 7, `qa` 15, `autopilot` 8, `recommendations` 9;
- integracyjne: `brand-intel` 13, `brand-memory` 12, `strategy` 8, `creative` 11, `qa` 7, `autopilot` 12, `recommendations` 8, `performance` 4;
- E2E: `brand-intel`, `brand-memory`, `director`, `creative` (z kontrolą jakości), `autopilot`, `recommendations` (z sekcjami pulpitu).

## Błędy znalezione w fazie testów i poprawione

1. **Ucięte odczyty w Supabase Cloud.** Supabase zwraca najwyżej 1000 wierszy na zapytanie, a 23 odczyty (analityka, strategia, rekomendacje, import CRM, panel administratora, zdjęcia) miały `.limit(5000–50000)`. W dużym biurze analityka zaniżyłaby kliknięcia i zapytania, a import CRM nie widziałby części istniejących ofert (ryzyko duplikatów). Lokalnie błąd był niewidoczny, bo lokalny PostgREST nie miał limitu. Poprawka: odczyt stronami (`src/lib/supabase/fetch-all.ts`), lokalny stos z tym samym limitem (`scripts/local-stack/postgrest.conf.example`), test `performance.test.ts` liczy ponad 1000 wierszy w każdej ścieżce.
2. **Rotacja formatów w autopilocie.** Przy włączonych scenariuszach wideo pierwsza oferta na Instagramie nigdy nie była karuzelą (jeden licznik do dwóch rzeczy). Poprawione i pokryte testem.
3. **Uzasadnienie rekomendacji z liczbą spoza danych** (liczba brakujących tematów edukacyjnych). Wykrył to test „każda liczba w uzasadnieniu jest w danych”. Poprawione.
4. **Profil startowy jako „zatwierdzony”.** Strategia i pulpit traktowały automatyczną wersję 1 profilu marki jak profil zatwierdzony przez użytkownika. Poprawione.
5. **Niestabilny test RLS.** Zadanie testowe mogło zostać pobrane przez działający worker przed anulowaniem. Test ustawia teraz termin w przyszłości.

## Wydajność (duże biuro, lokalnie)

Dane: 400 aktywnych ofert, 2400 zdjęć, 1500 materiałów, 1200 publikacji ze statystykami, 3000 kliknięć, 1500 zapytań.

| Operacja | Czas | Wymóg w teście |
| --- | --- | --- |
| Dane rekomendacji (wszystkie rekordy) | 555 ms | < 5 s |
| Rekomendacje z decyzjami | 579 ms | < 5 s |
| Dane strategii | 509 ms | < 5 s |
| Raport analityki za 90 dni | 431 ms | < 5 s |
| Plan autopilota, 40 pozycji ×100 | 29 ms | < 1 s |
| Zapis planu autopilota (40 pozycji) | 563 ms | < 3 s |

Pomiary z jednej maszyny i lokalnej bazy. Nie zastępują testu obciążeniowego na docelowej infrastrukturze.

## Kryteria akceptacji etapu 4 (1–16)

Legenda: **A** automatyczny E2E, **I** integracyjny (baza + aplikacja), **U** jednostkowy, \* na dostawcy AI offline.

| # | Kryterium | Stan | Rodzaj | Jak sprawdzone |
| --- | --- | --- | --- | --- |
| 1 | Podać stronę biura | ✅ | A + I | `brand-intel.spec`: adres, zgoda, analiza w tle; robots.txt, 401/403, limit podstron, ochrona SSRF w `brand-intel.test` |
| 2 | Propozycja profilu marki | ✅\* | A + I | 10 elementów z pewnością i źródłem. Kolory, fonty, logo, kontakt i zwroty pochodzą z kodu strony; ton i grupy odbiorców z dostawcy offline |
| 3 | Zatwierdzić branding | ✅ | A + I | zatwierdzenie, odrzucenie, wersje, przywracanie, eksport |
| 4 | Preferencje komunikacyjne | ✅ | A | `brand-intel.spec`, `brand-memory.spec` |
| 5 | Materiały referencyjne | ✅ | A + I | posty, opisy, PDF (pdftotext) |
| 6 | Treści zgodne ze stylem | ✅\* | A + I | styl profilu i pamięć jawna w promptach, kontrola zwrotów zakazanych |
| 7 | Kilka wariantów graficznych | ✅ | A + I | `creative.spec`: 5 osobnych grafik w różnych szablonach z prawdziwych zdjęć |
| 8 | Zmiana preferencji wpływa na generacje | ✅\* | A | `brand-memory.spec`: zapamiętana poprawka trafia do kolejnego generowania |
| 9 | Strategia marketingowa | ✅\* | A + I | `director.spec`, `strategy.test` (liczby spoza danych usuwane) |
| 10 | Miesięczny plan kampanii | ✅ | A + I | `autopilot.spec`, `autopilot.test`: plan z uzasadnieniem z danych biura (bez AI) |
| 11 | Zestaw materiałów do akceptacji | ✅\* | A + I | teksty i grafiki z prawdziwych zdjęć przez worker, w limicie AI, każdy z raportem jakości |
| 12 | Zatwierdzić lub odrzucić materiały | ✅ | A + I | akceptuj, odrzuć, przywróć, generuj ponownie, zaplanuj (bez publikacji); reklamy nigdy nie są planowane |
| 13 | Rekomendacje z istniejących danych | ✅ | A + I + U | `recommendations.test` na rekordach biura; test, że każda liczba w uzasadnieniu jest w danych; brak danych = brak rekomendacji |
| 14 | Usunąć preferencje | ✅ | A + I | `brand-memory.spec`: usunięcie wpisu, wyłączenie pamięci, czyszczenie całości |
| 15 | Izolacja biur | ✅ | I + A | każdy nowy plik integracyjny ma test „inne biuro”: brak odczytu, brak działania, brak wpływu na liczby; `isolation.spec` |
| 16 | Bez utraty funkcji z poprzednich etapów | ✅ | A + I | pełny przebieg 24/24 E2E i 167/167 integracyjnych, w tym wszystkie testy etapów 1–3 |

## Czego nie dało się przetestować

| Test | Powód | Co trzeba zrobić |
| --- | --- | --- |
| Jakość tekstów, strategii, tonu marki z prawdziwego Claude | brak `ANTHROPIC_API_KEY` | ustawić klucz, przejrzeć próbki na danych biura |
| Analiza prawdziwej strony biura w internecie | testy na lokalnej stronie testowej | uruchomić „Poznaj moją markę” na stronie biura po wdrożeniu |
| Rekomendacje z prawdziwych statystyk platform | statystyki z etapu 3 tylko z symulatora (App Review Meta/LinkedIn) | `docs/INTEGRATIONS_APPROVAL.md` |
| Wydajność na infrastrukturze produkcyjnej | brak projektu produkcyjnego | test obciążeniowy po wdrożeniu |

---

# Raport testów, etap 3

Data: 2026-10-13. Środowisko jak w etapie 2: lokalny stos Supabase (PostgreSQL 17, GoTrue, PostgREST), Chromium (Playwright), `AI_TEST_PROVIDER=1` (dostawca offline, bez klucza Anthropic). Integracje zewnętrzne testowane na **symulatorach kontraktu API** (`tests/mocks/social-api.mjs` dla Meta/LinkedIn, `tests/mocks/crm-api.mjs` dla ASARI/EstiCRM), oznaczonych w interfejsie jako symulator. Webhooki Stripe podpisywane lokalnie testowym sekretem (symulacja dostaw Stripe, **nie** test płatności).

## Wyniki

| Zestaw | Polecenie | Wynik |
| --- | --- | --- |
| TypeScript strict | `npm run typecheck` | ✅ 0 błędów |
| Testy jednostkowe | `npm test` | ✅ 170/170 (8 plików) |
| Testy integracyjne (baza, RLS, działająca aplikacja, symulatory) | `npm run test:integration` | ✅ 92/92 (7 plików: rls, billing, publishing, import, analytics, admin, site) |
| E2E w przeglądarce | `npm run test:e2e` | ✅ 18/18 (pełny przebieg 16/17 + ponowiony 1 po poprawce, nowy test telefonu 1/1) |
| Build produkcyjny | `STORAGE_DRIVER=supabase npm run build` | ✅ bez błędów (62 strony/trasy) |

Regresja: pełny przebieg E2E wykrył błąd w interfejsie (po „Spróbuj ponownie” zadanie kończące się w ułamku sekundy nie odświeżało widoku, bo przeskoczyło stan „w kolejce”). Poprawione w `src/components/campaigns/job-progress.tsx` (każda zmiana na stan końcowy odświeża widok); test przechodzi.

## Kryteria akceptacji etapu 3 (1–20)

Legenda: **A** automatyczny (unit/E2E), **I** integracyjny (baza + aplikacja + symulator), **M** ręczny, **🔒** test produkcyjny zablokowany przez dostawcę.

| # | Kryterium | Stan | Rodzaj | Jak sprawdzone / dlaczego zablokowane |
| --- | --- | --- | --- | --- |
| 1 | Rejestracja | ✅ | A | `smoke.spec`, `team.spec`, `mobile.spec`: rejestracja z linkiem z e-maila (lokalny serwer pocztowy) |
| 2 | Biuro i onboarding | ✅ | A | `team.spec`: kreator 9 kroków, pauza i wznowienie |
| 3 | Wygenerowanie materiału | ✅* | A | `criteria.spec`, `etap2-criteria.spec`, `campaign.spec` (\* dostawca offline) |
| 4 | Abonament w środowisku testowym | ⚠️ częściowo, 🔒 | I | Logika webhooków, idempotencja i blokady: `billing.test` 14/14. **Zakup przez Stripe Checkout nie został wykonany**: brak kluczy testowych Stripe (`sk_test_…`, `whsec_…`, `price_…`). Przycisk zakupu pokazuje „wymaga konfiguracji”. |
| 5 | Dostęp po webhooku | ✅ (symulacja) | I | „checkout completion alone does not grant access”, „subscription event activates the paid plan; duplicates are ignored”, „cancellation makes the office read-only” |
| 6 | Limity po stronie serwera | ✅ | I | „reserves atomically and refuses beyond the plan limit (parallel requests)”, „property limit is enforced by the database”, „an expired trial is read-only”, budżet AI w `admin.test` |
| 7 | Zaproszenie drugiej osoby | ✅ | A | `team.spec`: zaproszenie agenta, przyjęcie z drugiej przeglądarki |
| 8 | Uprawnienia | ✅ | A + I | `team.spec` (serwer odrzuca akcje spoza roli, nie tylko ukryte przyciski), „agent can request but not approve”, „agents only their own” (zapytania) |
| 9 | Połączenie konta społecznościowego | ⚠️ symulator, 🔒 | A | `publishing.spec`: pełny OAuth Meta na symulatorze kontraktu. **Prawdziwe konto: zablokowane** (brak `META_APP_ID`/`LINKEDIN_CLIENT_ID`, wymagane App Review i Business Verification, `docs/INTEGRATIONS_APPROVAL.md`). TikTok niedostępny (brak zatwierdzonego Content Posting API). |
| 10 | Zaplanowanie publikacji | ✅ | A + I | `publishing.spec`, `planner.spec`, bramka akceptacji w `publishing.test` |
| 11 | Uruchomienie o właściwej godzinie | ✅ (symulator) | I | „runs at the scheduled time: not before, then published soon after” (12 s przed terminem nic nie wysłano, publikacja ≤30 s po terminie), „an unapproved publication is never published, even when due” |
| 12 | Identyfikator zewnętrzny | ✅ (symulator) | I | „Facebook text post: published only with the platform id”, „LinkedIn multi-image post: … post URN stored”, karuzela Instagram (kontener → publikacja) |
| 13 | Obsługa błędów API | ✅ (symulator) | I | rate limit (ponowienie później), wygasły token (konto do ponownej autoryzacji), odrzucone media (bez ponawiania), brak danych dostępowych, „lost response … verified on the platform, no duplicate” |
| 14 | Import CSV | ✅ | A + I | `import.spec`, `import.test` 15/15 (podgląd, walidacja, duplikaty, raport, zmiany ceny) |
| 15 | Izolacja biur | ✅ | A + I | `isolation.spec` (2 testy), `rls.test`, testy izolacji w billing/publishing/import/analytics/admin |
| 16 | Statystyki z rzeczywistych źródeł | ⚠️ częściowo, 🔒 | I + A | Własne pomiary (kliknięcia linków, zapytania, wizyty strony) są rzeczywiste: `analytics.test`, `analytics.spec`. Statystyki postów: kod oficjalnych API testowany tylko na symulatorze; **prawdziwe dane zablokowane** do App Review Meta (`read_insights`, `instagram_manage_insights`) i LinkedIn Community Management API. Brak danych = „Brak danych”, nigdy 0. |
| 17 | Zabezpieczenie panelu administratora | ✅ | A + I | `admin.spec` (404 dla zwykłego użytkownika i po odebraniu roli, rola podglądu bez zapisu), „office users cannot read or write admin data”, „audit log is append-only even for the service role” |
| 18 | Pomiar zużycia płatnych usług | ✅ | I + A | „prices usage per office and blocks paid AI when the budget is exceeded”, `admin-costs.test`. Kwoty zależą od stawek wpisanych przez administratora (brak stawki = „nieznane”). |
| 19 | Telefon i komputer | ✅ | A + M | `mobile.spec` (390×844: rejestracja, menu, kluczowe ekrany bez poziomego przewijania), `site.spec` (strona sprzedażowa na telefonie), pozostałe E2E na desktopie; zrzuty obejrzane ręcznie |
| 20 | Odporność na ponowienia webhooków i zadań | ✅ | I | „duplicates are ignored”, „an older event delivered late does not overwrite newer state”, „the same idempotency key is charged once”, „claim is atomic: parallel claims never return the same publication”, „lost response … no duplicate” |

\* Na dostawcy offline. Jakość treści prawdziwego Claude wymaga klucza `ANTHROPIC_API_KEY` i przeglądu.

## Testy produkcyjne zablokowane przez dostawców

| Test | Blokada | Co trzeba zrobić |
| --- | --- | --- |
| Zakup w Stripe Checkout (test i live) | brak kluczy Stripe | `docs/DEPLOYMENT.md` pkt 4 |
| Publikacja na prawdziwej stronie FB, koncie IG, LinkedIn | brak aplikacji Meta/LinkedIn, App Review | `docs/SOCIAL_SETUP.md`, `docs/INTEGRATIONS_APPROVAL.md` |
| Statystyki postów z platform | uprawnienia insights po App Review | jw. |
| Import z prawdziwego ASARI / EstiCRM | brak danych dostępowych biura | `docs/CRM_IMPORT.md` |
| Generowanie przez Claude | brak `ANTHROPIC_API_KEY` | `docs/DEPLOYMENT.md` pkt 5 |
| Wysyłka e-maili przez produkcyjny SMTP | brak konta SMTP | testy używają lokalnego serwera pocztowego |
| Kopie zapasowe i odtwarzanie na Supabase Cloud | brak projektu produkcyjnego | procedura w `docs/DEPLOYMENT.md` pkt 2 |

## Nowe testy etapu 3

- Unit: `analytics.test.ts` (15: UTM, boty, metryki, kontrola liczb we wnioskach AI), `admin-costs.test.ts` (6: stawki, koszty częściowe, MRR, budżety), wcześniejsze testy importu (50).
- Integracyjne: `billing.test.ts` (14), `publishing.test.ts` (18), `import.test.ts` (15), `analytics.test.ts` (14), `admin.test.ts` (6), `site.test.ts` (4: formularz kontaktowy, zgoda na statystyki, retencja).
- E2E: `team.spec`, `publishing.spec`, `import.spec`, `analytics.spec`, `admin.spec`, `site.spec`, `mobile.spec`.

---

# Raport testów, etap 2

Data: 2026-10-13. Środowisko: Linux, Node 22, Chromium (Playwright), lokalny stos Supabase bez Dockera (PostgreSQL 17, GoTrue, PostgREST), `STORAGE_DRIVER=local`, `AI_TEST_PROVIDER=1` (dostawca offline, bez klucza Anthropic), Remotion 4.0.529 z Chromium headless shell, ffmpeg/ffprobe do weryfikacji plików MP4.

## Wyniki

| Zestaw | Polecenie | Wynik |
| --- | --- | --- |
| TypeScript strict | `npm run typecheck` | ✅ 0 błędów |
| Testy jednostkowe | `npm test` | ✅ 99/99 (5 plików) |
| Izolacja danych (RLS) | `npm run test:rls` | ✅ 21/21 (w tym 4 testy obejmujące 9 nowych tabel) |
| E2E w przeglądarce | `npm run test:e2e` | ✅ 11/11 (ok. 5 min, z dwoma renderami MP4) |
| Build produkcyjny | `STORAGE_DRIVER=supabase npm run build` | ✅ 56 tras, bez ostrzeżeń |

Testy etapu 1 zostały w zestawie i przechodzą razem z nowymi (regresja).

## Kryteria akceptacji etapu 2 (1–14)

Kryteria 1–13 sprawdza jedna ścieżka `tests/e2e/etap2-criteria.spec.ts`, kryterium 14 `tests/e2e/isolation.spec.ts` i `tests/integration/rls.test.ts`.

| # | Kryterium | Stan | Jak sprawdzone |
| --- | --- | --- | --- |
| 1 | Logowanie | ✅ | Rejestracja z linkiem z e-maila, wylogowanie, logowanie |
| 2 | Nieruchomość | ✅ | Formularz, cena, metraż, 3 zdjęcia |
| 3 | Kampania | ✅* | Cel „Promocja nowej oferty”, 11 materiałów (w tym Reels i Meta Ads) generowanych w tle; wszystkie mają status „Gotowe”, brief i kontrola jakości widoczne |
| 4 | Spójne posty | ✅* | Post na Instagram i Facebook: oba zawierają tytuł i cenę z rekordu oraz tę samą „myśl przewodnią” briefu; brak obietnic („gwarant…”) |
| 5 | Karuzela | ✅ | Karuzela kampanii ma 5–7 slajdów (6) |
| 6 | Edycja i pobranie karuzeli | ✅ | Edycja nagłówka, zapis wersji, PNG 1080×1350 sprawdzony bajtowo i wymiarami |
| 7 | PDF | ✅ | Broszura z kampanii: podgląd stron i pobrany plik `%PDF-` |
| 8 | Reels MP4 | ✅ | Szkic z kampanii → akceptacja scenariusza → render w kolejce → MP4 sprawdzony ffprobe: H.264, 1080×1920, 30/1 kl./s, 15,0 s |
| 9 | Biblioteka | ✅ | Wideo i broszura kampanii w filtrach biblioteki |
| 10 | Kalendarz | ✅ | Plan kampanii w planerze z ≥5 wpisami; na liście wpisy linkują do materiałów |
| 11 | Edycja po ponownym logowaniu | ✅ | Wylogowanie, logowanie: zmieniony nagłówek karuzeli i wyrenderowane MP4 są na miejscu |
| 12 | Branding | ✅ | Kolor główny marki ustawiony w Brand Studio (#0E7C66) znajduje się w pikselach pobranego PNG karuzeli |
| 13 | Czytelny błąd | ✅ | (a) symulowana odmowa AI (znacznik `[TEST:AI_FAIL]`, tylko dostawca testowy): brief pokazuje „Model AI odmówił wykonania tego zadania…”, materiały „Brief kampanii nie powstał…”, przycisk „Spróbuj ponownie”; po poprawie oferty ponowienie tworzy brief. (b) zły plik muzyki: „Obsługujemy pliki MP3, M4A, WAV i AAC.” (c) zmiana tekstu cofa akceptację i chowa przycisk renderu |
| 14 | Izolacja biur | ✅ | Biuro B dostaje 404 na kampanię, broszurę i wideo biura A oraz 403/404 na PDF, miniaturę, MP4, plakat i plik muzyki; nie usunie utworu A; nie widzi zadań, wpisów planera ani wideo A. RLS: 9 nowych tabel bez odczytu i zapisu z cudzego biura |

\* Na dostawcy offline. Z prawdziwym Claude potrzebny jest klucz i przegląd jakości tekstów (patrz „Czego te testy nie obejmują”).

## E2E (`tests/e2e`)

| Scenariusz | Co sprawdza |
| --- | --- |
| `etap2-criteria.spec.ts` | Kryteria 1–13 (tabela wyżej) |
| `campaign.spec.ts` | Kreator kampanii z celem „obniżka ceny” (wymagana poprzednia cena), styl, kanały, materiały, szacunek kosztu, generowanie w tle, brief, QA, broszura jako PDF, karuzela otwierana w edytorze |
| `graphics.spec.ts` | Edytor: zaznaczanie na płótnie, przeciąganie, edycja w miejscu, skala, font, ukrywanie i przywracanie, cofnij/ponów, kadr zdjęcia, duplikowanie i usuwanie slajdu, JPG, ZIP, PDF (7 stron), zapis jako szablon biura i nowa grafika z szablonu |
| `brochures.spec.ts` | Karta oferty (1 strona, polskie znaki, edycja, PDF) i katalog 2 ofert (3 strony), trwałość po przeładowaniu |
| `video.spec.ts` | Kreator wideo (10 s, wybrane zdjęcia i kolejność, styl kinowy), edycja haka, nagłówków, kolejności scen i ruchu kamery, własna muzyka z potwierdzeniem praw, akceptacja, render, MP4 z dźwiękiem (ffprobe), odtwarzanie z zakresem bajtów (206), trwałość, lista wideo |
| `planner.spec.ts` | Plan 7 dni / 3 wpisy w tygodniu, widoki miesiąc, tydzień, lista, plany; przeciągnięcie wpisu na inny dzień, edycja tytułu i godziny, statusy, „Oznacz jako opublikowane”, ręczny wpis, filtr statusu, postęp planu |
| `isolation.spec.ts` | Etap 1 (oferty, grafiki, pliki) i etap 2 (kampanie, broszury, wideo, muzyka, zadania, planer) |
| `criteria.spec.ts`, `studio.spec.ts`, `smoke.spec.ts` | Regresja etapu 1 |

## Testy jednostkowe (`tests/unit`)

- `video.test.ts`: oś czasu dla 4 długości z planszą parametrów i bez (dokładna liczba klatek, nakładanie przejść, minimalna długość sceny), liczba scen w projekcie, zmiana długości z zachowaniem tekstów, props kompozycji biorą cenę i parametry z rekordu, przełączniki ceny, parametrów i muzyki.
- `brochures.test.ts`: 4 warianty z polskimi znakami i długimi tekstami, odrzucenie złej liczby ofert.
- `graphics.test.ts`: render każdego z 12 szablonów w każdym formacie, dopasowanie tekstu bez nakładania, znak m² z fontu zapasowego.
- `engine.test.ts`, `skills.test.ts`: silnik treści, kontrola jakości i walidacja całej biblioteki kompetencji (także nowych: dyrektor kampanii i 6 celów). Brief i scenariusz wideo są sprawdzane w testach E2E.

## Sprawdzenie wizualne

Oprócz testów automatycznych obejrzane zostały: arkusze wszystkich szablonów grafik w każdym formacie, wszystkie strony 4 wariantów broszur, klatki wyrenderowanych Reels (sceny ze zdjęciami, plansza ceny i parametrów, plansza końcowa) oraz zrzuty ekranów edytorów (`docs/screenshots/etap2-*.png`).

## Błędy znalezione i naprawione w trakcie etapu 2

- Szablon „Pasek danych” używał nieistniejącego koloru marki (błąd typu wykryty przez TypeScript).
- Cofnij/ponów łączyło ukrycie i przywrócenie elementu w jeden krok. Łączone są teraz tylko kolejne zmiany tego samego pola.
- Kilka szablonów: plakietka nachodziła na logo (Noir), za słaby kontrast tytułu na zdjęciu (Magazyn), cena łamana na dwie linie (Cena w centrum), za mało miejsca na tekst w kwadratowej Galerii.
- Broszura „Karta oferty” gubiła opis przy dłuższych danych (nowy układ), katalog z 3 okładkami (mozaika), stopka rysowana na kolorowych stronach.
- Reels: plansza ceny i plansza końcowa były przesunięte do góry. Teraz są wyśrodkowane w strefie bezpiecznej, a plansza parametrów pokazuje też lokalizację.
- Pliki MP4, PDF i audio były serwowane z typem obrazu i bez zakresów bajtów (odtwarzacz nie mógł przewijać). Dodane typy MIME i odpowiedzi 206.
- Usunięcie materiału zostawiało wyrenderowane pliki MP4 w magazynie. Teraz są usuwane razem z materiałem.

## Czego te testy nie obejmują

- **Prawdziwego modelu Claude.** Briefy, teksty i scenariusze pochodzą z dostawcy offline (mechaniczne, oznaczone jako testowe). Integracja jest gotowa, jakość wymaga przeglądu po podłączeniu klucza.
- **Supabase Storage i Supabase Cloud** (testy na sterowniku dyskowym i lokalnym PostgreSQL).
- **Renderu na docelowym serwerze.** MP4 renderowane lokalnie (ok. 35–60 s na film 10–15 s z cache bundla). Wydajność przy wielu biurach naraz nie była mierzona.
- Przeglądarek innych niż Chromium (podgląd wideo używa standardowego `<video>` i @remotion/player), testów obciążeniowych, czytników ekranu.
