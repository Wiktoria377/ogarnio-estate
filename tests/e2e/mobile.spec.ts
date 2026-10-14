import { expect, test } from "@playwright/test";
import { createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

/** Acceptance 19: the app itself (not only the sales page) works at phone width without horizontal scrolling. */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("app on a phone: signup, menu navigation, key screens without horizontal overflow", async ({ page }) => {
  test.setTimeout(150_000);
  await signUpAndConfirm(page, uniqueEmail("mobile"), "Monika Mobilna");
  await createWorkspace(page, "Biuro Mobilne");
  const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.goto("/dashboard");
  await noOverflow();
  await page.getByRole("button", { name: "Otwórz menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Nieruchomości" }).click();
  await expect(page).toHaveURL(/\/properties$/);
  await noOverflow();
  for (const path of ["/properties/new", "/campaigns", "/studio", "/planner", "/publications", "/analytics", "/leads", "/library", "/settings/billing"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    await noOverflow();
  }
  await page.goto("/analytics");
  await page.screenshot({ path: "docs/screenshots/mobile-analytics.png" });
});
