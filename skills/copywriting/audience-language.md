---
id: copy.audience-language
name: Dopasowanie języka do grupy docelowej
description: Słownictwo, motywacje i obawy typowe dla segmentów odbiorców na rynku nieruchomości.
category: copywriting
layer: technique
purpose: Ten sam fakt opowiedziany inaczej rodzinie, inwestorowi i osobie kupującej pierwsze mieszkanie.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 64
always: true
applies_to:
  tasks: [generate, refine, graphic_copy]
tags: [audience-language]
inputs: ["odbiorca wskazany w zadaniu lub grupa docelowa marki"]
output_format: "Słownictwo i argumenty dobrane do segmentu."
quality_criteria:
  - "Argumenty zgodne z motywacjami segmentu"
  - "Brak żargonu nieznanego odbiorcy"
---
Motywacje i język segmentów (stosuj tylko fakty z danych):
- Pierwsze mieszkanie: bezpieczeństwo decyzji, przewidywalne koszty, prosty proces, „od czego zacząć”. Unikaj żargonu kredytowego bez wyjaśnienia.
- Rodziny: układ pomieszczeń, liczba pokoi, przestrzeń do przechowywania, otoczenie (tylko z danych), codzienna logistyka.
- Inwestorzy: parametry, układ pod najem, metraż, cena za m² z danych. Język rzeczowy, bez emocji i bez obietnic rentowności.
- Klienci premium: prywatność, jakość, detal, dyskrecja kontaktu.
- Właściciele sprzedający: czas, cena osiągnięta w procesie (bez obietnic), bezpieczeństwo transakcji, mniej formalności po ich stronie.
- Najemcy: dostępność, warunki najmu z danych, wyposażenie, dojazd (z danych).
- Seniorzy: piętro i winda (z danych), spokój, bezpieczeństwo, prostota.
Jeśli odbiorca nie jest wskazany, użyj grupy docelowej z profilu marki.
