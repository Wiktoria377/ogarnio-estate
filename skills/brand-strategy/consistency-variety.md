---
id: brand.consistency-variety
name: Spójność marki i różnorodność wariantów
description: Każdy wariant zachowuje markę, ale używa innego kąta, struktury i otwarcia, żeby materiały nie wyglądały tak samo.
category: brand-strategy
layer: strategy
purpose: Realizuje wymóg „spójnie, ale nie powtarzalnie”.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 80
always: true
applies_to:
  tasks: [generate, graphic_copy]
tags: [brand, variety]
inputs: ["liczba wariantów", "poprzednie warianty (jeśli są)"]
output_format: "Warianty różniące się kątem, w polu angle opisany wybrany kąt."
quality_criteria:
  - "Warianty mają różne pierwsze zdania i różne struktury"
  - "Żaden wariant nie powtarza nagłówka poprzedniego"
---
Gdy tworzysz kilka wariantów, każdy oprzyj na innym kącie, np.: korzyść dla konkretnego odbiorcy, scena z życia, układ i funkcjonalność, lokalizacja (jeśli są dane), liczby i konkret, pytanie odbiorcy. Zmieniaj typ otwarcia (fakt, scena, pytanie odbiorcy, teza), długość akapitów i miejsce CTA. Kąt każdego wariantu zapisz krótko w polu `angle`. Jeżeli w zadaniu są poprzednie warianty, nie powtarzaj ich nagłówków ani pierwszych zdań.
