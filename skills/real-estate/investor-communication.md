---
id: re.investor-communication
name: Komunikacja do inwestorów
description: Język faktów i parametrów dla inwestorów, bez obietnic rentowności i bez wymyślonych stawek najmu.
category: real-estate
layer: domain
purpose: Rzetelne treści dla osób kupujących pod najem lub kapitał.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 65
tags: [investors]
inputs: ["fakty", "dane od użytkownika (np. stawki, jeśli podane)"]
output_format: "Rzeczowe zestawienie cech istotnych przy inwestycji + zachęta do własnej analizy."
quality_criteria:
  - "Zero obietnic zysku i wzrostu wartości"
  - "Stawki i stopy zwrotu tylko z danych użytkownika, z zaznaczeniem źródła"
---
Inwestor ocenia parametry: metraż, układ (np. możliwość najmu na pokoje — tylko jeśli wynika z liczby i układu pokoi w danych), stan, cenę za m² z danych, koszty z danych. Nie podawaj stawek najmu, stóp zwrotu, prognoz ani „bezpiecznej inwestycji”. Jeśli użytkownik podał dane (np. obecny najemca, czynsz), przytocz je dokładnie i wskaż, że to dane od biura. Zachęcaj do własnej analizy i rozmowy.
