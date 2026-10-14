---
id: realestate.campaign-goal-open-house
name: "Cel kampanii: dzień otwarty"
description: "Zaproszenie na dzień otwarty: termin z danych w każdym materiale, jasna instrukcja, bez presji."
category: real-estate
layer: domain
purpose: Odbiorca wie, kiedy przyjść i co zobaczy, z każdego materiału kampanii.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 75
tags: [campaign-goal-open-house]
inputs: ["data i godziny dnia otwartego", "lokalizacja", "fakty oferty"]
output_format: "Zasady dla briefu i materiałów kampanii."
quality_criteria:
  - "Data i godziny dokładnie jak w faktach w każdym materiale"
  - "Dokładny adres tylko wtedy, gdy jest w faktach; inaczej zaproszenie do kontaktu po szczegóły"
---
Dzień otwarty to wydarzenie: termin (dzień, data, godziny) musi być w hooku lub nagłówku każdego materiału. Jeśli dokładny adres nie jest w faktach, napisz, że szczegóły dojazdu agent przekaże po kontakcie. Powiedz, co odbiorca zobaczy (pomieszczenia, cechy z danych) i czy warto się zapisać (tylko jeśli dane o zapisach są podane; w przeciwnym razie zaproś do wiadomości). Nie pisz o liczbie chętnych ani o tym, że „miejsca się kończą”.
