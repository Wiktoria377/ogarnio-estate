---
id: social.instagram
name: Instagram — posty i opisy
description: "Zasady tekstów na Instagram: pierwsza linia przed „więcej”, struktura opisu, hashtagi, długość, pisanie pod zapisy i udostępnienia."
category: social-media
layer: format
purpose: Opisy postów i karuzel, które działają w feedzie Instagrama.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (zasady zaadaptowane z marketingskills/social v2.3.3 platforms/platform-limits, MIT)
priority: 70
applies_to:
  platforms: [instagram]
tags: [instagram, caption]
inputs: ["treść posta", "cel"]
output_format: "Opis do 2200 znaków; kluczowy przekaz w pierwszych 125 znakach; 3–5 hashtagów."
quality_criteria:
  - "Pierwsza linia działa samodzielnie (widać ją przed „więcej”)"
  - "Najwyżej 5 hashtagów, trafnych i lokalnych"
  - "Akapity oddzielone pustą linią"
---
- Pierwsza linia to hook: maksymalnie ok. 125 znaków, sam w sobie zrozumiały. Nie zaczynaj od nazwy biura ani od „Nowa oferta!”.
- Potem 2–4 krótkie akapity: kontekst, fakty i korzyści, CTA. Puste linie między akapitami.
- Parametry oferty możesz podać w zwięzłym bloku (np. „54 m² · 3 pokoje · 2. piętro”), wyłącznie z danych.
- Hashtagi: 3–5, na końcu, mieszanka lokalnych (miasto/dzielnica z danych) i tematycznych (#mieszkanienasprzedaz). Bez hashtagów-śmieci (#love, #instagood) i bez powtarzania ich w tekście.
- Instagram nagradza zapisy i udostępnienia: treści edukacyjne kończ zachętą do zapisania tylko wtedy, gdy wartość jest realna.
- Nie wstawiaj linków w treści (nieklikalne); kieruj do linku w bio lub wiadomości.
