import { expect, test } from "@playwright/test";
import { acceptDialogs, createProperty, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * ETAP 3 faza 6: public offer page, tracked UTM link, lead form with consent,
 * lead handling and the analytics dashboard with AI insights (offline test
 * provider) and the PDF report. Post statistics from real Meta/LinkedIn need
 * approved apps (manual test, blocked); here they come from the contract mock.
 */
const VISITOR_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

test("public offer page, UTM link, lead with consent, analytics and PDF", async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  acceptDialogs(page);
  await signUpAndConfirm(page, uniqueEmail("analytics"), "Ala Analityczna");
  await createWorkspace(page, "Biuro Analityki Gdańsk");
  const title = "Apartament z widokiem na Motławę";
  const id = await createProperty(page, title, ["tests/fixtures/house-1.jpg"]);

  await page.goto(`/properties/${id}`);
  await page.getByRole("button", { name: "Włącz stronę oferty" }).click();
  const publicUrl = page.getByTestId("public-url");
  await expect(publicUrl).toBeVisible();
  const slug = /\/o\/([a-z0-9-]+)$/.exec((await publicUrl.textContent())!)![1]!;

  await page.goto("/analytics");
  await expect(page.getByTestId("kpi")).toHaveCount(6);
  await expect(page.getByText("Brak opublikowanych postów w tym okresie.")).toBeVisible();
  await page.getByLabel("Nazwa linku").fill("Post na Facebooku");
  await page.getByLabel("Oferta").selectOption({ label: title });
  await page.getByLabel("utm_campaign").fill("Jesień Gdańsk");
  await page.getByRole("button", { name: "Utwórz link" }).click();
  const shortUrl = (await page.getByTestId("new-link").locator("code").textContent())!;
  expect(shortUrl).toMatch(/\/l\/[A-Za-z0-9]{10}$/);
  await expect(page.getByTestId("tracked-link")).toContainText("facebook / social / jesien_gdansk");

  // An anonymous visitor (real browser UA) clicks the link and sends a lead.
  const visitor = await browser.newContext({ baseURL: info.project.use.baseURL, userAgent: VISITOR_UA });
  const v = await visitor.newPage();
  await v.goto(new URL(shortUrl).pathname);
  await expect(v).toHaveURL(new RegExp(`/o/${slug}\\?.*utm_campaign=jesien_gdansk`));
  await expect(v.getByRole("heading", { name: title })).toBeVisible();
  await v.getByLabel("Imię").fill("Marek Kupujący");
  await v.getByLabel("Telefon").fill("600 700 800");
  await v.getByLabel("Wiadomość").fill("Czy mieszkanie jest dostępne od grudnia?");
  await v.getByRole("button", { name: "Wyślij zapytanie" }).click();
  await expect(v.getByText("Zaznacz zgodę, abyśmy mogli odpowiedzieć.")).toBeVisible();
  await v.getByRole("checkbox").check();
  await v.screenshot({ path: "docs/screenshots/offer-page.png", fullPage: true });
  await v.getByRole("button", { name: "Wyślij zapytanie" }).click();
  await expect(v.getByTestId("lead-sent")).toBeVisible();
  await visitor.close();

  // The office sees the lead with its consent proof and source.
  await page.goto("/leads");
  await expect(page.getByTestId("lead-row")).toHaveCount(1);
  await expect(page.getByTestId("lead-row")).toContainText("Marek Kupujący");
  await page.getByTestId("lead-row").getByRole("link").click();
  await expect(page.getByTestId("lead-consent")).toContainText("Administratorem danych jest Biuro Analityki Gdańsk");
  await expect(page.getByText("jesien_gdansk")).toBeVisible();
  await page.getByLabel("Notatka").fill("Oddzwonić w piątek");
  await page.getByRole("button", { name: "Dodaj notatkę" }).click();
  await expect(page.getByText("Oddzwonić w piątek")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/lead.png", fullPage: true });

  await page.goto("/analytics");
  const kpis = page.getByTestId("kpi-value");
  await expect(kpis.nth(3)).toHaveText("1"); // clicks (bots excluded)
  await expect(kpis.nth(4)).toHaveText("1"); // offer page views
  await expect(kpis.nth(5)).toHaveText("1"); // leads
  await expect(kpis.nth(1)).toHaveText("Brak danych"); // no post statistics: unknown, not 0
  await page.getByRole("button", { name: "Przygotuj wnioski" }).click();
  await expect(page.getByTestId("observations").locator("li").first()).toBeVisible();
  await expect(page.getByTestId("hypotheses")).toContainText("Jak sprawdzić");
  await expect(page.getByTestId("recommendations")).toContainText("Miernik");
  await expect(page.getByText("Treść testowa (dostawca offline, bez AI)").first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/analytics.png", fullPage: true });
  const pdf = page.waitForEvent("download");
  await page.getByRole("link", { name: "Raport PDF" }).click();
  expect((await pdf).suggestedFilename()).toMatch(/^raport-30-dni-\d{4}-\d{2}-\d{2}\.pdf$/);

  // Disabling the page stops the form; the short link lands on a neutral page.
  await page.goto(`/properties/${id}`);
  await page.getByRole("button", { name: "Wyłącz stronę oferty" }).click();
  await expect(page.getByRole("button", { name: "Włącz stronę oferty" })).toBeVisible();
  const res = await page.request.get(`/o/${slug}`);
  expect(res.status()).toBe(404);
});
