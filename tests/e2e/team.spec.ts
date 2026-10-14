import { expect, test } from "@playwright/test";
import { PASSWORD, acceptDialogs, createProperty, createWorkspace, mailLink, signUpAndConfirm, uniqueEmail } from "./helpers";

/**
 * ETAP 3, acceptance 2, 7, 8: onboarding wizard (pause/resume), invitation of a
 * second user by e-mail, acceptance, and role permissions enforced on the
 * server (not only hidden buttons).
 */
test("onboarding wizard + invite agent + server-side role permissions", async ({ page, browser, baseURL }) => {
  const owner = uniqueEmail("owner");
  const agent = uniqueEmail("agent");
  await signUpAndConfirm(page, owner, "Olga Właścicielka");
  await createWorkspace(page, "Biuro Zespołowe Kraków");

  // Wizard: account + office done, logo skipped, colors saved.
  await expect(page.getByTestId("onboarding-progress")).toHaveText("2 z 9");
  await expect(page.getByRole("heading", { name: "Dodaj logo biura" })).toBeVisible();
  await page.getByRole("button", { name: "Pomiń ten krok" }).click();
  await expect(page.getByRole("heading", { name: "Ustaw kolory marki" })).toBeVisible();
  await page.getByRole("button", { name: "Zapisz kolory" }).click();
  await expect(page.getByTestId("onboarding-progress")).toHaveText("4 z 9");
  await expect(page.getByRole("heading", { name: "Dodaj pierwszą ofertę" })).toBeVisible();

  // Pause → dashboard shows the resume card; the wizard resumes at the same step.
  await page.getByRole("button", { name: "Dokończę później" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByTestId("onboarding-resume")).toContainText("4 z 9");
  await page.getByTestId("onboarding-resume").getByRole("link", { name: /Kontynuuj/ }).click();
  await expect(page.getByRole("heading", { name: "Dodaj pierwszą ofertę" })).toBeVisible();

  const ownerProperty = await createProperty(page, "Mieszkanie właściciela na Kazimierzu", ["tests/fixtures/house-1.jpg"]);
  await page.goto("/welcome");
  await expect(page.getByTestId("onboarding-progress")).toHaveText("5 z 9");

  // Invite an agent (SMTP sink captures the e-mail).
  await page.goto("/settings/team");
  await page.getByLabel("E-mail osoby zapraszanej").fill(agent);
  await page.getByLabel("Rola", { exact: true }).selectOption("agent");
  await page.getByRole("button", { name: "Zaproś" }).click();
  await expect(page.getByText(`Wysłano zaproszenie do ${agent}`)).toBeVisible();
  const invite = await mailLink(agent, "/invite/");

  // Agent: new browser, opens the invitation, creates an account on the invited address.
  const ctx2 = await browser.newContext({ baseURL, locale: "pl-PL" });
  const p2 = await ctx2.newPage();
  acceptDialogs(p2);
  await p2.goto(invite);
  await expect(p2.getByText("Biuro Zespołowe Kraków")).toBeVisible();
  await p2.getByRole("link", { name: "Załóż konto" }).click();
  await expect(p2.getByLabel("E-mail służbowy")).toHaveValue(agent);
  await p2.getByLabel("Imię i nazwisko").fill("Adam Agent");
  await p2.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await p2.getByRole("checkbox").check();
  await p2.getByRole("button", { name: "Załóż konto" }).click();
  await expect(p2.getByText("Wysłaliśmy link aktywacyjny")).toBeVisible();
  await p2.goto(await mailLink(agent));
  await p2.waitForURL(/\/invite\//);
  await p2.getByRole("button", { name: "Dołącz do biura" }).click();
  await p2.waitForURL(/\/dashboard\?joined=1/);
  await expect(p2.getByText("Biuro Zespołowe Kraków").first()).toBeVisible();

  // Agent cannot edit the owner's offer (page and server action), cannot manage billing or team.
  await p2.goto(`/properties/${ownerProperty}`);
  await expect(p2.getByRole("link", { name: "Edytuj dane" })).toHaveCount(0);
  const edit = await p2.goto(`/properties/${ownerProperty}/edit`);
  expect(edit?.status()).toBe(404);
  const checkout = await p2.request.post("/api/billing/checkout", { data: { planId: "solo" }, headers: { Origin: baseURL! } });
  expect(checkout.status()).toBe(403);
  await p2.goto("/settings/team");
  await expect(p2.getByLabel("E-mail osoby zapraszanej")).toHaveCount(0);

  // Agent creates their own offer; the agent picker is locked to them.
  await p2.goto("/properties/new");
  await expect(p2.getByLabel("Agent prowadzący")).toBeDisabled();
  const agentProperty = await createProperty(p2, "Dom agenta w Wieliczce", ["tests/fixtures/house-2.jpg"]);
  await expect(p2.getByRole("link", { name: "Edytuj dane" })).toBeVisible();

  // Owner switches the agent to Marketing: offers become read-only for them.
  await page.goto("/settings/team");
  await page.getByLabel("Rola: Adam Agent").selectOption("marketing");
  await expect(page.getByText("Zmieniono rolę na: Marketing")).toBeVisible();
  await p2.goto(`/properties/${agentProperty}`);
  await expect(p2.getByRole("link", { name: "Edytuj dane" })).toHaveCount(0);
  await p2.goto("/properties/new");
  await p2.waitForURL(/\/dashboard\?denied=/);
  await expect(p2.getByTestId("permission-denied")).toBeVisible();

  // Seat limit of the trial (2 users) blocks a third invitation on the server.
  await page.goto("/settings/team");
  await expect(page.getByRole("button", { name: "Zaproś" })).toBeDisabled();

  // Deactivation removes access immediately.
  await page.getByRole("button", { name: "Dezaktywuj" }).click();
  await expect(page.getByText("Dezaktywowano")).toBeVisible();
  await p2.goto("/dashboard");
  await p2.waitForURL(/\/onboarding/);
  await ctx2.close();
});
