#!/usr/bin/env node
/**
 * CONTRACT MOCK of CRM exports, for automated tests only (not real data):
 *  - ASARI Site API: POST /site/exportedListingIdList, POST /site/listing (header SiteAuth userID:Token)
 *  - EstiCRM EstiAPI: GET /apiClient/offer/list?company&token&skip&take
 *  - authorized XML/JSON feeds: GET /feeds/oferty.xml (Basic biuro:tajne), GET /feeds/oferty.json
 *  - photos: GET /img/:name.jpg (test fixtures)
 *  - SSRF probes: GET /redirect?to=<url> (302), GET /big (endless body)
 * Field names follow the vendors' public docs where known; they were not
 * verified against live accounts.
 *
 *   node tests/mocks/crm-api.mjs   (port 4020, or CRM_MOCK_PORT)
 *   POST /__set {"price": {"A-101": 619000}, "remove": ["A-103"]}   change listings between syncs
 *   POST /__reset
 */
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const PORT = Number(process.env.CRM_MOCK_PORT || 4020);
const BASE = `http://127.0.0.1:${PORT}`;
const FIX = path.resolve(import.meta.dirname, "../fixtures");

let listings;
function reset() {
  listings = [
    { id: "A-101", name: "Mieszkanie z balkonem, Jeżyce", section: "ApartmentSale", status: "Active", location: { locality: "Poznań", quarter: "Jeżyce" }, street: { name: "Kraszewskiego" }, totalArea: "54.5", noOfRooms: 3, floorNo: 2, noOfFloors: 4, yearBuilt: 2012, price: { amount: 649000, currency: "PLN" }, description: "Jasne mieszkanie z balkonem.", images: [{ id: "house-1" }, { id: "house-2" }], lastUpdated: "2026-10-01 10:00:00" },
    { id: "A-102", name: "Dom z ogrodem, Suchy Las", section: "HouseSale", status: "Active", location: { locality: "Suchy Las" }, street: { name: "Leśna" }, totalArea: "142", noOfRooms: 5, yearBuilt: 2019, price: { amount: 1290000, currency: "PLN" }, description: "Dom w zabudowie wolnostojącej.", images: [{ id: "house-3" }], lastUpdated: "2026-10-02 10:00:00" },
    { id: "A-103", name: "Kawalerka do wynajęcia", section: "ApartmentRental", status: "Active", location: { locality: "Poznań", quarter: "Wilda" }, totalArea: "28", noOfRooms: 1, floorNo: 0, price: { amount: 2300, currency: "PLN" }, description: "Umeblowana kawalerka.", images: [], lastUpdated: "2026-10-03 10:00:00" },
  ];
}
reset();

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function feedXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<eksport wersja="1"><oferty>${listings.map((l) => `
  <oferta><numer>${esc(l.id)}</numer><tytul>${esc(l.name)}</tytul><rodzaj>${l.section.startsWith("House") ? "dom" : "mieszkanie"}</rodzaj><transakcja>${l.section.endsWith("Rental") ? "wynajem" : "sprzedaż"}</transakcja>
    <lokalizacja><miasto>${esc(l.location.locality)}</miasto><dzielnica>${esc(l.location.quarter ?? "")}</dzielnica></lokalizacja>
    <powierzchnia>${String(l.totalArea).replace(".", ",")}</powierzchnia><pokoje>${l.noOfRooms}</pokoje><cena waluta="PLN">${l.price.amount}</cena>
    <opis><![CDATA[<p>${l.description}</p>]]></opis>
    <zdjecia>${l.images.map((i) => `<zdjecie>${BASE}/img/${i.id}.jpg</zdjecie>`).join("")}</zdjecia></oferta>`).join("")}
</oferty></eksport>`;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const p = url.pathname;
  if (p === "/__reset" && req.method === "POST") { reset(); return json(res, 200, { ok: true }); }
  if (p === "/__set" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    for (const [id, amount] of Object.entries(body.price ?? {})) { const l = listings.find((x) => x.id === id); if (l) { l.price.amount = amount; l.lastUpdated = new Date().toISOString(); } }
    for (const [id, st] of Object.entries(body.status ?? {})) { const l = listings.find((x) => x.id === id); if (l) l.status = st; }
    if (body.remove) listings = listings.filter((l) => !body.remove.includes(l.id));
    return json(res, 200, { ok: true });
  }
  // ASARI Site API
  if (p.startsWith("/site/")) {
    if (req.method !== "POST") return json(res, 405, { success: false });
    if (req.headers.siteauth !== "user-77:asari-token-123") return json(res, 401, { success: false, message: "Unauthorized" });
    const form = new URLSearchParams(await readBody(req));
    if (p === "/site/exportedListingIdList") return json(res, 200, { success: true, data: listings.map((l) => ({ id: l.id, lastUpdated: l.lastUpdated })), totalCount: listings.length });
    if (p === "/site/listing") {
      const l = listings.find((x) => x.id === form.get("id"));
      return l ? json(res, 200, { success: true, data: l }) : json(res, 404, { success: false });
    }
    return json(res, 404, { success: false });
  }
  // EstiCRM
  if (p === "/apiClient/offer/list") {
    if (url.searchParams.get("company") !== "1234" || url.searchParams.get("token") !== "esti-token-abc") return json(res, 403, { error: "forbidden" });
    const skip = Number(url.searchParams.get("skip") || 0);
    const take = Number(url.searchParams.get("take") || 100);
    const data = listings.slice(skip, skip + take).map((l) => ({ id: l.id, portalTitle: l.name, typeName: l.section.startsWith("House") ? "Dom" : "Mieszkanie", transactionName: l.section.endsWith("Rental") ? "Wynajem" : "Sprzedaż", locationCityName: l.location.locality, locationPrecinctName: l.location.quarter ?? null, areaTotal: Number(l.totalArea), apartmentRoomNumber: l.noOfRooms, price: l.price.amount, priceCurrency: "PLN", description: l.description, statusName: "Aktywna", pictures: l.images.map((i) => ({ file: `${BASE}/img/${i.id}.jpg` })) }));
    return json(res, 200, { data, total: listings.length });
  }
  if (p === "/feeds/oferty.xml") {
    if (req.headers.authorization !== `Basic ${Buffer.from("biuro:tajne").toString("base64")}`) { res.writeHead(401, { "www-authenticate": "Basic" }); return res.end(); }
    res.writeHead(200, { "content-type": "application/xml; charset=utf-8" });
    return res.end(feedXml());
  }
  if (p === "/feeds/oferty.json") return json(res, 200, { oferty: listings.map((l) => ({ numer: l.id, tytul: l.name, miasto: l.location.locality, powierzchnia: l.totalArea, cena: l.price.amount, zdjecia: l.images.map((i) => `${BASE}/img/${i.id}.jpg`) })) });
  if (p.startsWith("/img/")) {
    const name = path.basename(p).replace(/[^a-z0-9.-]/gi, "");
    try {
      const buf = readFileSync(path.join(FIX, name));
      res.writeHead(200, { "content-type": "image/jpeg", "content-length": buf.length });
      return res.end(buf);
    } catch {
      res.writeHead(404);
      return res.end();
    }
  }
  if (p === "/redirect") { res.writeHead(302, { location: url.searchParams.get("to") ?? "/" }); return res.end(); }
  if (p === "/big") {
    res.writeHead(200, { "content-type": "application/xml" });
    const chunk = Buffer.alloc(1024 * 1024, 32);
    let n = 0;
    const tick = () => { if (n++ > 60 || res.destroyed) return res.end(); res.write(chunk, tick); };
    return tick();
  }
  json(res, 404, { error: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`[crm-mock] ${BASE}`));
