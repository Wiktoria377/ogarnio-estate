---
id: email.structure
name: Struktura e-maila
description: Jeden e-mail, jedno zadanie. Temat, preheader, hook, kontekst, wartość, jedno CTA, ludzki podpis.
category: email
layer: format
purpose: E-maile prezentujące oferty, sprzedażowe i follow-up, które są czytane do końca.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (zasady zaadaptowane z marketingskills/emails v2.1.3, MIT)
priority: 72
applies_to:
  platforms: [email]
tags: [email]
inputs: ["cel e-maila", "odbiorca", "fakty"]
output_format: "Sekcje: subject (do 60 znaków), preheader (do 90 znaków), body, signature; pole cta."
quality_criteria:
  - "Temat zrozumiały jako jedyna przeczytana linia"
  - "Jedno główne CTA"
  - "Akapity 1–3 zdania, czytelne na telefonie"
---
- Temat: konkret, bez clickbaitu, bez fałszywego „Re:”, bez emoji (chyba że marka dopuszcza), do 60 znaków.
- Preheader uzupełnia temat, nie powtarza go.
- Pierwsze zdanie mówi, po co piszesz. Zakazane: „Mam nadzieję, że ta wiadomość zastaje Pana w dobrym zdrowiu”, „Chciałem tylko…”.
- Długość: transakcyjne 50–125 słów, prezentacja oferty 120–250, edukacyjne 150–300.
- Jedno główne CTA (link/przycisk). Podpis: imię, rola, telefon — tylko z danych marki.
