import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { createProperty, createWorkspace, login, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * ETAP 2 acceptance criteria 1–13 in one realistic journey (14, office
 * isolation, is in isolation.spec.ts). Offline AI provider, real database,
 * real job queue, real Remotion render.
 */
const FFPROBE = existsSync("/usr/bin/ffprobe") ? "/usr/bin/ffprobe" : "node_modules/@remotion/compositor-linux-x64-gnu/ffprobe";
const BRAND = { hex: "#0E7C66", rgb: [14, 124, 102] };
const TITLE = "Dom z ogrodem w Wilanowie";

async function startCampaign(page: Page, propertyId: string, goal: RegExp, withReel: boolean) {
  await page.goto(`/campaigns/new?property=${propertyId}`);
  await page.getByRole("button", { name: goal }).click();
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: "Dalej" }).click();
  if (withReel) await page.getByRole("button", { name: "Meta Ads", exact: true }).click();
  for (const d of ["Reels pionowy (MP4)", "Opis do wideo", "Broszura PDF"]) {
    const b = page.getByRole("button", { name: new RegExp(d.replace(/[()]/g, "\\$&")) });
    const on = (await b.getAttribute("aria-pressed")) === "true";
    if (on !== (withReel || d === "Broszura PDF")) await b.click();
  }
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: "Uruchom kampanię" }).click();
  await page.waitForURL(/\/campaigns\/[0-9a-f-]+\?new=1/);
  return page.url().replace("?new=1", "");
}

async function brandPixelShare(png: Buffer) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let hits = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (Math.abs(data[i]! - BRAND.rgb[0]!) + Math.abs(data[i + 1]! - BRAND.rgb[1]!) + Math.abs(data[i + 2]! - BRAND.rgb[2]!) < 30) hits++;
  }
  return hits / (info.width * info.height);
}

test("ETAP 2 criteria 1–13: login → property → campaign → posts, carousel, PDF, Reel MP4 → library, planner → persistence, branding, errors", async ({ page }) => {
  test.setTimeout(900_000);
  const email = uniqueEmail("etap2");

  // 12 (setup): brand colour that must show up in the materials.
  await signUpAndConfirm(page, email, "Ola Etap Dwa");
  await createWorkspace(page, "Etap Dwa Nieruchomości", { brand: true });
  await page.getByLabel("Kolor Główny (hex)").fill(BRAND.hex);
  await page.getByRole("button", { name: /Zapisz i przejdź/ }).click();
  await page.waitForURL(/\/dashboard/);

  // 1: login.
  await page.request.post("/auth/signout");
  await login(page, email);

  // 2: property with photos.
  const propertyId = await createProperty(page, TITLE);

  // 3: campaign with every material, Reel included.
  const campaignUrl = await startCampaign(page, propertyId, /Promocja nowej oferty/, true);
  await expect(page.getByText("Kampania gotowa")).toBeVisible({ timeout: 300_000 });
  for (const label of ["Post na Instagram", "Post na Facebook", "Karuzela (6 slajdów)", "3 Stories", "Reels pionowy (MP4)", "Opis do wideo", "Nagłówki reklamowe", "Teksty Meta Ads", "Broszura PDF", "Harmonogram publikacji"]) {
    await expect(page.getByTestId(/^asset-/).filter({ hasText: label }).getByText("Gotowe"), label).toBeVisible();
  }
  const bigIdea = (await page.getByText("Myśl przewodnia").locator("xpath=following-sibling::p").textContent())!.trim();
  expect(bigIdea.length).toBeGreaterThan(5);
  const hrefOf = async (d: string) => (await page.getByTestId(`asset-${d}`).getByRole("link", { name: "Otwórz i edytuj" }).getAttribute("href"))!;
  const carouselHref = await hrefOf("carousel");
  const brochureHref = await hrefOf("brochure");
  const reelHref = await hrefOf("reel");
  expect(reelHref).toMatch(/^\/video\//);

  // 4: consistent posts: both built from the same brief and the same record.
  const exported = await (await page.request.get("/api/account/export")).json();
  const items = exported.workspaces[0].contentItems as { id: string; title: string; kind: string; platform: string | null; params: { campaignId?: string }; current_version: number; versions: { version: number; body: unknown }[] }[];
  const campaignItems = items.filter((i) => i.params?.campaignId === campaignUrl.split("/").pop());
  const bodyOf = (i: (typeof items)[number]) => JSON.stringify(i.versions.find((v) => v.version === i.current_version)?.body);
  const ig = campaignItems.find((i) => i.kind === "text" && /Instagram/.test(i.title + i.platform) && !/Opis do wideo/.test(i.title))!;
  const fb = campaignItems.find((i) => i.kind === "text" && /Facebook/.test(i.title + i.platform))!;
  for (const post of [ig, fb]) {
    const body = bodyOf(post);
    expect(body).toContain(TITLE);
    expect(body).toMatch(/899[\s\u00a0\u202f]000/);
    expect(body).toContain(`Myśl przewodnia: ${bigIdea}`);
    expect(body).not.toMatch(/gwarant|na pewno sprzeda/i);
  }

  // 5: carousel 5–7 slides, 6: edit + download (brand colour present).
  await page.goto(carouselHref);
  const slides = page.getByRole("button", { name: /^Slajd \d+:/ });
  const count = await slides.count();
  expect(count).toBeGreaterThanOrEqual(5);
  expect(count).toBeLessThanOrEqual(7);
  await expect(page.getByTestId("graphic-preview")).toBeVisible({ timeout: 30_000 });
  await page.locator("#slot-title").fill("Ogród, który widać z kuchni");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByText("Zapisano nową wersję grafiki")).toBeVisible();
  await page.getByRole("button", { name: "Pobierz" }).click();
  const [png] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Slajd 1 \(PNG\)/ }).click()]);
  const pngBytes = readFileSync((await png.path())!);
  expect(pngBytes.subarray(1, 4).toString()).toBe("PNG");
  expect(await brandPixelShare(pngBytes)).toBeGreaterThan(0.002);
  const meta = await sharp(pngBytes).metadata();
  expect([meta.width, meta.height]).toEqual([1080, 1350]);

  // 7: PDF brochure from the campaign.
  await page.goto(brochureHref);
  await expect(page.getByTestId("brochure-pages").getByRole("img").first()).toBeVisible({ timeout: 30_000 });
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Pobierz PDF" }).click()]);
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe("%PDF-");

  // 8: Reel MP4: campaign draft → approve → render → download.
  await page.goto(reelHref);
  await expect(page.getByText("Scenariusz czeka na akceptację")).toBeVisible();
  await expect(page.getByTestId("video-scene")).toHaveCount(3);
  await page.getByRole("button", { name: /Zatwierdź scenariusz/ }).click();
  await expect(page.getByText("Scenariusz zatwierdzony", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Renderuj MP4" }).click();
  await expect(page.getByTestId("rendered-video")).toBeVisible({ timeout: 420_000 });
  const [mp4] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Pobierz MP4/ }).click()]);
  const probe = JSON.parse(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", (await mp4.path())!], { encoding: "utf8" }));
  const v = probe.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  expect([v.width, v.height, v.r_frame_rate]).toEqual([1080, 1920, "30/1"]);
  expect(Math.abs(Number(probe.format.duration) - 15)).toBeLessThan(0.3);

  // 9: library holds the campaign materials.
  await page.goto("/library?kind=video");
  await expect(page.getByRole("link", { name: new RegExp(TITLE) }).first()).toBeVisible();
  await page.goto("/library?kind=document");
  await expect(page.getByRole("link", { name: new RegExp(TITLE) }).first()).toBeVisible();

  // 10: planner has the campaign plan with entries linked to materials.
  await page.goto("/planner?view=plans");
  const plan = page.getByTestId("planner-plan").filter({ hasText: "Plan kampanii" });
  await expect(plan).toBeVisible();
  expect(await plan.getByTestId("planner-entry").count()).toBeGreaterThanOrEqual(5);
  await page.goto("/planner?view=list");
  await expect(page.getByTestId("planner-row").getByRole("link", { name: /Karuzela|Grafika/ }).first()).toBeVisible();

  // 11: edits survive logout/login.
  await page.request.post("/auth/signout");
  await page.goto("/dashboard");
  await page.waitForURL(/\/login/);
  await login(page, email);
  await page.goto(carouselHref);
  await expect(page.locator("#slot-title")).toHaveValue("Ogród, który widać z kuchni");
  await page.goto(reelHref);
  await expect(page.getByTestId("rendered-video")).toBeVisible();

  // 13: clear errors. (a) AI failure in a campaign → readable message + retry; recovers after the fix.
  const failing = await createProperty(page, "Oferta [TEST:AI_FAIL]", ["tests/fixtures/house-1.jpg"]);
  await startCampaign(page, failing, /Pozyskanie kupujących/, false);
  await expect(page.getByRole("alert").filter({ hasText: "Model AI odmówił wykonania tego zadania" }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("alert").filter({ hasText: "Brief kampanii nie powstał" }).first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "docs/screenshots/etap2-error-state.png", fullPage: true });
  const failedCampaign = page.url();
  await page.goto(`/properties/${failing}/edit`);
  await page.getByLabel("Nazwa oferty").fill("Oferta po poprawce");
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await page.waitForURL(new RegExp(`/properties/${failing}\\?saved=1`));
  await page.goto(failedCampaign);
  await page.getByRole("alert").filter({ hasText: "Model AI odmówił" }).getByRole("button", { name: "Spróbuj ponownie" }).click();
  await expect(page.getByText("Myśl przewodnia")).toBeVisible({ timeout: 60_000 });
  // (b) invalid upload → precise message, nothing stored.
  await page.goto(reelHref);
  await page.getByLabel("Plik muzyki").setInputFiles("tests/fixtures/house-1.jpg");
  await page.getByText("Potwierdzam, że biuro ma prawo").click();
  await page.getByRole("button", { name: "Dodaj utwór" }).click();
  await expect(page.getByText("Obsługujemy pliki MP3, M4A, WAV i AAC.")).toBeVisible();
  // (c) render without approval is refused with a reason.
  await page.getByLabel("Hak (pierwsza sekunda)").fill("Zmieniony hak");
  await expect(page.getByText("Scenariusz czeka na akceptację")).toBeVisible();
  await expect(page.getByRole("button", { name: /Renderuj/ })).toHaveCount(0);
});
