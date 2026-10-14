# Integracje wymagające zatwierdzenia lub konta zewnętrznego

Stan na 2026-10-13. Kod każdej integracji jest gotowy i przetestowany na **symulatorach kontraktu API** (oznaczonych w aplikacji). Testy produkcyjne poniższych pozycji są **zablokowane** do czasu uzyskania dostępu.

| Integracja | Co trzeba uzyskać | Kto składa | Co działa bez tego | Testy produkcyjne |
|---|---|---|---|---|
| **Meta: Facebook Pages** | Aplikacja Business, Facebook Login for Business, **App Review** uprawnień `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`, `business_management`, **Business Verification** | operator Ogarnio | tryb deweloperski: tylko konta z rolą w aplikacji Meta | zablokowane: brak zatwierdzonej aplikacji |
| **Meta: Instagram** | jak wyżej + `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`; konto firmowe/twórcy połączone ze stroną FB | operator Ogarnio | jak wyżej | zablokowane |
| **LinkedIn: profil** | aplikacja z produktami *Share on LinkedIn* i *Sign In with LinkedIn using OpenID Connect* (bez wniosku) | operator Ogarnio | wymaga tylko kluczy aplikacji | zablokowane: brak kluczy w tym środowisku. Statystyki postów profilu: brak publicznego API (w aplikacji „Brak danych”) |
| **LinkedIn: strony firmowe** | **wniosek o Community Management API** (`w_organization_social`, `r_organization_social`, `rw_organization_admin`), potem `LINKEDIN_ORG_SCOPES=1` | operator Ogarnio | publikacja tylko na profilu | zablokowane |
| **TikTok** | Content Posting API + audyt aplikacji (przed audytem posty są prywatne) | operator Ogarnio | eksport MP4 do ręcznej publikacji | nie wdrożone (świadomie) |
| **Stripe** | konto, aktywacja płatności, produkty i ceny, webhook, Customer Portal; decyzja o VAT i fakturach | operator Ogarnio | okres próbny; strona planu pokazuje „Wymaga konfiguracji” | test w trybie testowym Stripe zablokowany: brak `sk_test_` w tym środowisku (webhooki przetestowane na podpisanych zdarzeniach) |
| **Anthropic (Claude API)** | klucz API z limitem wydatków | operator Ogarnio | dostawca testowy w dev/testach (treści oznaczone), w produkcji komunikat „Wymaga konfiguracji” | zablokowane: brak `ANTHROPIC_API_KEY` |
| **ASARI Site API** | dane dostępowe (user id + token SiteAuth) od ASARI dla konkretnego biura; potwierdzenie adresu zdjęć (`ASARI_PHOTO_URL_TEMPLATE`) | każde biuro (operator może pomóc) | import plików CSV/XML/JSON | zablokowane: brak konta testowego ASARI |
| **EstiCRM EstiAPI** | `company` + `token` z panelu EstiCRM | każde biuro | jak wyżej | zablokowane: brak konta testowego |
| **Feedy XML/JSON biur** | adres HTTPS feedu i ewentualne dane logowania | każde biuro | | możliwe od razu po podaniu adresu |
| **SMTP** | dostawca poczty, domena z SPF, DKIM, DMARC | operator Ogarnio | zaproszenia jako link do skopiowania; brak powiadomień e-mail | zablokowane: brak SMTP produkcyjnego (lokalnie przechwytywacz poczty) |
| **Remotion** | licencja firmowa (firmy powyżej 3 osób) | operator Ogarnio | render działa, licencja to wymóg prawny | render przetestowany lokalnie |
| **Supabase** | projekt produkcyjny (zalecany plan z PITR) | operator Ogarnio | | testy na lokalnym stosie Supabase |

## Kolejność wniosków (najdłuższe pierwsze)
1. Meta Business Verification + App Review (zwykle najdłużej; wymaga nagrania przepływu i polityki prywatności pod publicznym adresem).
2. LinkedIn Community Management API.
3. Stripe (aktywacja konta firmowego).
4. Pozostałe: klucze i konta bez procesu przeglądu.

Do wniosków Meta i LinkedIn potrzebne są **zatwierdzone** regulamin i polityka prywatności (obecnie projekty) oraz publiczny adres HTTPS aplikacji.
