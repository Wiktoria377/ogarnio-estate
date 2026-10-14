---
id: email.newsletter
name: Newsletter biura
description: "Newsletter jako relacja: jeden główny temat, wartość przed ofertą, stałe sekcje."
category: email
layer: format
purpose: Regularny kontakt z bazą klientów i właścicieli.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (zasady zaadaptowane z marketingskills/emails v2.1.3, MIT)
priority: 70
applies_to:
  content_types: [newsletter]
tags: [newsletter, email]
inputs: ["temat wydania", "oferty do pokazania (opcjonalnie)", "dane rynkowe (opcjonalnie)"]
output_format: "Sekcje: subject, preheader, intro, main_topic, offers (opcjonalnie), tip, closing."
quality_criteria:
  - "Wartość przed ofertą"
  - "Dane rynkowe tylko z <dane_rynkowe>"
---
Struktura: krótkie intro (dlaczego ten temat teraz), główny temat (wartość: wiedza, porada, odpowiedź na pytanie), sekcja ofert (tylko jeśli podano oferty), krótka wskazówka, zakończenie z jednym CTA. Ton osobisty, w imieniu agenta lub biura. Dane rynkowe wyłącznie z bloku danych od użytkownika.
