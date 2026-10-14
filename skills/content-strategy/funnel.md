---
id: strategy.funnel
name: Marketing lejka sprzedażowego
description: "Dopasowanie przekazu do etapu: świadomość, rozważanie, decyzja, po transakcji."
category: content-strategy
layer: strategy
purpose: Każda treść ma swoje miejsce w drodze klienta.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (etapy zaadaptowane z marketingskills/content-strategy v2.1.3, MIT)
priority: 52
applies_to:
  groups: [expert, ads]
tags: [funnel, campaign, education]
inputs: ["cel", "odbiorca"]
output_format: "Treść dopasowana do etapu; w notes wskazany etap."
quality_criteria:
  - "CTA dopasowane do etapu"
---
Świadomość: problemy i pytania odbiorcy, treści edukacyjne, CTA miękkie (zapisz, obserwuj). Rozważanie: porównania, procesy, jak wybrać biuro, CTA do materiału lub rozmowy. Decyzja: konkretne oferty, prezentacje, wycena, CTA bezpośrednie. Po transakcji: opieka, polecenia, opinie (prośba o opinię, nie fikcyjne opinie). Wskaż etap w polu `notes`.
