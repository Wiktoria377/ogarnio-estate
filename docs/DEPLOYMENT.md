# Wdrożenie produkcyjne OGARNIO ESTATE

Instrukcja uruchomienia aplikacji na produkcji. Kroki oznaczone **[konto zewnętrzne]** wymagają konta lub zatwierdzenia u dostawcy (lista: `docs/INTEGRATIONS_APPROVAL.md`). Bez nich aplikacja działa, a dana funkcja pokazuje komunikat „Wymaga konfiguracji” zamiast udawać działanie.

## 1. Architektura uruchomieniowa

- **Next.js 16 (Node 22)** jako jeden stały proces serwera (`npm run build && npm start`). Wbudowany worker (`JOB_WORKER=inline`) obsługuje kolejkę zadań (kampanie, render wideo, import CRM, zdjęcia), publikacje, statystyki postów i retencję.
- Na platformie bezserwerowej (bez stałego procesu): `JOB_WORKER=off` i cron co minutę: `POST /api/jobs/tick` z nagłówkiem `Authorization: Bearer $JOB_TICK_SECRET`. Render wideo wymaga wtedy osobnego serwera z Chromium (Remotion), bo trwa dłużej niż typowy limit funkcji.
- **Supabase**: Postgres z RLS, Auth, Storage (bucket `workspace-files`, prywatny).
- Zalecany region UE (dane osobowe klientów biur).

## 2. Supabase

1. Utwórz projekt (region UE). Zapisz `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (tylko serwer).
2. Migracje z `supabase/migrations/` (21 plików, od `20261012000100_core_tenancy.sql` do `20261015000700_recommendations.sql`) stosuje automatycznie kontener przy starcie (`scripts/migrate.mjs`, zmienna `DATABASE_URL`, kolejność nazw, rejestr w `supabase_migrations.schema_migrations`). Ręcznie: `DATABASE_URL=... node scripts/migrate.mjs` albo `supabase db push`. Instrukcja krok po kroku dla Supabase i Railway: `docs/URUCHOMIENIE.md`.
3. Auth: włącz potwierdzanie e-maila, ustaw *Site URL* = adres aplikacji i *Redirect URLs* = `{SITE}/auth/callback`. Skonfiguruj własny SMTP w Auth (domyślny Supabase ma niskie limity).
4. Storage: migracja `20261012000500_storage.sql` tworzy bucket i polityki. `STORAGE_DRIVER=supabase`.
5. **Kopie zapasowe**: włącz Point-in-Time Recovery (plan Pro lub wyższy). Dodatkowo raz na dobę `pg_dump --format=custom` do zewnętrznego magazynu (inne konto/region) z retencją 30 dni oraz kopia bucketu Storage (np. `rclone sync`).
6. **Odtwarzanie**: PITR do punktu w czasie w panelu Supabase albo `pg_restore --clean --if-exists -d <url> dump.custom` na nowy projekt, potem przełączenie zmiennych środowiskowych. Test odtwarzania: raz na kwartał na projekcie testowym, wynik zapisz w dzienniku operacji.

## 3. Zmienne środowiskowe

Pełna lista z opisami: `.env.example`. Minimum produkcyjne:

| Zmienna | Po co | Uwagi |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | baza, auth, worker | klucz service_role nigdy w przeglądarce |
| `NEXT_PUBLIC_SITE_URL` | linki w e-mailach, OAuth, OG | HTTPS, bez końcowego `/` |
| `TOKEN_ENCRYPTION_KEY` | szyfrowanie tokenów OAuth i sekretów CRM | `openssl rand -base64 32`; utrata klucza = konieczność ponownego połączenia kont |
| `APP_SIGNING_SECRET` | podpisy linków mediów, zaproszeń, skróty odwiedzających | min. 24 znaki |
| `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_REVIEW_MODEL` | generowanie AI **[konto zewnętrzne]** | `AI_TEST_PROVIDER` musi być `0` (w produkcji i tak odrzucany) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | subskrypcje **[konto zewnętrzne]** | najpierw `sk_test_…`, potem `sk_live_…` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | zaproszenia, powiadomienia o zapytaniach | domena z SPF/DKIM/DMARC |
| `META_APP_ID`, `META_APP_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | publikacja i statystyki **[konto zewnętrzne]** | `docs/SOCIAL_SETUP.md` |
| `JOB_WORKER`, `JOB_WORKER_CONCURRENCY`, `JOB_TICK_SECRET` | kolejka | patrz punkt 1 |
| `REMOTION_BROWSER_EXECUTABLE`, `REMOTION_LICENSE_KEY` | render wideo | licencja firmowa Remotion dla firm >3 osób |
| `COST_CURRENCY`, `CONTACT_EMAIL` | panel admina, formularz kontaktowy | |

**Nie ustawiaj w produkcji**: `SOCIAL_API_MOCK`, `SAFE_FETCH_ALLOW_HOSTS`, `AI_TEST_PROVIDER=1`, `ASARI_API_BASE`/`ESTICRM_API_BASE` (chyba że dostawca poda inny adres). Kod ignoruje symulator i listę wyjątków SSRF przy `NODE_ENV=production`.

## 4. Stripe **[konto zewnętrzne]**

1. Utwórz produkty i ceny miesięczne dla planów Solo, Studio, Agency. Identyfikatory `price_…` wpisz w panelu `/admin/plans` (pole „Stripe price id”, zmiana z powodem trafia do dziennika).
2. Webhook: `{SITE}/api/billing/webhook`, zdarzenia: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`. Sekret podpisu do `STRIPE_WEBHOOK_SECRET`.
3. Włącz Customer Portal (zmiana planu, anulowanie, metoda płatności).
4. Dostęp premium włącza wyłącznie zdarzenie subskrypcji z webhooka (nie powrót ze strony sukcesu). Duplikaty i spóźnione zdarzenia są ignorowane (tabela `billing_events`).
5. Przed sprzedażą ustal VAT (ceny netto/brutto, `plans.price_tax_mode`) i faktury (Stripe Invoicing albo zewnętrzny system). Do tego czasu strona sprzedażowa pokazuje informację, że VAT zostanie uzupełniony.
6. Test: karta `4242 4242 4242 4242` w trybie testowym, potem jedna transakcja na żywo z kartą firmową i zwrot.

## 5. Media społecznościowe, CRM, AI

- Meta i LinkedIn: `docs/SOCIAL_SETUP.md` (App Review, Business Verification, Community Management API).
- ASARI i EstiCRM: dane dostępowe podaje każde biuro w aplikacji (szyfrowane). Nazwy pól z dokumentacji dostawców; pierwszy import każdego biura zweryfikuj w podglądzie (`docs/CRM_IMPORT.md`).
- Anthropic: klucz z limitem wydatków w konsoli dostawcy, dodatkowo budżet bezpieczeństwa w `/admin/costs`.

## 6. Panel administratora platformy

1. Załóż zwykłe konto w aplikacji.
2. Na zaufanej maszynie: `npm run admin:grant -- ty@firma.pl admin "uruchomienie produkcji"` (rola `viewer` = tylko podgląd). Odebranie: `npm run admin:revoke -- ty@firma.pl "powód"`. Lista: `npm run admin:list`. Każda operacja trafia do dziennika.
3. W `/admin/costs` wpisz stawki z cennika i faktur dostawców (AI za 1 mln tokenów per model, minuta renderowania, GB miesięcznie) i ustaw miesięczne budżety AI i renderowania. Bez stawek koszty pokazują się jako „nieznane”, a budżet nie może zadziałać.
4. Zalecenie: konta administratorów z włączonym MFA w Supabase Auth.

## 7. Bezpieczeństwo przed startem

- [ ] HTTPS z HSTS, nagłówki CSP z `next.config` (ustawione w kodzie) przechodzą przez proxy/CDN bez zmian.
- [ ] Klucze tylko w zmiennych środowiskowych serwera; `NEXT_PUBLIC_*` zawierają wyłącznie publiczne wartości.
- [ ] `npm run test:integration` na kopii produkcyjnej bazy (RLS, izolacja biur, billing, publikacja, import, analityka, admin).
- [ ] Limity Supabase (połączenia, rozmiar plików) zgodne z planami.
- [ ] Rotacja `APP_SIGNING_SECRET` unieważnia linki zaproszeń i mediów; `TOKEN_ENCRYPTION_KEY` rotuj tylko z migracją danych (odszyfruj starym, zaszyfruj nowym).
- [ ] Monitoring: `/admin/health` (błędy, kolejka, konta wymagające uwagi) i logi serwera; zdarzenie `budget` w błędach oznacza wstrzymanie płatnych operacji.

## 8. Dane osobowe i dokumenty

- Retencja działa automatycznie (`run_retention()`, co kilka godzin): `docs/PRIVACY_RETENTION.md`.
- Regulamin i polityka prywatności (`/regulamin`, `/polityka-prywatnosci`) to **projekty z miejscami [DO UZUPEŁNIENIA]**, oznaczone banerem. Przed sprzedażą muszą je uzupełnić i zatwierdzić osoby z uprawnieniami prawnymi; dotyczy też umowy powierzenia przetwarzania danych (zapytania klientów biur).
- Eksport danych użytkownika: Ustawienia → Dane i prywatność → „Pobierz moje dane (JSON)”. Usunięcie konta i biura: tamże, z hasłem.

## 9. Kolejność uruchomienia

1. Supabase + migracje + Auth SMTP.
2. Zmienne środowiskowe, `npm ci && npm run build && npm start` za reverse proxy (HTTPS).
3. Konto i uprawnienia administratora platformy, stawki i budżety.
4. Stripe w trybie testowym, test zakupu i webhooków, potem klucze live.
5. Klucz Anthropic, test generowania.
6. Aplikacje Meta/LinkedIn w trybie deweloperskim, test na kontach z rolą w aplikacji, wnioski o zatwierdzenie.
7. Uzupełnione dokumenty prawne, potem publiczna strona sprzedażowa.
