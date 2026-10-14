---
id: realestate.campaign-goal-price-drop
name: "Cel kampanii: obniżka ceny"
description: "Uczciwa komunikacja nowej ceny: tylko kwoty z danych, bez presji i bez sugerowania okazji inwestycyjnej."
category: real-estate
layer: domain
purpose: Komunikat o obniżce, który buduje zaufanie, a nie wrażenie wyprzedaży.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 75
tags: [campaign-goal-price-drop]
inputs: ["obecna cena", "poprzednia cena", "fakty oferty"]
output_format: "Zasady dla briefu i materiałów kampanii."
quality_criteria:
  - "Obie ceny i kwota obniżki dokładnie jak w faktach; brak procentów, jeśli nie podano ich w danych"
  - "Brak sformułowań „okazja inwestycyjna”, „cena poniżej rynku”, „najtaniej w okolicy”"
---
Obniżkę komunikuj faktami: „Nowa cena: X (wcześniej: Y)”. Kwotę obniżki podawaj tylko wtedy, gdy jest w faktach. Nie licz procentów samodzielnie i nie porównuj z rynkiem. Nie sugeruj przyczyny obniżki ani pośpiechu sprzedającego. Ton spokojny, informacyjny. Najmocniejszy argument oferty (z faktów) dalej prowadzi komunikację: nowa cena to powód, żeby wrócić do oferty, a nie jedyna jej zaleta. CTA: wiadomość lub prezentacja.
