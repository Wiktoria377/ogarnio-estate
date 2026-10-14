import { expect, test } from "@playwright/test";
import { createProperty, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * ETAP 3, acceptance 9–13 against the API CONTRACT MOCK (tests/mocks/social-api.mjs).
 * The OAuth consent screens are the mock's (clearly labelled "SYMULATOR TESTOWY");
 * connecting a REAL Facebook/LinkedIn account is a manual test blocked until
 * Meta/LinkedIn approve the app (docs/TEST_REPORT.md).
 */
const warsaw = (d: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
};

test("connect Meta via OAuth → compose → approve → worker publishes on time → external id → planner", async ({ page }) => {
  test.setTimeout(300_000);
  await fetch(`${process.env.SOCIAL_API_MOCK_URL ?? "http://127.0.0.1:4010"}/__reset`, { method: "POST" });
  await signUpAndConfirm(page, uniqueEmail("publish"), "Paula Publikująca");
  await createWorkspace(page, "Biuro Publikacji Poznań");
  await createProperty(page, "Apartament przy Starym Rynku", ["tests/fixtures/house-1.jpg", "tests/fixtures/house-2.jpg"]);

  // OAuth: official-flow shape (state, redirect), consent on the (mock) platform, pick accounts.
  await page.goto("/connections");
  await expect(page.getByTestId("social-mock-banner")).toBeVisible();
  await expect(page.getByTestId("provider-tiktok")).toContainText("Niedostępne");
  await page.getByRole("button", { name: "Połącz Facebook / Instagram" }).click();
  await page.waitForURL(/127\.0\.0\.1:4010\/meta\/dialog\/oauth/);
  await expect(page.getByText("SYMULATOR TESTOWY")).toBeVisible();
  await page.locator("#allow").click();
  await page.waitForURL(/\/connections\/select\?grant=/);
  await expect(page.getByLabel("Strona na Facebooku: Biuro Testowe (symulator)")).toBeChecked();
  await expect(page.getByLabel(/Instagram.*@biuro\.testowe\.symulator/)).toBeChecked();
  await page.getByRole("button", { name: "Połącz zaznaczone (2)" }).click();
  await page.waitForURL(/\/connections\?connected=1/);
  await expect(page.getByTestId("social-account")).toHaveCount(2);
  await expect(page.getByTestId("social-status").first()).toHaveText("Połączone");
  // Trial plan: 2 social accounts. The LinkedIn button is blocked by the limit (enforced again in the DB trigger).
  await expect(page.getByTestId("social-usage")).toContainText("2 z 2");
  await expect(page.getByRole("button", { name: "Połącz LinkedIn" })).toBeDisabled();
  await page.screenshot({ path: "docs/screenshots/connections.png", fullPage: true });

  // Compose: photos from the offer → FB photo set + IG carousel; validation per platform.
  await page.goto("/publications/new");
  await page.getByLabel("Zdjęcia z oferty").selectOption({ label: "Apartament przy Starym Rynku" });
  await page.getByRole("button", { name: "Zdjęcie 1" }).click();
  await page.getByRole("button", { name: "Zdjęcie 2" }).click();
  await expect(page.getByTestId("media-count")).toContainText("2");
  await page.getByLabel("Konto: Biuro Testowe (symulator)").check();
  await page.getByLabel("Konto: @biuro.testowe.symulator").check();
  await expect(page.getByLabel("Format: Biuro Testowe (symulator)")).toHaveValue("photo_set");
  await expect(page.getByLabel("Format: @biuro.testowe.symulator")).toHaveValue("carousel");
  await page.getByLabel("Tytuł wpisu w planerze").fill("Apartament przy Starym Rynku: premiera");
  const caption = `Nowość w ofercie: apartament przy Starym Rynku ${Date.now()} #poznań`;
  await page.getByLabel("Opis posta").fill(caption);
  // Instagram rejects text-only: switching IG to "Zdjęcie" with 2 files shows an issue.
  await page.getByLabel("Format: @biuro.testowe.symulator").selectOption("photo");
  await expect(page.getByTestId("publish-issues")).toContainText("Instagram");
  await page.getByLabel("Format: @biuro.testowe.symulator").selectOption("carousel");
  await expect(page.getByTestId("publish-issues")).toHaveCount(0);
  const at = warsaw(new Date(Date.now() + 150_000));
  await page.getByLabel("Data", { exact: true }).fill(at.date);
  await page.getByLabel("Godzina (czas polski)").fill(at.time);
  await expect(page.getByTestId("publish-preview")).toHaveCount(2);
  await page.screenshot({ path: "docs/screenshots/publish-composer.png", fullPage: true });
  await page.getByRole("button", { name: "Zatwierdź i zaplanuj" }).click();
  await page.waitForURL(/\/publications$/);
  await expect(page.getByTestId("publication-row")).toHaveCount(2);
  await expect(page.getByTestId("publication-state").first()).toHaveText("Zaplanowane");

  // Planner shows the automatic entry.
  await page.goto(`/planner?view=list&date=${at.date}`);
  await page.getByRole("button", { name: "Apartament przy Starym Rynku: premiera" }).click();
  await expect(page.getByTestId("entry-auto")).toContainText("Zaplanowane");
  await page.keyboard.press("Escape");

  // The worker publishes at the scheduled minute; status only after platform confirmation.
  await page.goto("/publications");
  await expect(async () => {
    await page.reload();
    await expect(page.locator('[data-testid="publication-row"][data-state="published"]')).toHaveCount(2, { timeout: 1000 });
  }).toPass({ timeout: 240_000, intervals: [5000] });
  await expect(page.getByTestId("external-id")).toHaveCount(2);
  await expect(page.getByTestId("social-mock-banner")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/publications.png", fullPage: true });
  await page.goto(`/planner?view=list&date=${at.date}`);
  await expect(page.getByTestId("planner-row").filter({ hasText: "premiera" }).getByLabel(/Status:/)).toHaveValue("published");

  // Disconnect: tokens removed, account no longer listed.
  await page.goto("/connections");
  await page.getByRole("button", { name: "Odłącz" }).first().click();
  await expect(page.getByText(/Odłączono/)).toBeVisible();
  await expect(page.getByTestId("social-account")).toHaveCount(1);
});
