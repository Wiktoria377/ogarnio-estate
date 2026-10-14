# Konfiguracja funkcji etapu 4

Etap 4 nie dodaje nowych zmiennych środowiskowych ani usług zewnętrznych. Korzysta z konfiguracji etapów 1–3 (`docs/DEPLOYMENT.md`) i z kilku narzędzi systemowych na serwerze.

## 1. Migracje

Zastosuj po kolei wszystkie pliki z `supabase/migrations` (w Supabase Cloud: `supabase db push` albo SQL Editor). Etap 4 dodaje:

| Plik | Co dodaje |
| --- | --- |
| `20261015000100_brand_intelligence.sql` | analizy stron (`brand_analyses`), materiały referencyjne, wersje profilu marki, zatwierdzanie i przywracanie |
| `20261015000200_brand_memory.sql` | pamięć marki (`brand_memory`), decyzje (`brand_feedback_events`), retencja |
| `20261015000300_marketing_strategy.sql` | strategie AI Marketing Director (`marketing_strategies`), `process_id` w `ai_usage_events` |
| `20261015000400_creative_engine.sql` | analiza zdjęć (`property_photos.analysis`) |
| `20261015000500_quality_assurance.sql` | raport kontroli jakości przy materiale (`content_items.qa`) |
| `20261015000600_campaign_autopilot.sql` | plany i kolejka akceptacji (`autopilot_runs`, `autopilot_items`), rodzaj zadania `autopilot_item` |
| `20261015000700_recommendations.sql` | decyzje o rekomendacjach (`recommendation_states`) |

Każda nowa tabela ma RLS. Zapisy, które muszą przejść przez kontrolę serwera (raporty jakości, strategie, kolejka autopilota, rekomendacje, sugestie pamięci), mają tylko politykę odczytu dla członków biura.

## 2. Zmienne środowiskowe (bez zmian, ale wymagane przez etap 4)

| Zmienna | Do czego w etapie 4 | Bez niej |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | ton i grupy odbiorców w analizie marki, strategia, teksty i grafiki autopilota, warianty | komunikat „Generowanie AI nie jest skonfigurowane”. Plan autopilota, kontrola jakości, analiza zdjęć i rekomendacje działają bez AI. |
| `AI_MODEL`, `AI_REVIEW_MODEL` | modele generowania i recenzji (wersja zapisywana przy materiale) | wartości domyślne |
| `SUPABASE_SERVICE_ROLE_KEY` + `JOB_WORKER=inline` (albo `JOB_TICK_SECRET` z cronem) | kolejka zadań: analiza strony, materiały autopilota | „Generowanie w tle nie jest skonfigurowane na serwerze” |
| `AI_TEST_PROVIDER=1` | **tylko testy**: deterministyczne teksty bez klucza, oznaczone w interfejsie | serwer produkcyjny odrzuca to ustawienie |

## 3. Narzędzia na serwerze

| Narzędzie | Pakiet | Do czego | Bez niego |
| --- | --- | --- | --- |
| `pdftotext` | `poppler-utils` | tekst z PDF dodanych jako materiały referencyjne marki | PDF jest odrzucany z komunikatem; posty i opisy działają |
| `ffprobe` (i `ffmpeg`) | `ffmpeg` | kontrola jakości gotowego MP4: kodek, rozdzielczość, kl./s, długość, audio, faststart | kontrola wideo sprawdza tylko projekt (napisy, sceny, zdjęcia), bez parametrów pliku; błąd trafia do dziennika serwera |
| `sharp` | zależność npm | analiza zdjęć, pomiar kontrastu na wyrenderowanych grafikach | wymagane (instalowane z `npm ci`) |

## 4. Supabase: limit wierszy API

Supabase Cloud zwraca maksymalnie 1000 wierszy na zapytanie (Settings → API → Max rows). Odczyty, które liczą dane całego biura (analityka, strategia, rekomendacje, import CRM, panel administratora), czytają dane stronami (`src/lib/supabase/fetch-all.ts`), więc działają przy dowolnej wartości tego limitu. Nie trzeba go zmieniać. Lokalny stos testowy ustawia ten sam limit (`scripts/local-stack/postgrest.conf.example`, `db-max-rows = 1000`).

## 5. Analiza strony biura (Brand Intelligence)

- Bot przedstawia się jako `OgarnioEstateBot` z adresem strony informacyjnej `/bot`. Respektuje `robots.txt`, nie omija logowania (401/403), pobiera do 5 podstron tej samej domeny.
- Serwer musi mieć wyjście HTTPS do stron biur. Adresy prywatne i lokalne są blokowane (ochrona SSRF). Tylko poza produkcją można dopuścić host testowy przez `SAFE_FETCH_ALLOW_HOSTS` (tak testy łączą się z `tests/mocks/brand-site.mjs`); przy `NODE_ENV=production` to ustawienie jest ignorowane.
- Zgoda użytkownika i jej treść są zapisywane przy każdej analizie.

## 6. Koszty AI

- Każde wywołanie AI ma `process_type` i `process_id` (strategia, warianty, plan autopilota), więc koszt widać przy procesie i w panelu administratora.
- Kwoty pojawią się po wpisaniu stawek w panelu administratora (`/admin`, Koszty). Bez stawek panel pokazuje tokeny i „nieznane” zamiast zera.
- Autopilot ma limit generowań na plan (0–40) i korzysta z miesięcznego limitu biura oraz budżetu bezpieczeństwa platformy.

## 7. Uruchomienie lokalne i testy

```bash
bash scripts/local-stack/start.sh              # Postgres, auth, PostgREST, bramka, SMTP
npx next dev -p 3000                           # z AI_TEST_PROVIDER=1 w .env.local
node tests/mocks/social-api.mjs                # symulator Meta/LinkedIn (:4010)
node tests/mocks/crm-api.mjs                   # symulator CRM (:4020)
node tests/mocks/brand-site.mjs                # strona testowa biura (:4030)
npm test                                       # jednostkowe
npm run test:integration                       # integracyjne (wymagają działającej aplikacji)
npm run test:e2e                               # przeglądarka
```
