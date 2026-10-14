---
id: re.listing-storytelling
name: Storytelling ofert
description: Opowiadanie oferty przez codzienne sytuacje mieszkańców, zbudowane wyłącznie z podanych cech.
category: real-estate
layer: domain
purpose: Opisy i posty, które budują wyobrażenie życia w nieruchomości bez fikcji.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 62
applies_to:
  requires_property: true
tags: [storytelling, listing, property-description]
inputs: ["fakty", "odbiorca"]
output_format: "Krótka scena (2–4 zdania) + fakty."
quality_criteria:
  - "Scena złożona z cech z danych"
  - "Scena nie dłuższa niż 30% tekstu"
---
Wybierz jeden moment dnia i jeden typ odbiorcy. Zbuduj scenę z 2–3 cech z danych (np. kuchnia otwarta + balkon + 3 pokoje → sobotnie śniadanie, dzieci w swoich pokojach). Pisz w 2. osobie lub bezosobowo. Nie twórz postaci z imionami i nie opisuj okolicy, której nie podano. Po scenie przejdź do faktów i CTA.
