/** Shared vocabulary of the marketing engine (industry-agnostic). */
export const PLATFORMS = {
  instagram: { label: "Instagram", short: true },
  facebook: { label: "Facebook", short: true },
  linkedin: { label: "LinkedIn", short: true },
  tiktok: { label: "TikTok", short: true },
  meta_ads: { label: "Meta Ads (FB/IG)", short: true },
  email: { label: "E-mail", short: false },
  website: { label: "Strona www / landing page", short: false },
  blog: { label: "Blog", short: false },
  portal: { label: "Portal ogłoszeniowy", short: false },
  print: { label: "Druk / broszura", short: false },
  general: { label: "Uniwersalnie", short: false },
} as const;
export type Platform = keyof typeof PLATFORMS;
export const PLATFORM_IDS = Object.keys(PLATFORMS) as [Platform, ...Platform[]];

export const GOALS = {
  leads: "Pozyskanie zapytań (leady)",
  sales: "Sprzedaż / wynajem konkretnej oferty",
  awareness: "Zasięg i rozpoznawalność",
  engagement: "Zaangażowanie społeczności",
  education: "Edukacja odbiorców",
  trust: "Budowanie zaufania i wizerunku",
  owner_acquisition: "Pozyskanie właścicieli nieruchomości",
  traffic: "Ruch na stronę",
  nurture: "Podtrzymanie relacji",
} as const;
export type Goal = keyof typeof GOALS;
export const GOAL_IDS = Object.keys(GOALS) as [Goal, ...Goal[]];

export const LENGTHS = {
  short: { label: "Krótka", hint: "Zwięźle, tylko to, co najważniejsze" },
  medium: { label: "Średnia", hint: "Standardowa długość dla formatu" },
  long: { label: "Rozbudowana", hint: "Pełne rozwinięcie tematu" },
} as const;
export type Length = keyof typeof LENGTHS;

export const CTA_TYPES = {
  call: "Telefon do agenta",
  message: "Wiadomość prywatna",
  viewing: "Umówienie prezentacji",
  website: "Wejście na stronę",
  download: "Pobranie materiału",
  comment: "Komentarz / zapis w komentarzu",
  newsletter: "Zapis do newslettera",
  valuation: "Bezpłatna rozmowa o wycenie",
  soft: "Miękkie, bez nachalnej prośby",
} as const;
export type CtaType = keyof typeof CTA_TYPES;

export const TONE_OVERRIDES = {
  brand: "Zgodnie z marką",
  warmer: "Cieplej",
  more_expert: "Bardziej ekspercko",
  more_direct: "Bardziej bezpośrednio",
  more_premium: "Bardziej premium",
  lighter: "Lżej, z humorem",
} as const;
export type ToneOverride = keyof typeof TONE_OVERRIDES;

export const OUTPUT_KINDS = [
  "post", "long_form", "listing", "carousel", "video_script", "ad", "email", "faq", "landing", "campaign", "ab_test", "short_copy",
] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

export type ContentGroup = "property" | "expert" | "personal" | "ads";

export type EngineTask = "generate" | "refine" | "graphic_copy" | "review" | "campaign_brief" | "video_script";
