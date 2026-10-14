import { test, expect } from "@playwright/test";
import { acceptDialogs, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * ETAP 4 acceptance 1–5 in the browser: website URL → profile proposal with
 * confidence → edit and approve → communication preferences saved → reference
 * materials added. The website is the TEST SITE of a fictional office
 * (tests/mocks/brand-site.mjs, must be running on :4030).
 */
const SITE = process.env.BRAND_SITE_URL ?? "http://127.0.0.1:4030";
const SHOTS = process.env.E2E_SHOTS; // optional directory for review screenshots

test("Poznaj moją markę: analysis, proposal with confidence, approval, preferences, references", async ({ page }) => {
  test.setTimeout(180_000);
  await fetch(`${SITE}/__reset`);
  acceptDialogs(page);
  await signUpAndConfirm(page, uniqueEmail("brandai"), "Marka Testowa");
  await createWorkspace(page, "Biuro Kamienica E2E");

  // #5 reference materials (text post) before the analysis.
  await page.goto("/brand/intelligence");
  await expect(page.getByRole("heading", { name: "Poznaj moją markę" })).toBeVisible();
  await page.getByLabel("Tytuł", { exact: true }).fill("Post z Instagrama");
  await page.getByLabel("Treść").fill("Nowa oferta w kamienicy na Jeżycach. Wysokie sufity i drewniane podłogi. Umów prezentację.");
  await page.getByRole("button", { name: "Dodaj materiał" }).click();
  await expect(page.getByTestId("reference-row")).toHaveCount(1);
  await expect(page.getByTestId("reference-row")).toContainText("Post z Instagrama");

  // #1 URL + consent; the button stays disabled without consent.
  await page.getByLabel("Adres strony biura").fill(SITE);
  const start = page.getByRole("button", { name: "Poznaj moją markę" });
  await expect(start).toBeDisabled();
  await page.getByTestId("brand-consent").check();
  await start.click();
  await expect(page.getByText("Analiza strony rozpoczęta")).toBeVisible();
  const row = page.getByTestId("analysis-row").first();
  await expect(row.getByTestId("analysis-status")).toHaveText("Gotowe", { timeout: 60_000 });

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/brand-intelligence.png`, fullPage: true });
  // #2 proposal with confidence levels and evidence.
  await row.getByRole("link", { name: "Przejrzyj propozycję" }).click();
  await page.waitForURL(/\/brand\/versions\//);
  await expect(page.getByTestId("confidence-palette")).toContainText("Potwierdzone na stronie");
  await expect(page.getByTestId("confidence-avoid")).toContainText(/Propozycja do sprawdzenia|Nie ustalono/);
  await expect(page.locator("#pe-primary")).toHaveValue("#1E3A5F");
  await expect(page.locator("#pe-cta")).toHaveValue(/Umów prezentację/);
  await expect(page.getByTestId("draft-changes")).toContainText("Paleta kolorów");
  await expect(page.getByTestId("pages-log")).toContainText("robots.txt");
  await expect(page.getByTestId("pages-log")).toContainText("403");
  await expect(page.getByTestId("pages-log")).not.toContainText("/prywatne");

  // #3 edit before approving, then approve.
  await page.waitForLoadState("networkidle");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/brand-proposal.png`, fullPage: true });
  await page.locator("#pe-avoid").fill("okazja\nhit cenowy");
  await page.getByRole("button", { name: "Zatwierdź profil" }).click();
  await page.waitForURL(/\/brand\/history/);
  await expect(page.getByTestId("version-2")).toContainText("Obowiązująca");
  await expect(page.getByTestId("version-2")).toContainText("Analiza strony");
  await expect(page.getByTestId("version-1")).toContainText("Archiwalna");

  // #4 communication preferences saved as a new version of the binding profile.
  await page.goto("/brand/profile");
  await expect(page.getByTestId("approved-version")).toHaveText("Wersja 2");
  await expect(page.locator("#pe-primary")).toHaveValue("#1E3A5F");
  await expect(page.locator("#pe-avoid")).toHaveValue("okazja\nhit cenowy");
  await page.waitForLoadState("networkidle"); // let the editor hydrate before typing
  await page.locator("#pe-cta").fill("Umów prezentację\nZadzwoń do nas");
  await page.getByRole("button", { name: "Zapisz profil marki" }).click();
  await expect(page.getByText(/Zapisano profil marki \(wersja 3\)/)).toBeVisible();
  await page.reload();
  await expect(page.locator("#pe-cta")).toHaveValue("Umów prezentację\nZadzwoń do nas");

  // History: restore version 1 (the original look) and export.
  await page.goto("/brand/history");
  await expect(page.getByTestId("version-3")).toContainText("Zmienione: Preferowane CTA");
  await expect(page.getByTestId("version-3")).not.toContainText("Dane firmy");
  await page.getByTestId("version-1").getByRole("button", { name: "Przywróć" }).click();
  await expect(page.getByText(/Przywrócono ustawienia \(zapisane jako wersja 4\)/)).toBeVisible();
  await expect(page.getByTestId("version-4")).toContainText("Przywrócenie");
  const res = await page.request.get("/api/brand/export");
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { versions: unknown[] };
  expect(body.versions.length).toBe(4);
});
