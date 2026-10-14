import { z } from "zod";
import type { PropertyRow, PropertyPhotoRow } from "@/lib/supabase/database.types";
import type { Fact, FactSheet } from "@/core/marketing-engine/facts";
import { formatArea, formatNumber, formatPrice, plural } from "@/lib/utils";
import { MARKETS, PROPERTY_TYPES, TRANSACTIONS } from "./labels";

const optionalNumber = (opts: { min: number; max: number; int?: boolean; label: string }) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v, ctx) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
      const n = typeof v === "number" ? v : Number(v.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: "custom", message: `${opts.label}: podaj liczbę` });
        return z.NEVER;
      }
      if (opts.int && !Number.isInteger(n)) {
        ctx.addIssue({ code: "custom", message: `${opts.label}: podaj liczbę całkowitą` });
        return z.NEVER;
      }
      if (n < opts.min || n > opts.max) {
        ctx.addIssue({ code: "custom", message: `${opts.label}: zakres ${opts.min}–${opts.max}` });
        return z.NEVER;
      }
      return n;
    });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksymalnie ${max} znaków`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const tagList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    const arr = Array.isArray(v) ? v : (v ?? "").split(/\n|;/);
    return [...new Set(arr.map((s) => s.trim()).filter(Boolean))].slice(0, 40).map((s) => s.slice(0, 80));
  });

export const propertyFormSchema = z.object({
  title: z.string().trim().min(2, "Podaj nazwę oferty").max(160),
  property_type: z.enum(Object.keys(PROPERTY_TYPES) as [PropertyRow["property_type"], ...PropertyRow["property_type"][]]),
  market: z
    .enum(["primary", "secondary", ""])
    .optional()
    .transform((v) => (v ? v : null)),
  transaction_type: z.enum(["sale", "rent"]),
  city: optionalText(80),
  district: optionalText(80),
  street: optionalText(120),
  show_street: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true"),
  area_m2: optionalNumber({ min: 1, max: 999999, label: "Metraż" }),
  rooms: optionalNumber({ min: 0, max: 50, int: true, label: "Liczba pokoi" }),
  floor: optionalNumber({ min: -5, max: 200, int: true, label: "Piętro" }),
  total_floors: optionalNumber({ min: 0, max: 200, int: true, label: "Liczba pięter" }),
  year_built: optionalNumber({ min: 1500, max: 2100, int: true, label: "Rok budowy" }),
  price: optionalNumber({ min: 0, max: 999999999999, label: "Cena" }),
  currency: z.enum(["PLN", "EUR", "USD"]).default("PLN"),
  description: optionalText(8000),
  features: tagList,
  amenities: tagList,
  agent_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.uuid().safeParse(v).success, "Nieprawidłowy agent"),
  status: z.enum(["draft", "active", "reserved", "sold", "rented", "archived"]).default("active"),
}).refine((d) => d.floor == null || d.total_floors == null || d.floor <= d.total_floors, {
  path: ["floor"],
  message: "Piętro nie może być wyższe niż liczba pięter budynku",
});

export type PropertyForm = z.infer<typeof propertyFormSchema>;

export function locationLabel(p: Pick<PropertyRow, "city" | "district" | "street" | "show_street">): string | null {
  const parts = [p.show_street ? p.street : null, p.district, p.city].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function floorLabel(floor: number | null, total: number | null): string | null {
  if (floor == null) return null;
  const f = floor === 0 ? "parter" : floor < 0 ? `poziom ${floor}` : `${floor}. piętro`;
  return total != null ? `${f} z ${total}` : f;
}

/**
 * The fact sheet is the only material the generator may state as fact.
 * Empty fields are omitted, so the model never sees (or invents) them.
 */
export function propertyFactSheet(p: PropertyRow, photos: Pick<PropertyPhotoRow, "is_visualization">[] = []): FactSheet {
  const facts: Fact[] = [];
  const push = (f: Fact | null) => f && facts.push(f);
  push({ key: "property_type", label: "Typ nieruchomości", value: PROPERTY_TYPES[p.property_type], unit: "text" });
  push({ key: "transaction", label: "Transakcja", value: TRANSACTIONS[p.transaction_type], unit: "text" });
  if (p.market) push({ key: "market", label: "Rynek", value: MARKETS[p.market], unit: "text" });
  const loc = locationLabel(p);
  if (loc) push({ key: "location", label: "Lokalizacja", value: loc, unit: "text" });
  if (p.area_m2 != null) push({ key: "area", label: "Powierzchnia", value: formatArea(p.area_m2)!, unit: "area", numbers: [p.area_m2, Math.round(p.area_m2)] });
  if (p.rooms != null) push({ key: "rooms", label: "Liczba pokoi", value: `${p.rooms} ${plural(p.rooms, ["pokój", "pokoje", "pokoi"])}`, unit: "count", numbers: [p.rooms] });
  const fl = floorLabel(p.floor, p.total_floors);
  if (fl) push({ key: "floor", label: "Piętro", value: fl, unit: "floor", numbers: [p.floor, p.total_floors].filter((n): n is number => n != null) });
  if (p.year_built != null) push({ key: "year_built", label: "Rok budowy", value: String(p.year_built), unit: "year", numbers: [p.year_built] });
  if (p.price != null) {
    const suffix = p.transaction_type === "rent" ? " / miesiąc" : "";
    push({
      key: "price",
      label: p.transaction_type === "rent" ? "Czynsz najmu" : "Cena",
      value: `${formatPrice(p.price, p.currency)}${suffix}`,
      unit: "price",
      numbers: [p.price, Math.round(p.price / 1000), Number((p.price / 1_000_000).toFixed(2))],
    });
  }
  if (p.price_per_m2 != null)
    push({ key: "price_per_m2", label: "Cena za m²", value: `${formatNumber(Math.round(p.price_per_m2), 0)} ${p.currency === "PLN" ? "zł" : p.currency}/m²`, unit: "price_per_area", numbers: [Math.round(p.price_per_m2), p.price_per_m2] });
  if (p.features.length) push({ key: "features", label: "Cechy szczególne", value: p.features.join("; "), unit: "text" });
  if (p.amenities.length) push({ key: "amenities", label: "Udogodnienia", value: p.amenities.join("; "), unit: "text" });
  if (photos.some((ph) => ph.is_visualization))
    push({ key: "visualizations", label: "Uwaga", value: "Część zdjęć to wizualizacje poglądowe (nie zdjęcia stanu faktycznego).", unit: "text" });

  return {
    subject: p.title,
    facts,
    notes: p.description ? [{ label: "Opis od biura (fakty podane przez użytkownika)", text: p.description }] : [],
  };
}

/**
 * Skill-selection tags from the property's own data (etap 4, Skills Engine 2.0).
 * Only facts typed by the user are used; thresholds are simple and documented.
 */
export function propertySkillTags(p: Pick<PropertyRow, "title" | "property_type" | "transaction_type" | "price" | "price_per_m2" | "area_m2" | "rooms" | "description" | "features" | "market">): { tags: string[]; reasons: string[] } {
  const tags: string[] = [];
  const reasons: string[] = [];
  const text = `${p.title} ${p.description ?? ""} ${(p.features ?? []).join(" ")}`.toLowerCase();
  const perM2 = p.price_per_m2 ?? (p.price && p.area_m2 ? p.price / p.area_m2 : null);
  if (p.transaction_type === "sale" && ((p.price ?? 0) >= 2_000_000 || (perM2 ?? 0) >= 25_000 || /luksus|premium|penthouse|rezydencj|ekskluzyw/.test(text))) {
    tags.push("premium");
    reasons.push((p.price ?? 0) >= 2_000_000 ? "cena od 2 mln zł" : (perM2 ?? 0) >= 25_000 ? "cena od 25 000 zł/m²" : "opis wskazuje segment premium");
  }
  if (p.transaction_type === "rent") {
    tags.push("rental");
    reasons.push("oferta najmu");
  }
  if (p.transaction_type === "sale" && (p.property_type === "house" || (p.rooms ?? 0) >= 3) && !tags.includes("premium")) {
    tags.push("families");
    reasons.push("dom lub 3+ pokoje");
  }
  if (p.transaction_type === "sale" && (p.property_type === "apartment" || p.property_type === "room") && (p.area_m2 ?? 99) <= 40) {
    tags.push("investors", "first-buyers");
    reasons.push("małe mieszkanie (do 40 m²)");
  }
  if (p.market === "primary") {
    tags.push("primary-market");
    reasons.push("rynek pierwotny");
  }
  return { tags, reasons };
}
