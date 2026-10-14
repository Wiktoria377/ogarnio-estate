import { test, expect } from "@playwright/test";
import { createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

test("signup → workspace → brand → property with photos", async ({ page }) => {
  const email = uniqueEmail("smoke");
  await signUpAndConfirm(page, email, "Anna Testowa");
  await createWorkspace(page, "Smoke Nieruchomości", { brand: true });
  await page.getByLabel("Slogan").fill("Spokojnie przez całą transakcję");
  await page.getByRole("button", { name: /Zapisz i przejdź/ }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto("/properties/new");
  await page.getByLabel("Nazwa oferty").fill("Mieszkanie z balkonem na Mokotowie");
  await page.getByLabel("Miasto").fill("Warszawa");
  await page.getByLabel("Powierzchnia (m²)").fill("54,5");
  await page.getByLabel("Liczba pokoi").fill("3");
  await page.locator("#price").fill("899000");
  await page.getByRole("button", { name: "Zapisz i dodaj zdjęcia" }).click();
  await page.waitForURL(/\/properties\/[0-9a-f-]+\?created=1/);
  await page.locator('input[type="file"]').setInputFiles(["tests/fixtures/house-1.jpg", "tests/fixtures/house-2.jpg"]);
  await expect(page.getByAltText("Zdjęcie 2")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/smoke-property.png", fullPage: true });
});
