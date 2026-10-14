import { test, expect } from "@playwright/test";
import { acceptDialogs, createProperty, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * ETAP 4 Recommendations and dashboard (acceptance 13): a new office gets only
 * the recommendations its data support (no accounts → measurement, no
 * educational material → topics, empty planner), each with basis, data, action and metric;
 * "Nie teraz" hides one and it can be restored; actions open real screens.
 * Older-data rules (gaps, unused offers, headline tests) run on seeded records
 * in tests/integration/recommendations.test.ts.
 */
test("Recommendations: from the office's data, decisions, actions, dashboard sections", async ({ page }) => {
  test.setTimeout(180_000);
  acceptDialogs(page);
  await signUpAndConfirm(page, uniqueEmail("reco"), "Rekomendacje Testowe");
  await createWorkspace(page, "Biuro Rekomendacji E2E");
  await createProperty(page);

  await page.goto("/recommendations");
  await expect(page.getByRole("heading", { name: "Rekomendacje", exact: true })).toBeVisible();
  const connect = page.locator('[data-testid="reco"][data-code="connect_channels"]');
  const edu = page.locator('[data-testid="reco"][data-code="missing_education"]');
  await expect(connect).toBeVisible();
  await expect(edu).toBeVisible();
  await expect(page.locator('[data-testid="reco"][data-code="empty_planner"]')).toContainText("Planer nie ma wpisów na najbliższe 14 dni. Liczba aktywnych ofert biura: 1.");
  await expect(page.getByTestId("reco")).toHaveCount(3);
  // A listing added today is not "unused" yet: no recommendation without the data for it.
  await expect(page.locator('[data-testid="reco"][data-code="unused_property"]')).toHaveCount(0);
  for (const part of ["Na jakiej podstawie", "Użyte dane", "Co warto mierzyć"]) await expect(edu).toContainText(part);
  await expect(edu.getByTestId("reco-data")).toContainText("Materiały edukacyjne w 90 dniach");
  await expect(page.getByTestId("reco-gaps")).toContainText("Statystyki platform ma 0 publikacji");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: "docs/screenshots/recommendations.png", fullPage: true });

  // "Nie teraz" hides it; it can be shown again.
  await edu.getByRole("button", { name: "Nie teraz" }).click();
  await expect(edu).toHaveCount(0);
  await expect(page.getByTestId("reco-hidden")).toContainText("Dodaj treści edukacyjne");
  await page.getByTestId("reco-hidden").getByRole("button", { name: "Pokaż ponownie" }).click();
  await expect(edu).toBeVisible();

  // Dashboard: overview from records, top recommendations, module states.
  await page.goto("/dashboard");
  const overview = page.getByTestId("dash-overview");
  await expect(overview).toContainText("Publikacje potwierdzone w 4 tygodniach");
  await expect(overview).toContainText("Brak danych");
  await expect(page.getByTestId("dash-recos").getByTestId("reco")).toHaveCount(3);
  await expect(page.getByTestId("dash-module")).toHaveCount(5);
  for (const m of ["AI Marketing Director", "Brand Intelligence", "Creative Studio", "Campaign Autopilot", "Brand Memory"]) await expect(page.getByTestId("dash-module").filter({ hasText: m })).toHaveCount(1);
  await expect(page.getByTestId("dash-module").filter({ hasText: "Campaign Autopilot" })).toContainText("Brak planu");
  await expect(page.getByTestId("dash-module").filter({ hasText: "Brand Intelligence" })).toContainText("Profil startowy");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: "docs/screenshots/dashboard-etap4.png", fullPage: true });

  // A recommendation's action opens the real creator with the topic filled in.
  await page.getByTestId("dash-recos").locator('[data-code="missing_education"]').getByRole("link").first().click();
  await page.waitForURL(/\/studio\/new\?type=buying_content/);
  await expect(page.getByRole("heading", { name: "Nowy materiał" })).toBeVisible();
});
