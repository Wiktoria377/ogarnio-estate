import type { BrandKit } from "@/core/brand/model";
import { SLIDE_KINDS, type Slide, type SlideKind } from "@/core/graphics/design";
import type { PropertyRow } from "@/lib/supabase/database.types";
import { formatArea, formatPrice, plural } from "@/lib/utils";
import { PROPERTY_TYPES, TRANSACTIONS } from "./labels";
import { floorLabel, propertyFactSheet } from "./property";

/**
 * Deterministic texts taken straight from the property and brand records.
 * These fill "fact" slots; AI only writes creative slots (headline, body).
 */
export function factTexts(p: PropertyRow | null, brand: BrandKit): Record<SlideKind, Record<string, string>> {
  const contact = [brand.contact.phone, brand.contact.email, brand.contact.website].filter(Boolean).join("\n");
  if (!p) {
    return { cover: { eyebrow: brand.companyName }, photo: {}, features: {}, facts: {}, cta: { contact } };
  }
  const where = [p.district, p.city].filter(Boolean).join(", ");
  const details = [
    p.area_m2 != null ? formatArea(p.area_m2) : null,
    p.rooms != null ? `${p.rooms} ${plural(p.rooms, ["pokój", "pokoje", "pokoi"])}` : null,
    floorLabel(p.floor, p.total_floors),
  ].filter(Boolean).join(" · ");
  const price = p.price != null ? `${formatPrice(p.price, p.currency)}${p.transaction_type === "rent" ? " / mies." : ""}` : "";
  const sheet = propertyFactSheet(p);
  const rows = sheet.facts
    .filter((f) => ["property_type", "market", "area", "rooms", "floor", "year_built", "price", "price_per_m2", "location"].includes(f.key))
    .map((f) => `${f.label}: ${f.value}`)
    .join("\n");
  const items = [...p.features, ...p.amenities].slice(0, 5);
  return {
    cover: { eyebrow: [`${PROPERTY_TYPES[p.property_type]} · ${TRANSACTIONS[p.transaction_type].toLowerCase()}`, where].filter(Boolean).join(" · "), title: p.title, details, price },
    photo: {},
    features: Object.fromEntries(items.map((t, i) => [`item${i + 1}`, t])),
    facts: { title: "Parametry", rows },
    cta: { contact },
  };
}

/** Fills empty fact slots of slides from the record without touching edited text. */
export function applyFactTexts(slides: Slide[], facts: Record<SlideKind, Record<string, string>>, overwrite = false): Slide[] {
  return slides.map((s) => {
    const texts = { ...s.texts };
    for (const slot of SLIDE_KINDS[s.kind].slots) {
      const value = facts[s.kind][slot.key];
      if (value === undefined) continue;
      if (overwrite ? slot.source === "fact" : !texts[slot.key]?.trim()) texts[slot.key] = value.slice(0, slot.maxChars * 2);
    }
    return { ...s, texts };
  });
}
