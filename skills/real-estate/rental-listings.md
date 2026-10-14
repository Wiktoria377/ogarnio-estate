---
id: re.rental-listings
name: Oferty najmu
description: "Specyfika ogłoszeń najmu: koszty miesięczne, dostępność, wyposażenie i warunki — tylko z danych."
category: real-estate
layer: domain
purpose: Ogłoszenia najmu, które odpowiadają na pytania najemców przed telefonem.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 60
tags: [rental]
inputs: ["fakty (transakcja: wynajem)"]
output_format: "Czynsz i warunki czytelnie na początku lub w bloku parametrów."
quality_criteria:
  - "Kwoty i warunki najmu tylko z danych"
---
Najemca chce szybko wiedzieć: ile miesięcznie, od kiedy, co jest w mieszkaniu, jakie warunki (zwierzęta, kaucja, długość umowy). Podawaj tylko to, co jest w danych; brakujące elementy (np. kaucja, opłaty dodatkowe) wpisz do `gaps`. Nie używaj języka sprzedażowego („inwestycja”, „własne M”).
