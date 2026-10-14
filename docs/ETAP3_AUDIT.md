# Audyt techniczny przed etapem 3

Data: 2026-10-13. Zakres: repozytorium, schemat bazy (6 migracji, 20 tabel), PROJECT_STATE.md, dokumentacja i działanie funkcji etapów 1–2. Audyt był wykonany na kodzie i na działającej aplikacji (lokalny stos Supabase, serwer dev), a nie na podstawie interfejsu.

## 1. Co naprawdę działa (zweryfikowane uruchomieniem)

| Obszar | Dowód | Stan |
| --- | --- | --- |
| Rejestracja, logowanie, reset hasła | E2E `smoke`, `criteria`, `etap2-criteria` (link z e-maila z lokalnej skrzynki SMTP) | ✅ |
| Biura, marka, oferty ze zdjęciami | E2E + 21 testów RLS | ✅ |
| Teksty AI, grafiki, karuzele, PDF, Reels MP4 | E2E (11/11), MP4 sprawdzane ffprobe, PNG bajtowo | ✅ na dostawcy testowym AI |
| Kolejka zadań, ponowienia, anulowanie | E2E kampanii i wideo | ✅ |
| Planer (ręczne oznaczanie publikacji) | E2E `planner` | ✅ |
| Izolacja biur | E2E `isolation` (2 scenariusze), RLS 21/21 | ✅ |
| Testy uruchomione ponownie 2026-10-13 | `npm test` 99/99, `npm run test:rls` 21/21, `tsc` 0 błędów | ✅ |

**Nie zweryfikowane (brak dostępu w środowisku budowy):**
- prawdziwy model Claude (brak `ANTHROPIC_API_KEY`), więc jakość tekstów nie jest oceniona;
- Supabase Cloud i Supabase Storage (testy na lokalnym PostgreSQL i sterowniku dyskowym).

## 2. Brakujące elementy wobec celu etapu 3

| Element | Stan przed etapem 3 |
| --- | --- |
| Płatności i plany | Tabela `workspace_subscriptions` istnieje. Status i plan **nie były egzekwowane**: anulowane biuro mogło generować. Limity były liczbami w wierszu, niezależnymi od planu. |
| Zespół | Role w bazie (owner/admin/agent/viewer), ale **brak zaproszeń**: nie dało się dodać drugiej osoby, więc kontrola ról nie działała w praktyce. Brak roli „Marketing” i dezaktywacji. |
| Publikacja automatyczna | **Brak.** Planer ma tylko pola `publish_provider`, `external_post_id` i `external_url`. Brak OAuth i tokenów. |
| Import ofert / CRM | **Brak.** Oferty tylko ręcznie. |
| Analityka i leady | **Brak.** Brak stron ofert, formularzy i metryk. |
| Panel operatora, koszty | **Brak.** Zużycie AI jest tylko w ustawieniach biura. |
| Onboarding | 2 kroki (nazwa biura → marka). Brak kreatora z postępem. |
| Strona sprzedażowa | **Brak** (`/` przekierowywało do panelu). |

## 3. Bezpieczeństwo: znalezione problemy i poprawki

Przegląd objął każdą trasę `src/app/api/**`, każdą akcję serwera, wszystkie polityki RLS i funkcje SECURITY DEFINER (katalog bazy) oraz użycia klucza serwisowego.

| # | Waga | Problem | Poprawka w etapie 3 |
| --- | --- | --- | --- |
| 1 | Wysoka | Usuwanie biura lub konta kasowało wiersze, a potem pliki klientem użytkownika. W Supabase Storage polityka wymaga członkostwa, które już nie istniało, więc **pliki zostawały** (problem RODO). Lokalny sterownik tego nie wykrywał. | Pliki usuwane kluczem serwisowym (lista kluczy pobrana przed usunięciem). |
| 2 | Średnia | Agent mógł wstawić zadanie `video_render` bezpośrednio przez API bazy i ominąć limit renderów (worker go nie sprawdzał). | Limit pobierany w rejestrze zużycia **w workerze** przed renderem (idempotentnie), zwrot przy błędzie (faza 2). |
| 3 | Średnia | Limity AI liczone po zakończeniu wywołania: równoległe żądania mogły przekroczyć limit (wyścig). | Atomowa rezerwacja w rejestrze zużycia (`consume_usage` z blokadą) przed wywołaniem modelu (faza 2). |
| 4 | Średnia | Upload czytał cały formularz przed sprawdzeniem sesji; limit rozmiaru tylko z nagłówka `Content-Length`. | Najpierw autoryzacja, potem odczyt strumieniowy z twardym limitem bajtów (`src/lib/http-body.ts`). |
| 5 | Średnia | Otwarte przekierowanie w `/auth/callback` (`next=/\evil.com`). | Ścisła walidacja ścieżki i porównanie origin. |
| 6 | Średnia | `deleteProperty` mógł usunąć pliki zdjęć innego biura (brak filtra `workspace_id` przy pobieraniu zdjęć). | Filtr biura, usuwanie plików tylko gdy wiersz faktycznie usunięto. |
| 7 | Średnia | Eksport danych RODO pomijał tabele etapu 2 i mógł być ucięty przy dużych biurach (limit 1000 wierszy). | Eksport wszystkich tabel z paginacją (faza 8). |
| 8 | Średnia | Brak Content-Security-Policy i HSTS. | CSP i HSTS (produkcja) w `next.config.ts`. |
| 9 | Niska | Każdy członek (także „podgląd”) mógł wstawiać wpisy zużycia AI i historii eksportu (fałszowanie, zużycie limitu). | Polityki INSERT usunięte; zapis tylko po stronie serwera. |
| 10 | Niska | Ciężkie renderowanie grafik/PDF bez limitu częstotliwości. | Limity częstotliwości w bazie (`rate_limit_hit`). |
| 11 | Niska | Proces renderujący wideo dziedziczył wszystkie zmienne środowiskowe (w tym klucz serwisowy). | Lista dozwolonych zmiennych. |
| 12 | Niska | `assertSameOrigin` przepuszczał żądania bez nagłówka Origin. | Wymagane Origin albo `Sec-Fetch-Site: same-origin`. |
| 13 | Niska | `restoreVersion` bez filtra biura i walidacji numeru wersji (RLS chroniła). | Filtr i walidacja. |
| 14 | Niska | Komunikat błędu AI zdradzał nazwę zmiennej konfiguracyjnej. | Ogólny komunikat, szczegół w logu. |
| 15 | Niska | Funkcje wyzwalaczy wykonywalne dla `anon`. | `revoke`. |
| 16 | Niska | Usunięcie konta jedynego właściciela kasowało biuro z innymi członkami zespołu. | Blokada, dopóki w biurze są inni aktywni członkowie (przekazanie własności; faza 3). |

Dodatkowo:
- granice miesiąca dla limitów liczone są teraz w strefie Europe/Warsaw, a nie w UTC;
- dodano centralny dziennik błędów (`app_errors`, widoczny tylko w panelu operatora) z usuwaniem tokenów z treści komunikatów.

Potwierdzone jako poprawne:
- RLS na wszystkich 20 tabelach;
- złożone klucze obce `(id, workspace_id)` blokują łączenie obiektów z różnych biur;
- funkcje SECURITY DEFINER sprawdzają rolę;
- klucz serwisowy używany wyłącznie po stronie serwera, zawsze z filtrem biura;
- pliki serwowane tylko członkom biura;
- brak sekretów w kodzie i w bundlu klienta.

## 4. Decyzje architektoniczne etapu 3

1. **Jedno źródło prawdy o planie i limitach w bazie.**
   - Tabela `plans` (edytowalna w panelu operatora, bez zmian kodu).
   - Nadpisania limitów per biuro.
   - Funkcja `workspace_limits()`.
   - Dostęp płatny zależy wyłącznie od statusu zapisanego przez webhook Stripe, nigdy od powrotu na stronę sukcesu.
2. **Rejestr zużycia (`usage_ledger`).**
   - Append-only, z kluczem idempotencji.
   - Rezerwacja przed kosztowną operacją, zwrot przy błędzie.
   - Limity liczbowe (użytkownicy, oferty, konta społecznościowe, miejsce na pliki) sprawdzane wyzwalaczami w bazie, więc nie da się ich ominąć przez API.
3. **Uprawnienia.**
   - Macierz ról w `src/core/auth/permissions.ts`.
   - Te same reguły w politykach RLS (rola „Marketing”, agent edytuje tylko przypisane oferty, dezaktywacja członka odcina dostęp w każdej polityce).
4. **Publikacja.**
   - Wpis planera rozszerzony o docelowe konto, podpis, media, akceptację i stan publikacji.
   - Wysyłka przez kolejkę zadań o zadanej godzinie.
   - Identyfikator zewnętrzny zapisywany dopiero po potwierdzeniu platformy.
   - Niepewny wynik jest najpierw weryfikowany w API platformy, a nie ponawiany na ślepo.
5. **Tokeny OAuth.**
   - Osobna tabela bez polityk dla użytkowników (tylko rola serwisowa).
   - Szyfrowanie AES-256-GCM kluczem z serwera.
   - Stan OAuth jednorazowy, z PKCE tam, gdzie platforma je wspiera.
6. **Import ofert.**
   - Wspólny model = istniejąca tabela `properties`, plus powiązanie ze źródłem (`property_sources`) i dziennik zmian.
   - Adaptery CRM jako moduły z jednym interfejsem.
   - CSV i autoryzowane kanały XML/JSON działają bez partnerstwa.
7. **Analityka.**
   - Tylko dane z oficjalnych API i z własnych stron/formularzy.
   - Brak metryki = „Brak danych”, nigdy 0.
8. **Panel operatora.**
   - Osobna lista administratorów platformy.
   - Tylko agregaty, bez treści klientów.
   - Każda akcja zapisywana w dzienniku audytu.
