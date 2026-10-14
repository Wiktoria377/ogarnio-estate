/**
 * Common internal property model for every import source (CSV, XML/JSON feed,
 * CRM adapters). Each source yields flat records (column → text); this module
 * maps them to Ogarnio fields, normalizes Polish CRM values, validates with the
 * same schema as the property form, detects duplicates and computes diffs.
 * Client-safe: no server imports.
 */
import { propertyFormSchema, type PropertyForm } from "@/verticals/real-estate/property";
import type { PropertyRow } from "@/lib/supabase/database.types";

export const IMPORT_FIELDS = {
  external_ref: { label: "Numer oferty w CRM", aliases: ["numer oferty", "nr oferty", "nr", "id oferty", "numer", "symbol", "symbol oferty", "kod oferty", "offer id", "listing id", "id", "ref", "reference", "external id", "number", "signature"] },
  title: { label: "Tytuł", aliases: ["tytuł", "tytul", "nazwa", "tytuł oferty", "nagłówek", "title", "name", "headline"] },
  property_type: { label: "Typ nieruchomości", aliases: ["typ", "typ nieruchomości", "rodzaj", "rodzaj nieruchomości", "kategoria", "property type", "type", "section", "category"] },
  transaction_type: { label: "Transakcja", aliases: ["transakcja", "rodzaj transakcji", "typ transakcji", "oferta", "transaction", "transaction type", "deal"] },
  market: { label: "Rynek", aliases: ["rynek", "rynek pierwotny/wtórny", "market"] },
  city: { label: "Miasto", aliases: ["miasto", "miejscowość", "miejscowosc", "city", "locality", "town"] },
  district: { label: "Dzielnica", aliases: ["dzielnica", "osiedle", "district", "quarter", "neighbourhood"] },
  street: { label: "Ulica", aliases: ["ulica", "adres", "street", "address"] },
  area_m2: { label: "Powierzchnia (m²)", aliases: ["powierzchnia", "metraż", "metraz", "pow.", "powierzchnia m2", "powierzchnia całkowita", "area", "total area", "size", "living area"] },
  rooms: { label: "Liczba pokoi", aliases: ["pokoje", "liczba pokoi", "ilość pokoi", "ilosc pokoi", "pokoi", "rooms", "no of rooms", "rooms number"] },
  floor: { label: "Piętro", aliases: ["piętro", "pietro", "kondygnacja", "floor", "floor no"] },
  total_floors: { label: "Liczba pięter", aliases: ["liczba pięter", "liczba pieter", "pięter w budynku", "ilość pięter", "floors", "total floors", "building floors", "floors in building"] },
  year_built: { label: "Rok budowy", aliases: ["rok budowy", "rok", "year built", "built", "year of construction", "build year"] },
  price: { label: "Cena", aliases: ["cena", "cena całkowita", "kwota", "cena ofertowa", "czynsz", "price", "total price", "amount"] },
  currency: { label: "Waluta", aliases: ["waluta", "currency"] },
  description: { label: "Opis", aliases: ["opis", "opis oferty", "description", "desc", "content"] },
  features: { label: "Cechy (rozdzielone ;)", aliases: ["cechy", "atuty", "zalety", "features", "highlights"] },
  amenities: { label: "Udogodnienia (rozdzielone ;)", aliases: ["udogodnienia", "wyposażenie", "wyposazenie", "media", "amenities", "equipment"] },
  status: { label: "Status", aliases: ["status", "stan oferty", "status oferty", "state"] },
  photos: { label: "Zdjęcia (adresy URL)", aliases: ["zdjęcia", "zdjecia", "zdjęcie", "foto", "zdjęcia url", "photos", "images", "pictures", "image urls", "photo"] },
} as const;

export type ImportField = keyof typeof IMPORT_FIELDS;
export const IMPORT_FIELD_KEYS = Object.keys(IMPORT_FIELDS) as ImportField[];
/** Column header → target field ("" = ignore). */
export type ColumnMapping = Record<string, ImportField | "">;

const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/[_\-./:]+/g, " ").replace(/\s+/g, " ").trim();

/** Proposes a mapping from headers; each field is assigned at most once (exact alias match first, then the last path segment). */
export function autoMap(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = Object.fromEntries(headers.map((h) => [h, ""]));
  const used = new Set<ImportField>();
  const candidates = (h: string) => [fold(h), fold(h.split(/[.>/]/).at(-1) ?? h)];
  for (const pass of [0, 1] as const) {
    for (const h of headers) {
      if (mapping[h]) continue;
      const key = candidates(h)[pass]!;
      const field = IMPORT_FIELD_KEYS.find((f) => !used.has(f) && (IMPORT_FIELDS[f].aliases as readonly string[]).some((a) => fold(a) === key));
      if (field) {
        mapping[h] = field;
        used.add(field);
      }
    }
  }
  return mapping;
}

const PROPERTY_TYPE_WORDS: [RegExp, PropertyRow["property_type"]][] = [
  [/^(mieszkanie|mieszkania|apartament|apartment|flat|kawalerka|lokal mieszkalny)/, "apartment"],
  [/^(dom|domy|house|segment|blizniak|szeregowiec|willa)/, "house"],
  [/^(dzialka|dzialki|grunt|plot|land)/, "plot"],
  [/^(biuro|biura|office|powierzchnia biurowa)/, "office"],
  [/^(lokal|lokale|lokal uzytkowy|premises|commercial premises|sklep|magazyn)/, "premises"],
  [/^(obiekt|komercyjn|commercial|hala|kamienica|hotel)/, "commercial"],
  [/^(garaz|miejsce postojowe|parking|garage)/, "garage"],
  [/^(pokoj|room)/, "room"],
  [/^(apartment|house|plot|commercial|office|premises|garage|room|other)$/, "other"],
];
const TRANSACTION_WORDS: [RegExp, PropertyRow["transaction_type"]][] = [
  [/(sprzeda|sale|sell|kupno)/, "sale"],
  [/(wynaj|najem|dzierzaw|rent|lease)/, "rent"],
];
const STATUS_WORDS: [RegExp, PropertyRow["status"]][] = [
  [/^(aktywn|active|dostepn|w sprzedazy|opublikowan|available|published|1$|true$)/, "active"],
  [/^(rezerwac|zarezerwowan|reserved)/, "reserved"],
  [/^(sprzedan|sold)/, "sold"],
  [/^(wynajet|rented|leased)/, "rented"],
  [/^(archiw|nieaktywn|wycofan|zakonczon|inactive|archived|withdrawn|0$|false$)/, "archived"],
  [/^(szkic|robocz|draft)/, "draft"],
];

export interface Issue {
  field: ImportField | "row";
  message: string;
  level: "error" | "warning";
}

/**
 * Parses Polish/English formatted numbers: "1 250 000,00 zł", "54,5 m²", "1.250.000", "450 tys.", "1,2 mln".
 * `grouped`: a single separator followed by exactly 3 digits is a thousands separator (prices).
 */
export function parseNumber(raw: string, grouped = false): number | null {
  let s = raw.toLowerCase().replace(/\u00a0/g, " ").trim();
  if (!s) return null;
  let mult = 1;
  if (/\d\s*(k|tys\.?)\s*(zł|pln)?$/.test(s)) mult = 1000;
  else if (/\d\s*mln\.?\s*(zł|pln)?$/.test(s)) mult = 1_000_000;
  s = s.replace(/m2|m²|zł|pln|eur|usd|€|\$|tys\.?|mln\.?|k$/g, "").replace(/\s+/g, "");
  if (!/^-?\d[\d.,]*$/.test(s)) return null;
  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  if (commas && dots) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (commas + dots > 1) {
    const sep = commas ? "," : ".";
    if ((s.match(sep === "," ? /,/g : /\./g) ?? []).length !== commas + dots) return null;
    s = s.split(sep).join("");
  } else if (commas + dots === 1) {
    const [, frac = ""] = s.split(/[.,]/);
    s = grouped && mult === 1 && frac.length === 3 ? s.replace(/[.,]/, "") : s.replace(",", ".");
  }
  const n = Number(s) * mult;
  return Number.isFinite(n) ? n : null;
}

function pick<T>(words: [RegExp, T][], raw: string): T | null {
  const v = fold(raw);
  for (const [re, value] of words) if (re.test(v)) return value;
  return null;
}

/** Splits photo URL lists (newline, space, ;, |, ,); keeps only http(s) URLs, max 40, deduplicated. */
export function parsePhotoUrls(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[\s;|,]+/)) {
    const t = part.trim();
    if (/^https?:\/\/[^\s]+$/i.test(t) && t.length <= 2000 && !out.includes(t)) out.push(t);
    if (out.length >= 40) break;
  }
  return out;
}

export interface NormalizedRecord {
  data: PropertyForm | null;
  externalRef: string | null;
  photoUrls: string[];
  issues: Issue[];
}

/** Maps one record and validates it with the property form schema. */
export function normalizeRecord(record: Record<string, string>, mapping: ColumnMapping, defaults: { transaction_type?: "sale" | "rent"; status?: PropertyRow["status"] } = {}): NormalizedRecord {
  const issues: Issue[] = [];
  const val = (f: ImportField) => {
    const cols = Object.entries(mapping).filter(([, t]) => t === f).map(([c]) => c);
    return cols.map((c) => (record[c] ?? "").trim()).filter(Boolean).join(f === "photos" ? "\n" : " ").trim();
  };
  const input: Record<string, unknown> = { area_m2: null, rooms: null, floor: null, total_floors: null, year_built: null, price: null };

  const rawType = val("property_type");
  const type = rawType ? pick(PROPERTY_TYPE_WORDS, rawType) : null;
  if (rawType && !type) issues.push({ field: "property_type", level: "warning", message: `Nieznany typ „${rawType.slice(0, 40)}” – ustawiono „Inne”.` });
  if (!rawType) issues.push({ field: "property_type", level: "warning", message: "Brak typu nieruchomości – ustawiono „Inne”." });
  input.property_type = type === "other" && rawType ? (["apartment", "house", "plot", "commercial", "office", "premises", "garage", "room", "other"].includes(fold(rawType)) ? fold(rawType) : "other") : (type ?? "other");

  const rawTx = val("transaction_type");
  const tx = rawTx ? pick(TRANSACTION_WORDS, rawTx) : null;
  if (rawTx && !tx) issues.push({ field: "transaction_type", level: "warning", message: `Nieznany rodzaj transakcji „${rawTx.slice(0, 40)}” – przyjęto sprzedaż.` });
  input.transaction_type = tx ?? defaults.transaction_type ?? "sale";

  const rawMarket = fold(val("market"));
  input.market = /pierwot|primary|deweloper|nowe/.test(rawMarket) ? "primary" : /wtorn|secondary|uzywan/.test(rawMarket) ? "secondary" : "";

  for (const f of ["city", "district", "street", "description"] as const) {
    const v = val(f);
    if (v) input[f] = f === "description" ? v.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim() : v;
  }

  const num = (f: "area_m2" | "rooms" | "year_built" | "price" | "total_floors", label: string) => {
    const v = val(f);
    if (!v) return;
    const n = parseNumber(v, f === "price");
    if (n === null) issues.push({ field: f, level: "error", message: `${label}: „${v.slice(0, 30)}” nie jest liczbą.` });
    else input[f] = f === "rooms" || f === "year_built" || f === "total_floors" ? Math.round(n) : n;
  };
  num("area_m2", "Powierzchnia");
  num("rooms", "Liczba pokoi");
  num("year_built", "Rok budowy");
  num("price", "Cena");
  num("total_floors", "Liczba pięter");

  const rawFloor = val("floor").toLowerCase().replace(/\s+/g, " ").trim();
  if (rawFloor) {
    const pair = rawFloor.match(/^(-?\d+|parter|p)\s*(?:\/|z)\s*(\d+)$/);
    const f = pair ? pair[1]! : rawFloor;
    const n = /^(parter|p|0)$/.test(f) ? 0 : /^(suterena|piwnica)$/.test(f) ? -1 : parseNumber(f);
    if (n === null) issues.push({ field: "floor", level: "error", message: `Piętro: „${rawFloor.slice(0, 20)}” nie jest liczbą.` });
    else input.floor = Math.round(n);
    if (pair && input.total_floors == null) input.total_floors = Number(pair[2]);
  }

  const rawCur = val("currency").toUpperCase().replace("ZŁ", "PLN").replace("€", "EUR").replace("$", "USD");
  if (rawCur && !["PLN", "EUR", "USD"].includes(rawCur)) issues.push({ field: "currency", level: "warning", message: `Nieobsługiwana waluta „${rawCur}” – przyjęto PLN.` });
  input.currency = ["PLN", "EUR", "USD"].includes(rawCur) ? rawCur : /€|eur/i.test(val("price")) ? "EUR" : "PLN";

  for (const f of ["features", "amenities"] as const) {
    const v = val(f);
    if (v) input[f] = v.split(/[;\n|]|,\s(?=\p{L})/u).map((s) => s.trim()).filter(Boolean);
  }

  const rawStatus = val("status");
  const st = rawStatus ? pick(STATUS_WORDS, rawStatus) : null;
  if (rawStatus && !st) issues.push({ field: "status", level: "warning", message: `Nieznany status „${rawStatus.slice(0, 30)}” – ustawiono „Aktywna”.` });
  input.status = st ?? defaults.status ?? "active";

  let title = val("title");
  if (!title) {
    const typeLabel: Record<string, string> = { apartment: "Mieszkanie", house: "Dom", plot: "Działka", commercial: "Obiekt komercyjny", office: "Biuro", premises: "Lokal użytkowy", garage: "Garaż", room: "Pokój", other: "Nieruchomość" };
    const parts = [typeLabel[String(input.property_type)], input.rooms != null ? `${input.rooms} pok.` : null, input.area_m2 != null ? `${String(input.area_m2).replace(".", ",")} m²` : null, [input.city, input.district].filter(Boolean).join(" ") || null].filter(Boolean);
    title = parts.join(", ");
    if (title.length >= 2) issues.push({ field: "title", level: "warning", message: "Brak tytułu – utworzono z typu, metrażu i lokalizacji." });
  }
  input.title = title.slice(0, 160);

  const externalRef = val("external_ref").slice(0, 120) || null;
  const photoUrls = parsePhotoUrls(val("photos"));
  const rawPhotos = val("photos");
  if (rawPhotos && !photoUrls.length) issues.push({ field: "photos", level: "warning", message: "W kolumnie zdjęć nie znaleziono adresów http(s)." });

  const parsed = propertyFormSchema.safeParse(input);
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      const field = (String(i.path[0] ?? "row") as ImportField | "row");
      // Number errors are already reported above in Polish with the original value.
      if (!issues.some((x) => x.field === field && x.level === "error")) issues.push({ field: IMPORT_FIELD_KEYS.includes(field as ImportField) ? field : "row", level: "error", message: i.message });
    }
  }
  const hasError = issues.some((i) => i.level === "error");
  return { data: parsed.success && !hasError ? parsed.data : null, externalRef, photoUrls, issues };
}

/** Fingerprint for duplicate detection when a record has no CRM number. */
export function fingerprint(p: Pick<PropertyForm, "property_type" | "transaction_type" | "city" | "street" | "area_m2" | "rooms">): string | null {
  if (!p.city || p.area_m2 == null) return null;
  return [p.property_type, p.transaction_type, fold(p.city), fold(p.street ?? ""), Math.round(p.area_m2 * 10) / 10, p.rooms ?? ""].join("|");
}

export const DIFF_FIELDS = ["title", "property_type", "transaction_type", "market", "city", "district", "street", "area_m2", "rooms", "floor", "total_floors", "year_built", "price", "currency", "description", "features", "amenities", "status"] as const;
export type DiffField = (typeof DIFF_FIELDS)[number];
export const DIFF_LABELS: Record<DiffField | "photos", string> = {
  title: "Tytuł", property_type: "Typ", transaction_type: "Transakcja", market: "Rynek", city: "Miasto", district: "Dzielnica", street: "Ulica",
  area_m2: "Powierzchnia", rooms: "Pokoje", floor: "Piętro", total_floors: "Liczba pięter", year_built: "Rok budowy", price: "Cena", currency: "Waluta",
  description: "Opis", features: "Cechy", amenities: "Udogodnienia", status: "Status", photos: "Zdjęcia",
};

export interface FieldChange {
  field: DiffField | "photos";
  before: unknown;
  after: unknown;
}

const same = (a: unknown, b: unknown) => {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  if (typeof a === "number" || typeof b === "number") return a != null && b != null ? Math.abs(Number(a) - Number(b)) < 0.005 : a == b;
  return (a ?? null) === (b ?? null);
};

/**
 * Differences between the stored offer and incoming data. Fields the source
 * left empty are not treated as removals (CRM exports often omit columns).
 */
export function diffProperty(current: Pick<PropertyRow, DiffField>, incoming: PropertyForm, opts: { mapped: Set<ImportField>; currentPhotoUrls?: string[]; incomingPhotoUrls?: string[] }): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const f of DIFF_FIELDS) {
    const mappedField: ImportField = f;
    if (!opts.mapped.has(mappedField) && !(f === "title")) continue;
    if (f === "title" && !opts.mapped.has("title")) continue;
    const after = incoming[f as keyof PropertyForm];
    const before = current[f];
    if (after === null || after === undefined || (Array.isArray(after) && after.length === 0) || after === "") continue;
    if (!same(before, after)) changes.push({ field: f, before: before ?? null, after });
  }
  if (opts.mapped.has("photos") && opts.incomingPhotoUrls?.length) {
    const cur = [...(opts.currentPhotoUrls ?? [])].sort();
    const inc = [...opts.incomingPhotoUrls].sort();
    if (JSON.stringify(cur) !== JSON.stringify(inc)) changes.push({ field: "photos", before: cur.length, after: inc.length });
  }
  return changes;
}

/** Stable serialization for change hashes (key order independent). */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

export function formatChangeValue(field: FieldChange["field"], v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (field === "photos") return `${v} zdj.`;
  if (Array.isArray(v)) return v.join(", ");
  if (field === "price" && typeof v === "number") return new Intl.NumberFormat("pl-PL").format(v);
  if (field === "description" && typeof v === "string") return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  return String(v);
}
