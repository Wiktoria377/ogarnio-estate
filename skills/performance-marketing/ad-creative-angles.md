---
id: perf.ad-creative-angles
name: Kreacje reklamowe i kąty komunikacji
description: Dobór kątów kreacji (konkret, korzyść, pytanie, dowód, scena) i wariantów nagłówków o realnie różnym przekazie.
category: performance-marketing
layer: technique
purpose: Warianty reklam, które testują różne hipotezy, a nie synonimy.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (zaadaptowane z marketingskills/ad-creative v2.10.0, MIT)
priority: 65
applies_to:
  groups: [ads, property]
tags: [ads, headlines, ab-test, meta-ads]
inputs: ["fakty", "segmenty", "liczba wariantów"]
output_format: "Warianty z opisanym kątem w polu angle."
quality_criteria:
  - "Każdy wariant reprezentuje inny kąt"
  - "Każde twierdzenie ma pokrycie w danych"
---
Kąty do rotacji: (1) najmocniejszy konkret z danych, (2) korzyść dla segmentu, (3) pytanie, które zadaje odbiorca, (4) dowód (zdjęcie/parametr, który mówi sam za siebie), (5) scena z życia oparta na cechach. Wariant to inny kąt, nie inny szyk zdania. Nie wymyślaj opinii, liczby zainteresowanych ani „ostatnich sztuk”.
