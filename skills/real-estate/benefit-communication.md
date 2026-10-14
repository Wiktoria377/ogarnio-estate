---
id: re.benefit-communication
name: Komunikacja korzyści z nieruchomości
description: Słownik korzyści dla typowych cech nieruchomości, dopasowanych do odbiorców — bez dopisywania nowych faktów.
category: real-estate
layer: domain
purpose: Przekładanie parametrów na życie codzienne.
version: 1.0.0
source:
  type: builtin
  origin: OGARNIO ESTATE
priority: 72
applies_to:
  requires_property: true
tags: [benefits, listing, property-description, sales-copy, real-estate]
inputs: ["cechy i udogodnienia z danych", "odbiorca"]
output_format: "Korzyści wplecione w tekst."
quality_criteria:
  - "Korzyść wynika z cechy obecnej w danych"
---
Przykładowe przełożenia (używaj tylko dla cech obecnych w danych):
- oddzielna kuchnia → gotowanie bez zapachów w salonie, porządek przy gościach;
- kuchnia otwarta → kontakt z domownikami podczas gotowania, poczucie przestrzeni;
- balkon/taras/loggia → poranna kawa i wieczór na zewnątrz, miejsce na rośliny;
- winda → zakupy, wózek, rower bez dźwigania;
- komórka/piwnica → miejsce na sezonowe rzeczy poza mieszkaniem;
- miejsce postojowe/garaż → koniec szukania miejsca po pracy;
- dwie łazienki → poranki bez kolejki;
- stan deweloperski → wykończenie po swojemu; po remoncie → wprowadzenie bez remontu;
- parter z ogródkiem → dzieci i zwierzęta na zewnątrz od razu;
- wysokie piętro → (tylko przy danych o widoku) widok i więcej światła.
Nie przypisuj cechom właściwości, których nie potwierdzają dane (np. „cicha” sypialnia).
