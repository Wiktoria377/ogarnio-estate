import type { BrandStyle } from "@/core/brand/model";
import { FORMATS, TEMPLATES, TEMPLATE_IDS, type FormatId, type TemplateCategory, type TemplateId } from "@/core/graphics/design";
import type { PhotoReport } from "./photos";

/**
 * Composition choice from what is actually there: number and proportions of
 * usable photos, their brightness and colours, amount of text, the message,
 * the property's character and the brand style. Deterministic and explained:
 * every recommendation lists its reasons, and the user can pick any template.
 */
export type Message = "sales" | "premium" | "price" | "event" | "expert" | "brand";

export interface CompositionInput {
  format: FormatId;
  photos: Pick<PhotoReport, "orientation" | "ratio" | "brightness" | "score" | "issues">[];
  /** Characters of creative text expected on the cover (headline + subtitle). */
  textLength: number;
  message: Message;
  propertyTags: string[];
  brandStyle: BrandStyle;
}

export interface CompositionChoice {
  template: TemplateId;
  score: number;
  reasons: string[];
}

const BRAND_FIT: Record<BrandStyle, TemplateCategory[]> = {
  luxury: ["luxury", "editorial"],
  modern_minimal: ["minimal", "architecture"],
  elegant_corporate: ["corporate", "editorial"],
  warm_lifestyle: ["corporate", "architecture", "editorial"],
  bold_contemporary: ["bold", "architecture"],
};
const MESSAGE_FIT: Record<Message, TemplateId[]> = {
  sales: ["frame", "corporate", "split", "editorial"],
  premium: ["arch", "noir", "magazine", "gallery"],
  price: ["pricetag", "split", "corporate"],
  event: ["frame", "collage", "split"],
  expert: ["editorial", "corporate", "magazine", "lines"],
  brand: ["magazine", "gallery", "lines", "editorial"],
};
/** Layouts that print text over the photo (need a calm, not too bright image). */
const TEXT_ON_PHOTO = new Set<TemplateId>(["minimal", "noir", "magazine"]);
/** Layouts with a separate text panel (tolerate long texts and busy photos). */
const TEXT_PANEL = new Set<TemplateId>(["editorial", "corporate", "split", "gallery", "frame"]);

export function recommendCompositions(input: CompositionInput): CompositionChoice[] {
  const usable = input.photos.filter((p) => !p.issues.some((i) => i.severity === "problem"));
  const story = FORMATS[input.format].h / FORMATS[input.format].w > 1.5;
  const landscape = usable.filter((p) => p.orientation === "landscape").length;
  const meanBright = usable.length ? usable.reduce((s, p) => s + p.brightness, 0) / usable.length : 0.5;
  const premium = input.message === "premium" || input.propertyTags.includes("premium") || input.brandStyle === "luxury";

  const out = TEMPLATE_IDS.map((id) => {
    const t = TEMPLATES[id];
    let score = 50;
    const reasons: string[] = [];
    if (t.photos > usable.length) {
      score -= usable.length === 0 ? 60 : 40;
      reasons.push(usable.length === 0 ? "brak dobrych zdjęć" : `wymaga ${t.photos} zdjęć, dobrych jest ${usable.length}`);
    } else if (t.photos >= 3) {
      score += 12;
      reasons.push(`${usable.length} dobre zdjęcia pozwalają pokazać kilka pomieszczeń`);
    }
    if (BRAND_FIT[input.brandStyle].includes(t.category)) { score += 15; reasons.push("pasuje do stylu marki"); }
    const m = MESSAGE_FIT[input.message].indexOf(id);
    if (m >= 0) { score += 20 - m * 4; reasons.push("wspiera główny przekaz"); }
    if (premium && t.category === "luxury") { score += 10; reasons.push("charakter premium oferty"); }
    if (!premium && t.category === "luxury") score -= 8;
    if (TEXT_ON_PHOTO.has(id)) {
      if (input.textLength > 90) { score -= 15; reasons.push("dużo tekstu na zdjęciu obniża czytelność"); }
      if (meanBright > 0.7) { score -= 10; reasons.push("jasne zdjęcia słabo niosą biały tekst"); }
    }
    if (TEXT_PANEL.has(id) && input.textLength > 90) { score += 8; reasons.push("osobny panel mieści dłuższy tekst"); }
    if (story && id === "collage") { score -= 15; reasons.push("kolaż w pionie zmniejsza zdjęcia"); }
    if (story && landscape > 0 && landscape === usable.length && !TEXT_PANEL.has(id)) { score -= 6; reasons.push("poziome zdjęcia w pionowym formacie mocno się przycinają"); }
    return { template: id, score, reasons };
  });
  return out.sort((a, b) => b.score - a.score || a.template.localeCompare(b.template));
}

/** Five creative directions for one material. Brand identity (colours, fonts, logo) never changes. */
export const CREATIVE_DIRECTIONS = {
  minimal: { label: "Minimalistyczna", message: "brand" as Message, prefer: ["gallery", "minimal", "lines"] as TemplateId[], tags: [] as string[], brief: "Kierunek minimalistyczny: najmniej słów, jeden konkret na element, dużo powietrza." },
  premium: { label: "Premium", message: "premium" as Message, prefer: ["arch", "noir", "magazine"] as TemplateId[], tags: ["premium", "storytelling"], brief: "Kierunek premium: spokojny, elegancki język, detal i jakość z danych, bez przymiotników na wyrost." },
  dynamic: { label: "Dynamiczna", message: "sales" as Message, prefer: ["split", "pricetag", "collage"] as TemplateId[], tags: ["hooks"], brief: "Kierunek dynamiczny: mocny hook, krótkie zdania, energia, liczby z danych na początku." },
  expert: { label: "Ekspercka", message: "expert" as Message, prefer: ["editorial", "corporate", "lines"] as TemplateId[], tags: ["expert", "education"], brief: "Kierunek ekspercki: rzeczowo, konkretne parametry i kontekst lokalizacji, ton doradcy." },
  sales: { label: "Sprzedażowa", message: "sales" as Message, prefer: ["frame", "corporate", "pricetag"] as TemplateId[], tags: ["sales-copy", "cta"], brief: "Kierunek sprzedażowy: korzyść dla odbiorcy, cena i parametry widoczne, jasne CTA." },
} as const;
export type CreativeDirection = keyof typeof CREATIVE_DIRECTIONS;
export const CREATIVE_DIRECTION_IDS = Object.keys(CREATIVE_DIRECTIONS) as CreativeDirection[];

/** Template for a direction: the direction's preferred layouts, ranked by the composition rules. */
export function templateForDirection(dir: CreativeDirection, input: Omit<CompositionInput, "message">): CompositionChoice {
  const d = CREATIVE_DIRECTIONS[dir];
  const ranked = recommendCompositions({ ...input, message: d.message });
  const best = ranked.filter((c) => d.prefer.includes(c.template))[0] ?? ranked[0]!;
  return { ...best, reasons: [`kierunek: ${d.label.toLowerCase()}`, ...best.reasons] };
}
