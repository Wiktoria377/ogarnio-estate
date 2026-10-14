import { test, expect } from "@playwright/test";
import { acceptDialogs, createProperty, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * ETAP 4 Campaign Autopilot (acceptance 10–12): "Przygotuj mój marketing na
 * najbliższy miesiąc" builds a plan with a rationale from the office's data,
 * prepares materials within the AI limit (offline AI provider), and every
 * material waits in the approval queue: accept, reject, schedule. Nothing is
 * published and ad proposals are never run.
 */
test("Campaign Autopilot: monthly plan, materials within the limit, approval queue", async ({ page }) => {
  test.setTimeout(240_000);
  acceptDialogs(page);
  await signUpAndConfirm(page, uniqueEmail("autopilot"), "Autopilot Testowy");
  await createWorkspace(page, "Biuro Autopilota E2E");
  await createProperty(page);

  await page.goto("/autopilot");
  const form = page.getByTestId("autopilot-form");
  await expect(form).toBeVisible();
  await page.getByLabel("Liczba publikacji").fill("5");
  await page.getByLabel("Limit generowań AI").fill("3");
  await page.getByTestId("autopilot-property").first().locator("input").check();
  await form.getByText("Propozycje reklam").click();
  await page.getByRole("button", { name: "Przygotuj mój marketing" }).click();
  await page.waitForURL(/\/autopilot\/[0-9a-f-]+$/);

  // Plan and its rationale from the office's own data.
  const rationale = page.getByTestId("autopilot-rationale");
  await expect(rationale).toContainText("Aktywne oferty: 1");
  await expect(rationale).toContainText("kolejki akceptacji");
  await expect(page.getByTestId("autopilot-item")).toHaveCount(5);
  await expect(page.locator('[data-testid="autopilot-item"][data-kind="ad_proposal"]')).toHaveCount(1);
  await expect(page.getByTestId("autopilot-rationale-item").first()).toContainText("Dlaczego");
  await expect(page.getByTestId("autopilot-meta")).toContainText("Limit AI planu: 0/3");

  // Materials: 3 of 5 within the limit, prepared in the background, each checked by QA.
  await page.getByTestId("autopilot-prepare").click();
  const ready = page.locator('[data-testid="autopilot-item"][data-status="ready"]');
  await expect(ready).toHaveCount(3, { timeout: 120_000 });
  await expect(page.locator('[data-testid="autopilot-item"][data-status="proposed"]')).toHaveCount(2);
  await expect(page.getByTestId("autopilot-meta")).toContainText("Limit AI planu: 3/3");
  await expect(page.getByTestId("autopilot-qa")).toHaveCount(3);
  await expect(page.getByTestId("test-provider-note")).toBeVisible();
  await expect(page.getByTestId("autopilot-prepare")).toBeDisabled();
  // Graphic materials show a real rendered thumbnail.
  const thumb = page.locator('[data-testid="autopilot-item"][data-kind="carousel"] img');
  await thumb.scrollIntoViewIfNeeded();
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: "docs/screenshots/autopilot-queue.png", fullPage: true });

  // Approve one non-ad material, reject another.
  const accept = ready.and(page.locator(':not([data-kind="ad_proposal"])')).first();
  const acceptedPos = await accept.locator("span").first().textContent();
  await accept.getByRole("button", { name: "Akceptuj" }).click();
  const acceptedCard = page.getByTestId("autopilot-item").filter({ hasText: acceptedPos! });
  await expect(acceptedCard).toHaveAttribute("data-status", "accepted");
  await ready.first().getByRole("button", { name: "Odrzuć" }).click();
  await expect(page.locator('[data-testid="autopilot-item"][data-status="rejected"]')).toHaveCount(1);

  // Accepted material goes to the planner (status "Gotowe"), not published.
  await page.getByTestId("autopilot-schedule-all").click();
  await expect(acceptedCard).toHaveAttribute("data-status", "scheduled");
  await expect(acceptedCard.getByTestId("autopilot-status")).toHaveText("W planerze");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: "docs/screenshots/autopilot-decided.png", fullPage: true });

  // The plan and its decisions are part of the user's data export.
  const exported = await (await page.request.get("/api/account/export")).json();
  const plans = exported.workspaces[0].autopilotPlans;
  expect(plans).toHaveLength(1);
  expect(plans[0].items).toHaveLength(5);
  expect(plans[0].items.map((i: { status: string }) => i.status).sort()).toEqual(["proposed", "proposed", "ready", "rejected", "scheduled"]);

  // The material opens in its editor.
  await acceptedCard.getByRole("link", { name: "Edytuj" }).click();
  await page.waitForURL(/\/(studio|graphics)\/[0-9a-f-]+$/);
});
