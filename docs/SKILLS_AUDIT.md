# Audyt załączników i biblioteka kompetencji

Ten raport obejmuje **wszystkie 8 archiwów** dostarczonych do projektu. Załączniki traktowałam jako źródła wiedzy, nie jako kod do uruchomienia: żaden skrypt, polecenie instalacyjne ani zależność z archiwów nie zostały wykonane ani dodane do aplikacji. Archiwa rozpakowałam do osobnego katalogu i czytałam jako tekst.

## 1. Inwentaryzacja

| Archiwum | Pliki | SKILL.md | Licencja | Czym jest | Decyzja |
| --- | ---: | ---: | --- | --- | --- |
| marketingskills-main.zip (Corey Haines) | 652 | 50 | MIT | Kompetencje marketingowe dla agentów AI (copywriting, social, reklamy, e-mail, CRO, SEO, SaaS) | **Źródło główne.** 9 plików zaimportowanych jako adaptacje (`skills/imported/marketingskills`); zasady z copywriting, social, ad-creative, emails, content-strategy, lead-magnets i ab-testing wbudowane w 26 kompetencji OGARNIO (źródło podane w `source.origin`) |
| claude-skills-main.zip | 567 | 67 | MIT | Kompetencje programistyczne (React, Postgres, bezpieczeństwo, testy, DevOps, języki) | Nie są kompetencjami marketingowymi. Nie importowane do aplikacji. Sklasyfikowane jako materiał deweloperski |
| impeccable-main.zip | 3900 | 24 | Apache 2.0 | Jedna kompetencja projektowania interfejsów („impeccable”) w 20 wariantach pod różne narzędzia (.claude, .cursor, .gemini…) + 4 pliki testowe | Materiał deweloperski o jakości UI. Nie importowany do runtime |
| taste-skill-main.zip | 64 | 13 | MIT | Kompetencje estetyki UI i generowania obrazów (minimalizm, brutalizm, brand kit, image-to-code) | Materiał deweloperski. Nie importowany. Część zakazów jest sprzeczna z briefem (patrz sekcja 3) |
| skills-main.zip (Emil Kowalski) | 28 | 14 | MIT | Animacje UI, design engineering, Sonner, Swift | Materiał deweloperski. Nie importowany |
| web-asset-generator-main.zip | 19 | 1 | MIT | Generator favicon, ikon aplikacji i obrazów Open Graph przez skrypty Python (Pillow) | Nie importowany: wymaga uruchamiania skryptów i zależności Pythona spoza projektu, a funkcja (ikony serwisu) nie należy do zakresu etapu 1 |
| Motion-Graphics-starter-kit.zip | 31 | 0 | brak dla zestawu; fonty OFL | Kurs „Motion Graphics with Claude Code”: prompty (HyperFrames), efekty dźwiękowe, klip wideo, zrzuty ekranów | Nie importowany: brak licencji dla promptów, dźwięków i klipu; prompty każą instalować oprogramowanie (nie wykonane); wideo jest poza zakresem etapu 1 |
| 30-seconds-of-code-master.zip | 3409 | 0 | CC-BY-4.0 (fragmenty kodu) | Serwis z artykułami o programowaniu: 782 artykuły Markdown (JS, CSS, React, Python, git), 2178 obrazów, kod strony (Astro) | Nie zawiera kompetencji ani treści marketingowych. Nie importowany |

Razem: **169 plików SKILL.md**, wszystkie odczytane (frontmatter i treść). Pełna lista z klasyfikacją jest w załączniku na końcu.

### Czego nie dało się odczytać lub zaimportować

- **Wszystkie pliki tekstowe odczytały się poprawnie.** Żaden SKILL.md nie był uszkodzony; wszystkie mają poprawny frontmatter.
- **Pliki binarne nie były analizowane treściowo:** `demo.mp4` (web-asset-generator), `clip.mp4` i 9 plików dźwiękowych (Motion kit), obrazy w 30-seconds-of-code. Sprawdziłam tylko ich typ i rolę z dokumentacji.
- **30-seconds-of-code-master.zip** (407 MB) pojawił się w plikach projektu później niż pozostałe archiwa. Przeanalizowałam listę 3409 plików, README i licencję oraz rozkład tematów artykułów; pojedynczych artykułów o programowaniu nie czytałam, bo nie dotyczą marketingu nieruchomości.
- **Nic z archiwów nie zostało uruchomione.** Skrypty (Python w web-asset-generator, polecenia instalacyjne w Motion kit i w kompetencjach deweloperskich) potraktowałam wyłącznie jako opis.

## 2. Klasyfikacja i powtarzające się zasady

Kompetencje marketingowe (marketingskills) powtarzają kilka zasad, które przeniosłam do warstwy nadrzędnej OGARNIO, bo dotyczą każdego tekstu:

| Zasada | Gdzie występuje w źródłach | Gdzie trafiła |
| --- | --- | --- |
| Konkret zamiast ogólników, korzyść przed cechą | copywriting, ad-creative, social, emails | `copywriting/benefit-persuasion`, `real-estate/benefit-communication` |
| Pierwsza linia decyduje (hook) | social, ad-creative/hook-system, video | `social-media/hooks`, `imported/hook-system` |
| Jedno CTA, konkretne działanie | copywriting, emails, cro, popups | `copywriting/cta` |
| Unikanie „AI-tells” i klisz | copywriting/ai-tells, social (tells), copy-editing | `core/natural-polish`, `imported/ai-tells`, `imported/social-tells`, reguły QA |
| Nie wymyślaj liczb ani dowodów społecznych | copywriting, ad-creative, cro | `core/fact-integrity`, `core/claims-compliance`, reguły QA liczb |
| Limity platform (znaki, proporcje) | social/platforms, ad-creative | `social-media/instagram`, `facebook`, `linkedin`, `tiktok`, `performance-marketing/meta-ads` |
| Struktura karuzeli: obietnica, rozwinięcie, CTA | social/carousel-frameworks | `social-media/carousel-structure`, `design/carousel-visual-narrative`, `design/graphic-copy` |
| Redakcja wieloprzebiegowa | copy-editing (seven sweeps) | `imported/seven-sweeps` (używana przy poprawkach) |

Kompetencje branżowe (opisy ofert, lokalizacja, inwestorzy, pierwsi kupujący, najem, premium, pozyskiwanie właścicieli, edukacja transakcyjna, rynek bez danych) i 5 stylów marki napisałam od zera, bo żadne archiwum nie dotyczy nieruchomości ani polskiego rynku.

## 3. Sprzeczności i jak je rozstrzygnęłam

| Sprzeczność | Rozstrzygnięcie |
| --- | --- |
| taste-skill i impeccable zakazują „AI-purple” (fioletowe poświaty, neonowe gradienty), a brief wymaga fioletowego akcentu | Wygrywa brief. Jeden stonowany akcent (#5B3FF0) na złamanej bieli, bez gradientów i poświat, czyli zgodnie z intencją obu zakazów (umiar), a nie z ich literą |
| marketingskills zakłada SaaS (trial, onboarding, churn, pricing, ASO) | Te kompetencje pominięte (lista w załączniku). Z ogólnych wzięłam tylko zasady przenośne |
| Źródła zachęcają do pilności i niedostępności („tylko dziś”, „ostatnie miejsca”) oraz do dowodu społecznego w liczbach | W nieruchomościach to ryzyko wprowadzenia w błąd. Dopuszczalne tylko, gdy fakt jest w danych od użytkownika; reguły QA flagują pilność i liczby bez pokrycia |
| marketing-psychology opisuje techniki perswazji (kotwiczenie, niedobór) | Zaadaptowane jako „etyczne zastosowanie”: wyjaśnianie decyzji odbiorcy, bez manipulacji i bez obietnic finansowych |
| Kompetencje deweloperskie zakładają dostęp agenta do terminala, plików `.agents/*` i narzędzi CLI | Takie instrukcje nie mają sensu w aplikacji i byłyby furtką dla poleceń z danych. Usunięte z adaptacji; dodatkowo `core/untrusted-input` każe ignorować polecenia w danych |

## 4. Biblioteka kompetencji w aplikacji

- 71 plików w `skills/`, każdy z frontmatter walidowanym schematem (`skillMetaSchema`): id, nazwa, opis, kategoria, warstwa, cel, wersja, źródło (wbudowana lub importowana, pochodzenie, ścieżka w oryginale, licencja, wersja oryginału), priorytet, zakres zastosowania (zadania, grupy, rodzaje treści, platformy, cele, styl marki, czy wymaga oferty), tagi, wejścia, format wyjścia, kryteria jakości.
- Kategorie: zasady nadrzędne, copywriting, social media, nieruchomości, reklama płatna, strategia marki, strategia treści, grafika, e-mail, zaimportowane.
- Warstwy decydują o kolejności w prompcie: guardrail → brand → strategy → domain → format → technique → qa.
- **Automatyczny dobór** (`selector.ts`) punktuje każdą kompetencję względem zadania i odrzuca niepasujące (np. kompetencję wymagającą oferty, gdy jej nie ma). Zasady nadrzędne i styl marki są zawsze dołączane, pozostałe w ramach budżetu tokenów.
- **Kompozycja** (`composer.ts`) skleja instrukcje w kolejności warstw z nagłówkiem każdej kompetencji. Lista wybranych kompetencji, z powodem wyboru, zapisuje się z każdą wersją materiału (zakładka „Kompetencje” w edytorze) i jest widoczna w katalogu `/skills`.
- **Jakość:** kryteria jakości wybranych kompetencji trafiają do recenzji AI.
- **Walidacja:** `npm run skills:check` i `scripts/check-skill-yaml.mjs`. Testy: `tests/unit/skills.test.ts` (parsowanie wszystkich plików, unikalne id, dobór dla typowych zadań).
- Dodanie kompetencji to dodanie pliku Markdown; nie wymaga zmian w kodzie.

## Załącznik: wszystkie pliki SKILL.md (169)

Kolumna „Decyzja”: **A** zaadaptowana jako plik w `skills/imported`, **Z** zasady wbudowane w kompetencję OGARNIO, **P** pominięta z podanego powodu, **D** materiał deweloperski (nie dla runtime).

| Archiwum | Kompetencja | Ścieżka | Decyzja |
| --- | --- | --- | --- |
| claude-skills | angular-architect | `skills/angular-architect/SKILL.md` | D |
| claude-skills | api-designer | `skills/api-designer/SKILL.md` | D |
| claude-skills | architecture-designer | `skills/architecture-designer/SKILL.md` | D |
| claude-skills | atlassian-mcp | `skills/atlassian-mcp/SKILL.md` | D |
| claude-skills | chaos-engineer | `skills/chaos-engineer/SKILL.md` | D |
| claude-skills | cli-developer | `skills/cli-developer/SKILL.md` | D |
| claude-skills | cloud-architect | `skills/cloud-architect/SKILL.md` | D |
| claude-skills | code-documenter | `skills/code-documenter/SKILL.md` | D |
| claude-skills | code-reviewer | `skills/code-reviewer/SKILL.md` | D |
| claude-skills | cpp-pro | `skills/cpp-pro/SKILL.md` | D |
| claude-skills | csharp-developer | `skills/csharp-developer/SKILL.md` | D |
| claude-skills | database-optimizer | `skills/database-optimizer/SKILL.md` | D |
| claude-skills | debugging-wizard | `skills/debugging-wizard/SKILL.md` | D |
| claude-skills | devops-engineer | `skills/devops-engineer/SKILL.md` | D |
| claude-skills | django-expert | `skills/django-expert/SKILL.md` | D |
| claude-skills | django-storages-s3 | `skills/django-storages-s3/SKILL.md` | D |
| claude-skills | dotnet-core-expert | `skills/dotnet-core-expert/SKILL.md` | D |
| claude-skills | embedded-systems | `skills/embedded-systems/SKILL.md` | D |
| claude-skills | fastapi-expert | `skills/fastapi-expert/SKILL.md` | D |
| claude-skills | feature-forge | `skills/feature-forge/SKILL.md` | D |
| claude-skills | fine-tuning-expert | `skills/fine-tuning-expert/SKILL.md` | D |
| claude-skills | flutter-expert | `skills/flutter-expert/SKILL.md` | D |
| claude-skills | fullstack-guardian | `skills/fullstack-guardian/SKILL.md` | D |
| claude-skills | game-developer | `skills/game-developer/SKILL.md` | D |
| claude-skills | golang-pro | `skills/golang-pro/SKILL.md` | D |
| claude-skills | graphql-architect | `skills/graphql-architect/SKILL.md` | D |
| claude-skills | java-architect | `skills/java-architect/SKILL.md` | D |
| claude-skills | javascript-pro | `skills/javascript-pro/SKILL.md` | D |
| claude-skills | kotlin-specialist | `skills/kotlin-specialist/SKILL.md` | D |
| claude-skills | kubernetes-specialist | `skills/kubernetes-specialist/SKILL.md` | D |
| claude-skills | laravel-specialist | `skills/laravel-specialist/SKILL.md` | D |
| claude-skills | legacy-modernizer | `skills/legacy-modernizer/SKILL.md` | D |
| claude-skills | mcp-developer | `skills/mcp-developer/SKILL.md` | D |
| claude-skills | microservices-architect | `skills/microservices-architect/SKILL.md` | D |
| claude-skills | ml-pipeline | `skills/ml-pipeline/SKILL.md` | D |
| claude-skills | monitoring-expert | `skills/monitoring-expert/SKILL.md` | D |
| claude-skills | nestjs-expert | `skills/nestjs-expert/SKILL.md` | D |
| claude-skills | nextjs-developer | `skills/nextjs-developer/SKILL.md` | D |
| claude-skills | pandas-pro | `skills/pandas-pro/SKILL.md` | D |
| claude-skills | php-pro | `skills/php-pro/SKILL.md` | D |
| claude-skills | playwright-expert | `skills/playwright-expert/SKILL.md` | D |
| claude-skills | postgres-pro | `skills/postgres-pro/SKILL.md` | D |
| claude-skills | prompt-engineer | `skills/prompt-engineer/SKILL.md` | D |
| claude-skills | python-pro | `skills/python-pro/SKILL.md` | D |
| claude-skills | rag-architect | `skills/rag-architect/SKILL.md` | D |
| claude-skills | rails-expert | `skills/rails-expert/SKILL.md` | D |
| claude-skills | react-expert | `skills/react-expert/SKILL.md` | D |
| claude-skills | react-native-expert | `skills/react-native-expert/SKILL.md` | D |
| claude-skills | rust-engineer | `skills/rust-engineer/SKILL.md` | D |
| claude-skills | salesforce-developer | `skills/salesforce-developer/SKILL.md` | D |
| claude-skills | secure-code-guardian | `skills/secure-code-guardian/SKILL.md` | D |
| claude-skills | security-reviewer | `skills/security-reviewer/SKILL.md` | D |
| claude-skills | shopify-expert | `skills/shopify-expert/SKILL.md` | D |
| claude-skills | spark-engineer | `skills/spark-engineer/SKILL.md` | D |
| claude-skills | spec-miner | `skills/spec-miner/SKILL.md` | D |
| claude-skills | spring-boot-engineer | `skills/spring-boot-engineer/SKILL.md` | D |
| claude-skills | sql-pro | `skills/sql-pro/SKILL.md` | D |
| claude-skills | sre-engineer | `skills/sre-engineer/SKILL.md` | D |
| claude-skills | swift-expert | `skills/swift-expert/SKILL.md` | D |
| claude-skills | terraform-engineer | `skills/terraform-engineer/SKILL.md` | D |
| claude-skills | test-master | `skills/test-master/SKILL.md` | D |
| claude-skills | the-fool | `skills/the-fool/SKILL.md` | D |
| claude-skills | typescript-pro | `skills/typescript-pro/SKILL.md` | D |
| claude-skills | vue-expert-js | `skills/vue-expert-js/SKILL.md` | D |
| claude-skills | vue-expert | `skills/vue-expert/SKILL.md` | D |
| claude-skills | websocket-engineer | `skills/websocket-engineer/SKILL.md` | D |
| claude-skills | wordpress-pro | `skills/wordpress-pro/SKILL.md` | D |
| impeccable | impeccable | `.agent/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.agents/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.claude/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.cursor/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.dsh/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.gemini/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.github/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.grok/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.hermes/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.kiro/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.opencode/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.pi/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.qoder/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.rovodev/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.trae-cn/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.trae/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.veto/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `.vibe/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `cursor-plugin/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `plugin/skills/impeccable/SKILL.md` | D |
| impeccable | impeccable | `tests/oracle/workspaces/ctx-pin/.agents/skills/impeccable/SKILL.md` | D: plik testowy repozytorium |
| impeccable | audit | `tests/oracle/workspaces/ctx-pin/.claude/skills/audit/SKILL.md` | D: plik testowy repozytorium |
| impeccable | impeccable | `tests/oracle/workspaces/ctx-pin/.claude/skills/impeccable/SKILL.md` | D: plik testowy repozytorium |
| impeccable | impeccable | `tests/oracle/workspaces/ctx-pin/.cursor/skills/impeccable/SKILL.md` | D: plik testowy repozytorium |
| marketingskills | ab-testing | `skills/ab-testing/SKILL.md` | Z |
| marketingskills | ad-creative | `skills/ad-creative/SKILL.md` | Z (+A hook-system) |
| marketingskills | ads | `skills/ads/SKILL.md` | P: pokrywa się z ad-creative (Z), dotyczy zarządzania kampaniami w panelach |
| marketingskills | ai-seo | `skills/ai-seo/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | analytics | `skills/analytics/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | aso | `skills/aso/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | attribution | `skills/attribution/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | churn-prevention | `skills/churn-prevention/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | co-marketing | `skills/co-marketing/SKILL.md` | P: poza zakresem etapu 1 (kanał lub działanie spoza treści i grafik) |
| marketingskills | cold-email | `skills/cold-email/SKILL.md` | P: zimny mailing (ryzyko RODO) |
| marketingskills | community-marketing | `skills/community-marketing/SKILL.md` | P: poza zakresem etapu 1 (kanał lub działanie spoza treści i grafik) |
| marketingskills | competitor-profiling | `skills/competitor-profiling/SKILL.md` | P: poza zakresem etapu 1 (kanał lub działanie spoza treści i grafik) |
| marketingskills | competitors | `skills/competitors/SKILL.md` | P: poza zakresem etapu 1 (kanał lub działanie spoza treści i grafik) |
| marketingskills | content-strategy | `skills/content-strategy/SKILL.md` | A searchable-shareable, Z |
| marketingskills | copy-editing | `skills/copy-editing/SKILL.md` | A seven-sweeps |
| marketingskills | copywriting | `skills/copywriting/SKILL.md` | Z (+A ai-tells) |
| marketingskills | cro | `skills/cro/SKILL.md` | P: optymalizacja konwersji stron poza zakresem |
| marketingskills | customer-research | `skills/customer-research/SKILL.md` | P: badania klientów poza zakresem |
| marketingskills | directory-submissions | `skills/directory-submissions/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | emails | `skills/emails/SKILL.md` | A email-principles, Z |
| marketingskills | events | `skills/events/SKILL.md` | P: poza zakresem |
| marketingskills | free-tools | `skills/free-tools/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | image | `skills/image/SKILL.md` | P: generowanie obrazów AI wykluczone (zdjęcia ofert nie są zmieniane) |
| marketingskills | influencer-marketing | `skills/influencer-marketing/SKILL.md` | P: poza zakresem etapu 1 (kanał lub działanie spoza treści i grafik) |
| marketingskills | launch | `skills/launch/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | lead-magnets | `skills/lead-magnets/SKILL.md` | A lead-magnets, Z |
| marketingskills | marketing-council | `skills/marketing-council/SKILL.md` | P: poza zakresem etapu 1 (kanał lub działanie spoza treści i grafik) |
| marketingskills | marketing-ideas | `skills/marketing-ideas/SKILL.md` | P: generator pomysłów SaaS |
| marketingskills | marketing-loops | `skills/marketing-loops/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | marketing-plan | `skills/marketing-plan/SKILL.md` | P: plan marketingowy firmy poza zakresem |
| marketingskills | marketing-psychology | `skills/marketing-psychology/SKILL.md` | A (wersja etyczna) |
| marketingskills | offers | `skills/offers/SKILL.md` | P: konstruowanie ofert produktowych (SaaS) |
| marketingskills | onboarding | `skills/onboarding/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | paywalls | `skills/paywalls/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | popups | `skills/popups/SKILL.md` | P: poza zakresem |
| marketingskills | pricing | `skills/pricing/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | product-marketing | `skills/product-marketing/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | programmatic-seo | `skills/programmatic-seo/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | prospecting | `skills/prospecting/SKILL.md` | P: poza zakresem etapu 1 (kanał lub działanie spoza treści i grafik) |
| marketingskills | public-relations | `skills/public-relations/SKILL.md` | P: poza zakresem etapu 1 (kanał lub działanie spoza treści i grafik) |
| marketingskills | referrals | `skills/referrals/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | revops | `skills/revops/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | sales-enablement | `skills/sales-enablement/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | schema | `skills/schema/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | seo-audit | `skills/seo-audit/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | signup | `skills/signup/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | site-architecture | `skills/site-architecture/SKILL.md` | P: SaaS/produkt cyfrowy lub SEO techniczne |
| marketingskills | sms | `skills/sms/SKILL.md` | P: kanał SMS poza zakresem |
| marketingskills | social | `skills/social/SKILL.md` | Z (+A carousel-frameworks, social-tells) |
| marketingskills | video | `skills/video/SKILL.md` | P: produkcja wideo poza etapem 1 (scenariusze z kompetencji social) |
| skills | animate-expo | `skills/animate-expo/SKILL.md` | D |
| skills | animate | `skills/animate/SKILL.md` | D |
| skills | animation-vocabulary | `skills/animation-vocabulary/SKILL.md` | D |
| skills | apple-design | `skills/apple-design/SKILL.md` | D |
| skills | ask-sonner | `skills/ask-sonner/SKILL.md` | D |
| skills | break-ui | `skills/break-ui/SKILL.md` | D |
| skills | emil-design-eng | `skills/emil-design-eng/SKILL.md` | D |
| skills | find-animation-opportunities | `skills/find-animation-opportunities/SKILL.md` | D |
| skills | improve-animations | `skills/improve-animations/SKILL.md` | D |
| skills | mobile-native | `skills/mobile-native/SKILL.md` | D |
| skills | pick-ui-library | `skills/pick-ui-library/SKILL.md` | D |
| skills | prototype | `skills/prototype/SKILL.md` | D |
| skills | review-animations | `skills/review-animations/SKILL.md` | D |
| skills | write-swift | `skills/write-swift/SKILL.md` | D |
| taste-skill | brandkit | `skills/brandkit/SKILL.md` | D |
| taste-skill | industrial-brutalist-ui | `skills/brutalist-skill/SKILL.md` | D |
| taste-skill | gpt-taste | `skills/gpt-tasteskill/SKILL.md` | D |
| taste-skill | image-to-code | `skills/image-to-code-skill/SKILL.md` | D |
| taste-skill | imagegen-frontend-mobile | `skills/imagegen-frontend-mobile/SKILL.md` | D |
| taste-skill | imagegen-frontend-web | `skills/imagegen-frontend-web/SKILL.md` | D |
| taste-skill | minimalist-ui | `skills/minimalist-skill/SKILL.md` | D |
| taste-skill | full-output-enforcement | `skills/output-skill/SKILL.md` | D |
| taste-skill | redesign-existing-projects | `skills/redesign-skill/SKILL.md` | D |
| taste-skill | high-end-visual-design | `skills/soft-skill/SKILL.md` | D |
| taste-skill | stitch-design-taste | `skills/stitch-skill/SKILL.md` | D |
| taste-skill | design-taste-frontend-v1 | `skills/taste-skill-v1/SKILL.md` | D |
| taste-skill | design-taste-frontend | `skills/taste-skill/SKILL.md` | D |
| web-asset-generator | web-asset-generator | `skills/web-asset-generator/SKILL.md` | P: wymaga uruchamiania skryptów Python; poza zakresem |
