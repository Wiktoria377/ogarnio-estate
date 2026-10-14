import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createProperty, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

test("office B cannot open office A's pages, files or exports", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await (await browser.newContext()).newPage();
  await signUpAndConfirm(a, uniqueEmail("iso-a"), "Anna A");
  await createWorkspace(a, "Biuro A");
  const propertyId = await createProperty(a, "Oferta A", ["tests/fixtures/house-1.jpg"]);
  const photoSrc = await a.getByAltText("Zdjęcie 1").getAttribute("src");
  await a.goto(`/graphics/new?property=${propertyId}&format=square`);
  await a.getByRole("button", { name: "Utwórz i edytuj" }).click();
  await a.waitForURL(/\/graphics\/[0-9a-f-]+$/);
  const graphicId = a.url().split("/").pop()!;

  const b = await (await browser.newContext()).newPage();
  await signUpAndConfirm(b, uniqueEmail("iso-b"), "Bartek B");
  await createWorkspace(b, "Biuro B");

  for (const path of [`/properties/${propertyId}`, `/properties/${propertyId}/edit`, `/graphics/${graphicId}`, `/studio/${graphicId}`]) {
    const res = await b.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  for (const path of [photoSrc!, `/api/graphics/${graphicId}/export?slide=0`, `/api/graphics/${graphicId}/export?all=1`]) {
    const res = await b.request.get(path);
    expect([403, 404], path).toContain(res.status());
  }
  // Rendering a design that references A's photo ids must not leak the photo.
  const design = await (await a.request.get(`/api/account/export`)).json();
  const body = design.workspaces[0].contentItems[0].versions[0].body;
  const res = await b.request.post("/api/graphics/render", { data: { design: body, slide: 0, width: 400 }, headers: { origin: "http://localhost:3000" } });
  expect(res.status()).toBe(200);
  const warnings = JSON.parse(decodeURIComponent(res.headers()["x-render-warnings"] ?? "[]"));
  expect(warnings.join(" ")).toMatch(/Nie znaleziono/);
  await b.goto("/library");
  await expect(b.getByText("Biblioteka jest pusta")).toBeVisible();
  await b.goto("/properties");
  await expect(b.getByText("Oferta A")).toHaveCount(0);
});

test("ETAP 2: office B cannot reach office A's campaigns, videos, brochures, music, plans or renders", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await (await browser.newContext()).newPage();
  await signUpAndConfirm(a, uniqueEmail("iso2-a"), "Anna A");
  await createWorkspace(a, "Biuro A2");
  const propertyId = await createProperty(a, "Oferta A2", ["tests/fixtures/house-1.jpg", "tests/fixtures/house-2.jpg"]);

  // Campaign (social posts only, quick), brochure, video draft, audio and a planner entry in office A.
  await a.goto(`/campaigns/new?property=${propertyId}`);
  await a.getByRole("button", { name: /Pozyskanie kupujących/ }).click();
  await a.getByRole("button", { name: "Dalej" }).click();
  await a.getByRole("button", { name: "Dalej" }).click();
  await a.getByRole("button", { name: "Dalej" }).click();
  await a.getByRole("button", { name: "Uruchom kampanię" }).click();
  await a.waitForURL(/\/campaigns\/[0-9a-f-]+\?new=1/);
  const campaignId = /campaigns\/([0-9a-f-]+)/.exec(a.url())![1]!;
  await a.goto(`/brochures/new?property=${propertyId}`);
  await a.getByRole("button", { name: "Utwórz broszurę" }).click();
  await a.waitForURL(/\/brochures\/[0-9a-f-]+$/);
  const brochureId = a.url().split("/").pop()!;
  await a.goto(`/video/new?property=${propertyId}`);
  await a.getByRole("button", { name: "Napisz scenariusz" }).click();
  await a.waitForURL(/\/video\/[0-9a-f-]+$/, { timeout: 60_000 });
  const videoId = a.url().split("/").pop()!;
  const upload = await a.request.post("/api/media/audio", { multipart: { file: { name: "tone.wav", mimeType: "audio/wav", buffer: readFileSync("tests/fixtures/tone.wav") }, label: "Utwór A", rights: "yes" }, headers: { origin: "http://localhost:3000" } });
  expect(upload.status()).toBe(200);
  const track = (await upload.json()).track as { id: string; url: string };
  await a.goto("/planner?view=month");
  await a.getByRole("button", { name: "Nowy wpis" }).click();
  await a.getByRole("dialog").getByLabel("Tytuł").fill("Tajny wpis biura A");
  await a.getByRole("dialog").getByRole("button", { name: "Dodaj wpis" }).click();
  await expect(a.getByText("Dodano wpis do planu")).toBeVisible();

  const b = await (await browser.newContext()).newPage();
  await signUpAndConfirm(b, uniqueEmail("iso2-b"), "Bartek B");
  await createWorkspace(b, "Biuro B2");
  for (const path of [`/campaigns/${campaignId}`, `/brochures/${brochureId}`, `/video/${videoId}`]) {
    const res = await b.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  for (const path of [`/api/brochures/${brochureId}`, `/api/brochures/${brochureId}/thumb`, `/api/video/${videoId}/file`, `/api/video/${videoId}/poster`, track.url, `/api/jobs?campaign=${campaignId}`]) {
    const res = await b.request.get(path);
    if (path.startsWith("/api/jobs")) expect((await res.json()).jobs ?? [], path).toEqual([]);
    else expect([403, 404], path).toContain(res.status());
  }
  const del = await b.request.delete(`/api/media/audio/${track.id}`, { headers: { origin: "http://localhost:3000" } });
  expect(del.status()).toBe(404);
  await b.goto("/planner?view=list");
  await expect(b.getByText("Tajny wpis biura A")).toHaveCount(0);
  await b.goto("/video");
  await expect(b.getByText("Nie masz jeszcze wideo")).toBeVisible();
  await b.goto("/campaigns");
  await expect(b.getByText("Oferta A2")).toHaveCount(0);
  // A still has everything.
  expect((await a.request.get(track.url)).status()).toBe(200);
});
