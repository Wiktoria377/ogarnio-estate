# Dane osobowe, retencja i dostęp (struktura dokumentacji RODO)

**To nie jest opinia prawna.** Dokument opisuje, co robi aplikacja, i porządkuje materiał do przygotowania dokumentów RODO przez osobę z uprawnieniami prawnymi.

## Role
- **Operator Ogarnio Estate**: administrator danych kont, rozliczeń, formularza kontaktowego strony sprzedażowej i statystyk tej strony.
- **Biuro nieruchomości**: administrator danych swoich klientów (zapytania z formularzy stron ofert, dane w ofertach). Operator jest podmiotem przetwarzającym: potrzebna **umowa powierzenia** (do przygotowania).

## Mapa danych
| Dane | Tabela | Kto widzi | Retencja (automatyczna) |
|---|---|---|---|
| Konto, profil, członkostwo | `auth.users`, `profiles`, `workspace_members` | użytkownik, biuro | do usunięcia konta |
| Oferty, zdjęcia, materiały | `properties`, `property_photos`, `content_*`, Storage | członkowie biura wg ról | do usunięcia przez biuro / usunięcia biura |
| Zapytania z formularzy ofert | `leads`, `lead_events` | właściciel, admin, marketing; agent tylko swoje | **24 miesiące** od ostatniej zmiany |
| Kliknięcia linków, wyświetlenia stron ofert | `web_events` | członkowie biura | **13 miesięcy**; bez IP, dzienny skrót |
| Odwiedziny strony sprzedażowej | `site_events` | administratorzy platformy | **13 miesięcy**; tylko po zgodzie, bez IP |
| Formularz kontaktowy strony | `contact_messages` | administratorzy platformy | **12 miesięcy** |
| Statystyki postów z platform | `publication_metrics` | członkowie biura | **25 miesięcy** |
| Dziennik użycia AI | `ai_usage_events` | biuro (własne), administratorzy (liczby) | **25 miesięcy** |
| Błędy techniczne | `app_errors` | administratorzy platformy | **90 dni** |
| Tymczasowe dane OAuth, limity zapytań | `oauth_states`, `oauth_grants`, `rate_limits` | nikt (serwer) | **1–2 dni** |
| Podglądy importu | `import_batches`, `import_rows` | biuro | do wygaśnięcia podglądu |
| Zaproszenia | `workspace_invitations` | właściciel, admin | wygasłe i nieprzyjęte: 30 dni po wygaśnięciu |
| Tokeny kont social, sekrety CRM | `social_credentials`, `property_source_secrets` | nikt poza serwerem (szyfrowane) | do odłączenia konta / usunięcia źródła |
| Dziennik działań administratorów | `admin_audit_log` | administratorzy platformy | **bez automatycznego usuwania** (rozliczalność); tylko do dopisywania |
| Rozliczenia | `billing_*`, Stripe | właściciel biura | [DO USTALENIA: okres z przepisów podatkowych] |

Retencję wykonuje funkcja `public.run_retention()`, wywoływana przez worker co 6 godzin (`src/lib/retention.ts`). Test: `tests/integration/site.test.ts`.

## Prawa osób
- **Dostęp i przenoszenie**: eksport JSON w Ustawienia → Dane i prywatność (`/api/account/export`): profil, biura, marka, oferty, zdjęcia (ścieżki), materiały z wersjami, kampanie, plan publikacji, konta social (bez tokenów), publikacje, zapytania (w zakresie roli), linki, źródła CRM (bez sekretów), własne użycie AI.
- **Usunięcie**: usunięcie konta i biura w aplikacji (z hasłem). Zapytanie klienta biura usuwa biuro (przez obsługę zapytań) albo retencja.
- **Zgody**: formularz zapytania i kontaktowy zapisują treść i wersję zgody jako dowód. Statystyki strony sprzedażowej działają dopiero po kliknięciu „Zgadzam się”; decyzję można zmienić w stopce.

## Dostęp administratorów platformy do danych klientów
- Panel `/admin` pokazuje **liczby i metadane** (nazwy biur, plany, zużycie, kody błędów). Nie pokazuje treści materiałów, ofert, zapytań ani danych klientów biur.
- Otwarcie karty biura jest zapisywane w dzienniku (`view_office`).
- Dostęp do treści klienta (np. przy zgłoszeniu błędu) **nie ma funkcji w aplikacji**. Procedura do wdrożenia organizacyjnie: pisemna zgoda klienta na konkretny zakres i czas, dostęp przez bazę wyłącznie przez wyznaczoną osobę, wpis w dzienniku działań z powodem.

## Prawa do zdjęć i mediów
- Przy pierwszym przesłaniu zdjęć użytkownik potwierdza prawa do mediów (zapis w bazie, `acknowledge_media_rights`). Import zdjęć z CRM wymaga osobnego potwierdzenia praw przy imporcie.
- Wizualizacje są oznaczane jako wizualizacje na stronach ofert.
- Brak trenowania własnych modeli na danych klientów.

## Do przygotowania przez prawnika
1. Rejestr czynności przetwarzania (operator) i rejestr kategorii czynności (jako podmiot przetwarzający).
2. Umowa powierzenia z biurami (wzór do regulaminu).
3. Lista podprocesorów (hosting, Supabase, Anthropic, Stripe, Meta, LinkedIn, SMTP) i podstawy transferu poza EOG.
4. Ocena, czy potrzebna jest DPIA (profilowanie: brak; analityka: zanonimizowana).
5. Ostateczne teksty: regulamin, polityka prywatności, klauzule zgód (obecne w kodzie: `CONSENT_VERSION` w `src/core/analytics/metrics.ts`, `CONTACT_CONSENT_VERSION` w `src/lib/site/service.ts`).
