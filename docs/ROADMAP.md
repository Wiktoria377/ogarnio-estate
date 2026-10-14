# Roadmapa

Stan po etapie 2 (2026-10-13). Najpierw konfiguracja, potem nowe funkcje.

## Przed uruchomieniem produkcyjnym (konfiguracja, bez nowego kodu)

1. **Supabase Cloud:** migracje z `supabase/migrations` (w tym `20261013000100_campaigns_jobs.sql`), bucket `workspace-files`, URL-e przekierowań, własny SMTP.
2. **Claude API:** `ANTHROPIC_API_KEY` na serwerze. Przegląd jakości na 20–30 ofertach biura: teksty, briefy AI Marketing Directora, teksty na grafiki i scenariusze Reels. Etapy 1 i 2 były testowane automatycznie na dostawcy offline.
3. **Supabase Storage:** test sterownika na prawdziwym projekcie: upload zdjęć i muzyki, podgląd, eksporty, MP4 do 100 MB, usunięcie konta z plikami.
4. **Serwer renderujący wideo:** Node 22 na zwykłym serwerze lub kontenerze (nie serverless), Chromium headless shell (`REMOTION_BROWSER_EXECUTABLE`), co najmniej 2 vCPU i 4 GB RAM na równoległy render.
5. **Licencja Remotion:** licencja firmowa dla firmy powyżej 3 osób (`REMOTION_LICENSE_KEY`) i sprawdzenie warunków dla produktu SaaS.
6. **`pdftoppm`** (poppler-utils) na serwerze dla podglądu stron broszur.
7. **Hosting:** web (Vercel lub Node) + worker na serwerze z zapisywalnym dyskiem (`JOB_WORKER=inline` na workerze, `off` na instancjach web, jeśli są rozdzielone).
8. **Monitoring:** Sentry, alert na wzrost `status = 'failed'` w `generation_jobs` i `status = 'error'` w `ai_usage_events`.

## Etap 3 (propozycja)

- **Publikacja automatyczna:** Meta Graph API (Instagram, Facebook), TikTok Content Posting API, LinkedIn. Model danych już ma pola `publish_provider`, `external_post_id`, `external_url`; potrzebne: OAuth kont biura, harmonogram wysyłki w kolejce zadań, statusy zwrotne. Wymaga przeglądu aplikacji przez Meta i TikTok.
- **Zespół:** zaproszenia e-mail, zmiana ról, przekazanie własności biura (role i RLS już istnieją), komentarze i akceptacja materiałów przez przełożonego.
- **Płatności:** Stripe lub Przelewy24. Webhook aktualizuje `workspace_subscriptions` (plan, limity generowań i renderów).
- **Wideo:** napisy dynamiczne słowo po słowie (karaoke), lektor TTS z licencją komercyjną, warianty 1:1 i 4:5, render na osobnej maszynie z kolejką (Remotion Lambda lub własny worker).
- **Grafiki:** więcej formatów (baner, plakat A4 do witryny), wyrównanie elementów do siatki, biblioteka elementów marki.
- **Import ofert:** CRM i portale (XML Otodom, ASARI, Galactica) z mapowaniem pól.
- **Analityka:** zasięgi i kliknięcia po integracji z platformami, rekomendacje kolejnych publikacji.
- **Kompetencje:** edytor kompetencji biura (własne zasady i przykłady tekstów).
- **Inne branże** przez katalog `src/verticals/` i wersja angielska interfejsu.
