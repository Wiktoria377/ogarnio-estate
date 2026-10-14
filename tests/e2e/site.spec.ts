import { expect, test } from "@playwright/test";

/**
 * ETAP 3 faza 8: public sales page. Hero and CTA text from the brief, pricing
 * from the plans table, legal pages marked as drafts, working contact form and
 * visit statistics recorded only after consent.
 */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

test("sales page: hero, pricing, legal drafts, contact form, consent-based stats", async ({ browser }, info) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, userAgent: UA });
  const page = await ctx.newPage();
  const beacons: boolean[] = [];
  page.on("response", async (r) => { if (r.url().endsWith("/api/public/site-event")) beacons.push(((await r.json()) as { recorded: boolean }).recorded); });

  await page.goto("/");
  await expect(page.getByTestId("hero")).toContainText("Marketing nieruchomości.Od oferty do publikacji.W jednej aplikacji");
  await expect(page.getByTestId("cta-hero")).toHaveText(/Wypróbuj Ogarnio Estate/);
  await expect(page.getByTestId("plan-card")).toHaveCount(3);
  await expect(page.getByTestId("plan-card").nth(0)).toContainText("Solo");
  await expect(page.getByTestId("plan-card").nth(1)).toContainText("Studio");
  await expect(page.getByTestId("plan-card").nth(2)).toContainText("Agency");
  for (const q of ["płatności", "publikuje", "platformach", "chronione", "CRM", "okres próbny"]) await expect(page.locator("summary", { hasText: new RegExp(q, "i") })).toHaveCount(1);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og\.png$/);

  // Nothing is sent before consent.
  await expect(page.getByTestId("stats-consent")).toBeVisible();
  expect(beacons).toEqual([]);
  await page.screenshot({ path: "docs/screenshots/site.png", fullPage: false });
  await page.getByRole("button", { name: "Zgadzam się" }).click();
  await expect.poll(() => beacons).toEqual([true]);
  await expect(page.getByTestId("stats-consent")).toHaveCount(0);

  // Contact form: consent required, then sent.
  await page.getByLabel("Imię i nazwisko").fill("Krzysztof Pośrednik");
  await page.getByLabel("E-mail", { exact: true }).fill("krzysztof@example.com");
  await page.getByRole("textbox", { name: "Wiadomość" }).fill("Chcemy zobaczyć import z ASARI na naszych ofertach.");
  await page.getByRole("button", { name: "Wyślij wiadomość" }).click();
  await expect(page.getByTestId("contact-error")).toContainText("Zaznacz zgodę");
  await page.locator("#kontakt").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Wyślij wiadomość" }).click();
  await expect(page.getByTestId("contact-sent")).toBeVisible();

  await page.getByTestId("cta-bottom").click();
  await expect(page).toHaveURL(/\/signup$/);

  for (const p of ["/regulamin", "/polityka-prywatnosci"]) {
    await page.goto(p);
    await expect(page.getByTestId("legal-draft")).toContainText("PROJEKT DO UZUPEŁNIENIA I ZATWIERDZENIA");
  }

  // Refusal is respected on a fresh visit.
  const ctx2 = await browser.newContext({ baseURL: info.project.use.baseURL, userAgent: UA, viewport: { width: 390, height: 844 } });
  const phone = await ctx2.newPage();
  const sent: string[] = [];
  phone.on("request", (r) => { if (r.url().endsWith("/api/public/site-event")) sent.push(r.url()); });
  await phone.goto("/");
  await phone.getByRole("button", { name: "Nie, dziękuję" }).click();
  await phone.reload();
  await expect(phone.getByTestId("hero")).toBeVisible();
  await expect(phone.getByTestId("stats-consent")).toHaveCount(0);
  expect(sent).toEqual([]);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await phone.screenshot({ path: "docs/screenshots/site-mobile.png" });
  await ctx.close();
  await ctx2.close();
});
