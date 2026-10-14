import type { PropertyRow } from "@/lib/supabase/database.types";

export const PROPERTY_TYPES: Record<PropertyRow["property_type"], string> = {
  apartment: "Mieszkanie",
  house: "Dom",
  plot: "Działka",
  commercial: "Obiekt komercyjny",
  office: "Biuro",
  premises: "Lokal użytkowy",
  garage: "Garaż / miejsce postojowe",
  room: "Pokój",
  other: "Inna",
};

export const MARKETS: Record<NonNullable<PropertyRow["market"]>, string> = {
  primary: "Rynek pierwotny",
  secondary: "Rynek wtórny",
};

export const TRANSACTIONS: Record<PropertyRow["transaction_type"], string> = {
  sale: "Sprzedaż",
  rent: "Wynajem",
};

export const PROPERTY_STATUSES: Record<PropertyRow["status"], { label: string; tone: "neutral" | "success" | "warning" | "muted" | "accent" }> = {
  draft: { label: "Szkic", tone: "muted" },
  active: { label: "Aktywna", tone: "success" },
  reserved: { label: "Rezerwacja", tone: "warning" },
  sold: { label: "Sprzedana", tone: "accent" },
  rented: { label: "Wynajęta", tone: "accent" },
  archived: { label: "Archiwum", tone: "muted" },
};

export const COMMON_FEATURES = [
  "Balkon", "Taras", "Loggia", "Ogród", "Winda", "Garaż", "Miejsce postojowe", "Komórka lokatorska",
  "Piwnica", "Klimatyzacja", "Ogrzewanie miejskie", "Ogrzewanie podłogowe", "Pompa ciepła", "Fotowoltaika",
  "Monitoring", "Ochrona", "Teren zamknięty", "Rolety zewnętrzne", "Kuchnia otwarta na salon", "Oddzielna kuchnia",
  "Garderoba", "Dwie łazienki", "Wanna", "Prysznic walk-in", "Kominek", "Umeblowane", "Do wykończenia", "Stan deweloperski",
  "Po remoncie", "Widok na zieleń", "Ekspozycja południowa", "Dwustronne",
];
