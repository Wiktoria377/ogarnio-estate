import { test, expect, type Page } from "@playwright/test";
import { acceptDialogs, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * ETAP 4 acceptance 6, 8 and 14 in the browser: generate in the approved style,
 * remember a correction, see it in the next generation, delete it and see the
 * effect disappear; memory switch. AI runs on the offline test provider, which
 * follows the brand CTA/avoid instructions mechanically (marked in the UI).
 */
async function generatePost(page: Page, propertyId: string) {
  await page.goto(`/studio/new?type=property_sales_post&property=${propertyId}`);
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: /Generuj/ }).click();
  await page.waitForURL(/\/studio\/[0-9a-f-]+\?new=1/);
  await page.waitForLoadState("networkidle");
}

test("Brand Memory: profile style in generation, remember a correction, delete it, switch memory off", async ({ page }) => {
  test.setTimeout(240_000);
  acceptDialogs(page);
  await signUpAndConfirm(page, uniqueEmail("memory"), "Pamięć Testowa");
  await createWorkspace(page, "Biuro Pamięci E2E");

  // #6 approved style: profile CTA and avoided word.
  await page.goto("/brand/profile");
  await page.waitForLoadState("networkidle");
  await page.locator("#pe-cta").fill("Umów prezentację mieszkania");
  await page.getByRole("button", { name: "Zapisz profil marki" }).click();
  await expect(page.getByText(/Zapisano profil marki/)).toBeVisible();

  await page.goto("/properties/new");
  await page.getByLabel("Nazwa oferty").fill("Mieszkanie z tarasem na Ochocie");
  await page.getByLabel("Miasto").fill("Warszawa");
  await page.getByLabel("Powierzchnia (m²)").fill("64");
  await page.locator("#price").fill("1050000");
  await page.getByRole("button", { name: "Zapisz i dodaj zdjęcia" }).click();
  await page.waitForURL(/\/properties\/[0-9a-f-]+\?created=1/);
  const propertyId = /properties\/([0-9a-f-]+)/.exec(page.url())![1]!;

  await generatePost(page, propertyId);
  await expect(page.getByLabel("CTA")).toHaveValue("Umów prezentację mieszkania");

  // A manual correction: the app offers to remember it, nothing is saved automatically.
  await page.getByLabel("CTA").fill("Zadzwoń do Ani z biura");
  await page.getByRole("button", { name: "Zapisz wersję" }).click();
  const panel = page.getByTestId("remember-panel");
  await expect(panel).toBeVisible();
  await page.goto("/brand/memory");
  await expect(page.getByTestId("memory-explicit")).toHaveCount(0);
  await expect(page.getByTestId("memory-decisions")).toContainText("Poprawka tekstu");
  await page.goBack();
  await page.waitForLoadState("networkidle");

  // Remember it explicitly (the panel is gone after navigation: make the same edit on another variant).
  await page.getByRole("tab", { name: /Wariant 2/ }).click();
  await page.getByLabel("CTA").fill("Zadzwoń do Ani z biura");
  await page.getByRole("button", { name: "Zapisz wersję" }).click();
  await expect(panel).toBeVisible();
  await panel.getByTestId("remember-candidate").filter({ hasText: "Preferowane CTA" }).getByRole("button", { name: "Zapamiętaj" }).click();
  await expect(panel.getByText("Zapamiętano")).toBeVisible();

  // Two identical corrections = a suggestion too, but the explicit entry already covers it.
  await page.goto("/brand/memory");
  await expect(page.getByTestId("memory-explicit")).toContainText("Zadzwoń do Ani z biura");
  await expect(page.getByTestId("memory-suggested")).toHaveCount(0);

  // #8 the preference changes the next generation.
  await generatePost(page, propertyId);
  await expect(page.getByLabel("CTA")).toHaveValue("Zadzwoń do Ani z biura");

  // #14 delete the preference: generation goes back to the profile CTA.
  await page.goto("/brand/memory");
  await page.getByRole("button", { name: "Usuń: Zadzwoń do Ani z biura" }).click();
  await expect(page.getByText("Usunięto z pamięci marki.")).toBeVisible();
  await expect(page.getByTestId("memory-explicit")).toHaveCount(0);
  await generatePost(page, propertyId);
  await expect(page.getByLabel("CTA")).toHaveValue("Umów prezentację mieszkania");

  // Manual entry + switching memory off.
  await page.goto("/brand/memory");
  await page.getByLabel("Rodzaj preferencji").selectOption("avoid");
  await page.getByLabel("Treść preferencji").fill("okazja");
  await page.getByRole("button", { name: "Dodaj" }).click();
  await expect(page.getByTestId("memory-explicit")).toContainText("okazja");
  await page.getByRole("switch", { name: "Pamięć marki włączona" }).click();
  await expect(page.getByTestId("memory-state")).toHaveText("Wyłączona");
  await page.getByRole("switch", { name: "Pamięć marki włączona" }).click();
  await expect(page.getByTestId("memory-state")).toHaveText("Włączona");

  // Delete everything.
  await page.getByRole("button", { name: "Usuń całą pamięć" }).click();
  await expect(page.getByText(/Wyczyszczono pamięć marki/)).toBeVisible();
  await expect(page.getByTestId("memory-explicit")).toHaveCount(0);
  await expect(page.getByTestId("memory-decisions")).toContainText("Brak zapisanych decyzji");
});
