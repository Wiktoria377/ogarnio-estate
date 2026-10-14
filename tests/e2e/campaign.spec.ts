import { expect, test } from "@playwright/test";
import { createProperty, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

test("campaign studio: property → goal → materials generated in background with brief and QA", async ({ page }) => {
  test.setTimeout(240_000);
  const email = uniqueEmail("campaign");
  await signUpAndConfirm(page, email, "Ewa Kampania");
  await createWorkspace(page, "Biuro Kampanii");
  const propertyId = await createProperty(page, "Apartament z tarasem na Żoliborzu");

  await page.goto(`/campaigns/new?property=${propertyId}`);
  await expect(page.getByRole("heading", { name: "Nowa kampania" })).toBeVisible();
  // Step 2: goal with conditional data
  await page.getByRole("button", { name: /Promocja obniżki ceny/ }).click();
  await expect(page.getByRole("button", { name: "Dalej" })).toBeDisabled();
  await page.getByLabel("Poprzednia cena").fill("949000");
  await page.getByRole("button", { name: "Dalej" }).click();
  // Step 3: audience + style
  await page.getByRole("button", { name: /Ekspercko/ }).click();
  await page.getByRole("button", { name: "Dalej" }).click();
  // Step 4: channels and deliverables
  await page.getByRole("button", { name: "Meta Ads", exact: true }).click();
  for (const d of ["Reels pionowy (MP4)", "Opis do wideo"]) {
    const b = page.getByRole("button", { name: new RegExp(d.replace(/[()]/g, "\\$&")) });
    if ((await b.getAttribute("aria-pressed")) === "true") await b.click();
  }
  const brochure = page.getByRole("button", { name: /Broszura PDF/ });
  if ((await brochure.getAttribute("aria-pressed")) !== "true") await brochure.click();
  await page.getByRole("button", { name: "Dalej" }).click();
  await expect(page.getByText(/Kampania zużyje około/)).toBeVisible();
  await page.getByRole("button", { name: "Uruchom kampanię" }).click();
  await page.waitForURL(/\/campaigns\/[0-9a-f-]+\?new=1/);

  await expect(page.getByText("Kampania gotowa")).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText("Myśl przewodnia")).toBeVisible();
  await expect(page.getByText("Kontrola jakości kampanii")).toBeVisible();
  await expect(page.getByText("Cel: nowa cena w komunikacji")).toBeVisible();
  for (const label of ["Post na Instagram", "Post na Facebook", "Karuzela (6 slajdów)", "3 Stories", "Nagłówki reklamowe", "Teksty Meta Ads", "Broszura PDF", "Harmonogram publikacji"]) {
    await expect(page.getByTestId(/^asset-/).filter({ hasText: label }).getByText("Gotowe")).toBeVisible();
  }
  await page.screenshot({ path: "docs/screenshots/etap2-campaign.png", fullPage: true });

  // The brochure is a regular PDF brochure built from the brief and the record.
  const brochureHref = await page.getByTestId("asset-brochure").getByRole("link", { name: "Otwórz i edytuj" }).getAttribute("href");
  expect(brochureHref).toMatch(/^\/brochures\//);
  const res = await page.request.get(`/api/brochures/${brochureHref!.split("/").pop()}`);
  expect(res.status()).toBe(200);
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // The carousel is a regular editable graphic linked to the campaign.
  await page.getByTestId("asset-carousel").getByRole("link", { name: "Otwórz i edytuj" }).click();
  await page.waitForURL(/\/graphics\/[0-9a-f-]+/);
  await expect(page.getByRole("button", { name: "Slajd 6: Kontakt i CTA" })).toBeVisible();
});
