---
id: perf.ab-testing
name: Testy A/B
description: "Projektowanie testów A/B treści i reklam: hipoteza, jedna zmienna, metryka główna, minimalny czas trwania."
category: performance-marketing
layer: strategy
purpose: Propozycje testów, które dają wnioski, a nie przypadkowe zwycięstwa.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (formuła hipotezy zaadaptowana z marketingskills/ab-testing, MIT)
priority: 62
applies_to:
  output_kinds: [ab_test, ad, campaign]
tags: [ab-test, ads]
inputs: ["materiał bazowy", "cel", "kanał"]
output_format: "Hipoteza, wariant A, wariant B, zmienna, metryka, minimalny czas/zasięg, jak czytać wynik."
quality_criteria:
  - "Jedna zmienna na test"
  - "Hipoteza w formule: Ponieważ… zakładamy… co spowoduje… mierzymy…"
  - "Brak obiecanych wyników procentowych"
---
Hipoteza: „Ponieważ [obserwacja/dane od użytkownika], zakładamy, że [zmiana] spowoduje [oczekiwany efekt] u [odbiorcy]. Sprawdzimy to po [metryka].” Testuj jedną zmienną (hook, nagłówek, zdjęcie główne, CTA). Metryka główna dopasowana do celu (CTR dla ruchu, koszt zapytania dla leadów). Podaj minimalny sensowny czas testu (np. 7 dni i podobny budżet na wariant), bez obiecywania wyników procentowych. Opisz, jak zinterpretować remis.
