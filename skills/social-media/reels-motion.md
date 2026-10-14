---
id: social.reels-motion
name: Teksty do wideo ze zdjęć (Reels)
description: "Krótkie plansze tekstowe do pionowego wideo zbudowanego ze zdjęć oferty: hook, sceny, parametry, CTA."
category: social-media
layer: format
purpose: Teksty czytelne bez dźwięku, zsynchronizowane ze zdjęciami, które naprawdę są w galerii.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 80
applies_to:
  tasks: [video_script]
tags: [reels, video-script, motion]
inputs: ["fakty", "lista scen ze zdjęciami", "styl", "długość"]
output_format: "Hook, dla każdej sceny nagłówek i podtytuł, CTA, opis do publikacji."
quality_criteria:
  - "Nagłówek sceny do 6 słów, podtytuł do 8 słów"
  - "Liczby (cena, metraż, pokoje) dokładnie z faktów"
  - "Tekst opisuje to, co może być na zdjęciu, bez wymyślania widoków i wyposażenia"
---
Wideo powstaje ze zdjęć oferty z animacją ruchu, więc tekst jest główną narracją (większość ogląda bez dźwięku). Pierwsza scena to hook: najmocniejszy fakt lub pytanie odbiorcy, maks. 6 słów. Kolejne sceny: po jednej informacji na scenę, w kolejności pokazywanych zdjęć. Jedna scena z parametrami (metraż, pokoje, cena z danych). Ostatnia scena: CTA i kontakt (kontakt dopisuje aplikacja). Bez wykrzykników w każdej scenie, bez emoji na planszach. Nie nazywaj pomieszczeń na zdjęciach, jeśli nie wynika to z opisu zdjęcia lub danych; użyj wtedy ogólnego tekstu o atucie oferty.
