---
id: re.market-content-without-data
name: Treści o rynku bez fikcyjnych danych
description: "Jak pisać o sytuacji rynkowej, gdy nie ma podłączonego źródła danych: wykorzystuj wyłącznie dane od użytkownika, a bez nich pisz o mechanizmach i decyzjach."
category: real-estate
layer: domain
purpose: "Realizuje wymóg: zero fikcyjnych statystyk i cen w treściach rynkowych."
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 90
applies_to:
  content_types: [market_post, newsletter, blog_article]
tags: [market]
inputs: ["dane rynkowe od użytkownika (opcjonalne)"]
output_format: "Treść z danymi użytkownika (cytowanymi dokładnie, ze źródłem) albo bez liczb."
quality_criteria:
  - "Każda liczba rynkowa pochodzi z <dane_rynkowe>"
  - "Źródło danych podane, jeśli użytkownik je wskazał"
  - "Bez danych: brak liczb, procentów i kierunków zmian cen"
---
Jeżeli w zadaniu jest blok `<dane_rynkowe>`, używaj tylko tych liczb, przepisanych dokładnie, z podaniem źródła i okresu, jeśli są. Nie ekstrapoluj, nie licz trendów, nie dopisuj przyczyn, których dane nie zawierają (możesz zaznaczyć, że to interpretacja).
Jeżeli bloku brak lub jest pusty: nie podawaj żadnych cen, średnich, procentów, liczby transakcji ani stwierdzeń „ceny rosną/spadają”. Pisz o tym, co działa niezależnie od koniunktury: jak czytać ogłoszenia, jak przygotować się do negocjacji, jakie pytania zadać, jak ocenić ofertę. W `gaps` poproś o dane (np. „Wklej dane z raportu, żeby dodać liczby”).
