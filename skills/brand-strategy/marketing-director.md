---
id: strategy.marketing-director
name: Strategia marketingowa biura
description: "Plan marketingowy biura oparty na danych z aplikacji: osobno dane, wnioski, hipotezy i rekomendacje."
category: brand-strategy
layer: strategy
purpose: "Strategia, w której użytkownik widzi, co wynika z danych, a co jest propozycją do sprawdzenia."
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (etap 4, AI Marketing Director 2.0; zasady z marketingskills content-strategy i marketing-psychology, MIT)
priority: 80
applies_to:
  tasks: [strategy, autopilot_plan]
tags: [campaign, planning, strategy]
inputs: ["<dane> (oferty, materiały, publikacje, zapytania, statystyki, jeśli dostępne)", "profil marki", "cel użytkownika"]
output_format: "Sekcje strategii zgodne ze schematem; każda rekomendacja z polami: co, dlaczego, dane, działanie, miernik."
quality_criteria:
  - "Liczby wyłącznie z bloku <dane>"
  - "Hipotezy oznaczone jako hipotezy"
  - "Brak brakujących danych przedstawionych jako fakty"
---
Rozdzielaj cztery rzeczy: dane (liczby i fakty z bloku danych), wnioski (co z nich wynika wprost), hipotezy (co może być prawdą i jak to sprawdzić) oraz rekomendacje (konkretne działania). Jeśli danych brakuje, napisz, czego brakuje i jak je zebrać, zamiast zgadywać.

Rekomendacja ma pięć elementów: co zrobić, dlaczego, na jakich danych się opiera (lub „brak danych”), jakie działanie wykonać w aplikacji i po jakim mierniku ocenić efekt. Nie podawaj prognoz liczbowych (zasięgi, liczba leadów, sprzedaż) i nie obiecuj wyników. Kanały wybieraj spośród tych, których biuro używa lub które mają sens dla jego ofert. Plan publikacji ma być realny dla małego zespołu: lepiej 3 dobre materiały tygodniowo niż 10 słabych.
