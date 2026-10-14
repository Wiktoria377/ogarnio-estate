import { expect, test } from "@playwright/test";
import { acceptDialogs, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * ETAP 3 faza 5: import ofert. CSV through the UI (mapping, preview, errors,
 * selection, report) and ASARI through the CRM CONTRACT MOCK (tests/mocks/crm-api.mjs).
 * A live ASARI/EstiCRM account is a manual test blocked by missing credentials.
 */
test("CSV import with preview and error report; ASARI sync with background photos", async ({ page }) => {
  test.setTimeout(240_000);
  await fetch("http://127.0.0.1:4020/__reset", { method: "POST" });
  acceptDialogs(page);
  await signUpAndConfirm(page, uniqueEmail("import"), "Igor Importujący");
  await createWorkspace(page, "Biuro Importu Wrocław");

  await page.goto("/properties");
  await page.getByRole("link", { name: "Importuj oferty" }).click();
  await page.waitForURL(/\/import$/);
  await page.getByLabel("Plik", { exact: true }).setInputFiles("tests/fixtures/oferty-crm.csv");
  await page.getByRole("button", { name: "Wczytaj i pokaż podgląd" }).click();
  await page.waitForURL(/\/import\/[0-9a-f-]{36}/);

  // Automatic mapping; the internal note column is ignored.
  await expect(page.getByLabel("Pole dla kolumny Nr oferty")).toHaveValue("external_ref");
  await expect(page.getByLabel("Pole dla kolumny Metraż")).toHaveValue("area_m2");
  await expect(page.getByLabel("Pole dla kolumny Notatka wewnętrzna")).toHaveValue("");
  await expect(page.getByTestId("import-row")).toHaveCount(3);
  await expect(page.locator('[data-testid="import-row"][data-action="invalid"]')).toContainText("„brak”");
  await expect(page.getByLabel("Importuj wiersz 3")).toBeDisabled();
  await page.screenshot({ path: "docs/screenshots/import-preview.png", fullPage: true });

  // Deselect row 2, import row 1 only.
  await page.getByLabel("Importuj wiersz 2").uncheck();
  await expect(page.getByRole("button", { name: "Importuj zaznaczone (1)" })).toBeEnabled();
  await page.getByRole("button", { name: "Importuj zaznaczone (1)" }).click();
  await expect(page.getByTestId("import-result")).toContainText("utworzono 1");
  const report = page.waitForEvent("download");
  await page.getByRole("link", { name: "Pobierz raport CSV" }).click();
  expect((await report).suggestedFilename()).toMatch(/^raport-importu-/);
  await page.goto("/properties");
  await expect(page.getByText("Mieszkanie przy Odrze")).toBeVisible();
  await expect(page.getByText("Apartament z tarasem")).toHaveCount(0);

  // ASARI via the official Site API shape (mock): add source → sync in background → preview → import.
  await page.goto("/import");
  await page.getByLabel("Rodzaj źródła").selectOption("asari");
  await page.getByLabel("Nazwa źródła").fill("ASARI biura");
  await page.getByLabel("User ID (Site API)").fill("user-77");
  await page.getByLabel("Token (Site API)").fill("asari-token-123");
  await page.getByRole("button", { name: "Dodaj źródło" }).click();
  await expect(page.getByTestId("import-source")).toContainText("ASARI biura");
  await page.getByRole("button", { name: "Synchronizuj" }).click();
  await page.waitForURL(/\/import\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await expect(page.getByTestId("import-row")).toHaveCount(3);
  await page.getByRole("checkbox", { name: /prawo używać zdjęć/ }).check();
  await page.getByRole("button", { name: "Importuj zaznaczone (3)" }).click();
  await expect(page.getByTestId("import-result")).toContainText("utworzono 3");
  await page.getByRole("link", { name: "Otwórz ofertę" }).first().click();
  await expect(page.getByTestId("property-sync")).toContainText("ASARI biura");
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("2 z 40")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 60_000, intervals: [3000] });
  await page.goto("/import");
  await page.screenshot({ path: "docs/screenshots/import.png", fullPage: true });
});
