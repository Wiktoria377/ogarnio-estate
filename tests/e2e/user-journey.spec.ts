import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { PASSWORD, acceptDialogs, createWorkspace, login, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * Launch check (ETAP 0): the journey of a new office on a running server,
 * production build included. Register → office → logo and colours → property
 * with 5 photos → AI post → carousel, headline edit, PNG → logout/login → saved.
 *
 * E2E_EXPECT_AI=1 requires a real AI result (server with ANTHROPIC_API_KEY);
 * without it the test checks that the server says AI is not configured
 * instead of showing invented text. E2E_ACCOUNT_EMAIL/E2E_ACCOUNT_PASSWORD use
 * an existing confirmed account (public server, real mailbox) instead of signup
 * through the local SMTP sink.
 */
const EXPECT_AI = process.env.E2E_EXPECT_AI === "1";
const TITLE = `Mieszkanie z tarasem na Żoliborzu ${Date.now() % 10000}`;
const HEADLINE = "Taras, zieleń i cisza w centrum";

test("launch journey: account, brand, property with 5 photos, post, carousel PNG, persistence", async ({ page }) => {
  test.setTimeout(600_000);
  acceptDialogs(page);
  const given = process.env.E2E_ACCOUNT_EMAIL;
  const email = given ?? uniqueEmail("journey");
  const password = given ? process.env.E2E_ACCOUNT_PASSWORD! : PASSWORD;

  // Account and office.
  if (given) {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Hasło", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL(/\/(dashboard|onboarding|welcome)/);
    if (/onboarding/.test(page.url())) await createWorkspace(page, "Biuro Testowe Startu");
  } else {
    await signUpAndConfirm(page, email, "Wiktoria Start");
    await createWorkspace(page, "Biuro Testowe Startu");
  }

  // Logo and colours.
  await page.goto("/brand");
  const logo = await sharp({ create: { width: 400, height: 160, channels: 4, background: { r: 14, g: 124, b: 102, alpha: 1 } } }).png().toBuffer();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logo });
  await expect(page.getByAltText("Logo biura")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Kolor Główny (hex)").fill("#0E7C66");
  await page.getByRole("button", { name: /^Zapisz/ }).first().click();
  await expect(page.getByText(/Zapisano|zapisan/).first()).toBeVisible();

  // Property with five photos.
  await page.goto("/properties/new");
  await page.getByLabel("Nazwa oferty").fill(TITLE);
  await page.getByLabel("Miasto").fill("Warszawa");
  await page.getByLabel("Powierzchnia (m²)").fill("62");
  await page.getByLabel("Liczba pokoi").fill("3");
  await page.locator("#price").fill("1150000");
  await page.getByRole("button", { name: "Zapisz i dodaj zdjęcia" }).click();
  await page.waitForURL(/\/properties\/[0-9a-f-]+\?created=1/);
  const propertyId = /properties\/([0-9a-f-]+)/.exec(page.url())![1]!;
  const sources = ["tests/fixtures/house-1.jpg", "tests/fixtures/house-2.jpg", "tests/fixtures/house-3.jpg", "tests/fixtures/house-1.jpg", "tests/fixtures/house-2.jpg"];
  const photos = await Promise.all(sources.map(async (f, i) => ({ name: `zdjecie-${i + 1}.jpg`, mimeType: "image/jpeg", buffer: await sharp(readFileSync(f)).modulate({ brightness: 1 + i * 0.04 }).jpeg().toBuffer() })));
  await page.locator('input[type="file"]').setInputFiles(photos);
  await expect(page.getByAltText("Zdjęcie 5")).toBeVisible({ timeout: 60_000 });

  // AI post.
  await page.goto(`/studio/new?type=property_sales_post&property=${propertyId}`);
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: /Generuj/ }).click();
  let postUrl: string | null = null;
  if (EXPECT_AI) {
    await page.waitForURL(/\/studio\/[0-9a-f-]+\?new=1/, { timeout: 180_000 });
    postUrl = page.url().replace("?new=1", "");
    await expect(page.getByRole("tab", { name: /Wariant 1/ })).toBeVisible();
    await expect(page.getByText(/tryb testowy|test provider/i)).toHaveCount(0);
  } else {
    await expect(page.getByText(/Generowanie AI nie jest skonfigurowane/)).toBeVisible({ timeout: 30_000 });
  }

  // Carousel: preview, headline edit, PNG.
  await page.goto(`/graphics/new?property=${propertyId}&format=carousel`);
  await page.getByRole("button", { name: "Utwórz i edytuj" }).click();
  await page.waitForURL(/\/graphics\/[0-9a-f-]+$/, { timeout: 120_000 });
  const graphicUrl = page.url();
  await expect(page.getByTestId("graphic-preview")).toBeVisible({ timeout: 60_000 });
  await page.locator("#slot-title").fill(HEADLINE);
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByText("Zapisano nową wersję grafiki")).toBeVisible();
  await page.getByRole("button", { name: "Pobierz" }).click();
  const [png] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Slajd 1 \(PNG\)/ }).click()]);
  const file = readFileSync((await png.path())!);
  expect(file.subarray(1, 4).toString()).toBe("PNG");
  const meta = await sharp(file).metadata();
  expect(meta.width).toBeGreaterThanOrEqual(1080);
  await page.screenshot({ path: "test-results/journey-graphic.png", fullPage: true });

  // Logout, login, everything is still there.
  await page.request.post("/auth/signout");
  await page.goto("/dashboard");
  await page.waitForURL(/\/login/);
  if (given) {
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Hasło", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL(/\/(dashboard|onboarding|welcome)/);
  } else await login(page, email);
  await page.goto(graphicUrl);
  await expect(page.locator("#slot-title")).toHaveValue(HEADLINE);
  if (postUrl) {
    await page.goto(postUrl);
    await expect(page.getByRole("tab", { name: /Wariant 1/ })).toBeVisible();
  }
  await page.goto("/library");
  await expect(page.getByRole("link", { name: new RegExp(TITLE) }).first()).toBeVisible();
  await page.goto(`/properties/${propertyId}`);
  await expect(page.getByAltText("Zdjęcie 5")).toBeVisible();
  await page.goto("/brand");
  await expect(page.getByAltText("Logo biura")).toBeVisible();
  await page.screenshot({ path: "test-results/journey-brand.png", fullPage: true });
});
