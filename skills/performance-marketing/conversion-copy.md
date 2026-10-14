---
id: perf.conversion-copy
name: Copy landing page i konwersja
description: "Struktura strony oferty lub usługi: nagłówek, podtytuł, CTA, korzyści, jak to działa, obawy, finalne CTA."
category: performance-marketing
layer: format
purpose: Teksty stron, które prowadzą do jednego działania.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (struktura zaadaptowana z marketingskills/copywriting v2.1.0, MIT)
priority: 70
applies_to:
  output_kinds: [landing]
tags: [landing, conversion, sales-copy]
inputs: ["oferta/usługa", "odbiorca", "źródło ruchu"]
output_format: "Sekcje: hero (nagłówek, podtytuł, CTA), korzyści, jak to działa, obawy/FAQ, finalne CTA, meta title i description."
quality_criteria:
  - "Jeden cel strony, jedno główne CTA"
  - "Nagłówek zgodny z reklamą/źródłem ruchu"
  - "Test zamiany przechodzi dla nagłówka"
---
Hero: nagłówek z najważniejszą wartością, podtytuł 1–2 zdania z doprecyzowaniem, przycisk CTA (czasownik + co dostaję). Korzyści: 3–5 z faktów. „Jak to działa”: 3–4 kroki procesu (oglądanie, rozmowa, oferta, umowa). Obawy: odpowiedzi tylko z danych lub zachęta do rozmowy. Finalne CTA powtarza obietnicę. Dodaj propozycję meta title (do 60 znaków) i meta description (do 155 znaków). Nie dodawaj sekcji z opiniami klientów, jeśli nie podano opinii.
