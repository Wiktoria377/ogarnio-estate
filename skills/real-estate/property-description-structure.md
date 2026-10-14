---
id: re.property-description-structure
name: Struktura opisu nieruchomości
description: "Sprawdzony układ opisu oferty na portal i stronę: otwarcie z wyróżnikiem, układ, wnętrze, budynek, lokalizacja, parametry, CTA."
category: real-estate
layer: domain
purpose: Opisy ofert, które czyta się od początku do końca i które odpowiadają na pytania kupującego.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 80
applies_to:
  output_kinds: [listing]
  requires_property: true
tags: [listing, property-description]
inputs: ["fakty nieruchomości", "opis od biura", "odbiorca"]
output_format: "Sekcje: opening, layout, interior, building, location, parameters, closing."
quality_criteria:
  - "Pierwsze zdanie zawiera wyróżnik oferty"
  - "Każda sekcja oparta na danych; sekcje bez danych pominięte"
  - "Parametry zebrane w czytelnej liście"
---
Kolejność sekcji (pomiń sekcję, jeśli brak danych — nie wypełniaj jej ogólnikami):
1. Otwarcie: 1–2 zdania z najważniejszym wyróżnikiem i dla kogo jest oferta.
2. Układ: liczba pokoi, funkcje pomieszczeń, relacje między nimi (tylko z danych).
3. Wnętrze i stan: wykończenie, wyposażenie, stan techniczny (z danych).
4. Budynek: rok, piętro, winda, część wspólna, miejsce postojowe (z danych).
5. Lokalizacja: tylko to, co podano. Gdy podano tylko miasto lub dzielnicę, napisz jedno zdanie i nie dodawaj punktów w okolicy.
6. Parametry: lista „etykieta: wartość” z faktów.
7. Zamknięcie: CTA + forma kontaktu z profilu marki.
Rynek pierwotny: termin oddania, standard deweloperski i inwestycja tylko z danych. Rynek wtórny: stan prawny i koszty tylko z danych.
