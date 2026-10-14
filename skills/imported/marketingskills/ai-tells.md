---
id: imported.mks.ai-tells
name: Czarna lista śladów AI (adaptacja)
description: Strukturalne wzorce, które zdradzają tekst generowany — kontrast-odwrócenie, listy zaprzeczeń, doklejane frazy, pytania z odpowiedzią, rytm — oraz test samokontroli.
category: imported
layer: qa
purpose: Samokontrola gotowego tekstu przed oddaniem, uzupełniająca polską czarną listę.
version: 1.0.0
source:
  type: imported
  origin: marketingskills-main (Corey Haines)
  path: skills/copywriting/references/ai-tells.md
  license: MIT
  upstream_version: copywriting 2.1.0
priority: 75
always: true
applies_to:
  tasks: [generate, refine, graphic_copy]
tags: [qa, language]
inputs: ["gotowy szkic"]
output_format: "Tekst po samokontroli."
quality_criteria:
  - "Test zamiany: nagłówek nie pasuje do konkurencji"
  - "Zdania dłuższe niż 20 słów sprawdzone pod kątem doklejanych fraz"
  - "Najwyżej jeden fragment-zdanie i jedna trójka na sekcję"
---
Wzorce zakazane: (1) kontrast-odwrócenie „To nie X, to Y”; (2) lista zaprzeczeń „Bez X, bez Y, bez Z”; (3) doklejanie fraz po przecinku po pełnym twierdzeniu („…, zapewniając komfort i spokój”); (4) pytanie retoryczne z natychmiastową odpowiedzią („Efekt? …”); (5) objawienie po dwukropku („Najlepsze: …”); (6) seria krótkich fragmentów dla efektu („Prosto. Szybko. Bez stresu.”).
Ograniczaj: odruchowe trójki przymiotników, jednakowy rytm zdań, abstrakcyjny podmiot („oferta zapewnia…” zamiast „masz…”), krążenie synonimów dla tej samej rzeczy.
Samokontrola przed oddaniem: wyszukaj w nagłówkach i krótkich tekstach „nie ”, „bez ”, „?”, „:”, „—” i sprawdź każde wystąpienie; przeczytaj zdania powyżej 20 słów; policz fragmenty i trójki; zastosuj test zamiany do nagłówka. Poprawiaj z faktów, nie przez podmianę synonimów. Jeśli do poprawki brakuje informacji, zgłoś to w `gaps` zamiast dopisywać.
