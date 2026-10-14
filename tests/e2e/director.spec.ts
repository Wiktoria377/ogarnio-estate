import { test, expect } from "@playwright/test";
import { acceptDialogs, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * ETAP 4 acceptance 9: „Zaproponuj mi strategię” on real office data (offline
 * AI provider, labelled). Data, conclusions, hypotheses and recommendations are
 * shown apart, all 11 sections exist, the strategy can be accepted and its
 * materials open in the Studio with type, offer and channel preset.
 */
test("AI Marketing Director: strategy from office data, 11 sections, accept, prepare material", async ({ page }) => {
  test.setTimeout(180_000);
  acceptDialogs(page);
  await signUpAndConfirm(page, uniqueEmail("director"), "Dyrektor Testowy");
  await createWorkspace(page, "Biuro Strategii E2E");

  await page.goto("/properties/new");
  await page.getByLabel("Nazwa oferty").fill("Luksusowy apartament z tarasem");
  await page.getByLabel("Miasto").fill("Warszawa");
  await page.getByLabel("Powierzchnia (m²)").fill("112");
  await page.locator("#price").fill("3400000");
  await page.getByRole("button", { name: "Zapisz i dodaj zdjęcia" }).click();
  await page.waitForURL(/\/properties\/[0-9a-f-]+\?created=1/);

  await page.goto("/director");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Cel biznesowy").selectOption("sell_listings");
  await page.getByLabel("Okres kampanii").selectOption("30");
  await page.getByTestId("strategy-property").filter({ hasText: "Luksusowy apartament" }).locator("input").check();
  await page.getByLabel("Publikacje tygodniowo").fill("2");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: "docs/screenshots/director-form.png", fullPage: true });
  await page.getByRole("button", { name: "Zaproponuj mi strategię" }).click();
  await page.waitForURL(/\/director\/[0-9a-f-]+$/, { timeout: 60_000 });

  await expect(page.getByTestId("test-provider-note")).toBeVisible();
  for (const s of ["diagnosis", "goals", "segments", "messages", "pillars", "campaigns", "schedule", "formats", "ctas", "metrics", "materials"]) {
    await expect(page.getByTestId(`sec-${s}`)).toBeVisible();
  }
  // Data is computed by the app (real numbers of this office), shown apart from conclusions and hypotheses.
  await page.getByTestId("strategy-data").locator("summary").click();
  await expect(page.getByTestId("strategy-data")).toContainText("Aktywne oferty");
  await expect(page.getByTestId("strategy-data")).toContainText("Brak danych");
  await expect(page.getByTestId("sec-conclusions").getByTestId("kind-conclusion").first()).toBeVisible();
  await expect(page.getByTestId("sec-hypotheses").getByTestId("kind-hypothesis").first()).toBeVisible();
  await expect(page.getByTestId("recommendation").first()).toContainText("Miernik");
  // The model's unsupported conclusion was moved to hypotheses by the check.
  await expect(page.getByTestId("strategy-warnings")).toContainText("przeniesiono do hipotez");
  await expect(page.getByTestId("strategy-material")).toHaveCount(9);
  await expect(page.getByTestId("strategy-meta")).toContainText("strategy-1.0.0");

  if (process.env.E2E_SHOTS) await page.screenshot({ path: "docs/screenshots/director-strategy.png", fullPage: true });
  await page.getByRole("button", { name: "Akceptuj strategię" }).click();
  await expect(page.getByTestId("strategy-status")).toHaveText("Zaakceptowana");

  const first = page.getByTestId("strategy-material").first();
  await expect(first).toContainText("Luksusowy apartament");
  await first.getByRole("link", { name: "Przygotuj" }).click();
  await page.waitForURL(/\/studio\/new\?type=property_sales_post/);
  await expect(page.getByLabel("Platforma")).toHaveValue("instagram");

  await page.goto("/director");
  await expect(page.getByTestId("strategy-row")).toHaveCount(1);
  await expect(page.getByTestId("strategy-row")).toContainText("Zaakceptowana");
});
