# Połączone konta i automatyczna publikacja: konfiguracja

Status: **kod zaimplementowany i przetestowany na symulatorze kontraktu API** (`tests/mocks/social-api.mjs`). Publikacja na prawdziwych kontach **wymaga konfiguracji i zatwierdzenia aplikacji przez platformy**. Bez tego przyciski łączenia pokazują „Wymaga konfiguracji”.

## Wspólne
1. `TOKEN_ENCRYPTION_KEY` (32 bajty base64) i `APP_SIGNING_SECRET`.
2. `NEXT_PUBLIC_SITE_URL` = publiczny adres HTTPS aplikacji. Meta pobiera zdjęcia i filmy z `/api/public-media/…` (linki podpisane, ważne 72 h), więc adres musi być osiągalny z internetu (`PUBLIC_MEDIA_BASE_URL`, jeśli media mają iść z innej domeny).
3. Stały proces serwera (worker publikacji działa w pętli zadań) albo cron `POST /api/jobs/tick` z `JOB_TICK_SECRET`, co najmniej co minutę.

## Meta (Facebook + Instagram)
1. Utwórz aplikację typu Business na developers.facebook.com, dodaj produkt *Facebook Login for Business*.
2. Redirect URI: `{SITE}/api/social/meta/callback`.
3. Uprawnienia: `pages_show_list, pages_read_engagement, pages_manage_posts, read_insights, business_management, instagram_basic, instagram_content_publish, instagram_manage_insights`.
4. **Wymagane: App Review dla tych uprawnień oraz weryfikacja firmy (Business Verification).** Przed zatwierdzeniem działa tylko dla kont z rolą w aplikacji (tryb deweloperski).
5. Ustaw `META_APP_ID`, `META_APP_SECRET` (opcjonalnie `META_CONFIG_ID`). PKCE włącz (`META_OAUTH_PKCE=1`) dopiero, gdy Meta oznaczy je jako ogólnie dostępne.
6. Instagram musi być kontem firmowym lub twórcy połączonym ze stroną FB. Limit API: 100 publikacji na 24 h. Obrazy tylko JPEG (konwertujemy), proporcje 4:5–1,91:1.

## LinkedIn
1. Aplikacja na linkedin.com/developers, produkt *Share on LinkedIn* (profil osobisty, bez wniosku) i *Sign In with LinkedIn using OpenID Connect*.
2. Redirect URI: `{SITE}/api/social/linkedin/callback`.
3. Strony firmowe: **wniosek o Community Management API**; po zatwierdzeniu `LINKEDIN_ORG_SCOPES=1`.
4. Token ważny 60 dni; odświeżanie tylko, jeśli LinkedIn włączy je dla aplikacji. Po wygaśnięciu konto ma status „Wymaga ponownej autoryzacji”.
5. Wideo na LinkedIn: nieobsługiwane w tej wersji.

## TikTok
Niedostępny: Content Posting API wymaga audytu aplikacji (przed audytem posty są prywatne). Architektura (dostawca, statusy, reguły formatów) jest przygotowana.

## Jak działa publikacja
`Szkic → Czeka na akceptację → (akceptacja: owner/admin/marketing) Zaplanowane → W kolejce → W trakcie publikacji → W trakcie przetwarzania przez platformę → Opublikowane`, albo `Niepowodzenie` / `Wymaga działania użytkownika`.
- Akceptacja zamraża treść, format i pliki (hash). Zmiana treści cofa do szkicu; zmiana terminu nie.
- „Opublikowane” tylko z identyfikatorem z API (ograniczenie w bazie).
- Brak odpowiedzi platformy po wysłaniu = wynik niepewny: przed ponowieniem sprawdzamy na platformie, czy post istnieje (FB `published_posts`, IG status kontenera i `media`, LinkedIn `posts?q=author`). Gdy sprawdzenie jest niemożliwe, decyduje użytkownik.
- Błędy: token (→ ponowna autoryzacja), limit zapytań (ponowienie wg Retry-After), awaria (do 4 prób z odstępem), odrzucone media/proporcje (niepowodzenie z opisem).

## Testy
- `npm run mock:social` (symulator, port 4010) + `SOCIAL_API_MOCK=1` w `.env.local` (UI pokazuje baner „Tryb testowy”).
- `npx vitest run --config vitest.rls.config.ts tests/integration/publishing.test.ts` (17 testów).
- `npx playwright test tests/e2e/publishing.spec.ts` (OAuth na symulatorze → kreator → akceptacja → publikacja o czasie → ID).
- Test ręczny na prawdziwych kontach: **zablokowany** do czasu zatwierdzenia aplikacji przez Meta/LinkedIn.
