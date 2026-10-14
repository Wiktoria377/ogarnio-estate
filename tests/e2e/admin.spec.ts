import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { acceptDialogs, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * ETAP 3 faza 7: platform admin panel. Office owners get a 404; access is granted
 * only through the CLI (service role). The admin sees numbers (no content),
 * grants a trial with a reason, and every action shows in the audit log.
 */
const cli = (...args: string[]) => execFileSync("node", ["--env-file=.env.local", "scripts/platform-admin.mjs", ...args], { encoding: "utf8" });

test("admin panel: access control, offices, trial grant, plans, costs, audit", async ({ page }) => {
  test.setTimeout(180_000);
  acceptDialogs(page);
  const email = uniqueEmail("admin");
  await signUpAndConfirm(page, email, "Pola Platformowa");
  const office = `Biuro Pani Admin ${Date.now().toString(36)}`;
  await createWorkspace(page, office);

  // A regular office owner does not even learn the panel exists.
  const denied = await page.request.get("/admin");
  expect(denied.status()).toBe(404);

  expect(cli("grant", email, "viewer", "E2E podgląd")).toContain("viewer");
  await page.goto("/admin");
  await expect(page.getByTestId("admin-role")).toHaveText("Podgląd");
  await expect(page.getByTestId("admin-mrr")).toBeVisible();
  await page.goto("/admin/plans");
  await expect(page.getByRole("button", { name: "Zapisz plan" })).toHaveCount(0);

  expect(cli("grant", email, "admin", "E2E administrator")).toContain("admin");
  await page.goto("/admin");
  await expect(page.getByTestId("admin-role")).toHaveText("Administrator");
  await expect(page.getByTestId("activation")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/admin.png", fullPage: true });

  await page.goto(`/admin/offices?q=${encodeURIComponent(office)}`);
  await expect(page.getByTestId("admin-office")).toHaveCount(1);
  await page.getByRole("link", { name: office }).click();
  await expect(page.getByTestId("office-plan")).toContainText("trial");
  await page.getByLabel("Liczba dni").fill("30");
  await page.getByLabel("Plan w okresie próbnym").selectOption({ label: "Studio" });
  await page.getByRole("button", { name: "Przyznaj okres próbny" }).click();
  await expect(page.getByText("Podaj powód")).toBeVisible();
  await page.getByLabel("Powód").fill("Klient testuje wdrożenie z zespołem");
  await page.getByRole("button", { name: "Przyznaj okres próbny" }).click();
  await expect(page.getByTestId("office-plan")).toContainText("studio");
  await expect(page.getByTestId("office-audit")).toContainText("grant_trial");
  await expect(page.getByTestId("office-audit")).toContainText("Klient testuje wdrożenie z zespołem");

  await page.goto("/admin/costs");
  await expect(page.getByRole("heading", { name: "Koszty i budżety" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/admin-costs.png", fullPage: true });
  await page.goto("/admin/health");
  await expect(page.getByTestId("job-stats")).toBeVisible();

  await page.goto("/admin/audit");
  await expect(page.getByTestId("audit-row").filter({ hasText: "grant_trial" }).first()).toContainText(email);
  await expect(page.getByTestId("audit-row").filter({ hasText: "view_office" }).first()).toBeVisible();
  await expect(page.getByTestId("audit-row").filter({ hasText: "cli_grant_admin" }).first()).toBeVisible();

  // The office itself sees the new trial in its own billing settings.
  await page.goto("/settings/billing");
  await expect(page.getByText("Studio").first()).toBeVisible();

  cli("revoke", email, "E2E koniec");
  expect((await page.request.get("/admin")).status()).toBe(404);
});
