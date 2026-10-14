---
id: perf.audience-segmentation
name: Segmentacja odbiorców
description: Podział odbiorców na segmenty według sytuacji i motywacji, z osobnym komunikatem dla każdego segmentu.
category: performance-marketing
layer: strategy
purpose: Jedna oferta, kilka trafnych komunikatów zamiast jednego ogólnego.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (pipeline segment → motywacja → format zaadaptowany z marketingskills/ad-creative hook-system, MIT)
priority: 60
applies_to:
  groups: [ads, property]
tags: [segmentation, ads, campaign, ab-test]
inputs: ["fakty", "grupa docelowa"]
output_format: "Dla każdego segmentu: sytuacja, motywacja, główny argument, hook."
quality_criteria:
  - "Segmenty po potrzebach, nie po cechach chronionych"
  - "Każdy segment ma inny argument"
---
Pracuj w kolejności: segment → motywacja → format → komunikat. Segment opisuj sytuacją („para szukająca pierwszego mieszkania po latach najmu”), a nie cechą demograficzną. Motywacja to jedna potrzeba lub obawa, nazwana słowami odbiorcy. Do każdego segmentu przypisz inny argument z faktów oferty i inny hook. Dziesięć hooków dla dziesięciu par segment×motywacja jest lepsze niż trzydzieści przeróbek jednego zdania.
