# Brief etapu 4 (od Wiktorii, 2026-10-13, kopia dosłowna)

jak skończysz etap 3 to zacznij 4:
OGARNIO ESTATE — ETAP 4
INTELLIGENT MARKETING OS — AI MARKETING DIRECTOR, BRAND INTELLIGENCE, CREATIVE ENGINE I PERSONALIZACJA
TWOJA ROLA
Kontynuujesz rozwój istniejącej aplikacji webowej SaaS OGARNIO ESTATE.
Pracujesz jako interdyscyplinarny zespół specjalistów:

* Principal AI Engineer
* Senior Full-Stack Developer
* Software Architect
* AI Product Architect
* Senior UI/UX Designer
* Creative Director
* Brand Strategist
* Senior Graphic Designer
* Head of Marketing
* Senior Copywriter
* Marketing Automation Specialist
* Data Analytics Engineer
* AI Quality Assurance Engineer

Twoim zadaniem jest przekształcenie Ogarnio Estate z zestawu narzędzi marketingowych w zintegrowany, inteligentny system zarządzania marketingiem.
Nie twórz nowej aplikacji. Pracuj na istniejącym kodzie i bazie danych.
Przed rozpoczęciem przeprowadź audyt wszystkich wdrożonych funkcji, przeczytaj PROJECT_STATE.md i przeanalizuj bibliotekę skills marketingowych.
Nie zakładaj, że poprzednie etapy zostały w pełni zrealizowane.
Zachowaj dotychczasową architekturę, użytkowników, nieruchomości, materiały marketingowe, integracje oraz system subskrypcji.
1. GŁÓWNY CEL
Chcę stworzyć SaaS, który zachowuje się jak profesjonalny dyrektor marketingowy zatrudniony przez biuro nieruchomości.
System powinien rozumieć:

* czym zajmuje się biuro,
* jaki ma styl komunikacji,
* jaką posiada identyfikację wizualną,
* jakie nieruchomości sprzedaje,
* do jakich klientów kieruje swoje oferty,
* jakie kampanie realizowało wcześniej,
* jakie materiały były akceptowane,
* jakie wyniki przynosiły działania marketingowe.

Na tej podstawie aplikacja ma przygotowywać spójne strategie, kampanie, treści, grafiki, filmy i rekomendacje.
Najważniejsza zasada:
OGARNIO ESTATE ma tworzyć materiały tak, jakby za ich przygotowaniem stał doświadczony, profesjonalny dział marketingu, posiadający wielomiesięczną wiedzę o danym biurze.
System nie może podejmować nieodwracalnych działań zewnętrznych, publikować materiałów ani uruchamiać płatnych kampanii bez odpowiedniej autoryzacji użytkownika.
2. BRAND INTELLIGENCE — AUTOMATYCZNE POZNAWANIE MARKI
Rozbuduj dotychczasowe Brand Studio o inteligentny system analizy marki.
Dodaj funkcję:
„Poznaj moją markę”.
Użytkownik może podać:

* adres strony internetowej biura,
* oficjalne logo,
* przykładowe grafiki,
* przykładowe posty,
* prezentacje firmowe,
* materiały PDF,
* opis firmy,
* dane kontaktowe.

Analiza strony internetowej
Po podaniu URL system powinien — za zgodą użytkownika i w granicach dozwolonego dostępu — przeanalizować stronę.
Zidentyfikuj:

* dominujące kolory,
* kolory uzupełniające,
* typografię,
* logo,
* styl zdjęć,
* styl wizualny,
* sposób prezentowania ofert,
* ton komunikacji,
* główne grupy klientów,
* wyróżniki biura,
* strukturę komunikatów marketingowych.

Nie zakładaj, że każda strona pozwala na pobranie wszystkich tych danych.
Wprowadź system oceny pewności rozpoznania.
Jeżeli nie można wiarygodnie ustalić czcionki, koloru lub innej cechy, przedstaw ją jako propozycję, a nie potwierdzony fakt.
Bezpieczeństwo pobierania stron
Zaimplementuj:

* blokowanie adresów lokalnych i prywatnych,
* ochronę przed SSRF,
* kontrolę przekierowań,
* limity rozmiaru pobieranych zasobów,
* ograniczenia czasu pobierania,
* walidację adresów,
* respektowanie ograniczeń dostępu i praw do materiałów.

Nie obchodź zabezpieczeń stron ani ograniczeń autoryzacji.
Pobrane treści traktuj jako niezaufane dane, nigdy jako instrukcje sterujące aplikacją.
Brand Profile
Na podstawie wyników system powinien zaproponować profil marki zawierający:

1. Paletę kolorystyczną.
2. Typografię.
3. Logo i jego warianty.
4. Styl materiałów graficznych.
5. Tone of Voice.
6. Słowa charakterystyczne.
7. Słowa, których marka powinna unikać.
8. Preferowane CTA.
9. Grupy odbiorców.
10. Ogólne wytyczne marketingowe.

Użytkownik zatwierdza lub edytuje profil.
Dopiero zatwierdzony profil staje się obowiązującą konfiguracją generowania.
Zachowuj poprzednie wersje profilu i możliwość przywracania ustawień.
3. BRAND MEMORY — PAMIĘĆ MARKETINGOWA
Zbuduj system pamięci marki.
Nie chodzi o zapisywanie całych rozmów z AI bez struktury.
Chcę uporządkowany mechanizm zapamiętywania:

* zaakceptowanych treści,
* zaakceptowanych grafik,
* preferowanych szablonów,
* poprawek wprowadzanych przez użytkownika,
* stylu komunikacji,
* preferowanych nagłówków,
* zabronionych sformułowań,
* preferowanych CTA,
* odrzuconych propozycji.

Mechanizm uczenia preferencji
Przykład:
System generuje pięć wariantów karuzeli.
Agent wybiera jeden, zmienia nagłówek i kolorystykę.
Ogarnio powinno umożliwić zapisanie tej decyzji jako preferencji na przyszłość.
Nie zakładaj automatycznie, że pojedyncza poprawka oznacza trwałą preferencję.
Wprowadź dwa poziomy pamięci:
Pamięć jawna
Preferencje świadomie zapisane lub zatwierdzone przez użytkownika.
Pamięć sugerowana
Wnioski z powtarzających się decyzji, które użytkownik może zaakceptować, odrzucić albo usunąć.
Nie trenuj własnego modelu na danych klientów bez osobnego projektu, odpowiedniej podstawy prawnej i świadomej decyzji produktowej.
Zastosuj preferencyjnie ustrukturyzowaną bazę profili oraz selektywne wyszukiwanie przykładów.
Zapewnij izolację pamięci pomiędzy biurami.
4. AI MARKETING DIRECTOR 2.0
Rozbuduj istniejący moduł AI Marketing Director.
Nie powinien być zwykłym interfejsem konwersacyjnym.
Ma pełnić funkcję centralnego systemu planowania marketingu biura.
Funkcja „Zaproponuj mi strategię”
Użytkownik wybiera:

* cel biznesowy,
* okres kampanii,
* grupę odbiorców,
* promowane nieruchomości,
* dostępne kanały,
* budżet reklamowy,
* preferowaną częstotliwość publikacji.

AI generuje:

1. Diagnozę sytuacji na podstawie dostępnych danych.
2. Cele marketingowe.
3. Segmenty odbiorców.
4. Główne komunikaty.
5. Filary contentowe.
6. Pomysły na kampanie.
7. Harmonogram działań.
8. Rekomendowane formaty.
9. Propozycje CTA.
10. Mierniki sukcesu.
11. Wstępny zestaw materiałów do przygotowania.

System musi jasno rozdzielać:

* rzeczywiste dane,
* wnioski,
* hipotezy,
* rekomendacje.

Nie przedstawiaj przewidywanych wyników marketingowych jako gwarantowanych.
5. MARKETING SKILLS ENGINE 2.0
Przeprowadź ponowny audyt wszystkich skills dostępnych w projekcie.
Uwzględnij zarówno:

* skills dostarczone przeze mnie,
* skills zaimplementowane w poprzednich etapach,
* wewnętrzne reguły copywritingu,
* zasady social media,
* zasady marketingu nieruchomości,
* wytyczne projektowania materiałów wizualnych.

Nie pomijaj istniejących materiałów.
Inteligentny wybór skills
Zbuduj mechanizm, który dobiera kompetencje na podstawie:

* rodzaju materiału,
* grupy docelowej,
* platformy,
* celu kampanii,
* profilu marki,
* specyfiki nieruchomości.

Przykład:
Zadanie: „Karuzela Instagram promująca luksusowy apartament”.
System dobiera:

* storytelling nieruchomości premium,
* copywriting sprzedażowy,
* projektowanie karuzeli,
* hierarchię typograficzną,
* wytyczne Brand Studio,
* zasady tworzenia hooków,
* odpowiednie CTA.

Nie wysyłaj całej biblioteki skills do AI w każdym zapytaniu.
Wprowadź:

* rejestr skills,
* wersjonowanie,
* ocenę przydatności,
* mechanizm doboru,
* ustrukturyzowane dane wejściowe,
* walidację danych wyjściowych,
* testy jakości.

Zadbaj o bezpieczeństwo przetwarzania instrukcji pochodzących z zewnętrznych plików.
6. CREATIVE ENGINE 2.0
To jeden z najważniejszych modułów tego etapu.
Chcę, aby Ogarnio generowało materiały wizualne na poziomie profesjonalnego studia kreatywnego.
Inteligentny dobór kompozycji
System powinien analizować:

* liczbę zdjęć,
* ich proporcje,
* dominujące kolory,
* ilość tekstu,
* główny przekaz,
* charakter nieruchomości,
* styl marki.

Następnie powinien dobierać najbardziej odpowiedni szablon lub wariant kompozycji.
Ocena zdjęć
Dodaj analizę techniczną zdjęć:

* rozdzielczość,
* proporcje,
* orientacja,
* jasność,
* kontrast,
* ostrość,
* ryzyko niewłaściwego kadrowania.

Jeżeli model wizualny jest dostępny, może proponować kategorie zdjęć, np. salon, kuchnia, sypialnia, elewacja.
Takie rozpoznanie traktuj jako propozycję, nie pewny fakt.
System nie może samodzielnie usuwać ani ukrywać rzeczywistych wad nieruchomości.
Inteligentne kadrowanie
Wprowadź możliwość automatycznej propozycji kadru.
Zachowaj oryginalne zdjęcie.
Użytkownik powinien móc przywrócić oryginalny kadr.
Nie generuj brakujących części pomieszczeń w sposób mogący wprowadzać odbiorcę ogłoszenia w błąd.
Warianty kreatywne
Dla jednej kampanii system może przygotować:

* wersję minimalistyczną,
* wersję premium,
* wersję dynamiczną,
* wersję ekspercką,
* wersję sprzedażową.

Wszystkie warianty muszą zachowywać najważniejsze zasady identyfikacji wizualnej.
7. CREATIVE QUALITY CONTROL
Dodaj automatyczny proces oceny jakości materiałów.
System powinien sprawdzać:
Tekst

* poprawność językową,
* zgodność z faktami,
* czytelność,
* dopasowanie do celu,
* jakość nagłówka,
* jakość CTA.

Grafika

* kontrast,
* marginesy,
* czytelność typografii,
* nachodzenie elementów,
* zgodność z brandingiem,
* poprawność proporcji,
* brak obciętych napisów.

Wideo

* poprawność napisów,
* czas trwania,
* bezpieczne obszary,
* płynność animacji,
* synchronizację scen,
* poprawność eksportu.

Wykorzystaj testy deterministyczne tam, gdzie to możliwe, zamiast polegać wyłącznie na subiektywnej ocenie modelu AI.
Dodaj ocenę jakości jako wewnętrzne narzędzie wspierające proces.
Nie przedstawiaj oceny jako naukowo obiektywnego wyniku.
Jeżeli materiał nie spełnia minimalnych wymagań technicznych, oznacz problem i zaproponuj poprawkę.
8. CAMPAIGN AUTOPILOT — TRYB PÓŁAUTOMATYCZNY
Dodaj funkcję:
„Przygotuj mój marketing na najbliższy miesiąc”.
Użytkownik wybiera:

* okres,
* liczbę publikacji,
* platformy,
* nieruchomości,
* filary tematyczne,
* cele marketingowe.

Ogarnio przygotowuje:

* plan publikacji,
* propozycje postów,
* karuzele,
* materiały promocyjne,
* scenariusze filmów,
* propozycje reklam,
* uzasadnienie strategii.

Materiały trafiają do kolejki akceptacji.
Użytkownik może:

* zaakceptować,
* odrzucić,
* edytować,
* ponownie wygenerować,
* zaplanować publikację.

Domyślnie Autopilot nie publikuje materiałów bez zatwierdzenia.
Nie uruchamia płatnych kampanii reklamowych.
Wprowadź limity kosztów AI dla zbiorczych generacji.
9. INTELLIGENT MARKETING RECOMMENDATIONS
Wykorzystaj dane analityczne z etapu 3.
System powinien proponować usprawnienia marketingowe.
Przykłady:

* rekomendacja zmiany częstotliwości publikacji,
* propozycja testu innego nagłówka,
* wskazanie niewykorzystanych nieruchomości,
* wykrywanie długich przerw w komunikacji,
* propozycja ponownej promocji oferty,
* rekomendacja stworzenia dodatkowej karuzeli,
* wskazanie tematów edukacyjnych, których brakuje.

Każda rekomendacja powinna zawierać:

1. Co proponuje AI?
2. Na jakiej podstawie?
3. Jakie dane wykorzystano?
4. Co użytkownik może zrobić?
5. Jaki rezultat warto mierzyć?

Unikaj pozornych analiz i wymyślania zależności przyczynowo-skutkowych.
W przypadku braku odpowiednich danych nie twórz fikcyjnych rekomendacji opartych na nieistniejących statystykach.
10. EXPERIENCE — NOWY INTERFEJS
Rozbuduj dashboard o sekcje:

* Marketing Overview
* AI Marketing Director
* Brand Intelligence
* Creative Studio
* Campaign Autopilot
* Recommendations
* Brand Memory

Zaprojektuj interfejs inspirowany profesjonalnymi narzędziami kreatywnymi i produktami premium SaaS.
Stosuj:

* jasne tła,
* fioletowe akcenty,
* nowoczesną typografię,
* inteligentne podpowiedzi,
* płynne przejścia,
* podglądy na żywo,
* czytelne wskaźniki postępu.

Najważniejsze zadania powinny wymagać możliwie niewielkiej liczby kliknięć.
Nie przeprojektowuj całej aplikacji bez potrzeby.
Zachowaj spójność z poprzednimi etapami.
11. ARCHITEKTURA AI
Wprowadź wyraźne rozdzielenie następujących warstw:
Brand Context
Zatwierdzone informacje o marce.
Property Context
Potwierdzone dane nieruchomości.
Marketing Skills
Wiedza i reguły marketingowe.
Campaign Brief
Cel i parametry bieżącego zadania.
Generation Engine
Generowanie tekstów i ustrukturyzowanych projektów.
Rendering Engine
Tworzenie grafik, filmów i dokumentów.
Quality Assurance
Kontrola zgodności i jakości.
Approval Workflow
Zatwierdzanie przez użytkownika.
Dopilnuj, aby modele AI zwracały przewidywalne, walidowane struktury danych dla generatorów.
Nie dopuszczaj do bezpośredniego wykonywania kodu wygenerowanego przez model w środowisku produkcyjnym.
Zadbaj o izolację tenantów oraz kontrolę dostępu do wszystkich danych.
Wprowadź wersjonowanie modeli, promptów i skills.
Dodaj pomiar kosztów każdego procesu generowania.
12. ZASADY PRYWATNOŚCI I BEZPIECZEŃSTWA
Brand Memory oraz analizy klientów muszą pozostawać odizolowane pomiędzy biurami.
Nie wykorzystuj danych jednego biura do personalizacji kampanii innego biura.
Zaimplementuj:

* możliwość wyłączenia pamięci marki,
* usuwanie zapisanych preferencji,
* eksport profilu marki,
* historię zmian,
* kontrolę dostępu,
* bezpieczne przetwarzanie plików,
* politykę retencji danych.

Nie pobieraj prywatnych profili społecznościowych ani danych niedostępnych poprzez autoryzowane integracje.
Korzystaj wyłącznie z danych, do których użytkownik posiada odpowiednie uprawnienia.
13. PLAN WDROŻENIA
Realizuj etap w następujących fazach:
FAZA 1 — Audyt
Sprawdzenie poprzednich etapów, skills, bazy danych i istniejących integracji.
FAZA 2 — Brand Intelligence
Analiza strony, ekstrakcja brandingu, zatwierdzanie profilu marki.
FAZA 3 — Brand Memory
Preferencje, zaakceptowane materiały, zarządzanie pamięcią.
FAZA 4 — Marketing Skills Engine
Selekcja, wersjonowanie i testowanie kompetencji.
FAZA 5 — AI Marketing Director
Strategie marketingowe i kampanie.
FAZA 6 — Creative Engine
Dobór szablonów, inteligentne kadrowanie, warianty wizualne.
FAZA 7 — Quality Assurance
Walidacja treści, grafik i wideo.
FAZA 8 — Campaign Autopilot
Zbiorcze generowanie planów i materiałów.
FAZA 9 — Recommendations
Analiza dostępnych danych i rekomendacje.
FAZA 10 — Testy
Testy integracyjne, bezpieczeństwa, jakości i wydajności.
Po każdej fazie zaktualizuj PROJECT_STATE.md.
14. TESTY AKCEPTACYJNE
Etap 4 jest ukończony, kiedy użytkownik może:

1. Podać stronę internetową swojego biura.
2. Otrzymać propozycję profilu marki.
3. Zatwierdzić branding.
4. Zapisać preferencje komunikacyjne.
5. Dodać przykładowe materiały referencyjne.
6. Wygenerować treści zgodne z zatwierdzonym stylem.
7. Wygenerować kilka różnych wariantów graficznych.
8. Zmienić preferencje i zobaczyć wpływ na kolejne generacje.
9. Stworzyć strategię marketingową.
10. Przygotować miesięczny plan kampanii.
11. Wygenerować zestaw materiałów do akceptacji.
12. Odrzucić lub zatwierdzić poszczególne materiały.
13. Otrzymać rekomendacje oparte na istniejących danych.
14. Usunąć zapisane preferencje.
15. Zachować izolację danych pomiędzy biurami.
16. Korzystać z aplikacji bez utraty funkcji z poprzednich etapów.

Testuj funkcje na rzeczywistych danych testowych, a nie wyłącznie na statycznych makietach.
15. OCZEKIWANY REZULTAT
Po zakończeniu przedstaw:

* rzeczywiście zaimplementowany kod,
* nowe migracje bazy danych,
* nowy Brand Intelligence,
* działającą pamięć marki,
* zaktualizowany silnik skills,
* AI Marketing Director 2.0,
* ulepszony Creative Engine,
* Campaign Autopilot,
* system rekomendacji,
* wyniki testów,
* ograniczenia,
* instrukcję konfiguracji,
* aktualizację PROJECT_STATE.md.

Dodatkowo przygotuj tabelę statusów:
Funkcja | Działa | Przetestowana | Wymaga konfiguracji | Pozostałe problemy
Nie deklaruj ukończenia funkcji, której nie udało się uruchomić lub przetestować.
Nie twórz atrap interfejsu ani fikcyjnych wyników analitycznych.
GŁÓWNY CEL: Ogarnio Estate ma być inteligentnym, spersonalizowanym systemem marketingowym dla biur nieruchomości, który rozumie konkretną markę, tworzy profesjonalne materiały i pomaga zarządzać komunikacją bez potrzeby korzystania z wielu oddzielnych narzędzi.
Rozpocznij od audytu istniejącego projektu, a następnie przejdź do implementacji według ustalonych faz.
