import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createProperty, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

test("brochures: one-page card and a catalog, edited, saved and downloaded as PDF", async ({ page }) => {
  test.setTimeout(240_000);
  await signUpAndConfirm(page, uniqueEmail("pdf"), "Broszura Testowa");
  await createWorkspace(page, "Biuro Broszur Śląsk");
  const first = await createProperty(page);
  await createProperty(page, "Dom z ogrodem w Ząbkach", ["tests/fixtures/house-2.jpg"]);

  // One-page card for the first property.
  await page.goto(`/brochures/new?property=${first}`);
  await page.getByRole("button", { name: /Karta oferty/ }).click();
  await page.getByRole("button", { name: "Utwórz broszurę" }).click();
  await page.waitForURL(/\/brochures\/[0-9a-f-]+$/);
  const pages = page.getByTestId("brochure-pages").getByRole("img");
  await expect(pages).toHaveCount(1, { timeout: 30_000 });
  await page.getByLabel("Imię i nazwisko agenta").fill("Łukasz Żółtowski");
  await page.getByLabel("Nagłówek").fill("Jasne mieszkanie z balkonem");
  await expect(page.getByText("Niezapisane zmiany")).toBeVisible();
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByText("Zapisano broszurę")).toBeVisible();
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Pobierz PDF" }).click()]);
  const bytes = readFileSync((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect((bytes.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
  await expect(page.getByText("Odświeżam")).toHaveCount(0, { timeout: 30_000 });
  await page.screenshot({ path: "docs/screenshots/etap2-brochure-card.png", fullPage: true });

  // Reload keeps the edits.
  await page.reload();
  await expect(page.getByLabel("Imię i nazwisko agenta")).toHaveValue("Łukasz Żółtowski");

  // Catalog needs at least two properties.
  await page.goto("/brochures/new");
  await page.getByRole("button", { name: /Katalog ofert/ }).click();
  await expect(page.getByRole("button", { name: "Utwórz broszurę" })).toBeDisabled();
  // The most recently edited offer is preselected; add the other one.
  await page.getByRole("button", { name: /Mieszkanie z balkonem na Mokotowie/ }).click();
  await page.getByRole("button", { name: "Utwórz broszurę" }).click();
  await page.waitForURL(/\/brochures\/[0-9a-f-]+$/);
  await expect(page.getByTestId("brochure-pages").getByRole("img")).toHaveCount(3, { timeout: 30_000 });
  await page.getByLabel("Tytuł katalogu").fill("Oferty jesień 2026");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByText("Zapisano broszurę")).toBeVisible();

  await page.goto("/brochures");
  await expect(page.getByText("Katalog ofert · 2 ofert")).toBeVisible();
  await expect(page.locator('img[src*="/api/brochures/"]').first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/etap2-brochures.png", fullPage: true });
});
