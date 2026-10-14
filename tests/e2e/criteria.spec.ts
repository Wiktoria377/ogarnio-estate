import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { PASSWORD, createProperty, createWorkspace, login, mailLink, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * Completion criteria 1–12 of ETAP 1 in one user journey (AI runs on the
 * offline test provider here; with ANTHROPIC_API_KEY the same flow uses Claude).
 */
test("ETAP 1 criteria: account → brand → property → AI text → graphics → library → persistence → account", async ({ page }) => {
  test.setTimeout(300_000);
  const email = uniqueEmail("criteria");

  // 1–3: account, login (via e-mail confirmation), workspace
  await signUpAndConfirm(page, email, "Ewa Kryteria");
  await createWorkspace(page, "Kryteria Nieruchomości", { brand: true });

  // 4: branding
  await page.getByLabel("Slogan").fill("Dom zaczyna się od rozmowy");
  await page.getByRole("button", { name: /Zapisz i przejdź/ }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Ewa/ })).toBeVisible();
  await expect(page.getByText("Kryteria Nieruchomości").first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/dashboard-empty.png", fullPage: true });

  // 5: property with photos
  const propertyId = await createProperty(page, "Apartament z widokiem na park");

  // 6: AI property description
  await page.goto(`/studio/new?type=description_apartment&property=${propertyId}`);
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: /Generuj/ }).click();
  await page.waitForURL(/\/studio\/[0-9a-f-]+\?new=1/, { timeout: 90_000 });
  const textUrl = page.url().replace("?new=1", "");
  await expect(page.getByRole("tab", { name: /Wariant 1/ })).toBeVisible();

  // 7: social post with skills (skills tab lists selected competences)
  await page.goto(`/studio/new?type=property_sales_post&property=${propertyId}`);
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: "Dalej" }).click();
  await page.getByRole("button", { name: /Generuj/ }).click();
  await page.waitForURL(/\/studio\/[0-9a-f-]+\?new=1/, { timeout: 90_000 });
  await page.getByRole("tab", { name: "Kompetencje" }).click();
  await expect(page.getByText("Zasady nadrzędne").first()).toBeVisible();

  // 8–9: editable carousel + PNG download
  await page.goto(`/graphics/new?property=${propertyId}&format=carousel`);
  await page.getByRole("button", { name: "Utwórz i edytuj" }).click();
  await page.waitForURL(/\/graphics\/[0-9a-f-]+$/);
  const graphicUrl = page.url();
  await expect(page.getByTestId("graphic-preview")).toBeVisible({ timeout: 30_000 });
  await page.locator("#slot-title").fill("Zieleń za oknem, miasto pod ręką");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByText("Zapisano nową wersję grafiki")).toBeVisible();
  await page.getByRole("button", { name: "Pobierz" }).click();
  const [png] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Slajd 1 \(PNG\)/ }).click()]);
  expect(readFileSync((await png.path())!).subarray(1, 4).toString()).toBe("PNG");

  // 10: saved in the library and reopened
  await page.goto("/library");
  await expect(page.getByRole("link", { name: /Apartament z widokiem na park/ }).first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/library-grid.png", fullPage: true });
  await page.goto("/library?view=list&kind=graphic");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.screenshot({ path: "docs/screenshots/library-list.png", fullPage: true });
  await page.goto("/library?q=zzzz-nie-ma");
  await expect(page.getByText("Brak materiałów dla tych filtrów")).toBeVisible();

  // 11: data survives logout, login and refresh
  await page.goto("/dashboard");
  await page.screenshot({ path: "docs/screenshots/dashboard.png", fullPage: true });
  await page.request.post("/auth/signout");
  await page.goto("/dashboard");
  await page.waitForURL(/\/login/);
  await login(page, email);
  await page.goto(graphicUrl);
  await page.reload();
  await expect(page.locator("#slot-title")).toHaveValue("Zieleń za oknem, miasto pod ręką");
  await page.goto(textUrl);
  await expect(page.getByRole("tab", { name: /Wariant 1/ })).toBeVisible();

  // Settings: usage, export, skills catalog
  await page.goto("/settings");
  await expect(page.getByText("Wykorzystano w tym miesiącu")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/settings.png", fullPage: true });
  const exp = await page.request.get("/api/account/export");
  expect(exp.ok()).toBeTruthy();
  const data = await exp.json();
  expect(data.account.email).toBe(email);
  expect(data.workspaces[0].properties).toHaveLength(1);
  expect(data.workspaces[0].contentItems.length).toBeGreaterThanOrEqual(3);
  await page.goto("/skills");
  await expect(page.getByRole("heading", { name: "Kompetencje AI" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/skills.png", fullPage: true });

  // Password reset by e-mail
  await page.request.post("/auth/signout");
  await page.goto("/forgot-password");
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Wyślij link" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.waitForTimeout(1000);
  await page.goto(await mailLink(email, "recovery"));
  await page.waitForURL(/\/reset-password/);
  const NEW = `${PASSWORD}-nowe1`;
  await page.getByLabel("Nowe hasło").fill(NEW);
  await page.getByLabel("Powtórz hasło").fill(NEW);
  await page.getByRole("button", { name: "Ustaw hasło" }).click();
  await page.waitForURL(/\/dashboard/);

  // RODO: account deletion removes the account; login no longer works
  await page.goto("/settings/privacy");
  await page.getByRole("button", { name: "Usuń konto", exact: true }).click();
  await page.getByLabel("Potwierdzenie").fill("USUŃ");
  await page.getByRole("dialog").getByLabel("Hasło").fill(NEW);
  await page.getByRole("button", { name: "Usuń konto na zawsze" }).click();
  await page.waitForURL(/\/login\?notice=deleted/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(NEW);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});
