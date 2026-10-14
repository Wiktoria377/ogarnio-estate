# PROJECT_STATE: OGARNIO ESTATE

## Etap 4 (zamknięty 2026-10-14): Intelligent Marketing OS

Brief: `docs/ETAP4_BRIEF.md`. Audyt wejściowy: `docs/ETAP4_AUDIT.md`. Wyniki testów: `docs/TEST_REPORT.md`. Konfiguracja: `docs/ETAP4_SETUP.md`.

| Faza | Stan | Testy |
|---|---|---|
| 1. Audyt | Zrobione: weryfikacja etapów 1–3 (brak atrap), mapa luk względem briefu, decyzje projektowe | stan wejściowy: unit 170/170, integracyjne 92/92, E2E 18/18 |
| 2. Brand Intelligence | Zrobione: „Poznaj moją markę” (URL + zapisana zgoda, robots.txt respektowany, 401/403 nie są omijane, do 5 podstron, CSS, logo, zdjęcia, materiały referencyjne: posty, opisy, PDF przez pdftotext), propozycja 10 elementów profilu z poziomem pewności i źródłem/cytatem, szkic do edycji, zatwierdzenie, odrzucenie, wersjonowanie (`brand_profile_versions`), historia ze zmianami, przywracanie, eksport JSON, strona informacyjna bota `/bot`. Treść strony traktowana jako dane (test z wstrzykniętym poleceniem). Ton i grupy odbiorców bez klucza AI pochodzą z dostawcy testowego (oznaczone). Naprawione w trakcie: nagłówek User-Agent z polskimi znakami, parser HTML pomijał korzeń dokumentu, regex cen z „zł”, logo nie było promowane przy zatwierdzeniu bez edycji, fałszywe „zmiany” przy pustych polach. | unit 25 nowych (łącznie 195/195), integracyjne brand-intel 13/13, E2E brand-intel 1/1 (kryteria 1–5, na stronie testowej `tests/mocks/brand-site.mjs`) |
| 3. Brand Memory | Zrobione: tabele `brand_memory` (pamięć jawna i sugerowana) i `brand_feedback_events` (ustrukturyzowane decyzje: poprawka tekstu, wybór i odrzucenie wariantu, tekst „gotowy”, wybór szablonu, kolory w grafice). Pojedyncza poprawka = tylko propozycja „Zapamiętaj” w edytorze; sugestia dopiero po powtórzeniu (CTA 2×, usunięte słowo 2×, skracanie nagłówków 2×, szablon 3×, kolor 2×, odrzucony typ wariantu 2×), z listą decyzji jako dowodem; działa po akceptacji, odrzucona nie wraca. Do generowania trafia wyłącznie pamięć jawna + do 2 zaakceptowanych tekstów tego samego rodzaju (selektywny wybór), kontrola jakości oznacza zwroty z pamięci, preferowany szablon jest preselekcją w Studiu grafik. Ekran „Pamięć marki”: włącz/wyłącz, dodawanie, edycja, usuwanie, akceptacja/odrzucenie sugestii, ostatnie decyzje, usunięcie całej pamięci, eksport. Retencja: decyzje 12 mies., odrzucone sugestie 6 mies., analizy stron 24 mies. Izolacja i role w RLS (sugestie tworzy tylko serwer, agent usuwa tylko własne wpisy, wyłączanie i czyszczenie: owner/admin). Bez trenowania modeli. | unit 10 nowych, integracyjne brand-memory 12/12, E2E brand-memory 1/1 (kryteria 6, 8, 14) |
| 4. Skills Engine 2.0 | Zrobione: ponowny przegląd biblioteki (85 skills, 6 nowych: hierarchia typograficzna, wytyczne wizualne Brand Studio, analiza marki, strategia biura, warianty kreatywne, plan miesięczny). Wybór zależy od rodzaju materiału, platformy, celu, odbiorców, stylu marki, grup odbiorców z zatwierdzonego profilu i cech oferty (`propertySkillTags`: premium, najem, rodziny, inwestorzy, rynek pierwotny); cechy konkretnego przypadku ważą więcej niż ogólne tagi formatu. Zasady stałe nie wypadają z limitu, reszta mieści się w limicie 12 skills i ok. 9000 tokenów (nigdy cała biblioteka). Rejestr wersji `skills/skills.lock.json` (wersja + sha256; test blokuje zmianę treści bez podbicia wersji, `node scripts/skills-lock.mjs`), wersje skills zapisywane przy każdej wersji materiału. Skuteczność w katalogu „Kompetencje AI”: odsetek materiałów biura oznaczonych jako gotowe bez ręcznych poprawek, od 5 użyć, opisana jako wskazówka. Skaner treści skills rozszerzony (przejęcie roli, ujawnianie promptu i kluczy, obrazki do zewnętrznych adresów, `javascript:`, `<script>`, `eval`, zakodowane bloki). | unit 19 nowych (łącznie 224/224), w tym test wzorcowy „Karuzela Instagram promująca luksusowy apartament” |
| 5. AI Marketing Director 2.0 | Zrobione: ekran „AI Marketing Director” (`/director`) z funkcją „Zaproponuj mi strategię”: cel biznesowy, okres, odbiorcy (z profilu marki lub presety), oferty (do 10), kanały, budżet reklamowy, częstotliwość. Sekcja danych liczona przez serwer z rekordów biura (oferty, materiały, publikacje potwierdzone przez platformy, zapytania, kliknięcia, statystyki platform; brak danych = „Brak danych”, nie zero). Model zwraca 11 sekcji + wnioski, hipotezy, rekomendacje (co, dlaczego, dane, działanie, miernik). Kontrola deterministyczna: liczby spoza danych usuwane, wniosek bez faktów → hipoteza, obietnice wyników oznaczane, materiały tylko z dostępnych rodzajów, wybranych ofert i kanałów, w limicie częstotliwość × okres, bez reklam przy budżecie 0. Strategię zapisuje wyłącznie serwer (`marketing_strategies`, treść niezmienna, klient zmienia tylko status), akceptacja/archiwum/usuwanie, „Przygotuj” otwiera Studio z rodzajem, ofertą, kanałem i tematem. Wersja promptu `strategy-1.0.0`, wersje skills i koszt procesu (wywołania i tokeny oznaczone `process_id` w `ai_usage_events`). | unit 8, integracyjne 8/8, E2E director 1/1 (kryterium 9) |
| 6. Creative Engine 2.0 | Zrobione: techniczna analiza każdego zdjęcia (wymiary, proporcje, orientacja, jasność, kontrast, ostrość z laplasjanu, dominujące kolory, punkt uwagi, odsetek kadru zachowany w każdym formacie, wynik 0–100) liczona z pikseli przy dodaniu zdjęcia i na żądanie (`property_photos.analysis`, wersja `photo-1.0.0`); panel „Jakość techniczna zdjęć” z uwagami (bardzo mała rozdzielczość, ciemne, prześwietlone, nieostre, nietypowe proporcje, ryzyko przycięcia w Stories). Zdjęcia nie są retuszowane ani uzupełniane, wady nie są ukrywane. Rozpoznawanie pomieszczeń: **wymaga modelu wizualnego, nie włączone** (oznaczone w UI). Rekomendacja układu (12 szablonów) z liczby i jakości zdjęć, proporcji, jasności, długości tekstu, przekazu, charakteru oferty i stylu marki, z uzasadnieniem i przyciskiem „Zastosuj”. „Zaproponuj kadr” wokół punktu uwagi (oryginał bez zmian) i „Przywróć oryginalny kadr”. 5 wariantów kreatywnych (minimalistyczny, premium, dynamiczny, ekspercki, sprzedażowy): każdy to osobna grafika z innym układem i tekstami, te same zdjęcia, kadry i fakty, zawsze kolory, fonty i logo marki (nadpisania kolorów usuwane); koszt liczony jako jeden proces `creative_variants`. | unit 7 nowych (łącznie 239/239), integracyjne creative 11/11 (prawdziwe piksele z magazynu), E2E creative 1/1 (kryterium 7) |
| 7. Kontrola jakości | Zrobione: wspólny raport kontroli (`qa-1.0.0`) dla tekstu, grafiki i wideo, liczony na serwerze bez kosztu AI i zapisywany przy materiale (`content_items.qa`, zapis tylko przez serwer, baza odrzuca zapis klienta). Tekst: język (udział polskich i angielskich słów), fakty i obietnice (warstwa reguł generatora uruchamiana ponownie na bieżącym tekście), czytelność (szacunek FOG-PL, długie zdania), zgodność z celem, jakość nagłówka (długość, wersaliki, schematyczny początek, konkret) i CTA (czasownik działania, ogólnikowość, prośba o kontakt przy celu „zapytania”). Grafika: kontrast mierzony na pikselach wyrenderowanego slajdu pod każdym tekstem (wzór WCAG, próg Otsu), wielkość czcionki, marginesy i strefy Stories, nakładanie elementów, ucięty tekst, zgodność kolorów, fontów i logo z Brand Studio, powiększanie i przycinanie zdjęć, fakty w tekstach. Wideo: czas czytania napisów względem czasu sceny, liczba linii, ciągłość osi czasu, strefy interfejsu Reels/TikTok, krótkie sceny i powtórzone zdjęcia, rozdzielczość zdjęć przy ruchu kamery, długość muzyki, plik MP4 sprawdzany przez ffprobe (kodek, piksele, 1080×1920, 30 kl./s, długość, audio, faststart, wersja). Każda uwaga ma metodę (reguła / pomiar / szacunek) i propozycję poprawki; raport opisany jako wskazówka, nie obiektywna ocena. Panel „Kontrola jakości” w edytorze tekstu, grafiki (zakładka „Jakość”) i wideo. | unit 15 nowych (łącznie 254/254), integracyjne qa 7/7 (prawdziwy render grafiki, prawdziwy MP4 z ffmpeg), E2E creative 1/1 (z kontrolą jakości) |
| 8. Campaign Autopilot | Zrobione: ekran `/autopilot` z funkcją „Przygotuj mój marketing na najbliższy miesiąc”: początek i długość okresu (7–31 dni), liczba publikacji (do 40), platformy (Instagram, Facebook, LinkedIn, TikTok), oferty (do 10), filary treści (oferty, edukacja, właściciele, zaufanie, marka), cele (do 3), scenariusze wideo, propozycje reklam, limit generowań AI planu, opcjonalnie zaakceptowana strategia z AI Marketing Director (jej materiały idą pierwsze). Plan (`autopilot-1.0.0`) jest deterministyczny i nie kosztuje AI: wagi filarów według celów, format według kanału i liczby zdjęć (TikTok = scenariusz, oferty na Instagramie rotują karuzela, post, scenariusz Reels; Facebook ze zdjęciami = grafika promocyjna), terminy rozłożone na okres. Uzasadnienie planu z danych biura (te same fakty co w strategii; braki opisane jako „Brak danych o”), uzasadnienie każdej pozycji. „Przygotuj materiały” tworzy w tle (kolejka zadań) teksty i grafiki z prawdziwych zdjęć oferty, w limicie planu i miesięcznym limicie biura; reszta czeka. Każdy materiał przechodzi kontrolę jakości. Kolejka akceptacji: akceptuj, odrzuć, przywróć, edytuj (otwiera edytor), generuj ponownie (1 generowanie, maks. 5 na pozycję), zaplanuj (wpis w planerze ze statusem „Gotowe”; publikacja nadal wymaga osobnego zatwierdzenia i potwierdzenia platformy). Propozycje reklam to tylko teksty: nie są planowane ani uruchamiane. Koszt procesu (wywołania, tokeny, szacunek kosztu) liczony z `ai_usage_events.process_id`. Zapis statusów i limitów tylko przez serwer (RLS bez polityk zapisu), izolacja biur. | unit 8 nowych (łącznie 262/262), integracyjne autopilot 12/12 (prawdziwy worker, zdjęcia, QA, limity, ochrona), E2E autopilot 1/1 |
| 9. Rekomendacje i pulpit | Zrobione: ekran `/recommendations` i sekcje pulpitu. Rekomendacje (`reco-1.0.0`) liczone regułami na bieżących rekordach biura, bez AI i bez kosztu: przerwa w komunikacji (ponad 14 dni od ostatniej publikacji potwierdzonej przez platformę), nieregularny rytm (publikacje w mniej niż 4 z 8 tygodni), pusty planer na 14 dni, niewykorzystana oferta (aktywna od 7 dni, bez materiału lub bez publikacji), ponowna promocja (ostatnia publikacja oferty ponad 30 dni temu i brak zapytań w 30 dniach), brak karuzeli (co najmniej 5 zdjęć), brak zdjęć, test nagłówka (tylko przy co najmniej 5 publikacjach ze statystykami platform: wskaźnik interakcji poniżej połowy mediany), brakujące tematy edukacyjne, pomiar wyników (brak połączonych kont lub linków śledzących). Każda rekomendacja ma: co proponujemy, na jakiej podstawie, użyte dane, działania (prawdziwe linki do kreatorów z wypełnionym tematem lub ofertą) i rezultat do zmierzenia; tam gdzie dane nie pokazują przyczyny, jest zastrzeżenie (np. nagłówek a pora publikacji). Test sprawdza, że każda liczba w uzasadnieniu jest w danych. Gdy danych brakuje, reguła milczy, a ekran pokazuje „Czego dane jeszcze nie pokazują”. „Nie teraz” (30 dni) i „Zrobione” (14 dni, potem wraca, jeśli dane się nie zmieniły), „Pokaż ponownie”; zapis tylko przez serwer (`recommendation_states`), izolacja biur. Pulpit: Marketing Overview (liczby z rekordów, „Brak danych” zamiast zera), 3 najważniejsze rekomendacje, kafle AI Marketing Director, Brand Intelligence, Creative Studio, Campaign Autopilot, Brand Memory ze stanem z bazy. | unit 9 nowych, integracyjne recommendations 8/8 (dane z rekordów: oferty, zdjęcia, publikacje, statystyki), E2E recommendations 1/1 |
| 10. Testy | Zrobione: pełna regresja etapów 1–4, test wydajności dużego biura (400 ofert, 1200 publikacji, 1500 zapytań: odczyty 0,4–0,6 s), testy bezpieczeństwa w każdym nowym pliku integracyjnym (role, zapis tylko przez serwer, izolacja biur). Lokalny PostgREST działa z limitem 1000 wierszy jak Supabase Cloud. Wykryte i poprawione: 23 odczyty ucinane do 1000 wierszy (analityka, strategia, rekomendacje, import CRM, panel administratora; teraz odczyt stronami `fetch-all.ts`), rotacja formatów w autopilocie, profil startowy traktowany jak zatwierdzony, niestabilny test RLS. Eksport danych konta obejmuje strategie, plany autopilota i decyzje o rekomendacjach. | unit 271/271, integracyjne 167/167, E2E 24/24, build ✅ |

### Tabela statusu etapu 4

| Funkcja | Działa | Przetestowana | Wymaga konfiguracji | Pozostałe problemy |
| --- | --- | --- | --- | --- |
| Brand Intelligence („Poznaj moją markę”) | Tak | Tak: unit, integracyjne, E2E na lokalnej stronie testowej | `ANTHROPIC_API_KEY` (ton, odbiorcy), `pdftotext` dla PDF, wyjście HTTPS z serwera | Nie sprawdzona na prawdziwej stronie biura w internecie. Strony renderowane wyłącznie przez JavaScript dają mało danych (bot nie uruchamia skryptów). |
| Zatwierdzanie profilu marki, wersje, eksport | Tak | Tak | Nie | |
| Brand Memory (pamięć jawna i sugestie, wyłączanie, usuwanie) | Tak | Tak | Nie | Sugestie powstają z reguł powtórzeń, nie z analizy treści przez AI |
| Skills Engine 2.0 (selekcja, wersje, skuteczność) | Tak | Tak (unit) | Nie | Skuteczność skills liczona od 5 użyć, to wskazówka |
| AI Marketing Director 2.0 (strategia z danych) | Tak, na dostawcy offline | Tak | `ANTHROPIC_API_KEY` | Jakość strategii prawdziwego modelu nieoceniona |
| Creative Engine (analiza zdjęć, kadr, 5 wariantów) | Tak | Tak, na prawdziwych zdjęciach | Nie (teksty wariantów: `ANTHROPIC_API_KEY`) | Analiza zdjęć jest techniczna (piksele); rozpoznawanie treści zdjęcia wymagałoby modelu wizualnego |
| Kontrola jakości tekstu, grafiki, wideo | Tak | Tak (prawdziwy render i MP4) | `ffprobe` dla pomiaru pliku wideo | Czytelność to szacunek (FOG-PL); raport jest wskazówką, nie oceną |
| Campaign Autopilot (plan, materiały, kolejka akceptacji) | Tak | Tak (worker, limity, ochrona) | `ANTHROPIC_API_KEY`, worker zadań | Scenariusze wideo są tekstem (render MP4 z Video Studio osobno); propozycje reklam tylko jako teksty, bez uruchamiania |
| Rekomendacje | Tak | Tak, na rekordach biura | Nie | Progi reguł (14, 30 dni, 5 publikacji) to założenia do weryfikacji z użytkownikami; bez prawdziwych statystyk platform test nagłówka się nie pojawi |
| Sekcje pulpitu (Overview, Director, Brand Intelligence, Creative Studio, Autopilot, Recommendations, Brand Memory) | Tak | Tak (E2E) | Nie | Kompaktowe kafle; bez pełnego przeprojektowania (zgodnie z briefem) |
| Koszt procesu i wersjonowanie | Tak | Tak | Stawki w panelu administratora | Bez stawek widoczne tylko tokeny i wywołania |
| Prywatność (izolacja, eksport, retencja, usuwanie pamięci) | Tak | Tak | Nie | Retencja nowych tabel autopilota i rekomendacji: razem z danymi biura (bez osobnego terminu) |

---

## Etap 3 (zamknięty 2026-10-13): komercjalizacja SaaS

Stan na 2026-10-13. Audyt wejściowy: `docs/ETAP3_AUDIT.md`, research integracji: `docs/INTEGRATIONS_RESEARCH.md`.

| Faza | Stan | Testy |
|---|---|---|
| 1. Audyt, bezpieczeństwo, architektura | Zrobione: 16 poprawek (redirecty, origin, limity body, rate limit, CSP, centralny log błędów `app_errors`, szyfrowanie tokenów) | unit 99/99, RLS 21/21 |
| 2. Subskrypcje i limity | Zrobione: plany w tabeli `plans`, Stripe Checkout/Portal (tryb testowy, bez kluczy produkcyjnych), webhook z podpisem i idempotencją, dziennik zużycia `usage_ledger` egzekwowany w bazie | integracyjne billing 14/14 |
| 3. Onboarding i zespół | Zrobione: kreator 9 kroków z pauzą i wznowieniem, zaproszenia e-mail (lub link bez SMTP), role owner/admin/agent/marketing/viewer egzekwowane na serwerze i w RLS, limit miejsc, dezaktywacja, przekazanie własności | E2E 12/12 (w tym nowy `team.spec.ts`) |
| 4. Połączone konta i publikacja | Zrobione w kodzie: OAuth Meta/LinkedIn (state, PKCE opcjonalnie), tokeny szyfrowane tylko po stronie serwera, wybór stron, statusy kont, kreator publikacji z regułami platform, akceptacja, kolejka z ochroną przed duplikatami, sprawdzanie statusu, mapowanie błędów, kalendarz z konfliktami. **Prawdziwe konta: wymaga kluczy i App Review** (docs/SOCIAL_SETUP.md). TikTok: niedostępny (audyt). | integracyjne publishing 17/17, E2E publishing 1/1 (na symulatorze kontraktu API, oznaczonym w UI) |
| 5. Import ofert i CRM | Zrobione: wspólny model ofert dla wszystkich źródeł, import CSV/XML/JSON z pliku (mapowanie, podgląd, walidacja, duplikaty po numerze CRM i „odcisku” oferty, wybór wierszy, raport CSV), autoryzowane feedy XML/JSON (Basic/Bearer, szyfrowane), adaptery ASARI Site API i EstiCRM EstiAPI (oficjalna dokumentacja, bez scrapingu), synchronizacja wykrywająca zmiany ceny, statusu, opisu, parametrów i zdjęć; zmiany stosowane dopiero po decyzji użytkownika; zmiana ceny oznacza materiały jako nieaktualne i (opcjonalnie) cofa zaplanowane publikacje do akceptacji; zdjęcia pobierane w tle. Bezpieczne pobieranie URL (`src/lib/net/safe-fetch.ts`: blokada adresów prywatnych i lokalnych, kontrola DNS i przekierowań, limity czasu i rozmiaru), do ponownego użycia w etapie 4. **Prawdziwe konta ASARI/EstiCRM: wymaga danych dostępowych biura; nazwy pól z dokumentacji, do weryfikacji przy pierwszym imporcie** (docs/CRM_IMPORT.md). | unit 149/149 (w tym 50 nowych), integracyjne import 15/15, E2E import 1/1 (na symulatorze kontraktu CRM) |
| 6. Analityka i leady | Zrobione: statystyki postów wyłącznie z oficjalnych API (Facebook post insights, Instagram media insights, LinkedIn `organizationalEntityShareStatistics`), migawki w `publication_metrics`, odświeżanie w tle co 6 h; metryka niedostępna = „Brak danych”, nigdy 0 (profil LinkedIn członka nie ma API statystyk, oznaczone). Własne pomiary: linki śledzące z UTM (`/l/…`, kliknięcia bez IP, boty i podglądy linków odfiltrowane), publiczna strona oferty włączana świadomie (`/o/…`, noindex), formularz zapytania z wymaganą zgodą RODO (treść i wersja zgody zapisane jako dowód, honeypot, limit 5/h), zapytania przypisane do agenta oferty, widoczność według ról w RLS, statusy i notatki z historią. Panel Analityka (KPI, wykres tygodniowy, kanały, kampanie, publikacje), raport PDF, wnioski AI z rozdzieleniem obserwacji, hipotez i rekomendacji (co / dlaczego / dane / działanie / miernik) i automatycznym odrzucaniem zdań z liczbami spoza raportu. **Prawdziwe statystyki: wymaga App Review Meta (`read_insights`, `instagram_manage_insights`) i LinkedIn Community Management API**; bez `ANTHROPIC_API_KEY` wnioski są oznaczoną treścią testową. | unit 164/164 (15 nowych), integracyjne analytics 14/14 (łącznie 81/81), E2E analytics 1/1 (statystyki postów z symulatora) |
| 7. Panel administratora i koszty | Zrobione: osobna przestrzeń `/admin` (dla innych użytkowników 404), dostęp tylko z tabeli `platform_admins` nadawanej z CLI (`npm run admin:grant`), role administrator / podgląd sprawdzane na serwerze. Przegląd: biura, subskrypcje według statusu, MRR według cennika, okresy próbne, aktywacja nowych biur, wywołania AI i tokeny, filmy i czas renderowania, miejsce na pliki; lista biur (liczby i metadane, bez treści materiałów i danych klientów); przyznawanie okresu próbnego z powodem (blokada dla aktywnej subskrypcji Stripe); edycja planów z powodem i zapisem różnic; błędy integracji, konta social wymagające uwagi, kolejka zadań, zadania nieudane i zawieszone. Dziennik działań tylko do dopisywania (baza blokuje edycję i usuwanie), obejmuje też otwarcie karty biura. Koszty: szacunki według stawek wpisanych przez administratora (AI za 1 mln tokenów per model, minuta renderowania, GB miesięcznie), na biuro, plan i operację; brak stawki = „nieznane”, nie zero. Miesięczne budżety bezpieczeństwa AI i renderowania sprawdzane przed każdą płatną operacją, po przekroczeniu operacje wstrzymane z komunikatem i wpisem w błędach. **Wymaga konfiguracji: stawki według faktur dostawców, budżety, COST_CURRENCY.** | unit 170/170 (6 nowych), integracyjne admin 6/6, E2E admin 1/1 |
| 8. Strona sprzedażowa, prywatność, wdrożenie | Zrobione: strona `/` (hero, problemy, 5 kroków, prawdziwe zrzuty ekranu z środowiska testowego z podpisem, cennik z tabeli `plans`, FAQ, kontakt, SEO, Open Graph, `robots.txt`, `sitemap.xml`), bez opinii klientów i statystyk. Formularz kontaktowy z wymaganą zgodą, honeypotem i limitem 3/h (wiadomości w panelu admina). Statystyki strony tylko po zgodzie (cookie pierwszej strony, sprawdzane na serwerze, boty odrzucane). Regulamin i polityka prywatności jako **projekty z banerem i miejscami [DO UZUPEŁNIENIA]**, do zatwierdzenia przez prawnika. Retencja automatyczna (`run_retention()`, co 6 h), eksport danych użytkownika (rozszerzony o kampanie, publikacje, zapytania, linki; bez tokenów i sekretów), procedura usunięcia konta, dokumentacja: `docs/DEPLOYMENT.md` (wdrożenie, kopie, odtwarzanie), `docs/INTEGRATIONS_APPROVAL.md`, `docs/PRIVACY_RETENTION.md` (struktura RODO, prawa do mediów; nie jest weryfikacją prawną). | integracyjne site 4/4 (łącznie 92/92), E2E site 1/1 i telefon 1/1 (łącznie 18/18), build ✅ |

Etap 3 wymaga konfiguracji: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `plans.stripe_price_id`, `TOKEN_ENCRYPTION_KEY`, `APP_SIGNING_SECRET`, `SMTP_*`. Bez nich funkcje pokazują komunikat „wymaga konfiguracji” zamiast udawać działanie.

Raport testów z kryteriami akceptacji 1–20: `docs/TEST_REPORT.md`. Wdrożenie: `docs/DEPLOYMENT.md`. Integracje do zatwierdzenia: `docs/INTEGRATIONS_APPROVAL.md`.

### Tabela końcowa etapu 3

| Funkcja | Zaimplementowana | Przetestowana | Wymaga konfiguracji | Ograniczenia |
|---|---|---|---|---|
| Subskrypcje Stripe (Checkout, Portal, webhook) | Tak | Webhooki: tak (symulacja podpisanych zdarzeń). Zakup: **nie** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `price_…` w planach | Zakup nie był wykonany nawet w trybie testowym (brak kluczy). VAT i faktury do ustalenia |
| Plany i limity (serwer, baza) | Tak | Tak (integracyjne) | Nie | Ceny planów do decyzji biznesowej |
| Konta wieloosobowe i role | Tak | Tak (E2E + RLS) | SMTP dla e-maili (bez niego link do skopiowania) | |
| Onboarding | Tak | Tak (E2E) | Nie | |
| Połączenie Meta (FB/IG) i LinkedIn | Tak (OAuth, szyfrowane tokeny) | Tylko na symulatorze kontraktu | Aplikacje Meta/LinkedIn, App Review, Business Verification | Nie sprawdzone z prawdziwą platformą. TikTok: niedostępny |
| Planowanie i kolejka publikacji | Tak | Tak (termin, akceptacja, duplikaty, błędy; symulator) | Nie | |
| Rzeczywiste publikowanie | Tak w kodzie (oficjalne API) | Tylko na symulatorze | Jak wyżej | Status „opublikowane” wyłącznie po identyfikatorze z platformy |
| Import CSV/XML/JSON i feedy | Tak | Tak | Nie | |
| ASARI, EstiCRM | Tak (oficjalne API) | Na symulatorze kontraktu | Dane dostępowe biura | Nazwy pól do weryfikacji przy pierwszym prawdziwym imporcie |
| Analityka: linki, strona oferty, zapytania | Tak | Tak (prawdziwe zdarzenia w lokalnym środowisku) | Nie | |
| Statystyki postów z platform | Tak (oficjalne API) | Tylko na symulatorze | Uprawnienia insights po App Review | LinkedIn profil prywatny: brak API, oznaczone „Brak danych” |
| Wnioski AI i raport PDF | Tak | Tak (dostawca offline, oznaczony) | `ANTHROPIC_API_KEY` | Jakość prawdziwego modelu nieoceniona |
| Panel administratora i dziennik działań | Tak | Tak (E2E + integracyjne) | `npm run admin:grant` | Bez dostępu do treści klientów; dostęp wyjątkowy wymaga procedury organizacyjnej |
| Monitoring kosztów i budżety | Tak | Tak | Stawki dostawców, budżety, `COST_CURRENCY` | Koszty to szacunki ze stawek, nie faktury |
| Strona sprzedażowa, kontakt, zgoda na statystyki | Tak | Tak (E2E + integracyjne) | `CONTACT_EMAIL`, SMTP | |
| Regulamin, polityka prywatności | Projekty | Nie dotyczy | Uzupełnienie i zatwierdzenie przez prawnika | Nie są zweryfikowaną obsługą prawną |
| Retencja, eksport, usunięcie konta | Tak | Retencja i eksport: tak | Nie | |
| Kopie zapasowe i odtwarzanie | Procedura | Nie (brak projektu produkcyjnego) | PITR, `pg_dump` w Supabase Cloud | |
| Wersja na telefon | Tak | Tak (E2E 390×844) | Nie | Tylko Chromium |

---

# Etap 2 (stan zamknięcia)

Stan na 2026-10-13. Ten plik mówi, co naprawdę działa, co wymaga konfiguracji i czego jeszcze nie ma. Etap 2 rozwija aplikację z etapu 1 (te same konta, biura, marka, dane i RLS); nic nie zostało przepisane od zera.

## Podsumowanie

**Jedna nieruchomość → kompletna kampania.** Kreator kampanii tworzy w tle (kolejka zadań ze statusami i ponowieniami):
- post na Instagram i Facebook,
- karuzelę (6 slajdów) i 3 Stories,
- Reels MP4 (scenariusz do akceptacji, potem render),
- opis do wideo,
- nagłówki reklamowe i teksty Meta Ads,
- broszurę PDF,
- harmonogram publikacji w planerze.

Wszystkie materiały wychodzą z jednego briefu AI Marketing Directora i z danych oferty. Każdy ma podgląd, edytor, wersje i pobieranie.

Nowe moduły:
- **Campaign Studio** z 6 celami.
- **AI Marketing Director:** strukturalny brief, wersjonowane instrukcje, kontrola faktów, brandingu i celu.
- **Graphic Studio:**
  - 12 szablonów w 6 kategoriach,
  - edytor na płótnie,
  - eksport PNG, JPG, PDF i ZIP.
- **Broszury PDF** w 4 wariantach.
- **Video Studio:**
  - Remotion, 1080×1920, 30 kl./s, MP4,
  - 5 stylów i 4 długości,
  - podgląd na żywo,
  - muzyka tylko z potwierdzeniem praw.
- **Planer:**
  - widoki miesiąc, tydzień, lista i plany,
  - generator 7/14/30 dni,
  - przeciąganie, statusy, ręczne oznaczanie publikacji.

**Testy:**
- TypeScript strict,
- 99 testów jednostkowych,
- 21 testów RLS,
- 11 scenariuszy E2E, w tym kryteria 1–14 etapu 2 i regresja etapu 1,
- build produkcyjny.

Szczegóły w `docs/TEST_REPORT.md`.

**Najważniejsze zastrzeżenia:**
1. AI działało wyłącznie na deterministycznym dostawcy offline (brak `ANTHROPIC_API_KEY` w środowisku budowy). Teksty w testach są mechaniczne.
2. Render wideo działa i jest przetestowany lokalnie. Na produkcji wymaga serwera z Chromium i licencji firmowej Remotion (patrz niżej).

## Wymaga konfiguracji

| Funkcja | Czego potrzeba | Bez tego |
| --- | --- | --- |
| Teksty, briefy, scenariusze wideo z AI | `ANTHROPIC_API_KEY` na serwerze | Komunikat „Generowanie AI nie jest skonfigurowane…”: kampanie i nowe scenariusze się nie uruchomią; edycja, PDF, render zatwierdzonych wideo i eksport działają |
| **Render MP4 (Video Studio)** ⚠️ | Serwer Node 22 (nie serverless) z zapisywalnym dyskiem, Chromium headless shell (`REMOTION_BROWSER_EXECUTABLE` lub `npx remotion browser ensure`), worker `JOB_WORKER=inline` | Zadanie renderu kończy się błędem „Serwer renderujący nie ma przeglądarki…”; podgląd w przeglądarce działa |
| **Licencja Remotion** ⚠️ | Licencja firmowa dla firm > 3 osób (`REMOTION_LICENSE_KEY`), sprawdzenie warunków dla SaaS: https://www.remotion.pro/license | Ryzyko prawne przy komercyjnym użyciu |
| Kolejka zadań (kampanie, render) | `SUPABASE_SERVICE_ROLE_KEY` (worker działa jako rola serwisowa) | Komunikat „Generowanie w tle nie jest skonfigurowane na serwerze…” |
| Podgląd stron broszur jako obrazy | `pdftoppm` (pakiet `poppler-utils`) | Edytor pokazuje PDF w ramce przeglądarki; pobieranie działa |
| Pliki (zdjęcia, MP4, muzyka) | Supabase Storage: migracje ustawiają bucket (100 MB, typy MP4/PDF/audio). Sterownik niesprawdzony na żywo | Lokalnie `STORAGE_DRIVER=local` |
| Konta, dane | Projekt Supabase, wszystkie migracje z `supabase/migrations` | Aplikacja nie wystartuje |
| Publikacja automatyczna w social media | **Niezaimplementowana.** Planer oznacza publikację ręcznie; tabela ma pola pod przyszłe integracje | Użytkownik publikuje sam i oznacza status |
| Płatności | Stripe lub Przelewy24 (etap 3) | Limity generowań i renderów ustawiane w `workspace_subscriptions` |

## Kryteria akceptacji etapu 2

| # | Kryterium | Stan |
| --- | --- | --- |
| 1 | Logowanie | ✅ |
| 2 | Nieruchomość | ✅ |
| 3 | Kampania | ✅* |
| 4 | Spójne posty | ✅* |
| 5 | Karuzela | ✅ |
| 6 | Edycja i pobranie karuzeli | ✅ |
| 7 | PDF | ✅ |
| 8 | Reels MP4 | ✅ (lokalny render) |
| 9 | Biblioteka | ✅ |
| 10 | Kalendarz | ✅ |
| 11 | Edycja po ponownym logowaniu | ✅ |
| 12 | Branding | ✅ |
| 13 | Czytelny błąd | ✅ |
| 14 | Izolacja biur | ✅ |

\* Na dostawcy offline; z Claude po dodaniu klucza wymagany przegląd jakości. Dowody (co dokładnie sprawdza każdy test): `docs/TEST_REPORT.md`.

## Co zostało zbudowane

**Faza 1, audyt.** Przegląd kodu etapu 1, schematu i testów; plan rozszerzeń bez łamania istniejących funkcji. W etapie 2 nie było nowych załączników. Archiwa z etapu 1 są opisane w `docs/SKILLS_AUDIT.md`. Z „Motion-Graphics-starter-kit” nic nie zostało użyte: pakiet nie ma licencji, a jego prompty instalują oprogramowanie. Wideo powstało w Remotion zgodnie z briefem, a muzyka i efekty z kitu nie są dołączane.

**Faza 2, architektura i zadania.**
- Migracja `20261013000100_campaigns_jobs.sql`: 9 tabel z RLS, funkcje kolejki (`claim`, `retry`, `cancel`), limity renderów i równoległości.
- Worker w procesie serwera (`instrumentation.ts`):
  - postęp 0–100,
  - automatyczne ponowienia tylko błędów przejściowych,
  - ręczne ponowienie (maks. 5) i anulowanie,
  - deduplikacja,
  - odzyskiwanie po awarii.

**Faza 3, generator i dyrektor.**
- Kampania jest wyceniana i liczona w limicie przed startem.
- Brief zawiera argumenty z dowodem w danych, a jego instrukcje mają wersję.
- Każdy materiał korzysta z briefu.
- Kontrola jakości kampanii obejmuje fakty, cel, branding i spójność.
- Kompetencje: dyrektor kampanii i 6 celów.

**Faza 4, Graphic Studio.**
- 12 szablonów: Luxury, Minimalist, Corporate, Editorial, Modern Architecture, Bold Social Media.
- Inteligentna kompozycja:
  - dopasowanie tekstu,
  - kadr według istotnego obszaru zdjęcia,
  - dobór szablonu do celu kampanii.
- Edytor:
  - zaznaczanie na podglądzie, przeciąganie, skalowanie, edycja tekstu w miejscu,
  - font i kolor elementu,
  - kadr i powiększenie zdjęcia, zamiana zdjęcia,
  - ukrywanie elementów,
  - kolejność i duplikowanie slajdów,
  - logo,
  - cofnij/ponów, zapis wersji,
  - szablony biura.
- Eksport PNG/JPG (slajd), PDF (wszystkie slajdy) i ZIP (PNG lub JPG), z historią eksportu.

**Faza 5, PDF.**
- Warianty: karta oferty, broszura premium, katalog 2–12 ofert, prezentacja dla klienta.
- Dane zawsze z bazy, styl marki, polskie znaki (fonty TTF z kontrolą glifów).
- Teksty się nie ucinają: najpierw mniejsza czcionka, potem skrót na granicy zdania z ostrzeżeniem, długi opis przechodzi na kolejne strony.
- Etykiety wizualizacji, klauzula, że oferta nie jest ofertą w rozumieniu art. 66 KC.

**Faza 6, Video Studio.**
- Przepływ: nieruchomość → zdjęcia → styl → długość → scenariusz AI → akceptacja → render w kolejce → podgląd → edycja tekstów, kolejności scen, zdjęć i ruchu kamery → pobranie.
- Animacje:
  - słowa pojawiające się zależnie od stylu,
  - Ken Burns i paralaksa,
  - przejścia,
  - paski scen,
  - cena „wjeżdżająca” znak po znaku i kolejno pojawiające się parametry,
  - plansza końcowa z logo, CTA i kontaktem.
- Strefy bezpieczne TikToka i Instagrama.
- Muzyka opcjonalna: tylko własne lub licencjonowane pliki biura, z potwierdzeniem praw.
- Historia renderów.

**Faza 7, Planer.**
- Widoki: miesiąc, tydzień, lista, plany kampanii.
- Generator 7/14/30 dni: częstotliwość, kanały, przypisanie materiałów z kampanii lub oferty, puste terminy oznaczone jako pomysły.
- Przeciąganie między dniami, edycja wpisu, przypisanie materiału.
- 5 statusów: Pomysł, W przygotowaniu, Do zatwierdzenia, Gotowe, Opublikowane.
- „Oznacz jako opublikowane” z linkiem do posta.
- Strefa czasowa Europe/Warsaw.

**Faza 8, testy i dokumentacja.**
- Test akceptacyjny kryteriów 1–13.
- Izolacja etapu 2 (E2E i RLS).
- Symulacja błędu AI w dostawcy testowym (znacznik `[TEST:AI_FAIL]`; nie działa przy prawdziwym modelu).
- Dokumentacja: README, ARCHITECTURE, TEST_REPORT, ROADMAP i ten plik.

## Znane ograniczenia (stan faktyczny)

- **AI na prawdziwym modelu nie było uruchomione** (tak jak w etapie 1). Prompty dyrektora, schematy JSON i scenariusze są gotowe, ale ich jakość trzeba ocenić z kluczem.
- **Render wideo** był testowany na jednej maszynie (film 10–15 s w ok. 35–60 s). Nie było testu obciążeniowego. Przy wielu biurach potrzebny jest osobny serwer renderujący (`JOB_WORKER=off` na serwerach web).
- **Podgląd wideo w przeglądarce** ładuje zdjęcia w pełnej rozdzielczości. Przy wolnym łączu pierwsze odtworzenie może się buforować.
- **Supabase Storage i Supabase Cloud** nadal niesprawdzone na żywo (testy: sterownik dyskowy, lokalny PostgreSQL).
- **Brak automatycznej publikacji** w social media. Planer niczego nie wysyła; pola integracji są przygotowane.
- **Brak biblioteki muzyki.** Biuro dodaje własne pliki. Aplikacja nie weryfikuje praw autorskich, tylko wymaga ich potwierdzenia i zapisuje datę oraz źródło licencji.
- **Edytor grafik:** nie ma wyrównywania do siatki ani wielokrotnego zaznaczenia; elementy przesuwa się pojedynczo.
- **Planer:** przeciąganie działa na myszce i touchpadzie (HTML5 drag and drop). Na ekranach dotykowych datę zmienia się w oknie wpisu.
- **Pierwszy render po wdrożeniu** buduje bundle Remotion (dodatkowe ok. 30–40 s). Kolejne korzystają z cache w `.remotion-bundle/`.
- Nadal z etapu 1: brak zaproszeń do zespołu, płatności i zmiany e-maila; wyszukiwanie w bibliotece tylko po tytule.

## Jak uruchomić i sprawdzić

Instrukcja w `README.md` (sekcje „Video Studio: konfiguracja” i „Broszury PDF: podgląd”). Wyniki testów są w `docs/TEST_REPORT.md`, architektura w `docs/ARCHITECTURE.md`, plan w `docs/ROADMAP.md`.
