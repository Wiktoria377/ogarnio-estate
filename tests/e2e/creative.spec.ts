import { test, expect } from "@playwright/test";
import { acceptDialogs, createProperty, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * ETAP 4 Creative Engine 2.0 (acceptance 7): photos uploaded by the user are
 * checked technically (real pixels), the new-graphic screen recommends a
 * composition with reasons, a crop is proposed and can be reverted, and one
 * graphic yields five separate brand-consistent variants (offline AI provider).
 */
test("Creative Engine: photo quality, composition advice, crop proposal, 5 variants, QA", async ({ page }) => {
  test.setTimeout(240_000);
  acceptDialogs(page);
  await signUpAndConfirm(page, uniqueEmail("creative"), "Kreacja Testowa");
  await createWorkspace(page, "Biuro Kreacji E2E");
  const propertyId = await createProperty(page);

  // Photo analysis runs on upload; reports are visible on the property.
  await page.reload();
  await expect(page.getByTestId("photo-quality")).toHaveCount(3);
  await page.getByTestId("photo-quality-panel").locator("summary").click();
  await expect(page.getByTestId("photo-report")).toHaveCount(3);
  await expect(page.getByTestId("photo-report").first()).toContainText("wynik techniczny");
  await expect(page.getByTestId("photo-quality-panel")).toContainText("wymaga modelu wizualnego");

  // Composition advice with reasons on the new-graphic screen.
  await page.goto(`/graphics/new?property=${propertyId}&format=square`);
  await expect(page.getByTestId("composition-advice")).toBeVisible();
  await expect(page.getByTestId("recommended-template")).toHaveCount(1);
  await page.getByRole("button", { name: "Utwórz i edytuj" }).click();
  await page.waitForURL(/\/graphics\/[0-9a-f-]+$/);
  const preview = page.getByTestId("graphic-preview");
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Odświeżam podgląd")).toHaveCount(0, { timeout: 30_000 });

  // Crop proposal from the photo's salient point; the original framing can be restored.
  await page.locator('[data-element="photo0"]').click({ position: { x: 10, y: 10 } });
  await page.getByRole("button", { name: "Zaproponuj kadr" }).click();
  await expect(page.getByText(/Zaproponowany kadr: widać ok\. \d+% zdjęcia/)).toBeVisible();
  await page.getByRole("button", { name: "Przywróć oryginalny kadr" }).click();
  await expect(page.getByTestId("element-panel")).toContainText("100%");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByText("Zapisano nową wersję grafiki")).toBeVisible();

  // Five variants, each a separate graphic.
  await page.getByTestId("variants-box").getByRole("button", { name: "Warianty" }).click();
  await page.getByRole("button", { name: "Przygotuj warianty" }).click();
  await expect(page.getByText("Przygotowano 5 wariantów.")).toBeVisible({ timeout: 90_000 });
  const links = page.getByTestId("variant-links").getByRole("link");
  await expect(links).toHaveCount(5);
  for (const l of ["Minimalistyczna", "Premium", "Dynamiczna", "Ekspercka", "Sprzedażowa"]) await expect(page.getByTestId("variant-links")).toContainText(l);

  // A variant opens as its own editable graphic and lists its siblings.
  const sourceUrl = page.url();
  await links.filter({ hasText: "Premium" }).click();
  await page.waitForURL((u) => u.href !== sourceUrl && /\/graphics\/[0-9a-f-]+$/.test(u.pathname));
  await expect(page.getByLabel("Tytuł grafiki")).toHaveValue(/^Wariant premium/, { timeout: 30_000 });
  await expect(page.getByTestId("graphic-preview")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#slot-price")).toHaveValue(/899\s?000/);
  // Its four sibling variants are linked.
  await expect(page.getByTestId("variant-links").getByRole("link")).toHaveCount(4);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: "docs/screenshots/creative-variant.png", fullPage: true });

  // Quality assurance of the variant (rendered pixels, layout, brand), no AI cost.
  await page.getByRole("tab", { name: "Jakość" }).click();
  await page.getByTestId("qa-run").click();
  await expect(page.getByTestId("qa-summary")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("qa-check").first()).toBeVisible();
  for (const area of ["Kontrast", "Typografia", "Marginesy", "Nakładanie", "Ucięty tekst", "Marka", "Fakty"]) await expect(page.getByTestId("qa-panel")).toContainText(area);
  await expect(page.getByTestId("qa-panel")).toContainText("nie jest obiektywną oceną");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: "docs/screenshots/qa-graphic.png", fullPage: true });
  // The report is stored: it is there after a reload.
  await page.reload();
  await page.getByRole("tab", { name: "Jakość" }).click();
  await expect(page.getByTestId("qa-summary")).toBeVisible();
});
