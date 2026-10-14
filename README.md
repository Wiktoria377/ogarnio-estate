# OGARNIO ESTATE

Aplikacja SaaS do marketingu biur nieruchomości. Z jednej nieruchomości powstaje kompletna kampania: posty, karuzela, Stories, Reels MP4, nagłówki i teksty Meta Ads, broszura PDF i harmonogram publikacji, wszystkie oparte na jednym briefie AI Marketing Directora i danych oferty. Do tego Brand Studio, Studio treści (40 rodzajów tekstów), Graphic Studio (12 szablonów, edytor, PNG/JPG/PDF/ZIP), Video Studio (Remotion) i Planer. Wiele biur (multi-tenant) z izolacją danych przez RLS w Postgres.

Etap 3 dodaje warstwę komercyjną: plany i subskrypcje Stripe z limitami egzekwowanymi w bazie, zespoły z rolami i zaproszeniami, kreator pierwszego uruchomienia, połączone konta Facebook/Instagram/LinkedIn z akceptacją i kolejką publikacji, import ofert (CSV/XML/JSON, ASARI, EstiCRM), analitykę (statystyki z oficjalnych API, linki UTM, strony ofert z formularzem i zgodą RODO, raport PDF, wnioski AI), panel administratora platformy z kosztami i budżetami, stronę sprzedażową oraz retencję danych.

Stack: Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, komponenty w stylu shadcn (Radix), Supabase (Auth, Postgres, Storage), Claude API przez warstwę serwerową, grafiki z szablonów SVG (resvg), PDF (pdfkit), wideo (Remotion 4), kolejka zadań w Postgres.

Dokumentacja:

| Plik | Zawartość |
| --- | --- |
| [PROJECT_STATE.md](PROJECT_STATE.md) | Co działa, co wymaga konfiguracji, znane ograniczenia |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Moduły, przepływ generowania, bezpieczeństwo, model danych |
| [docs/SKILLS_AUDIT.md](docs/SKILLS_AUDIT.md) | Inwentaryzacja i analiza wszystkich załączników |
| [docs/TEST_REPORT.md](docs/TEST_REPORT.md) | Wyniki testów, testy akceptacyjne etapu 3 (1–20), kryteria etapów 1 i 2 |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Instrukcja wdrożenia produkcyjnego, kopie zapasowe, odtwarzanie |
| [docs/INTEGRATIONS_APPROVAL.md](docs/INTEGRATIONS_APPROVAL.md) | Integracje wymagające zatwierdzenia lub konta zewnętrznego |
| [docs/PRIVACY_RETENTION.md](docs/PRIVACY_RETENTION.md) | Mapa danych, retencja, eksport, dostęp administratorów (materiał do RODO) |
| [docs/SOCIAL_SETUP.md](docs/SOCIAL_SETUP.md) | Konfiguracja Meta i LinkedIn |
| [docs/CRM_IMPORT.md](docs/CRM_IMPORT.md) | Import ofert i integracje CRM |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Kolejne etapy |

## Szybki start (Supabase Cloud)

Wymagania: Node.js 22+, konto Supabase, klucz Anthropic API.

1. **Projekt Supabase.** Utwórz projekt na supabase.com. Z *Project Settings → API* skopiuj URL, klucz `anon` i klucz `service_role`.
2. **Migracje.** Uruchom pliki z `supabase/migrations/` w kolejności nazw: w *SQL Editor* (wklej każdy plik po kolei) albo przez Supabase CLI:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   Migracja `…000500_storage.sql` tworzy prywatny bucket `workspace-files` (limit 10 MB, JPEG/PNG/WebP) i polityki dostępu według pierwszego segmentu ścieżki (id biura).
3. **Auth.** W *Authentication → URL Configuration* ustaw *Site URL* na adres aplikacji i dodaj `https://twoja-domena/auth/callback` do *Redirect URLs*. Potwierdzanie e-maili zostaw włączone. Na produkcji podłącz własny SMTP (*Authentication → Emails → SMTP*), bo wbudowany ma niskie limity.
4. **Zmienne środowiskowe.** Skopiuj `.env.example` do `.env.local` i uzupełnij:
   ```bash
   cp .env.example .env.local
   ```
   | Zmienna | Wymagana | Opis |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tak | Klient Supabase (klucz anon jest publiczny z założenia; dane chroni RLS) |
   | `SUPABASE_SERVICE_ROLE_KEY` | tak | Tylko serwer: usuwanie konta (RODO). Nigdy nie trafia do przeglądarki |
   | `NEXT_PUBLIC_SITE_URL` | tak | Adres aplikacji w linkach e-mail |
   | `ANTHROPIC_API_KEY` | do AI | Bez klucza aplikacja działa, ale generowanie jest wyłączone z czytelnym komunikatem |
   | `AI_MODEL`, `AI_REVIEW_MODEL` | nie | Domyślnie `claude-opus-5-5` (generowanie) i `claude-haiku-5-5` (kontrola jakości) |
   | `AI_USER_RATE_PER_MINUTE` | nie | Limit wywołań AI na użytkownika na minutę (domyślnie 8) |
   | `STORAGE_DRIVER` | nie | `supabase` (domyślnie, produkcja) lub `local` (dysk, tylko dev/testy) |
   | `JOB_WORKER`, `JOB_WORKER_CONCURRENCY` | nie | `inline` (domyślnie): kolejka zadań działa w procesie serwera; `off`: worker na innym serwerze. Równoległość domyślnie 2 |
   | `REMOTION_BROWSER_EXECUTABLE` | do wideo | Ścieżka do Chromium „headless shell” na serwerze renderującym (patrz „Video Studio”) |
   | `REMOTION_LICENSE_KEY` | do wideo (firmy) | Klucz licencji firmowej Remotion |
   | `REMOTION_CONCURRENCY` | nie | Liczba równolegle renderowanych klatek (domyślnie 2) |
5. **Uruchomienie.**
   ```bash
   npm install
   npm run fonts:fetch   # tylko jeśli brakuje plików w assets/fonts (są w repozytorium)
   npm run dev           # http://localhost:3000
   npm run build && npm start   # produkcja
   ```

## Video Studio: konfiguracja (WYMAGA KONFIGURACJI)

Render MP4 działa w osobnym procesie Node (`scripts/render-video.mjs`) uruchamianym przez kolejkę zadań. Potrzebne:

1. **Serwer z Node 22 i zapisywalnym dyskiem** (render nie zadziała w środowisku serverless z limitem czasu kilku sekund; Vercel Functions odpadają). Własny serwer, kontener lub osobna maszyna z `JOB_WORKER=inline`.
2. **Chromium**. Ustaw `REMOTION_BROWSER_EXECUTABLE` na „chrome-headless-shell”. Bez tej zmiennej Remotion spróbuje pobrać przeglądarkę przy pierwszym renderze (potrzebny internet). Instalacja: `npx remotion browser ensure`.
3. **Licencja Remotion.** Remotion jest darmowy dla osób prywatnych i firm do 3 osób. Firma z większym zespołem musi kupić licencję firmową (https://www.remotion.pro/license) i wpisać klucz w `REMOTION_LICENSE_KEY`. Przed komercyjnym uruchomieniem SaaS sprawdź warunki licencji dla Twojego modelu (użycie w produkcie dla klientów).
4. **Czas i zasoby.** Pierwszy render buduje bundle (ok. 30–40 s, potem cache w `.remotion-bundle/`). Film 15 s renderuje się ok. 20–60 s zależnie od CPU. Proces ma limit 15 minut.
5. **Magazyn plików.** Migracja `…campaigns_jobs.sql` podnosi limit bucketu do 100 MB i dodaje typy `video/mp4`, `application/pdf` i audio.

Muzyka: tylko pliki dodane przez biuro z potwierdzeniem praw (MP3, M4A, WAV, AAC, do 15 MB). Aplikacja nie dostarcza biblioteki muzyki.

## Broszury PDF: podgląd

PDF działa zawsze (pdfkit). Podgląd stron jako obrazy w edytorze wymaga programu `pdftoppm` z pakietu `poppler-utils` (`apt install poppler-utils`). Bez niego edytor pokazuje PDF w przeglądarce.

Limit generowań na biuro jest w tabeli `workspace_subscriptions` (domyślnie plan `starter`, 300 generowań miesięcznie). Zmieniasz go z poziomu SQL lub (w przyszłości) webhookiem płatności; użytkownicy nie mogą go zmienić (brak polityki UPDATE).

## Klucz Claude API

Klucz jest czytany wyłącznie po stronie serwera (`src/lib/env.ts`, moduł oznaczony `server-only`). Przeglądarka wywołuje tylko własne endpointy aplikacji (`/api/ai/*`), które sprawdzają sesję, rolę, limit minutowy i miesięczny, a każde wywołanie zapisują w `ai_usage_events`.

Bez klucza:
- interfejs pokazuje komunikat „Generowanie AI wymaga konfiguracji”,
- przyciski generowania są nieaktywne lub zwracają czytelny błąd,
- reszta aplikacji (marka, oferty, edycja, grafiki z danych oferty, eksport PNG) działa normalnie.

## Lokalny stos testowy (bez Dockera)

W środowisku, w którym powstał ten etap, Docker nie był dostępny, więc testy E2E działały na lokalnym stosie z pojedynczych usług Supabase: PostgreSQL 17, GoTrue (Supabase Auth), PostgREST, prosta bramka (`scripts/local-stack/gateway.mjs`, zastępuje Kong) i przechwytywacz e-maili (`scripts/local-stack/smtp-sink.py`). Pliki są w magazynie lokalnym (`STORAGE_DRIVER=local`), bo pobranie obrazu Supabase Storage API nie powiodło się.

Jeśli masz Dockera, prościej użyć oficjalnego Supabase CLI:

```bash
npx supabase init && npx supabase start    # wypisze URL i klucze
npx supabase db reset                      # zastosuje migracje z supabase/migrations
```

Następnie w `.env.local` ustaw klucze z wyjścia CLI. E-maile z potwierdzeniem znajdziesz w Inbucket (`http://localhost:54324`).

Tryb bez klucza AI na potrzeby testów: `AI_TEST_PROVIDER=1` włącza deterministycznego dostawcę offline, który składa teksty mechanicznie z danych i oznacza je jako „Treść testowa”. Jest zablokowany przy `NODE_ENV=production`.

## Testy

```bash
npm run typecheck     # TypeScript strict
npm test              # testy jednostkowe
npm run test:integration  # RLS, billing, publikacja, import, analityka, admin, strona (wymaga Supabase i symulatorów)
npm run test:e2e      # Playwright: pełne ścieżki w przeglądarce (wymaga `npm run dev` i stosu)
npm run mock:social   # symulator kontraktu API Meta/LinkedIn (port 4010) dla testów
npm run mock:crm      # symulator kontraktu API ASARI/EstiCRM i feedów (port 4020) dla testów
npm run admin:grant -- email@firma.pl admin "powód"   # dostęp do panelu /admin
```

Aktualne liczby testów i podział na automatyczne, integracyjne i ręczne: `docs/TEST_REPORT.md`.

Testy E2E odczytują linki z e-maili z katalogu `E2E_MAIL_DIR` (domyślnie katalog przechwytywacza SMTP lokalnego stosu). Przy Supabase CLI wskaż katalog z wiadomościami albo dostosuj `tests/e2e/helpers.ts` do API Inbucket.

## Struktura

```
src/app/                 trasy (App Router): (auth), (app), admin, api, auth, o (strony ofert), l (linki UTM), strona sprzedażowa
src/lib/billing          Stripe, webhook, limity planów
src/lib/social, publishing  OAuth Meta/LinkedIn, publikacja, statystyki postów
src/lib/import, net      import ofert i CRM, bezpieczne pobieranie URL (SSRF)
src/lib/analytics, site  raporty, leady, linki śledzące, formularz kontaktowy
src/lib/admin            panel administratora: dostęp, dziennik, koszty, budżety
src/components/          UI: ui/ (prymitywy), studio/, graphics/, campaigns/, brochures/, video/, planner/, brand/, properties/, library/, settings/
src/core/marketing-engine  silnik treści: taksonomia, prompty, pipeline, QA, kompetencje
src/core/graphics        formaty, 12 szablonów SVG, dopasowanie tekstu, render PNG/JPG/PDF/ZIP
src/core/brochures       model i render broszur PDF (4 warianty)
src/core/video           model wideo, props kompozycji
src/core/planner         generator planu, kalendarz, strefa czasowa
src/remotion             kompozycja Reels (Remotion)
src/lib/jobs             kolejka zadań: worker, handlery (kampania, harmonogram, render wideo)
scripts/render-video.mjs proces renderujący MP4
src/core/ai              dostawcy LLM (Anthropic, testowy offline)
src/core/brand           model marki, fonty
src/verticals/real-estate  wszystko, co branżowe: rodzaje treści, fakty oferty, etykiety
src/lib                  sesja, autoryzacja, Supabase, storage, AI (limity, logowanie)
skills/                  biblioteka kompetencji (Markdown + YAML frontmatter)
supabase/migrations      schemat, RLS, funkcje
tests/                   unit, integration (RLS), e2e (Playwright)
```
