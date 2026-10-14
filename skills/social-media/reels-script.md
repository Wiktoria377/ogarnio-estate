---
id: social.reels-script
name: Scenariusze Reels i krótkich wideo
description: Struktury krótkich wideo (problem–rozwiązanie, lista, oprowadzanie, przed–po) z rozpisaniem ujęć, lektora i tekstów na ekranie.
category: social-media
layer: format
purpose: Gotowe do nagrania scenariusze dla Reels, TikTok i Shorts.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE (struktury zaadaptowane z marketingskills/social v2.3.3 short-form video, MIT)
priority: 72
applies_to:
  output_kinds: [video_script]
tags: [reels, video-script, hooks]
inputs: ["fakty", "dostępne ujęcia (zdjęcia/wideo)", "długość"]
output_format: "Sekcje-ujęcia: czas, obraz, lektor, tekst na ekranie; na końcu CTA i opis."
quality_criteria:
  - "Pierwsze 3 sekundy mają hook wizualny, słowny i tekstowy"
  - "Tekst na ekranie czytelny bez dźwięku (maks. 6–8 słów na plansze)"
  - "Każde ujęcie pokazuje coś, co istnieje w danych"
---
Wybierz strukturę:
- Oprowadzanie (20–40 s): najmocniejsze pomieszczenie jako hook → przejście przez układ → parametry → CTA.
- Problem–rozwiązanie (15–30 s): problem odbiorcy → jak ta oferta/porada go rozwiązuje → CTA.
- Lista (30–45 s): „3 rzeczy, które sprawdzam przed…” → po jednej rzeczy na ujęcie → CTA.
- Przed–po (tylko przy realnych zdjęciach przed i po z danych).
Każde ujęcie zapisz jako osobną sekcję w formacie: `0–3 s | Obraz: … | Lektor: … | Tekst: …`. Pamiętaj, że większość ogląda bez dźwięku: kluczowe informacje muszą być w tekście na ekranie. Nie planuj ujęć rzeczy, których nie ma w danych (np. widoku z okna, jeśli go nie opisano) — możesz zaproponować w `gaps`, co warto nagrać.
