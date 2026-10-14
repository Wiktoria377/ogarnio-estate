# Import ofert i integracje CRM

Wszystkie źródła przechodzą ten sam proces: rekordy → poczekalnia (`import_rows`) → mapowanie kolumn, walidacja (ten sam schemat co formularz oferty), wykrywanie duplikatów i zmian → **podgląd** → użytkownik zaznacza wiersze → import → raport CSV. Nic nie zmienia ofert przed kliknięciem „Importuj zaznaczone”.

## Źródła

| Źródło | Jak działa | Wymaga |
|---|---|---|
| Plik CSV | średnik/przecinek/tabulator, UTF-8 lub Windows-1250, do 5000 wierszy i 10 MB | nic |
| Plik XML/JSON | automatyczne wykrycie listy ofert lub ścieżka (np. `oferty.oferta`); encje XML i DOCTYPE nie są przetwarzane | nic |
| Feed XML/JSON (URL) | pobranie przez bezpieczny fetch, opcjonalnie Basic/Bearer (szyfrowane AES-GCM) | `TOKEN_ENCRYPTION_KEY` przy autoryzacji |
| ASARI CRM | Site API `https://api.asari.pro/site/`, nagłówek `SiteAuth: userID:Token`, `POST exportedListingIdList` + `POST listing`; odstęp ≥ 2,6 s (limit 25 zapytań/min) | userID i Token Site API od ASARI; `TOKEN_ENCRYPTION_KEY`; dla zdjęć `ASARI_PHOTO_URL_TEMPLATE` |
| EstiCRM | EstiAPI v1.5 `https://app.esticrm.pl/apiClient/offer/list` (company + token, skip/take) | ID firmy i token (Ustawienia → Dane firmowe, konto administratora) |

Inne CRM (IMO, Galactica Virgo, WebEstate): brak publicznego API; użyj eksportu CSV/XML.

**Nie zweryfikowano na prawdziwych kontach.** Nazwy pól ASARI i EstiCRM w presetach pochodzą z publicznej dokumentacji. Ekran mapowania pokazuje wszystkie kolumny, które CRM faktycznie zwrócił, więc przy pierwszym imporcie należy sprawdzić przypisania; zatwierdzone mapowanie zapamiętuje się dla źródła.

## Synchronizacja i zmiany

- Dopasowanie: numer oferty z danego źródła (`properties.source_id + external_ref`). Bez numeru: „odcisk” (typ, transakcja, miasto, ulica, metraż, pokoje). Podobna oferta nigdy nie jest łączona sama; użytkownik wybiera „Aktualizuj”, „Utwórz nową” albo „Pomiń”.
- Wykrywane zmiany: cena, status, opis, parametry, zdjęcia. Kolumny pominięte w eksporcie nie kasują danych.
- Zmiana ceny: materiały oferty dostają znacznik „Nieaktualny” (Biblioteka, strona oferty), ich ponowna akceptacja do publikacji jest blokowana, dopóki ktoś nie poprawi materiału albo nie wybierze „Sprawdzone, treść aktualna”. Opcjonalnie zaplanowane publikacje wracają do akceptacji. Treść materiałów nie jest zmieniana automatycznie.
- Zdjęcia: pobierane w tle (zadanie `import_photos`), przetwarzane jak zwykłe przesłanie (metadane usunięte); usuwane są tylko zdjęcia pochodzące ze źródła, nigdy dodane ręcznie. Wymaga potwierdzenia praw do zdjęć.
- Historia zastosowanych zmian: `property_changes`, widoczna na stronie oferty.

## Bezpieczeństwo

`src/lib/net/safe-fetch.ts`: tylko http/https i porty 80/443/8080/8443, bez loginu w URL, blokada `localhost`, `.local`, `.internal`, adresów prywatnych, loopback, link-local (w tym 169.254.169.254), CGNAT, multicast, IPv6 ULA/link-local oraz IPv4 zapisanych w IPv6. Kontrola odbywa się w lookupie DNS gniazda (bez okna na DNS rebinding), każde przekierowanie (maks. 3) jest sprawdzane ponownie, limity czasu i rozmiaru po dekompresji. Pobrana treść jest wyłącznie danymi.

Import uruchamia właściciel lub administrator (`import.run`). Tabele poczekalni i sekretów są zapisywane tylko przez serwer; sekrety nie mają polityk RLS.

## Testy

- `tests/unit/import.test.ts`: CSV, liczby, mapowanie, normalizacja, duplikaty, diff, ochrona SSRF, feedy.
- `tests/integration/import.test.ts` (wymaga `node tests/mocks/crm-api.mjs`): podgląd, wybór, uprawnienia, izolacja biur, zmiana ceny, duplikaty, feed z Basic Auth, ASARI ze zdjęciami w tle, EstiCRM, SSRF na prawdziwych gniazdach.
- `tests/e2e/import.spec.ts`: import CSV przez UI i synchronizacja ASARI.
- Ręczny (zablokowany): import z prawdziwego konta ASARI/EstiCRM, wymaga danych dostępowych biura.
