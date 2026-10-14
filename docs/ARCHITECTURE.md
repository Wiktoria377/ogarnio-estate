# Architektura OGARNIO ESTATE (etapy 1 i 2)

## Warstwy

```
Przeglądarka (React 19, komponenty klienckie)
   │  formularze → Server Actions        │  fetch → /api/* (Route Handlers)
   ▼                                      ▼
Next.js 16 (serwer)
   proxy.ts            odświeżenie sesji Supabase, blokada tras prywatnych
   src/lib/session     authorize(member|editor|admin): użytkownik + aktywne biuro + rola
   src/lib/ai          guardAiUsage (limit minutowy i miesięczny), MeteredProvider (log zużycia)
   src/core/*          silniki bez zależności od Next.js i branży
   src/verticals/real-estate   wiedza branżowa (rodzaje treści, fakty oferty, etykiety)
   ▼
Supabase: Auth (GoTrue) · Postgres + RLS · Storage (bucket prywatny workspace-files)
Anthropic Claude API (tylko z serwera)
```

Zasada: logika domenowa nie zna HTTP ani Supabase. `core/marketing-engine` dostaje gotowe fakty, markę i dostawcę LLM, a zwraca warianty z raportem jakości. Dzięki temu silnik jest testowany jednostkowo bez sieci (`tests/unit/engine.test.ts`) i da się go użyć dla innej branży, podmieniając `verticals/`.

## Moduły

| Moduł | Kod | Uwagi |
| --- | --- | --- |
| A. Auth i biura | `src/app/(auth)`, `src/app/auth`, `src/app/onboarding`, `src/app/workspace-actions.ts` | Rejestracja z potwierdzeniem e-mail (PKCE), logowanie, reset hasła bez ujawniania, czy konto istnieje, wylogowanie tylko POST. Biuro tworzy funkcja `create_workspace` (limit 5 biur na właściciela). Przełącznik biur trzyma wybór w ciasteczku, które serwer zawsze weryfikuje z członkostwem |
| B. Pulpit | `src/app/(app)/dashboard` | Powitanie, logo i nazwa biura, CTA, szybkie akcje, liczniki, ostatnie materiały i oferty, skróty |
| C. Brand Studio | `src/app/(app)/brand`, `src/components/brand`, `src/core/brand` | Logo, 5 kolorów, fonty z kuratorowanej listy (15 rodzin z pełnym zestawem polskich znaków), kontakt, social media, slogan, charakter, grupa docelowa, styl komunikacji, forma zwracania się, 5 stylów marki, zdjęcia referencyjne |
| D. Nieruchomości | `src/app/(app)/properties`, `src/components/properties`, `src/verticals/real-estate/property.ts` | Wszystkie pola oferty, do 40 zdjęć z kolejnością (drag and drop), okładką, opisem i flagą „wizualizacja”. Karta oferty z panelem generowania |
| E. Studio treści | `src/app/(app)/studio`, `src/components/studio`, `src/core/marketing-engine` | Kreator 4 kroków, 40 rodzajów treści w 4 grupach, warianty, 8 akcji poprawek, edycja ręczna, wersje, eksport |
| F. Studio grafik | `src/app/(app)/graphics`, `src/components/graphics`, `src/core/graphics` | 4 formaty, 6 szablonów, 5 typów slajdów, teksty z AI tylko w polach kreatywnych, podgląd na żywo, PNG 1080 px i ZIP |
| G. Biblioteka | `src/app/(app)/library` | Siatka i lista, filtry (rodzaj, grupa, status, oferta), wyszukiwanie, statusy, kopiowanie, eksport, duplikowanie, usuwanie |
| Kompetencje | `skills/`, `src/core/marketing-engine/skills`, `src/app/(app)/skills` | 71 plików Markdown z walidowanym frontmatter, selektor i kompozytor |
| Ustawienia | `src/app/(app)/settings`, `src/app/api/account/export` | Profil, hasło, nazwa biura, zespół, plan i zużycie AI, eksport danych, usunięcie biura i konta |

## Przepływ generowania tekstu

1. `POST /api/ai/generate` (sprawdzenie pochodzenia żądania, sesji i roli `editor`).
2. Walidacja żądania (`generationRequestSchema`, zod) i `guardAiUsage`: maks. N wywołań na użytkownika na minutę oraz miesięczny limit biura (`ai_quota_status`). Odmowy też trafiają do `ai_usage_events`.
3. `buildTaskInput`: rodzaj treści, platforma, fakty oferty (`propertyFactSheet`, tylko pola wypełnione w bazie), odbiorca.
4. Wybór kompetencji (`selectSkills`):
   - punktacja według zadania, grupy, rodzaju treści, platformy, celu, stylu marki i tagów,
   - zasady nadrzędne i kompetencja stylu marki są zawsze dołączane,
   - pozostałe w ramach budżetu tokenów, a grupy wykluczające zostawiają jedną kompetencję.
5. Kompozycja promptu systemowego w kolejności warstw: zasady nadrzędne, marka, strategia, branża, format, technika, kontrola. Dane użytkownika i oferty trafiają do promptu w tagach jako dane, nie polecenia (`fence()` zamienia znaki `<` i `>`, więc dane nie mogą zamknąć ani otworzyć tagu).
6. Wywołanie Claude z wymuszonym schematem JSON (`output_config.format` json_schema). Model główny `AI_MODEL`, recenzja `AI_REVIEW_MODEL`.
7. `normalizeVariant`, potem kontrola jakości dla każdego wariantu:
   - reguły deterministyczne (`quality/rules.ts`): liczby spoza faktów, metraże i ceny niezgodne z ofertą, obietnice zysku i „gwarancje”, klisze, forma Ty/Pan, schematyczne hooki, myślniki w krótkich formach,
   - recenzja AI w 9 kategoriach (`quality/review.ts`),
   - wynik 0–100 i lista uwag.
8. Krytyczne uwagi uruchamiają jedną automatyczną poprawkę („usuń, nie dopisuj”) i ponowną kontrolę.
9. Zapis: `content_items` + `add_content_version` (funkcja w bazie, atomowo dopisuje wersję i przesuwa wskaźnik). Wersje są tylko do dopisywania; RLS nie ma polityk UPDATE/DELETE dla `content_versions`.

Poprawki (`/api/ai/refine`) i dodatkowe warianty (`/api/ai/variants`) przechodzą tę samą kontrolę. Edycja ręczna przechodzi tylko reguły deterministyczne (bez kosztu AI).

## Grafiki

- Projekt grafiki to dane JSON (`graphicDesignSchema`): format, szablon, slajdy (rodzaj, zdjęcia, teksty), nadpisania kolorów i fontów, logo, oznaczanie wizualizacji, opis posta. Każda wersja w bibliotece da się otworzyć i edytować.
- Pola tekstowe mają źródło: `fact` (z oferty i marki, deterministycznie w `verticals/real-estate/graphics.ts`) albo `ai`. AI dostaje tylko listę pól `ai`; ceny, metraże i kontakt nigdy nie przechodzą przez model. Po odpowiedzi liczby w tekstach AI są sprawdzane względem faktów, a teksty przycinane do limitów pól.
- Render: szablony SVG (`templates.ts`), tekst jako ścieżki wektorowe z wbudowanych fontów (opentype.js), więc pomiar szerokości jest dokładny. `fitText` zmniejsza czcionkę do minimum, a potem skraca wielokropkiem i zgłasza ostrzeżenie. `layoutColumn` układa bloki jeden pod drugim według zmierzonych wysokości, więc teksty się nie nakładają.
- Zdjęcia są tylko kadrowane (sharp, `position: attention`), nigdy modyfikowane przez AI. Zdjęcie oznaczone w ofercie jako wizualizacja dostaje widoczną etykietę „Wizualizacja”.
- PNG: resvg, bez fontów systemowych. Podgląd na żywo i eksport używają tego samego kodu. Eksport pobiera zapisany projekt, ZIP pakuje fflate.

## Bezpieczeństwo

- **Izolacja biur:** każda tabela z danymi ma `workspace_id` i polityki RLS oparte o `is_workspace_member` / `has_workspace_role` (funkcje SECURITY DEFINER bez rekurencji). Klucze obce złożone `(id, workspace_id)` uniemożliwiają podpięcie zdjęcia lub wersji do obiektu z innego biura. Sprawdzone testem `tests/integration/rls.test.ts` (17 przypadków) i E2E `tests/e2e/isolation.spec.ts`.
- **Role:** owner, admin, agent (edycja), viewer (podgląd). Sprawdzane w RLS i w `authorize()`.
- **Pliki:** klucze `<workspace>/<obszar>/<uuid>.<ext>` walidowane wyrażeniem regularnym (`assertSafeKey`), pobieranie przez `/api/files/*` po sprawdzeniu członkostwa. Upload: limit 10 MB, rozpoznanie typu po bajtach, ponowne kodowanie przez sharp (usuwa EXIF, w tym GPS), limity liczby zdjęć, sprzątanie pliku przy błędzie zapisu w bazie.
- **Klucze:** `ANTHROPIC_API_KEY` i `SUPABASE_SERVICE_ROLE_KEY` tylko w modułach `server-only`. Klucz serwisowy jest używany wyłącznie do usunięcia konta, po ponownym sprawdzeniu hasła.
- **Nadużycia:** limit minutowy na użytkownika, miesięczny limit biura, limit biur na konto, limity długości pól (zod i CHECK w bazie), sprawdzanie pochodzenia żądań POST do API (`assertSameOrigin`), nagłówki bezpieczeństwa (`next.config.ts`).
- **Prompt injection:** treści od użytkownika, z oferty i z kompetencji importowanych są przekazywane jako dane w tagach; zasada nadrzędna `core/untrusted-input.md` i system prompt mówią, że polecenia w danych są ignorowane.
- **RODO:** eksport danych do JSON, usunięcie biura (wiersze kaskadowo i pliki), usunięcie konta (biura, w których użytkownik jest jedynym właścicielem, są usuwane w całości; w pozostałych zostają materiały biura bez autorstwa).

## Model danych (skrót)

`profiles` · `workspaces` · `workspace_members` · `workspace_subscriptions` (plan, limit, pola dostawcy płatności) · `brand_profiles` · `brand_assets` · `properties` · `property_photos` · `content_items` (rodzaj, status, wskaźnik bieżącej wersji) · `content_versions` (treść JSON, źródło, kompetencje, ocena jakości, model) · `ai_usage_events`.

## Dostawcy AI

`LlmProvider` ma trzy implementacje: `AnthropicProvider` (SDK `@anthropic-ai/sdk`, schemat JSON, beta zapasowego modelu po stronie serwera dla modeli, które ją obsługują), `TestProvider` (offline, deterministyczny, tylko poza produkcją) i `MeteredProvider` (opakowanie: logowanie tokenów, czasu i błędów). Błędy API są mapowane na czytelne komunikaty po polsku (`aiErrorMessage`).

---

# Etap 2: AI Creative Studio, Video Studio i automatyzacja

Etap 2 rozwija tę samą aplikację (te same konta, biura, marka, dane i RLS). Nowe moduły korzystają z istniejących warstw: `core/*` nie zna Next.js, `lib/*` łączy rdzeń z bazą i plikami, `app/*` to strony i API.

## Nowe moduły

| Moduł | Kod | Uwagi |
| --- | --- | --- |
| Campaign Studio | `src/app/(app)/campaigns`, `src/components/campaigns`, `src/lib/campaigns.ts`, `src/verticals/real-estate/campaign.ts` | Kreator: nieruchomość, 6 celów (z danymi zależnymi od celu: poprzednia cena, termin dnia otwartego), odbiorca i styl, kanały i 11 materiałów. Szacunek kosztu przed startem. Widok kampanii z postępem, podglądami, briefem i QA |
| AI Marketing Director | `src/core/marketing-engine/director.ts`, `skills/content-strategy/campaign-director.md`, `skills/real-estate/campaign-goal-*.md` | Strukturalny brief (zod): myśl przewodnia, przekaz, argumenty z dowodem w danych, CTA, ton, plan kanałów, czego unikać, braki danych. Wersja instrukcji `director-2.0.0` zapisana przy briefie i każdym zadaniu. Kontrola faktów, brandingu i celu dla każdego materiału i dla całej kampanii |
| Kolejka zadań | `src/lib/jobs/*`, `src/instrumentation.ts`, `generation_jobs` | Zadania w bazie, pobierane atomowo (`claim_generation_job`: `FOR UPDATE SKIP LOCKED`, limit równoległości na biuro). Worker działa w procesie serwera (`JOB_WORKER=inline`) i może być uruchomiony na osobnym serwerze. Statusy, postęp 0–100, automatyczne ponowienia z wykładniczym odstępem tylko dla błędów przejściowych, ręczne ponowienie (limit 5) i anulowanie przez RPC, deduplikacja (`dedupe_key`), odzyskanie zadań po awarii procesu (`p_stale_seconds`) |
| Graphic Studio | `src/core/graphics/*`, `src/components/graphics/*` | 12 szablonów w 6 kategoriach. Serwerowy renderer SVG jest jedynym źródłem prawdy: tryb JSON zwraca obraz i układ elementów, a przeglądarka rysuje nad nim zaznaczenie, uchwyty i edycję w miejscu. Nadpisania per element (przesunięcie, skala, ukrycie, kolor, font, kadr i powiększenie zdjęcia). Cofnij/ponów, duplikowanie i kolejność slajdów, szablony biura (`design_templates`). Eksport PNG, JPG, PDF (pdfkit, strona na slajd) i ZIP (PNG lub JPG) w pełnej rozdzielczości |
| Broszury PDF | `src/core/brochures/*`, `src/lib/brochures.ts`, `src/app/(app)/brochures` | 4 warianty: karta oferty, broszura premium, katalog (2–12 ofert), prezentacja dla klienta (A4 poziomo). Broszura to dane JSON; PDF jest renderowany za każdym razem z aktualnych rekordów (cena i parametry zawsze z bazy). Fonty marki TTF z kontrolą glifów (zapas: Manrope), pola tekstowe najpierw zmniejszają czcionkę, potem są skracane na granicy zdania z ostrzeżeniem, a dłuższe opisy przechodzą na kolejne strony. Podgląd stron jako PNG przez `pdftoppm` (bez niego: PDF w przeglądarce) |
| Video Studio | `src/remotion/*`, `src/core/video/*`, `src/lib/video.ts`, `scripts/render-video.mjs`, `src/app/(app)/video` | Remotion 4 (1080×1920, 30 kl./s, H.264 + AAC). Ta sama kompozycja działa w podglądzie (`@remotion/player`) i w renderze. 5 stylów, długości 10/15/20/30 s, sceny tylko z prawdziwych zdjęć oferty |
| Planer | `src/core/planner/*`, `src/app/(app)/planner`, `src/components/planner/planner.tsx` | Widoki: miesiąc, tydzień, lista i plany kampanii. Generator planu na 7/14/30 dni (częstotliwość, kanały, materiały z kampanii lub nieruchomości). Przeciąganie wpisów między dniami, edycja, statusy, ręczne oznaczenie publikacji z linkiem. Daty w strefie Europe/Warsaw |

## Przepływ kampanii

1. `POST /api/campaigns`: walidacja, limit miesięczny (cała kampania jest liczona z góry), utworzenie kampanii i zadań: `campaign_brief` oraz po jednym `campaign_asset` na materiał.
2. Worker wykonuje brief (AI Marketing Director). Zadania materiałów czekają na brief (`JobDeferred`, bez zużycia prób). Gdy brief się nie uda, materiały kończą się czytelnym błędem „Brief kampanii nie powstał…”.
3. Każdy materiał dostaje instrukcje z briefu (`briefInstructions`), więc posty, karuzela, Stories, nagłówki, Meta Ads, opis wideo, scenariusz Reels i broszura mówią to samo. Liczby pochodzą tylko z faktów oferty.
4. Harmonogram powstaje na końcu (czeka na pozostałe zadania) i tworzy plan w planerze z wpisami połączonymi z materiałami.
5. Ponowienie materiału dopisuje nową wersję do istniejącego elementu biblioteki (bez duplikatów).

## Przepływ wideo

1. Kreator: nieruchomość → zdjęcia (kolejność = sceny; brakujące uzupełnia ranking ostrości i ekspozycji, prawdziwe zdjęcia przed wizualizacjami) → styl → długość → wskazówki. AI pisze scenariusz (`video-script-1.0.0`): hak, krótkie teksty scen, CTA i opis do publikacji. Teksty są skracane do limitów słów i sprawdzane względem faktów; ceny i parametry na planszy pochodzą z rekordu, nie z AI.
2. Edytor: podgląd na żywo, edycja tekstów, kolejności scen, zdjęć i ruchu kamery, styl, długość, cena i parametry, oznaczanie wizualizacji, muzyka. Każda zmiana treści cofa akceptację scenariusza.
3. Akceptacja zapisuje wersję z `scriptApproved: true`. Dopiero wtedy `renderVideo` sprawdza miesięczny limit renderów (`render_quota_status`) i dodaje zadanie `video_render` (deduplikacja: jedno aktywne na wideo).
4. Worker (`runVideoRender`): ładuje bieżącą wersję, przygotowuje katalog zadania (zdjęcia 1296×2304 z zapasem na ruch kamery, fonty marki, logo, muzyka), uruchamia `scripts/render-video.mjs` w osobnym procesie. Skrypt serwuje pliki tylko na 127.0.0.1, buduje (i cache’uje) bundle Remotion, renderuje MP4 i kadr poglądowy, raportuje postęp liniami JSON. Limit czasu 15 minut.
5. MP4 i plakat trafiają do magazynu (`<biuro>/renders/<materiał>/<uuid>.mp4`), wiersz do `rendered_files` (zapis tylko przez worker). Odtwarzanie z obsługą zakresów bajtów (206), pobranie zapisuje się w `export_events`.

Animacje: tekst pojawiający się słowami (różnie w każdym stylu), zbliżenie, oddalenie i panoramy (Ken Burns), paralaksa z dwiema warstwami, przejścia zależne od stylu, paski postępu scen, cena „wjeżdżająca” znak po znaku, parametry jako kolejno pojawiające się etykiety, plansza końcowa z logo, CTA i kontaktem. Napisy trzymają się stref bezpiecznych TikToka i Instagrama (góra 250 px, dół 420 px, prawa krawędź 150 px).

## Nowe tabele (migracja `20261013000100_campaigns_jobs.sql`)

`campaigns` · `campaign_assets` · `generation_jobs` · `rendered_files` · `media_assets` (muzyka z potwierdzeniem praw, NOT NULL `rights_confirmed_at`) · `schedule_plans` · `schedule_entries` (statusy Pomysł → Opublikowane, pola pod przyszłe integracje: `publish_provider`, `external_post_id`, `external_url`) · `export_events` (tylko dopisywanie) · `design_templates`. Kolumny limitów w `workspace_subscriptions`: `monthly_render_limit` (domyślnie 40). Wersje materiałów (graficznych, broszur, wideo) to dalej `content_versions`.

Wszystkie tabele mają RLS. Członkowie czytają dane swojego biura; zapis wymaga roli owner/admin/agent; `rendered_files` zapisuje tylko worker (rola serwisowa); użytkownik nie może zmienić statusu zadania ani usunąć historii eksportu. Sprawdzone w `tests/integration/rls.test.ts` (sekcja „ETAP 2 tables”) i E2E `isolation.spec.ts`.

## Koszty i bezpieczeństwo

- Kampania jest wyceniana i liczona w limicie miesięcznym przed startem; zadania w tle nie podlegają limitowi minutowemu, ale ponowienia są ograniczone (`max_attempts`, `manual_retries ≤ 5`).
- Render wideo ma osobny limit miesięczny i deduplikację: jedno aktywne zadanie na wideo i jeden render naraz w biurze (`claim_generation_job`), limit równoległych zadań biura `max_parallel_jobs` oraz równoległość workera `JOB_WORKER_CONCURRENCY`.
- Muzyka: rozpoznanie typu po bajtach (MP3, M4A, WAV, AAC), maks. 15 MB, 30 utworów na biuro, wymagane potwierdzenie praw. Aplikacja nie pobiera muzyki z internetu.
- Proces renderujący dostaje wyłącznie pliki skopiowane do katalogu zadania; serwer plików w skrypcie przyjmuje tylko płaskie nazwy z białej listy rozszerzeń.

# Etap 3: SaaS, publikacja, CRM, analityka, administracja

## Nowe moduły
| Obszar | Kod | Tabele (migracja) |
|---|---|---|
| Bezpieczeństwo | `src/lib/api.ts` (origin), `src/lib/http-body.ts`, `src/lib/observability.ts` (rate limit, `app_errors`), `src/lib/crypto.ts` (AES-GCM tokenów, HMAC) | `20261014000100_security_hardening` |
| Subskrypcje i limity | `src/lib/billing/*` (Stripe, webhook z idempotencją, `consume_usage`) | `plans`, `workspace_subscriptions`, `usage_ledger`, `billing_*` (`…0200`) |
| Zespół i onboarding | `src/core/auth/permissions.ts` (macierz ról = RLS), zaproszenia | `workspace_invitations` (`…0300`) |
| Publikacja | `src/lib/social/*` (Meta, LinkedIn), `src/lib/publishing/*` (akceptacja z hashem, kolejka, sprawdzanie niepewnych wyników) | `social_*`, `oauth_*`, `publications`, `publication_*` (`…0400`) |
| Import ofert | `src/core/import/*`, `src/lib/import/*` (CSV/XML/JSON, ASARI, EstiCRM), `src/lib/net/safe-fetch.ts` (SSRF) | `property_sources`, `import_*`, `property_changes` (`…0500`) |
| Analityka i leady | `src/core/analytics/*`, `src/lib/analytics/*`, `src/lib/social/metrics.ts`, `/l/[slug]`, `/o/[slug]` | `publication_metrics`, `tracked_links`, `web_events`, `leads`, `lead_events`, `analytics_insights` (`…0600`) |
| Panel administratora i koszty | `src/lib/admin/*`, `src/core/admin/costs.ts`, `/admin/*`, `scripts/platform-admin.mjs` | `platform_admins`, `admin_audit_log`, `cost_rates`, `platform_budgets` (`…0700`) |
| Strona sprzedażowa, retencja | `src/app/page.tsx`, `src/lib/site/*`, `src/lib/retention.ts` | `contact_messages`, `site_events`, `run_retention()` (`…0800`) |

## Zasady przekrojowe
- **Uprawnienia na serwerze i w bazie.** Każda akcja serwera sprawdza rolę (`authorizePerm`), a RLS powtarza tę samą macierz. Tabele zapisywane tylko przez serwer mają odebrane `insert/update/delete` dla `anon` i `authenticated`. Tabele administracyjne nie mają żadnych polityk (tylko rola serwisowa).
- **Worker** (`src/lib/jobs/worker.ts`): kolejka `generation_jobs` z atomowym przejęciem, ponowieniami tylko dla błędów przejściowych i `dedupe_key`; w tej samej pętli: publikacje (`publishTick`), statystyki postów (`metricsTick`, co minutę po 5 postów, każdy co 6 h), retencja (co 6 h). Na serverless to samo robi `POST /api/jobs/tick`.
- **Brak danych to nie zero.** Metryki platform są `null`, gdy API ich nie zwraca; koszty bez stawki są „nieznane”; wnioski AI dostają tylko policzone fakty i są automatycznie czyszczone ze zdań z liczbami spoza raportu.
- **Zgody i pomiary własne.** Kliknięcia i odwiedziny zapisują skrót (HMAC z dzienną zmianą) zamiast IP; boty i podglądy linków są oznaczane i pomijane. Statystyki strony sprzedażowej tylko po zgodzie (cookie decyzji sprawdzane na serwerze).
- **Budżety bezpieczeństwa.** `assertBudget("ai" | "video_render")` przed każdym płatnym wywołaniem AI (`MeteredProvider`) i renderem wideo; stan liczony z `ai_usage_month()` / `render_seconds()` i stawek, pamięć podręczna 30 s.
- **Rozliczalność.** Każda zmiana w panelu administratora zapisuje wpis przed wykonaniem (błąd zapisu przerywa operację); dziennik blokuje edycję i usuwanie wyzwalaczem.

## Przepływ: link UTM → zapytanie
`/l/{slug}` zapisuje kliknięcie i przekierowuje na `/o/{public_slug}?utm_…&l={slug}` → strona oferty zapisuje odsłonę → formularz `POST /api/public/leads/{slug}` (ta sama domena, limit 16 KB, honeypot, zgoda, 5 na godzinę) → lead z UTM linku, przypisany do agenta oferty, powiadomienie e-mail bez danych osobowych → raport (`buildReport`) liczy kliknięcia, zapytania i konwersję per kanał i kampania.
