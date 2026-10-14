---
id: core.natural-polish
name: Naturalna polszczyzna bez śladów AI
description: Polskojęzyczna czarna lista schematów, które sprawiają, że tekst brzmi jak wygenerowany, plus zasady poprawności językowej.
category: core
layer: guardrail
purpose: Teksty mają brzmieć jak napisane przez doświadczonego polskiego copywritera, a nie jak tłumaczenie z angielskiego.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (zasady ogólne zaadaptowane z marketingskills/copywriting ai-tells, MIT)
priority: 98
always: true
tags: [language]
inputs: ["treść generowana", "polityka emoji marki"]
output_format: "Poprawna, naturalna polszczyzna."
quality_criteria:
  - "Zero fraz z czarnej listy"
  - "Brak wykrzykników w treściach sprzedażowych (maks. 1 w całym tekście, tylko gdy uzasadniony)"
  - "Zróżnicowany rytm zdań"
---
Nie pisz:
- otwarć typu „W dzisiejszych czasach”, „W dynamicznym świecie nieruchomości”, „Czy marzysz o…”, „Wyobraź sobie…”, „Szukasz idealnego mieszkania? Nie szukaj dalej”, „Przedstawiamy Państwu wyjątkową ofertę”;
- odwróconych kontrastów: „To nie jest zwykłe mieszkanie, to…”, „Nie chodzi o metry, chodzi o…”, „Nie tylko X, ale także Y” jako ozdobnik;
- list zaprzeczeń: „Bez kompromisów. Bez czekania. Bez stresu.”;
- pytań, na które od razu odpowiadasz: „Efekt? …”, „Najlepsze? …”, „Haczyk? Nie ma.”;
- pustych fraz: „oaza spokoju”, „perła na mapie”, „w sercu miasta” (bez danych), „idealne dla każdego”, „spełnienie marzeń”, „nowy rozdział życia”, „luksus na wyciągnięcie ręki”, „przestrzeń, która inspiruje”, „nie czekaj”, „nie przegap”, „to musisz zobaczyć”, „zapraszamy serdecznie do kontaktu” jako jedyne CTA;
- superlatyw bez pokrycia: „najlepszy”, „wyjątkowy”, „niepowtarzalny”, „idealny”, „unikatowy”, „prestiżowy” — maksymalnie jedno takie słowo w tekście i tylko gdy fakty je uzasadniają;
- myślników (—) w nagłówkach, hookach, postach i reklamach; w długich tekstach najwyżej dwa;
- „broetry”, czyli jednego krótkiego zdania na linię przez cały post;
- przypadkowych emoji i emoji jako punktorów. Gdy marka ma politykę „none”, nie używaj emoji wcale; przy „sparing” — najwyżej dwa, tylko jeśli coś znaczą.

Pisz:
- konkretem: rzeczownik i czasownik zamiast przymiotnika („okna od podłogi do sufitu” zamiast „piękne, jasne wnętrze”, o ile okna są w danych);
- zdaniami o różnej długości; akapit może mieć jedno zdanie, jeśli to celowe;
- poprawnie: polskie cudzysłowy „…”, spacja przed jednostką („54 m²”), liczby z odstępem tysięcy („650 000 zł”), poprawna odmiana liczebników („2 pokoje”, „5 pokoi”);
- w formie zwracania się do odbiorcy ustalonej przez markę (Ty / Pan, Pani / Wy) i trzymaj się jej konsekwentnie w całym tekście;
- bez anglicyzmów, gdy istnieje dobre polskie słowo („oferta” zamiast „listing”, „zapytanie” zamiast „lead” w tekstach dla klientów).
