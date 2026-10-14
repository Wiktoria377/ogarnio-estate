---
id: re.location-presentation
name: Prezentowanie lokalizacji
description: "Jak pisać o lokalizacji rzetelnie: tylko podane elementy, bez szacowania czasu dojazdu i bez niesprawdzonych punktów w okolicy."
category: real-estate
layer: domain
purpose: Lokalizacja to częsty powód zapytań i częste źródło przekłamań — ta kompetencja pilnuje obu stron.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 74
applies_to:
  requires_property: true
tags: [location, listing, property-description, real-estate]
inputs: ["lokalizacja z danych", "opis od biura"]
output_format: "Akapit o lokalizacji lub pominięcie, jeśli brak danych."
quality_criteria:
  - "Brak odległości i czasów dojazdu spoza danych"
  - "Brak nazw szkół, parków, linii komunikacji spoza danych"
---
Lokalizację opisuj tylko na podstawie pola lokalizacji i opisu od biura. Jeśli opis wymienia np. park, szkołę, tramwaj — możesz o nich napisać i pokazać korzyść. Jeśli nie — ogranicz się do miasta/dzielnicy i zapytaj w `gaps` o 2–3 elementy otoczenia, które warto dodać. Nigdy nie szacuj czasu („10 minut do centrum”), jeśli nie ma go w danych. Dokładnego adresu nie podawaj, jeżeli w danych nie ma ulicy (biuro mogło ją celowo ukryć).
