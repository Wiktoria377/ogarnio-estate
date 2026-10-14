# Uruchomienie OGARNIO ESTATE w internecie

Ta instrukcja prowadzi od zera do działającej aplikacji pod publicznym adresem. Nie wymaga programowania. Wszystkie tajne klucze wpisujesz tylko w panelach Supabase, Anthropic i Railway, nigdy do czatu ani do repozytorium.

## Jak to działa

| Element | Gdzie działa | Co robi |
| --- | --- | --- |
| Aplikacja (Next.js) | Railway, 1 kontener z `Dockerfile` | strony, logowanie, API, generowanie PNG i PDF |
| Kolejka zadań i zadania cykliczne | ten sam kontener (`JOB_WORKER=inline`) | kampanie, render wideo, zaplanowane publikacje, statystyki, retencja danych. Osobny cron nie jest potrzebny. |
| Wideo (Remotion) | ten sam kontener | Chromium headless shell i ffmpeg są w obrazie |
| Baza, logowanie, pliki | Supabase Cloud | PostgreSQL z RLS, Auth (e-mail i hasło), Storage (bucket `workspace-files`, prywatny) |
| AI | Anthropic API | klucz tylko w zmiennych serwera |

Migracje bazy uruchamiają się same przy każdym starcie kontenera (`scripts/migrate.mjs`). Każda jest stosowana raz, a nieudana migracja zatrzymuje start, więc aplikacja nie ruszy na niepełnej bazie.

## Krok 1. Supabase

1. Załóż konto na https://supabase.com i utwórz projekt (**New project**):
   - region: **Central EU (Frankfurt)**;
   - hasło bazy: wygeneruj i zapisz w menedżerze haseł.
2. **Authentication → URL Configuration**:
   - Site URL: adres aplikacji z kroku 3 (na początek wpisz tymczasowo `http://localhost:3000` i popraw po kroku 3);
   - Redirect URLs: dodaj `https://TWOJ-ADRES/auth/callback`.
3. **Authentication → Sign In / Providers → Email**: zostaw włączone „Confirm email”.
4. Wbudowana poczta Supabase wysyła tylko kilka e-maili na godzinę i tylko do członków zespołu projektu. Twoje konto zadziała od razu. Zanim zaprosisz inne osoby, ustaw własny serwer SMTP w **Authentication → Emails → SMTP Settings** (np. Resend, Brevo albo poczta firmowa).
5. Skopiuj do notatnika w menedżerze haseł (nie do czatu):
   - **Project Settings → API**: Project URL, klucz `anon` i klucz `service_role`;
   - **Connect** (u góry) → **Session pooler**: connection string z wpisanym hasłem bazy. Port 5432, adres `...pooler.supabase.com`. Pooler sesyjny jest potrzebny, bo Railway łączy się przez IPv4.

Tabel ani bucketu nie zakładasz ręcznie. Zrobi to pierwszy start aplikacji.

## Krok 2. Klucz Anthropic

1. https://console.anthropic.com → **API Keys** → **Create Key** (nazwa np. `ogarnio-produkcja`).
2. **Billing**: doładuj konto i ustaw miesięczny limit wydatków (np. 50 USD), żeby koszt nie mógł wymknąć się spod kontroli.

## Krok 3. Railway

1. Załóż konto na https://railway.com (plan **Hobby**, 5 USD miesięcznie).
2. **New Project → Deploy from GitHub repo → Wiktoria377/ogarnio-estate**. Railway znajdzie `railway.json` i zbuduje `Dockerfile`. Pierwsza budowa się nie uda, bo brakuje zmiennych. To normalne.
3. **Settings → Networking → Generate Domain**. Dostaniesz adres `https://...up.railway.app`. To jest publiczny adres aplikacji.
4. **Variables → Raw Editor**: wklej zawartość `.env.production.example` i uzupełnij wartości:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` z kroku 1;
   - `NEXT_PUBLIC_SITE_URL`: adres z punktu 3;
   - `ANTHROPIC_API_KEY` z kroku 2;
   - `TOKEN_ENCRYPTION_KEY` i `APP_SIGNING_SECRET`: dwa różne losowe ciągi. Najprościej wygenerować je w Supabase → **SQL Editor** zapytaniem `select encode(extensions.gen_random_bytes(32), 'base64') as klucz;` uruchomionym dwa razy (albo poleceniem `openssl rand -base64 32`). Nie używaj generatorów ze stron internetowych.
5. **Settings → Resources**: ustaw co najmniej 2 GB RAM (render wideo).
6. Zapisz zmienne. Railway zbuduje aplikację ponownie. W **Deployments → View logs** powinny pojawić się linie `[migrate] applied ...`, a potem `Ready`.
7. Wróć do Supabase (krok 1.2) i wpisz prawdziwy adres w Site URL i Redirect URLs.

Zmiana `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` albo `NEXT_PUBLIC_SITE_URL` wymaga ponownej budowy (Railway robi ją sam po zapisaniu zmiennych), bo te wartości trafiają do kodu strony.

## Krok 4. Twoje konto administratora

1. Otwórz publiczny adres, kliknij **Załóż konto**, potwierdź e-mail i utwórz biuro. Jako twórczyni biura masz w nim rolę właścicielki.
2. Dostęp do panelu platformy (`/admin`: koszty AI, biura, limity) nadaje się celowo poza aplikacją. W Supabase otwórz **SQL Editor**, wklej i uruchom (wpisz swój adres w obu miejscach):

```sql
insert into public.admin_audit_log (actor, actor_email, action, target_type, target_id, reason, detail)
select null, 'sql-editor', 'cli_grant_admin', 'platform_admin', id, 'pierwszy administrator', jsonb_build_object('email', email, 'role', 'admin')
from auth.users where lower(email) = lower('TWOJ@EMAIL.PL');

insert into public.platform_admins (user_id, role, note)
select id, 'admin', 'pierwszy administrator' from auth.users where lower(email) = lower('TWOJ@EMAIL.PL')
on conflict (user_id) do update set role = 'admin';
```

Programiści mogą zamiast tego użyć `npm run admin:grant -- email admin "powód"` z kluczem service_role w `.env.local`.

## Krok 5. Sprawdzenie

Na publicznym adresie: rejestracja i logowanie, biuro, logo i kolory w **Marka**, oferta z 5 zdjęciami, post w **Studio treści**, karuzela w **Studio grafik** (edycja nagłówka, **Pobierz → PNG**), wylogowanie, ponowne logowanie i materiały w **Bibliotece**. Ten sam scenariusz jest zautomatyzowany:

```bash
E2E_BASE_URL=https://TWOJ-ADRES E2E_EXPECT_AI=1 \
E2E_ACCOUNT_EMAIL=konto-testowe@... E2E_ACCOUNT_PASSWORD=... \
npx playwright test tests/e2e/user-journey.spec.ts
```

## Zarządzanie bazą

- **Podgląd i edycja danych**: Supabase → **Table Editor**. Uwaga: edycja tu omija reguły aplikacji. Do zmian używaj aplikacji, a Table Editor traktuj jako podgląd.
- **Kopie zapasowe**: plan Free nie ma automatycznych kopii. Plan Pro robi kopię codziennie (7 dni wstecz). Przed przejściem na prawdziwych klientów przejdź na Pro.
- **Pliki** (zdjęcia, grafiki, wideo): Supabase → **Storage → workspace-files**, katalog na biuro (identyfikator biura).
- **Zmiany struktury bazy**: tylko nowym plikiem w `supabase/migrations/` (nazwa z datą). Wdrożenie zastosuje go samo. Nie zmieniaj plików już zastosowanych. Lista zastosowanych jest w tabeli `supabase_migrations.schema_migrations`.
- **Logi aplikacji**: Railway → **Deployments → View logs**.
- **Koszty AI**: w aplikacji `/admin` → Koszty, po wpisaniu stawek modelu.

## Koszty miesięczne (szacunek)

| Pozycja | Mały start (1–3 biura) | Uwagi |
| --- | --- | --- |
| Railway Hobby | 5–15 USD | 5 USD abonamentu zawiera 5 USD zużycia. Serwer bez ruchu zużywa ok. 0,5 GB RAM. Rendery wideo zwiększają zużycie na czas renderu. |
| Supabase | 0 USD (Free) albo 25 USD (Pro) | Free: 500 MB bazy, 1 GB plików, projekt usypia po 7 dniach bez ruchu, brak kopii. Na produkcję z klientami: Pro (8 GB bazy, 100 GB plików, kopie dzienne). |
| Anthropic | ok. 0,05–0,20 USD za wygenerowany materiał | Model `claude-opus-5-5`: 4 USD / 20 USD za milion tokenów wejścia / wyjścia, kontrola jakości tańszym `claude-haiku-5-5`. 300 materiałów miesięcznie to ok. 15–60 USD. Dokładną kwotę pokaże panel `/admin` po pierwszych generowaniach. |
| Domena (opcjonalnie) | ok. 5 USD | własna domena zamiast `up.railway.app` |
| Licencja Remotion | 0 USD do 3 osób w firmie | większe firmy: licencja firmowa Remotion |

Razem na start: ok. **10–30 USD** miesięcznie przy Supabase Free albo ok. **35–100 USD** przy Supabase Pro i aktywnym generowaniu.
