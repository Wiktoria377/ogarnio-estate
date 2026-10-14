import { test, expect } from "@playwright/test";
import { createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

test("studio: generate post from property, refine, edit, versions", async ({ page }) => {
  await signUpAndConfirm(page, uniqueEmail("studio"), "Jan Studio");
  await createWorkspace(page, "Studio Biuro");
  await page.goto("/properties/new");
  await page.getByLabel("Nazwa oferty").fill("Dom z ogrodem w Wilanowie");
  await page.getByLabel("Miasto").fill("Warszawa");
  await page.getByLabel("Powierzchnia (m²)").fill("140");
  await page.locator("#price").fill("2450000");
  await page.getByRole("button", { name: "Zapisz i dodaj zdjęcia" }).click();
  await page.waitForURL(/\/properties\/[0-9a-f-]+\?created=1/);
  await page.getByRole("link", { name: "Post sprzedażowy" }).click();
  await page.waitForURL(/\/studio\/new/);
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: /Generuj/ }).click();
  await page.waitForURL(/\/studio\/[0-9a-f-]+\?new=1/);
  await expect(page.getByRole("tab", { name: /Wariant 2/ })).toBeVisible();
  await page.getByRole("button", { name: "Nowy nagłówek" }).click();
  await expect(page.getByText(/wersja 2/)).toBeVisible();
  await page.getByRole("button", { name: /Więcej wariantów/ }).click();
  await expect(page.getByRole("tab", { name: /Wariant 4/ })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/studio-editor.png", fullPage: true });
});
