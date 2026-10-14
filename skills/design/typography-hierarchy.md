---
id: design.typography-hierarchy
name: Hierarchia typograficzna
description: "Kolejność czytania na grafice i slajdzie: jeden dominujący element, wyraźny drugi poziom, reszta pomocnicza."
category: design
layer: format
purpose: "Teksty do szablonów pisane tak, aby font nagłówka i treści marki budował czytelną hierarchię na telefonie."
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (zasady hierarchii z wytycznych projektowania materiałów wizualnych, etap 4)
priority: 70
applies_to:
  tasks: [graphic_copy, generate, creative_variants]
tags: [typography, carousel, graphic-copy, headlines]
inputs: ["pola szablonu z limitami", "fonty marki (nagłówek, treść)"]
output_format: "Pola tekstowe o zróżnicowanej długości: krótki nagłówek, dłuższy podtytuł, zwięzłe punkty."
quality_criteria:
  - "Na slajdzie jest jeden element dominujący (nagłówek albo liczba z danych)"
  - "Podtytuł nie powtarza nagłówka"
  - "Treść pomocnicza nie konkuruje z nagłówkiem długością"
---
Na każdym slajdzie odbiorca czyta najpierw jeden element. Zdecyduj, który: nagłówek (obietnica, lokalizacja) albo fakt z danych (metraż, liczba pokoi, cena tylko gdy jest w danych). Drugi poziom to podtytuł: jedno zdanie, które dopowiada, a nie powtarza. Trzeci poziom to krótkie punkty lub CTA.

Pisz z myślą o fontach marki: font nagłówka (często szeryfowy lub wyrazisty) dobrze znosi 3–6 słów, font treści potrzebuje krótkich zdań. Unikaj dwóch długich pól na jednym slajdzie, bo wtedy szablon zmniejsza tekst i hierarchia znika. Nie zapisuj całych zdań wielkimi literami i nie dodawaj znaków ozdobnych zamiast hierarchii. W karuzeli zachowaj ten sam układ poziomów na kolejnych slajdach, żeby seria była spójna.
