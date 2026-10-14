import type { ContentTypeDef, SectionSpec } from "@/core/marketing-engine/content-types";

const body = (hint: string, maxChars?: number): SectionSpec[] => [{ key: "body", label: "Treść", hint, maxChars }];

const LISTING_SECTIONS: SectionSpec[] = [
  { key: "opening", label: "Otwarcie", hint: "1–2 zdania z wyróżnikiem i dla kogo jest oferta" },
  { key: "layout", label: "Układ", optional: true },
  { key: "interior", label: "Wnętrze i stan", optional: true },
  { key: "building", label: "Budynek", optional: true },
  { key: "location", label: "Lokalizacja", optional: true },
  { key: "parameters", label: "Parametry", hint: "Lista „etykieta: wartość” wyłącznie z faktów" },
  { key: "closing", label: "Zakończenie i CTA" },
];

const EMAIL_SECTIONS: SectionSpec[] = [
  { key: "subject", label: "Temat", maxChars: 60 },
  { key: "preheader", label: "Preheader", maxChars: 90 },
  { key: "body", label: "Treść" },
  { key: "signature", label: "Podpis" },
];

const META_AD_SECTIONS: SectionSpec[] = [
  { key: "primary_text", label: "Tekst główny", hint: "Hook w pierwszych 125 znakach", maxChars: 500 },
  { key: "headline", label: "Nagłówek", maxChars: 40 },
  { key: "description", label: "Opis", maxChars: 30 },
  { key: "cta_button", label: "Przycisk CTA", hint: "Jedna z opcji Meta: Dowiedz się więcej / Wyślij wiadomość / Zadzwoń / Zarezerwuj" },
];

const CAMPAIGN_SECTIONS: SectionSpec[] = [
  { key: "objective", label: "Cel i miernik" },
  { key: "audience", label: "Odbiorcy" },
  { key: "key_message", label: "Główny przekaz" },
  { key: "channels", label: "Kanały i formaty" },
  { key: "schedule", label: "Harmonogram" },
  { key: "assets", label: "Materiały do przygotowania" },
  { key: "measurement", label: "Pomiar" },
];

const VIDEO_SEQUENCE = {
  prefix: "scene_",
  label: "Ujęcie",
  min: 4,
  max: 10,
  hint: "Format: „0–3 s | Obraz: … | Lektor: … | Tekst: …”",
};

const CAROUSEL_SEQUENCE = { prefix: "slide_", label: "Slajd", min: 4, max: 10, hint: "Nagłówek slajdu w pierwszej linii, potem 1–2 krótkie zdania", maxChars: 220 };

export const REAL_ESTATE_CONTENT_TYPES: ContentTypeDef[] = [
  // ── A. Nieruchomości ───────────────────────────────────────────────────
  {
    id: "description_apartment", group: "property", label: "Opis mieszkania",
    description: "Profesjonalny opis oferty mieszkania na portal i stronę biura.",
    outputKind: "listing", defaultPlatform: "portal", platforms: ["portal", "website"], property: "required",
    defaultGoal: "sales", defaultCta: "viewing", defaultLength: "medium", usesHeadline: true,
    skillTags: ["listing", "property-description", "benefits", "location", "fab"], sections: LISTING_SECTIONS,
  },
  {
    id: "description_house", group: "property", label: "Opis domu",
    description: "Opis domu z działką: układ kondygnacji, ogród, budynek, otoczenie z danych.",
    outputKind: "listing", defaultPlatform: "portal", platforms: ["portal", "website"], property: "required",
    defaultGoal: "sales", defaultCta: "viewing", defaultLength: "long", usesHeadline: true,
    skillTags: ["listing", "property-description", "benefits", "location", "storytelling"], sections: LISTING_SECTIONS,
  },
  {
    id: "premium_description", group: "property", label: "Opis nieruchomości premium",
    description: "Powściągliwy, precyzyjny opis oferty z segmentu premium.",
    outputKind: "listing", defaultPlatform: "portal", platforms: ["portal", "website", "print"], property: "required",
    defaultGoal: "sales", defaultCta: "viewing", defaultLength: "medium", usesHeadline: true,
    skillTags: ["listing", "property-description", "premium", "location"], sections: LISTING_SECTIONS,
  },
  {
    id: "short_listing", group: "property", label: "Krótki opis ogłoszenia",
    description: "Zwięzły opis do 600 znaków na portale, do skrótów i wiadomości.",
    outputKind: "short_copy", defaultPlatform: "portal", platforms: ["portal", "facebook", "general"], property: "required",
    defaultGoal: "sales", defaultCta: "call", defaultLength: "short", usesHeadline: true,
    skillTags: ["listing", "benefits", "headlines"], sections: body("Do 600 znaków, najważniejsze fakty i CTA", 600),
  },
  {
    id: "presentation_long", group: "property", label: "Rozbudowana prezentacja oferty",
    description: "Pełna prezentacja nieruchomości na stronę oferty lub do wysyłki klientowi.",
    outputKind: "long_form", defaultPlatform: "website", platforms: ["website", "email", "print"], property: "required",
    defaultGoal: "sales", defaultCta: "viewing", defaultLength: "long", usesHeadline: true,
    skillTags: ["listing", "property-description", "benefits", "location", "storytelling"],
    sections: [
      { key: "summary", label: "Podsumowanie oferty" },
      { key: "for_whom", label: "Dla kogo" },
      { key: "layout", label: "Układ i funkcjonalność", optional: true },
      { key: "interior", label: "Wnętrze i stan", optional: true },
      { key: "building", label: "Budynek i otoczenie", optional: true },
      { key: "location", label: "Lokalizacja", optional: true },
      { key: "parameters", label: "Parametry" },
      { key: "next_steps", label: "Kolejne kroki" },
    ],
  },
  {
    id: "property_sales_post", group: "property", label: "Post sprzedażowy",
    description: "Post z ofertą do feedu: hook, korzyści, parametry, CTA.",
    outputKind: "post", defaultPlatform: "instagram", platforms: ["instagram", "facebook", "linkedin"], property: "required",
    defaultGoal: "sales", defaultCta: "message", defaultLength: "medium", usesHashtags: true,
    skillTags: ["sales-copy", "hooks", "caption", "benefits", "cta"], sections: body("Opis posta z blokiem parametrów"),
  },
  {
    id: "property_reels_script", group: "property", label: "Scenariusz Reels",
    description: "Scenariusz oprowadzania lub krótkiej prezentacji oferty do nagrania.",
    outputKind: "video_script", defaultPlatform: "instagram", platforms: ["instagram", "tiktok", "facebook"], property: "required",
    defaultGoal: "awareness", defaultCta: "message", defaultLength: "short", usesHashtags: true,
    skillTags: ["reels", "video-script", "hooks"], sections: [], sequence: VIDEO_SEQUENCE,
    tailSections: [{ key: "caption", label: "Opis do publikacji", maxChars: 2200 }],
  },
  {
    id: "property_reels_caption", group: "property", label: "Opis do Reels",
    description: "Krótki opis pod wideo z ofertą.",
    outputKind: "post", defaultPlatform: "instagram", platforms: ["instagram", "tiktok", "facebook"], property: "required",
    defaultGoal: "awareness", defaultCta: "message", defaultLength: "short", usesHashtags: true,
    skillTags: ["caption", "hooks", "reels"], sections: body("Do 400 znaków, hook w pierwszej linii", 600),
  },
  {
    id: "property_sales_carousel", group: "property", label: "Karuzela sprzedażowa",
    description: "Teksty slajdów karuzeli z ofertą i opis posta. Grafiki stworzysz w Graphic Studio.",
    outputKind: "carousel", defaultPlatform: "instagram", platforms: ["instagram", "facebook", "linkedin"], property: "required",
    defaultGoal: "sales", defaultCta: "message", defaultLength: "medium", usesHashtags: true,
    skillTags: ["carousel", "hooks", "sales-copy", "cta", "benefits"], sections: [], sequence: CAROUSEL_SEQUENCE,
    tailSections: [{ key: "caption", label: "Opis posta", maxChars: 2200 }],
  },
  {
    id: "property_ad_headlines", group: "property", label: "Nagłówki reklam",
    description: "Warianty nagłówków reklam oferty (do 40 znaków).",
    outputKind: "ad", defaultPlatform: "meta_ads", platforms: ["meta_ads", "portal"], property: "required",
    defaultGoal: "leads", defaultCta: "viewing", defaultLength: "short",
    skillTags: ["headlines", "ads", "ab-test"], sections: [],
    sequence: { prefix: "headline_", label: "Nagłówek", min: 6, max: 12, maxChars: 40 },
  },
  {
    id: "property_meta_ad", group: "property", label: "Reklama Meta Ads oferty",
    description: "Tekst główny, nagłówek, opis i przycisk reklamy oferty.",
    outputKind: "ad", defaultPlatform: "meta_ads", platforms: ["meta_ads"], property: "required",
    defaultGoal: "leads", defaultCta: "viewing", defaultLength: "short",
    skillTags: ["meta-ads", "ads", "hooks", "cta", "sales-copy"], sections: META_AD_SECTIONS,
  },
  {
    id: "brochure", group: "property", label: "Treść do broszury",
    description: "Teksty do drukowanej lub PDF-owej broszury oferty.",
    outputKind: "long_form", defaultPlatform: "print", platforms: ["print"], property: "required",
    defaultGoal: "sales", defaultCta: "viewing", defaultLength: "medium", usesHeadline: true,
    skillTags: ["listing", "premium", "property-description", "brochure"],
    sections: [
      { key: "cover_title", label: "Tytuł okładki", maxChars: 60 },
      { key: "cover_subtitle", label: "Podtytuł okładki", maxChars: 90 },
      { key: "intro", label: "Wprowadzenie" },
      { key: "spaces", label: "Wnętrza i układ" },
      { key: "location", label: "Lokalizacja", optional: true },
      { key: "parameters", label: "Parametry" },
      { key: "contact", label: "Kontakt" },
    ],
  },
  {
    id: "email_property", group: "property", label: "E-mail prezentujący nieruchomość",
    description: "Wiadomość do klienta z prezentacją oferty.",
    outputKind: "email", defaultPlatform: "email", platforms: ["email"], property: "required",
    defaultGoal: "sales", defaultCta: "viewing", defaultLength: "medium",
    skillTags: ["email", "sales-copy", "cta", "benefits"], sections: EMAIL_SECTIONS,
  },

  // ── B. Marketing ekspercki ────────────────────────────────────────────
  {
    id: "educational_post", group: "expert", label: "Post edukacyjny",
    description: "Wiedza, którą odbiorca może od razu zastosować.",
    outputKind: "post", defaultPlatform: "instagram", platforms: ["instagram", "facebook", "linkedin"], property: "none",
    defaultGoal: "education", defaultCta: "soft", defaultLength: "medium", usesHashtags: true,
    skillTags: ["education", "hooks", "expert", "caption"], sections: body("Post edukacyjny"),
  },
  {
    id: "guide_content", group: "expert", label: "Treść poradnikowa",
    description: "Poradnik krok po kroku dla kupujących, sprzedających lub najemców.",
    outputKind: "long_form", defaultPlatform: "blog", platforms: ["blog", "website", "facebook", "email"], property: "none",
    defaultGoal: "education", defaultCta: "soft", defaultLength: "long", usesHeadline: true,
    skillTags: ["education", "expert", "faq", "seo"], sections: [{ key: "intro", label: "Wprowadzenie" }],
    sequence: { prefix: "step_", label: "Krok", min: 3, max: 8, modelLabels: true },
    tailSections: [{ key: "summary", label: "Podsumowanie i CTA" }],
  },
  {
    id: "market_post", group: "expert", label: "Post o sytuacji rynkowej",
    description: "Komentarz rynkowy. Liczby tylko z danych, które wkleisz.",
    outputKind: "post", defaultPlatform: "linkedin", platforms: ["linkedin", "facebook", "instagram"], property: "none",
    defaultGoal: "trust", defaultCta: "soft", defaultLength: "medium", usesHashtags: true, marketData: "required_for_numbers",
    skillTags: ["market", "expert", "education"], sections: body("Komentarz rynkowy"),
  },
  {
    id: "faq", group: "expert", label: "FAQ",
    description: "Najczęstsze pytania i rzetelne odpowiedzi na stronę lub do social mediów.",
    outputKind: "faq", defaultPlatform: "website", platforms: ["website", "facebook", "general"], property: "optional",
    defaultGoal: "education", defaultCta: "message", defaultLength: "medium",
    skillTags: ["faq", "education", "expert"], sections: [],
    sequence: { prefix: "q_", label: "Pytanie", min: 4, max: 10, modelLabels: true, hint: "label = pytanie, content = odpowiedź" },
  },
  {
    id: "buying_content", group: "expert", label: "O kupowaniu mieszkań",
    description: "Treści dla kupujących: proces, pułapki, przygotowanie.",
    outputKind: "post", defaultPlatform: "facebook", platforms: ["facebook", "instagram", "linkedin", "blog"], property: "none",
    defaultGoal: "education", defaultCta: "soft", defaultLength: "medium", usesHashtags: true,
    skillTags: ["education", "first-buyers", "expert"], sections: body("Treść dla kupujących"),
  },
  {
    id: "selling_content", group: "expert", label: "O sprzedaży nieruchomości",
    description: "Treści dla właścicieli: przygotowanie, proces, decyzje.",
    outputKind: "post", defaultPlatform: "facebook", platforms: ["facebook", "instagram", "linkedin", "blog"], property: "none",
    defaultGoal: "owner_acquisition", defaultCta: "valuation", defaultLength: "medium", usesHashtags: true,
    skillTags: ["education", "owner-acquisition", "expert", "agent-value"], sections: body("Treść dla sprzedających"),
  },
  {
    id: "trust_post", group: "expert", label: "Post budujący zaufanie",
    description: "Jak pracuje biuro, standardy, kulisy (na podstawie Twoich informacji).",
    outputKind: "post", defaultPlatform: "facebook", platforms: ["facebook", "instagram", "linkedin"], property: "none",
    defaultGoal: "trust", defaultCta: "soft", defaultLength: "medium", usesHashtags: true,
    skillTags: ["trust", "agent-value", "storytelling"], sections: body("Post wizerunkowy biura"),
  },
  {
    id: "short_video_script", group: "expert", label: "Scenariusz krótkiego filmu",
    description: "Edukacyjny lub ekspercki film 15–45 s.",
    outputKind: "video_script", defaultPlatform: "tiktok", platforms: ["tiktok", "instagram", "facebook"], property: "none",
    defaultGoal: "education", defaultCta: "comment", defaultLength: "short", usesHashtags: true,
    skillTags: ["video-script", "hooks", "education"], sections: [], sequence: VIDEO_SEQUENCE,
    tailSections: [{ key: "caption", label: "Opis do publikacji", maxChars: 2200 }],
  },
  {
    id: "blog_article", group: "expert", label: "Artykuł blogowy",
    description: "Artykuł na blog biura, pisany pod pytania odbiorców.",
    outputKind: "long_form", defaultPlatform: "blog", platforms: ["blog", "website"], property: "none",
    defaultGoal: "education", defaultCta: "soft", defaultLength: "long", usesHeadline: true,
    skillTags: ["blog", "seo", "education", "expert"], sections: [{ key: "lead", label: "Lead (odpowiedź w skrócie)" }],
    sequence: { prefix: "section_", label: "Sekcja", min: 3, max: 7, modelLabels: true },
    tailSections: [
      { key: "summary", label: "Podsumowanie i CTA" },
      { key: "meta_description", label: "Meta description", maxChars: 155 },
    ],
  },
  {
    id: "newsletter", group: "expert", label: "Newsletter",
    description: "Wydanie newslettera biura.",
    outputKind: "email", defaultPlatform: "email", platforms: ["email"], property: "optional",
    defaultGoal: "nurture", defaultCta: "website", defaultLength: "medium",
    skillTags: ["newsletter", "email", "education"],
    sections: [
      { key: "subject", label: "Temat", maxChars: 60 },
      { key: "preheader", label: "Preheader", maxChars: 90 },
      { key: "intro", label: "Wstęp" },
      { key: "main_topic", label: "Temat główny" },
      { key: "offers", label: "Oferty", optional: true },
      { key: "tip", label: "Wskazówka" },
      { key: "closing", label: "Zakończenie" },
    ],
  },
  {
    id: "owner_acquisition", group: "expert", label: "Kampania pozyskania właścicieli",
    description: "Koncepcja i teksty do kampanii skierowanej do właścicieli nieruchomości.",
    outputKind: "campaign", defaultPlatform: "facebook", platforms: ["facebook", "instagram", "meta_ads", "general"], property: "none",
    defaultGoal: "owner_acquisition", defaultCta: "valuation", defaultLength: "medium",
    skillTags: ["owner-acquisition", "lead-gen", "campaign", "agent-value"],
    sections: [
      { key: "concept", label: "Koncepcja kampanii" },
      { key: "audience", label: "Do kogo mówimy" },
      { key: "key_message", label: "Główny przekaz" },
      { key: "post_copy", label: "Tekst posta" },
      { key: "ad_copy", label: "Tekst reklamy" },
      { key: "lead_magnet", label: "Materiał za kontakt" },
      { key: "landing_hint", label: "Tekst strony/formularza" },
    ],
  },

  // ── C. Marka osobista agenta ──────────────────────────────────────────
  {
    id: "image_post", group: "personal", label: "Post wizerunkowy",
    description: "Post budujący wizerunek agenta lub biura.",
    outputKind: "post", defaultPlatform: "instagram", platforms: ["instagram", "facebook", "linkedin"], property: "none",
    defaultGoal: "trust", defaultCta: "soft", defaultLength: "medium", usesHashtags: true,
    skillTags: ["personal-brand", "trust", "storytelling"], sections: body("Post wizerunkowy"),
  },
  {
    id: "agent_intro", group: "personal", label: "Przedstawienie agenta",
    description: "Post przedstawiający agenta: kim jest, jak pracuje, w czym pomaga.",
    outputKind: "post", defaultPlatform: "facebook", platforms: ["facebook", "instagram", "linkedin"], property: "none",
    defaultGoal: "trust", defaultCta: "message", defaultLength: "medium", usesHashtags: true,
    skillTags: ["personal-brand", "agent-value", "storytelling"], sections: body("Przedstawienie agenta (tylko fakty od Ciebie)"),
  },
  {
    id: "agent_expert_post", group: "personal", label: "Treść ekspercka agenta",
    description: "Wiedza i obserwacje z praktyki agenta.",
    outputKind: "post", defaultPlatform: "linkedin", platforms: ["linkedin", "facebook", "instagram"], property: "none",
    defaultGoal: "trust", defaultCta: "soft", defaultLength: "medium", usesHashtags: true,
    skillTags: ["expert", "personal-brand", "education"], sections: body("Post ekspercki"),
  },
  {
    id: "agent_story", group: "personal", label: "Storytelling",
    description: "Historia z pracy agenta (na podstawie prawdziwej sytuacji, którą opiszesz).",
    outputKind: "post", defaultPlatform: "instagram", platforms: ["instagram", "facebook", "linkedin"], property: "none",
    defaultGoal: "engagement", defaultCta: "soft", defaultLength: "medium", usesHashtags: true,
    skillTags: ["storytelling", "personal-brand"], sections: body("Historia"),
  },
  {
    id: "tiktok_script", group: "personal", label: "Scenariusz TikTok",
    description: "Scenariusz krótkiego wideo agenta do kamery.",
    outputKind: "video_script", defaultPlatform: "tiktok", platforms: ["tiktok", "instagram"], property: "optional",
    defaultGoal: "awareness", defaultCta: "comment", defaultLength: "short", usesHashtags: true,
    skillTags: ["tiktok", "video-script", "hooks", "personal-brand"], sections: [], sequence: VIDEO_SEQUENCE,
    tailSections: [{ key: "caption", label: "Opis do publikacji", maxChars: 2200 }],
  },
  {
    id: "linkedin_post", group: "personal", label: "Post na LinkedIn",
    description: "Profesjonalny post do sieci kontaktów agenta.",
    outputKind: "post", defaultPlatform: "linkedin", platforms: ["linkedin"], property: "optional",
    defaultGoal: "trust", defaultCta: "soft", defaultLength: "medium", usesHashtags: true,
    skillTags: ["linkedin", "expert", "personal-brand"], sections: body("Post na LinkedIn"),
  },
  {
    id: "client_answers", group: "personal", label: "Odpowiedzi na pytania klientów",
    description: "Gotowe odpowiedzi na pytania, które zadają klienci (wpisz pytania w temacie).",
    outputKind: "faq", defaultPlatform: "general", platforms: ["general", "facebook", "instagram", "email"], property: "optional",
    defaultGoal: "trust", defaultCta: "message", defaultLength: "short",
    skillTags: ["faq", "expert", "follow-up"], sections: [],
    sequence: { prefix: "q_", label: "Pytanie", min: 1, max: 10, modelLabels: true, hint: "label = pytanie klienta, content = odpowiedź" },
  },
  {
    id: "awareness_content", group: "personal", label: "Materiał zwiększający rozpoznawalność",
    description: "Treść pod zasięg: lokalność, charakter, wartości.",
    outputKind: "post", defaultPlatform: "instagram", platforms: ["instagram", "tiktok", "facebook"], property: "none",
    defaultGoal: "awareness", defaultCta: "soft", defaultLength: "short", usesHashtags: true,
    skillTags: ["personal-brand", "hooks", "series"], sections: body("Post pod zasięg"),
  },

  // ── D. Reklama i sprzedaż ─────────────────────────────────────────────
  {
    id: "meta_ad", group: "ads", label: "Reklama Meta Ads",
    description: "Reklama usługi biura lub oferty (FB/IG).",
    outputKind: "ad", defaultPlatform: "meta_ads", platforms: ["meta_ads"], property: "optional",
    defaultGoal: "leads", defaultCta: "message", defaultLength: "short",
    skillTags: ["meta-ads", "ads", "hooks", "segmentation"], sections: META_AD_SECTIONS,
  },
  {
    id: "headline_variants", group: "ads", label: "Warianty nagłówków",
    description: "Zestaw różnych nagłówków do testów.",
    outputKind: "ad", defaultPlatform: "meta_ads", platforms: ["meta_ads", "website", "general"], property: "optional",
    defaultGoal: "leads", defaultCta: "website", defaultLength: "short",
    skillTags: ["headlines", "ab-test", "ads"], sections: [],
    sequence: { prefix: "headline_", label: "Nagłówek", min: 6, max: 12, maxChars: 60 },
  },
  {
    id: "cta_variants", group: "ads", label: "Teksty CTA",
    description: "Warianty wezwań do działania do przycisków, postów i e-maili.",
    outputKind: "short_copy", defaultPlatform: "general", platforms: ["general", "website", "email", "meta_ads"], property: "optional",
    defaultGoal: "leads", defaultCta: "message", defaultLength: "short",
    skillTags: ["cta", "ab-test"], sections: [],
    sequence: { prefix: "cta_", label: "CTA", min: 6, max: 12, maxChars: 60 },
  },
  {
    id: "landing_copy", group: "ads", label: "Landing page copy",
    description: "Teksty strony oferty lub usługi.",
    outputKind: "landing", defaultPlatform: "website", platforms: ["website"], property: "optional",
    defaultGoal: "leads", defaultCta: "message", defaultLength: "medium",
    skillTags: ["landing", "conversion", "headlines", "cta"],
    sections: [
      { key: "hero_headline", label: "Nagłówek hero", maxChars: 80 },
      { key: "hero_subheadline", label: "Podtytuł", maxChars: 200 },
      { key: "hero_cta", label: "Przycisk CTA", maxChars: 40 },
      { key: "benefits", label: "Korzyści" },
      { key: "how_it_works", label: "Jak to działa" },
      { key: "objections", label: "Pytania i obawy" },
      { key: "final_cta", label: "Finalne CTA" },
      { key: "meta_title", label: "Meta title", maxChars: 60 },
      { key: "meta_description", label: "Meta description", maxChars: 155 },
    ],
  },
  {
    id: "sales_email", group: "ads", label: "E-mail sprzedażowy",
    description: "E-mail z propozycją usługi lub oferty do bazy kontaktów.",
    outputKind: "email", defaultPlatform: "email", platforms: ["email"], property: "optional",
    defaultGoal: "leads", defaultCta: "message", defaultLength: "medium",
    skillTags: ["email", "sales-copy", "cta"], sections: EMAIL_SECTIONS,
  },
  {
    id: "campaign_proposal", group: "ads", label: "Propozycja kampanii",
    description: "Szkic kampanii: cel, odbiorcy, przekaz, kanały, harmonogram.",
    outputKind: "campaign", defaultPlatform: "general", platforms: ["general", "meta_ads", "instagram", "facebook"], property: "optional",
    defaultGoal: "leads", defaultCta: "message", defaultLength: "medium",
    skillTags: ["campaign", "planning", "segmentation", "funnel"], sections: CAMPAIGN_SECTIONS,
  },
  {
    id: "ad_followup", group: "ads", label: "Tekst follow-up",
    description: "Wiadomość po prezentacji, zapytaniu lub rozmowie.",
    outputKind: "email", defaultPlatform: "email", platforms: ["email", "general"], property: "optional",
    defaultGoal: "sales", defaultCta: "viewing", defaultLength: "short",
    skillTags: ["follow-up", "email", "cta"],
    sections: [
      { key: "subject", label: "Temat (dla e-maila)", maxChars: 60, optional: true },
      { key: "body", label: "Treść wiadomości" },
    ],
  },
  {
    id: "ab_test", group: "ads", label: "Propozycja testów A/B",
    description: "Hipoteza, warianty i sposób pomiaru testu.",
    outputKind: "ab_test", defaultPlatform: "meta_ads", platforms: ["meta_ads", "website", "email", "instagram"], property: "optional",
    defaultGoal: "leads", defaultCta: "message", defaultLength: "medium",
    skillTags: ["ab-test", "ads", "headlines"],
    sections: [
      { key: "hypothesis", label: "Hipoteza" },
      { key: "variable", label: "Testowana zmienna" },
      { key: "variant_a", label: "Wariant A" },
      { key: "variant_b", label: "Wariant B" },
      { key: "metric", label: "Metryka główna" },
      { key: "duration", label: "Czas i warunki testu" },
      { key: "reading", label: "Jak czytać wynik" },
    ],
  },
];

export const CONTENT_TYPE_MAP = new Map(REAL_ESTATE_CONTENT_TYPES.map((t) => [t.id, t]));

export function getContentType(id: string): ContentTypeDef | undefined {
  return CONTENT_TYPE_MAP.get(id);
}

export const AUDIENCE_PRESETS = {
  first_buyers: "Osoby kupujące pierwsze mieszkanie",
  families: "Rodziny z dziećmi",
  investors: "Inwestorzy (zakup pod najem)",
  premium: "Klienci premium",
  owners: "Właściciele chcący sprzedać lub wynająć",
  tenants: "Najemcy",
  seniors: "Seniorzy",
  relocation: "Osoby przeprowadzające się z innego miasta",
  brand: "Grupa docelowa z profilu marki",
} as const;
export type AudiencePreset = keyof typeof AUDIENCE_PRESETS;

/** Skill tags implied by the chosen audience. */
export const AUDIENCE_TAGS: Partial<Record<AudiencePreset, string[]>> = {
  first_buyers: ["first-buyers"],
  investors: ["investors"],
  premium: ["premium"],
  owners: ["owner-acquisition"],
  tenants: ["rental"],
};
