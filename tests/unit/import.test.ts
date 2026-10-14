import { describe, expect, it } from "vitest";
import { readCsv } from "@/core/import/csv";
import { autoMap, diffProperty, fingerprint, normalizeRecord, parseNumber, parsePhotoUrls } from "@/core/import/model";
import { isBlockedAddress, validateExternalUrl } from "@/lib/net/safe-fetch";
import { flattenRecords } from "@/lib/import/feeds";

const enc = (s: string) => new TextEncoder().encode(s);

describe("CSV reader", () => {
  it("reads semicolon CSV with BOM, quotes and line breaks", () => {
    const t = readCsv(enc('﻿Numer oferty;Tytuł;Opis\n"A-1";"Mieszkanie; 3 pokoje";"Linia 1\nLinia ""2"""\n'));
    expect(t.delimiter).toBe(";");
    expect(t.headers).toEqual(["Numer oferty", "Tytuł", "Opis"]);
    expect(t.rows[0]).toEqual(["A-1", "Mieszkanie; 3 pokoje", 'Linia 1\nLinia "2"']);
  });
  it("decodes Windows-1250", () => {
    const t = readCsv(new Uint8Array([...enc("Miasto;X\n"), 0xa3, 0xf3, 0x64, 0x9f, ...enc(";1\n")])); // "Łódź" in CP1250
    expect(t.encoding).toBe("windows-1250");
    expect(t.rows[0]![0]).toBe("Łódź");
  });
});

describe("number parsing", () => {
  it.each([
    ["1 250 000,00 zł", true, 1250000],
    ["450 000", true, 450000],
    ["1.250.000", true, 1250000],
    ["450 tys.", true, 450000],
    ["1,2 mln", true, 1200000],
    ["899,000", true, 899000],
    ["54,5 m²", false, 54.5],
    ["54.50", false, 54.5],
    ["120,000", false, 120],
    ["abc", false, null],
    ["", false, null],
  ])("%s → %s", (raw, grouped, expected) => {
    expect(parseNumber(raw, grouped)).toBe(expected);
  });
});

describe("mapping and normalization", () => {
  const headers = ["Nr oferty", "Rodzaj nieruchomości", "Transakcja", "Miejscowość", "Dzielnica", "Metraż", "Pokoje", "Piętro", "Cena", "Status", "Zdjęcia", "Notatka"];
  it("auto-maps Polish CRM headers and ignores unknown columns", () => {
    const m = autoMap(headers);
    expect(m).toMatchObject({ "Nr oferty": "external_ref", "Rodzaj nieruchomości": "property_type", Transakcja: "transaction_type", Miejscowość: "city", Metraż: "area_m2", Pokoje: "rooms", Piętro: "floor", Cena: "price", Zdjęcia: "photos", Notatka: "" });
  });
  it("normalizes Polish values and builds a title", () => {
    const m = autoMap(headers);
    const r = normalizeRecord({ "Nr oferty": "MS-101", "Rodzaj nieruchomości": "Mieszkanie", Transakcja: "Sprzedaż", Miejscowość: "Poznań", Dzielnica: "Jeżyce", Metraż: "54,5", Pokoje: "3", Piętro: "2/4", Cena: "649 000 zł", Status: "aktywna", Zdjęcia: "https://a.example/1.jpg; https://a.example/2.jpg", Notatka: "x" }, m);
    expect(r.data).toMatchObject({ property_type: "apartment", transaction_type: "sale", city: "Poznań", area_m2: 54.5, rooms: 3, floor: 2, total_floors: 4, price: 649000, status: "active", title: "Mieszkanie, 3 pok., 54,5 m², Poznań Jeżyce" });
    expect(r.externalRef).toBe("MS-101");
    expect(r.photoUrls).toHaveLength(2);
    expect(r.issues.some((i) => i.field === "title" && i.level === "warning")).toBe(true);
  });
  it("reports errors with the original value and rejects the row", () => {
    const m = autoMap(headers);
    const r = normalizeRecord({ "Nr oferty": "X", "Rodzaj nieruchomości": "Dom", Miejscowość: "Gniezno", Metraż: "duży", Cena: "-5", Piętro: "9/3" }, m);
    expect(r.data).toBeNull();
    expect(r.issues.find((i) => i.field === "area_m2")?.message).toContain("„duży”");
    expect(r.issues.some((i) => i.level === "error" && (i.field === "price" || i.field === "floor"))).toBe(true);
  });
  it("keeps only http(s) photo URLs", () => {
    expect(parsePhotoUrls("javascript:alert(1) file:///etc/passwd https://ok.example/a.jpg ftp://x/y")).toEqual(["https://ok.example/a.jpg"]);
  });
});

describe("duplicates and diffs", () => {
  it("fingerprints ignore case and diacritics", () => {
    const a = fingerprint({ property_type: "apartment", transaction_type: "sale", city: "Łódź", street: "Piotrkowska", area_m2: 54.5, rooms: 3 });
    const b = fingerprint({ property_type: "apartment", transaction_type: "sale", city: "lodz", street: "PIOTRKOWSKA", area_m2: 54.5, rooms: 3 });
    expect(a).toBe(b);
    expect(fingerprint({ property_type: "apartment", transaction_type: "sale", city: null, street: null, area_m2: 54.5, rooms: 3 })).toBeNull();
  });
  it("detects price, status, description and photo changes; omitted columns are not removals", () => {
    const m = autoMap(["Nr", "Cena", "Status", "Opis", "Zdjęcia", "Miasto"]);
    const r = normalizeRecord({ Nr: "1", Cena: "600 000", Status: "rezerwacja", Opis: "Nowy opis", Zdjęcia: "https://a.example/1.jpg", Miasto: "Poznań" }, m);
    const current = { title: "Mieszkanie", property_type: "other", transaction_type: "sale", market: null, city: "Poznań", district: "Jeżyce", street: null, area_m2: 50, rooms: 2, floor: null, total_floors: null, year_built: null, price: 649000, currency: "PLN", description: "Stary opis", features: [], amenities: [], status: "active" } as const;
    const ch = diffProperty({ ...current, features: [], amenities: [] }, r.data!, { mapped: new Set(Object.values(m).filter(Boolean) as never), currentPhotoUrls: [], incomingPhotoUrls: r.photoUrls });
    expect(ch.map((c) => c.field).sort()).toEqual(["description", "photos", "price", "status"]);
  });
});

describe("SSRF guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::"])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });
  it.each(["8.8.8.8", "151.101.1.69", "2a00:1450:4001:82a::200e"])("allows %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
  it.each(["http://localhost/x", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data", "http://intranet/", "ftp://example.com/a", "file:///etc/passwd", "https://user:pass@example.com/", "https://example.com:22/", "http://10.0.0.1:8080/"])("rejects %s", (u) => {
    expect(() => validateExternalUrl(u)).toThrow();
  });
  it("accepts public URLs", () => {
    expect(validateExternalUrl("https://crm.example.com/feed.xml").hostname).toBe("crm.example.com");
  });
});

describe("feed flattening", () => {
  it("finds the record list in XML and flattens nested fields and photo lists", () => {
    const xml = `<?xml version="1.0"?><eksport><oferty><oferta><numer>A1</numer><cena waluta="PLN">500000</cena><lokalizacja><miasto>Poznań</miasto></lokalizacja><zdjecia><zdjecie>https://x.example/1.jpg</zdjecie><zdjecie>https://x.example/2.jpg</zdjecie></zdjecia></oferta><oferta><numer>A2</numer><cena>1</cena></oferta></oferty></eksport>`;
    const t = flattenRecords(xml, "xml");
    expect(t.path).toBe("eksport.oferty.oferta");
    expect(t.records).toHaveLength(2);
    expect(t.records[0]).toMatchObject({ numer: "A1", cena: "500000", "lokalizacja.miasto": "Poznań", "zdjecia.zdjecie": "https://x.example/1.jpg\nhttps://x.example/2.jpg" });
  });
  it("does not resolve XML entities (XXE / billion laughs)", () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "AAAA"><!ENTITY b "&a;&a;&a;&a;">]><r><o><t>&b;</t></o><o><t>x</t></o></r>`;
    const t = flattenRecords(xml, "xml");
    expect(JSON.stringify(t.records)).not.toContain("AAAA");
  });
  it("reads JSON arrays at a given path", () => {
    const t = flattenRecords(JSON.stringify({ data: { items: [{ id: 1, price: { amount: 5 } }, { id: 2 }] } }), "json", "data.items");
    expect(t.records[0]).toEqual({ id: "1", "price.amount": "5" });
  });
});
