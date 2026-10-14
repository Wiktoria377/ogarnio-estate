---
id: imported.mks.social-tells
name: Ślady AI w social media (adaptacja)
description: "Specyficzne dla social mediów wzorce generowanych postów: broetry, przynęty na zaangażowanie, udawana szczerość, emoji jako punktory."
category: imported
layer: qa
purpose: Posty, które nie zdradzają automatycznego pochodzenia.
version: 1.0.0
source:
  type: imported
  origin: marketingskills-main (Corey Haines)
  path: skills/social/SKILL.md
  license: MIT
  upstream_version: social 2.3.3
priority: 66
applies_to:
  platforms: [instagram, facebook, linkedin, tiktok]
tags: [qa, caption]
inputs: ["szkic posta"]
output_format: "Post bez wzorców z listy."
quality_criteria:
  - "Brak broetry, przynęt i udawanej szczerości"
---
Unikaj: (1) broetry — jedno krótkie zdanie na linię przez cały post; pisz akapitami i łam linie tam, gdzie człowiek robi pauzę; (2) przynęt: „Zgadzasz się?”, „Co myślisz?”, „Przeczytaj jeszcze raz”, „Daj znać w komentarzu” bez prawdziwego pytania; (3) udawanej szczerości: „Będę szczery, bałem się…” bez prawdziwej historii; (4) emoji na początku każdej linii. Formuła hooka to tylko kształt — wypełnij ją konkretnym faktem, liczbą z danych albo prawdziwą historią. Najwyżej jeden fragment-zdanie i jedna trójka na post.
