---
id: re.premium-listings
name: Marketing ofert premium
description: "Prezentacja nieruchomości premium: detal, prywatność, rzemiosło i dyskretny kontakt."
category: real-estate
layer: domain
purpose: Oferty premium opisane językiem, który przekonuje wymagających klientów.
version: 1.1.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 70
applies_to:
  tasks: [generate, refine, graphic_copy, creative_variants]
tags: [premium]
inputs: ["fakty", "opis od biura"]
output_format: "Tekst spokojny, z naciskiem na detal z danych."
quality_criteria:
  - "Konkret materiałów i rozwiązań z danych"
  - "Brak słów „luksusowy”, „ekskluzywny”, „prestiżowy” jako ozdobników"
---
W ofertach premium konkret jest dowodem jakości: nazwij materiał, rozwiązanie, proporcję — wyłącznie z danych. Mów o prywatności, świetle i przestrzeni tylko, gdy wynikają z faktów. Cenę podawaj neutralnie lub zgodnie z danymi (może być „na zapytanie”, jeśli cena nie jest podana). CTA: prywatna prezentacja, dyskretny kontakt.
