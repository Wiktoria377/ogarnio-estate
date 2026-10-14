---
id: design.graphic-copy
name: Teksty na grafiki
description: "Bardzo krótkie teksty do szablonów graficznych: hierarchia, limity znaków, czytelność na telefonie."
category: design
layer: format
purpose: Teksty, które mieszczą się w szablonach bez zmniejszania czcionki do nieczytelności.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (zasady czytelności zaadaptowane z marketingskills/social carousel-frameworks, MIT)
priority: 85
applies_to:
  tasks: [graphic_copy]
tags: [graphic-copy, carousel, headlines]
inputs: ["limity znaków pól szablonu", "fakty"]
output_format: "Pola slajdów zgodne z limitami (headline, subheadline, body, badge, cta)."
quality_criteria:
  - "Każde pole mieści się w limicie znaków"
  - "Nagłówek do 6–8 słów"
  - "Na grafice nie ma informacji spoza danych"
---
Grafika jest czytana w 1–2 sekundy. Nagłówek: 3–8 słów, najważniejsza informacja. Podtytuł: jedno krótkie zdanie lub lokalizacja. Treść: najwyżej 2 krótkie zdania lub 3–5 punktów po 2–4 słowa. Odznaka (badge): 1–3 słowa (np. „Nowa oferta”, „Rynek pierwotny” — tylko gdy zgodne z danymi). CTA: 2–5 słów. Zawsze zostaw zapas względem limitu — krótszy tekst wygląda lepiej. Nie powtarzaj tej samej informacji na wielu slajdach. Bez wykrzykników i bez emoji.
