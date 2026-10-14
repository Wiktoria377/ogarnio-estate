import "server-only";
import { AppError } from "@/lib/errors";
import { safeFetch } from "@/lib/net/safe-fetch";
import { flattenRecord, type FlatTable } from "./feeds";
import type { ColumnMapping } from "@/core/import/model";

/**
 * CRM adapters built on the vendors' documented APIs only (no scraping, no
 * browser automation). Each adapter returns flat records that go through the
 * common mapping → validation → preview pipeline, where the user confirms the
 * field mapping before anything is written.
 *
 * Field names in the presets come from public documentation and could not be
 * verified against a live account (no test credentials). They are proposals:
 * the mapping step shows every column the CRM actually returned.
 */
export interface CrmCredentials {
  /** ASARI: userID; EstiCRM: company ID. */
  account: string;
  token: string;
}

export interface CrmAdapter {
  kind: "asari" | "esticrm";
  label: string;
  docsUrl: string;
  defaultBaseUrl: string;
  accountLabel: string;
  tokenLabel: string;
  preset: ColumnMapping;
  fetchAll(opts: { baseUrl: string; creds: CrmCredentials; signal?: { progress(p: number): Promise<void> } }): Promise<FlatTable>;
}

const MAX_LISTINGS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function crmError(status: number, vendor: string): AppError {
  if (status === 401 || status === 403) return new AppError(`${vendor} odrzucił dane dostępowe (HTTP ${status}). Sprawdź identyfikator i token.`, "crm_auth", 422);
  if (status === 429) return new AppError(`${vendor} ogranicza liczbę zapytań. Spróbuj ponownie za kilka minut.`, "crm_rate_limited", 429);
  return new AppError(`${vendor} zwrócił błąd HTTP ${status}.`, "crm_http", 502);
}

function json(text: string, vendor: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError(`${vendor} zwrócił odpowiedź, która nie jest JSON-em.`, "crm_bad_response", 502);
  }
}

function headersOf(records: Record<string, string>[]): string[] {
  const out: string[] = [];
  for (const r of records) for (const k of Object.keys(r)) if (!out.includes(k) && out.length < 300) out.push(k);
  return out;
}

const base = (u: string) => (u.endsWith("/") ? u : `${u}/`);

/**
 * ASARI CRM – Site API (https://api.asari.pro/site/), header `SiteAuth: userID:Token`.
 * Limit 25 requests/min: requests are spaced (ASARI_MIN_INTERVAL_MS, default 2600 ms).
 * POST exportedListingIdList → ids with lastUpdated; POST listing (id) → details.
 */
const asari: CrmAdapter = {
  kind: "asari",
  label: "ASARI CRM",
  docsUrl: "https://asaricrm.atlassian.net/wiki/spaces/DOKU/pages/3770812/Site",
  defaultBaseUrl: "https://api.asari.pro/site/",
  accountLabel: "User ID (Site API)",
  tokenLabel: "Token (Site API)",
  preset: {
    id: "external_ref", listingId: "external_ref", name: "title", section: "property_type", _transaction: "transaction_type", "location.locality": "city", "location.quarter": "district", "street.name": "street",
    totalArea: "area_m2", noOfRooms: "rooms", floorNo: "floor", noOfFloors: "total_floors", yearBuilt: "year_built", "price.amount": "price", "price.currency": "currency", description: "description", status: "status", _photos: "photos",
  },
  async fetchAll({ baseUrl, creds, signal }) {
    const gap = Number(process.env.ASARI_MIN_INTERVAL_MS ?? 2600);
    const headers = { SiteAuth: `${creds.account}:${creds.token}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
    const call = async (path: string, body: Record<string, string>) => {
      const res = await safeFetch(`${base(baseUrl)}${path}`, { method: "POST", headers, body: new URLSearchParams(body).toString(), timeoutMs: 20_000, maxBytes: 5 * 1048576 });
      if (res.status !== 200) throw crmError(res.status, "ASARI");
      const data = json(res.text(), "ASARI") as { success?: boolean; data?: unknown };
      if (data.success === false) throw new AppError("ASARI odrzucił zapytanie (success=false). Sprawdź uprawnienia Site API.", "crm_rejected", 422);
      return data.data;
    };
    const list = await call("exportedListingIdList", {});
    const ids = (Array.isArray(list) ? list : []).map((x) => (x && typeof x === "object" ? String((x as { id?: unknown }).id ?? "") : String(x))).filter(Boolean).slice(0, MAX_LISTINGS);
    const records: Record<string, string>[] = [];
    for (const [i, id] of ids.entries()) {
      await sleep(gap);
      const item = await call("listing", { id });
      const flat = flattenRecord(item);
      if (flat.section) flat._transaction = flat.section;
      const tpl = process.env.ASARI_PHOTO_URL_TEMPLATE;
      const imageIds = (flat["images.id"] ?? "").split("\n").filter(Boolean);
      if (tpl && imageIds.length) flat._photos = imageIds.map((x) => tpl.replace("{id}", encodeURIComponent(x))).join("\n");
      records.push(flat);
      await signal?.progress(10 + (80 * (i + 1)) / ids.length);
    }
    return { path: "listing", records, headers: headersOf(records) };
  },
};

/**
 * EstiCRM – EstiAPI v1.5 (https://app.esticrm.pl/apiClient), parameters company + token
 * (Ustawienia → Dane firmowe, konto administratora). GET offer/list with skip/take.
 */
const esticrm: CrmAdapter = {
  kind: "esticrm",
  label: "EstiCRM",
  docsUrl: "https://przetestuj.esticrm.pl/help/esticrmxml",
  defaultBaseUrl: "https://app.esticrm.pl/apiClient/",
  accountLabel: "ID firmy (company)",
  tokenLabel: "Token API",
  preset: {
    id: "external_ref", number: "external_ref", portalTitle: "title", title: "title", typeName: "property_type", transactionName: "transaction_type", marketName: "market", locationCityName: "city", locationPrecinctName: "district", locationStreetName: "street",
    areaTotal: "area_m2", apartmentRoomNumber: "rooms", apartmentFloor: "floor", buildingFloornumber: "total_floors", buildingYear: "year_built", price: "price", priceCurrency: "currency", description: "description", statusName: "status", "pictures.file": "photos",
  },
  async fetchAll({ baseUrl, creds, signal }) {
    const take = 100;
    const records: Record<string, string>[] = [];
    for (let page = 0; page < MAX_LISTINGS / take; page++) {
      const qs = new URLSearchParams({ company: creds.account, token: creds.token, skip: String(page * take), take: String(take) });
      const res = await safeFetch(`${base(baseUrl)}offer/list?${qs}`, { timeoutMs: 20_000, maxBytes: 10 * 1048576 });
      if (res.status !== 200) throw crmError(res.status, "EstiCRM");
      const data = json(res.text(), "EstiCRM") as { data?: unknown } | unknown[];
      const items = Array.isArray(data) ? data : Array.isArray((data as { data?: unknown }).data) ? ((data as { data: unknown[] }).data) : [];
      records.push(...items.map(flattenRecord));
      await signal?.progress(10 + Math.min(80, page * 10));
      if (items.length < take) break;
    }
    return { path: "offer/list", records, headers: headersOf(records) };
  },
};

export const CRM_ADAPTERS = { asari, esticrm } as const;

/** Authorized feed (URL to an XML/JSON export) with an optional Basic/Bearer credential. */
export async function fetchFeed(url: string, format: "xml" | "json", auth?: { type: "basic" | "bearer"; value: string } | null): Promise<string> {
  const headers: Record<string, string> = { accept: format === "xml" ? "application/xml, text/xml, */*" : "application/json, */*" };
  if (auth?.type === "basic") headers.authorization = `Basic ${Buffer.from(auth.value).toString("base64")}`;
  if (auth?.type === "bearer") headers.authorization = `Bearer ${auth.value}`;
  const res = await safeFetch(url, { headers, timeoutMs: 30_000, maxBytes: 25 * 1048576 });
  if (res.status === 401 || res.status === 403) throw new AppError(`Serwer feedu odmówił dostępu (HTTP ${res.status}). Sprawdź dane dostępowe.`, "feed_auth", 422);
  if (res.status !== 200) throw new AppError(`Serwer feedu zwrócił HTTP ${res.status}.`, "feed_http", 502);
  return res.text();
}
