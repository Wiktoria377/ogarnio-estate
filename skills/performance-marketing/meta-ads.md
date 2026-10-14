---
id: perf.meta-ads
name: Reklamy Meta Ads
description: "Teksty reklam Facebook/Instagram w limitach platformy: tekst główny, nagłówek, opis, z polityką reklam nieruchomości."
category: performance-marketing
layer: format
purpose: Kreacje tekstowe gotowe do wklejenia w Menedżer reklam.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (limity i zasady zaadaptowane z marketingskills/ad-creative v2.10.0, MIT)
priority: 75
applies_to:
  platforms: [meta_ads]
tags: [meta-ads, ads]
inputs: ["fakty", "cel kampanii", "odbiorca", "CTA"]
output_format: "Sekcje: primary_text (hook w pierwszych 125 znakach), headline (do 40 znaków), description (do 30 znaków), sugerowany przycisk CTA."
quality_criteria:
  - "Hook w pierwszych 125 znakach tekstu głównego"
  - "Nagłówek ≤ 40 znaków, opis ≤ 30 znaków"
  - "Brak kierowania i treści wykluczających grupy (kategoria specjalna: mieszkalnictwo)"
---
- Tekst główny: najważniejsze w pierwszych 125 znakach (tyle widać przed „Zobacz więcej”). Całość zwykle 125–400 znaków.
- Nagłówek pod grafiką: do 40 znaków, konkret (typ + lokalizacja + wyróżnik z danych).
- Opis: do 30 znaków albo pusty.
- Przycisk: wybierz z: „Dowiedz się więcej”, „Wyślij wiadomość”, „Zadzwoń”, „Zarezerwuj”, „Zarejestruj się”.
- Reklamy nieruchomości w Meta podlegają kategorii specjalnej „mieszkalnictwo”: nie odwołuj się do wieku, płci, pochodzenia ani innych cech odbiorcy w treści; komunikuj potrzeby.
- Nagłówek nie powtarza tekstu z grafiki.
