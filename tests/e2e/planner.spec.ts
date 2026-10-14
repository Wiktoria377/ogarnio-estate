import { test, expect } from "@playwright/test";
import { createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

const warsawToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
const plus = (d: string, n: number) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);

test("planner: 7-day plan, month/week/list/plan views, drag & drop, statuses, manual publish", async ({ page }) => {
  test.setTimeout(180_000);
  await signUpAndConfirm(page, uniqueEmail("plan"), "Planer Testowy");
  await createWorkspace(page, "Biuro Planu Gdańsk");
  const start = plus(warsawToday(), 1);

  await page.goto("/planner?view=plans");
  await expect(page.getByText("Nie masz jeszcze planów")).toBeVisible();
  await page.getByRole("button", { name: "Nowy plan" }).first().click();
  await page.getByRole("dialog").getByLabel("Nazwa").fill("Plan testowy tygodnia");
  await page.getByRole("dialog").getByLabel("Początek").fill(start);
  await page.getByRole("button", { name: "7 dni" }).click();
  await page.getByLabel(/Częstotliwość/).fill("3");
  await page.getByRole("button", { name: "Facebook" }).click(); // only Instagram stays
  await page.getByRole("button", { name: "TikTok" }).click();
  await page.getByRole("button", { name: /Utwórz plan \(3 wpisów\)/ }).click();
  await expect(page.getByText("Utworzono plan: 3 wpisów")).toBeVisible();
  const plan = page.getByTestId("planner-plan");
  await expect(plan).toContainText("Plan testowy tygodnia");
  await expect(plan.getByTestId("planner-entry")).toHaveCount(3);
  await expect(plan).toContainText("Opublikowane 0/3");

  // Month view: entries are on the calendar; drag the first one two days later.
  await page.goto(`/planner?view=month&date=${start}`);
  const entries = page.getByRole("grid").getByTestId("planner-entry");
  await expect(entries).toHaveCount(3);
  const first = entries.first();
  const fromCell = page.locator(`[data-date="${start}"]`);
  await expect(fromCell.getByTestId("planner-entry")).toHaveCount(1);
  const target = plus(start, 2);
  await first.dragTo(page.locator(`[data-date="${target}"]`));
  await expect(page.getByText(/Przeniesiono na/)).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-date="${start}"]`).getByTestId("planner-entry")).toHaveCount(0);

  // Edit an entry: title, time, status → published with a link.
  await page.locator(`[data-date="${target}"]`).getByTestId("planner-entry").first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Tytuł").fill("Karuzela: mieszkanie w Oliwie");
  await dlg.getByLabel("Godzina").fill("19:15");
  await dlg.getByLabel("Status").selectOption("ready");
  await dlg.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByText("Zapisano wpis")).toBeVisible();
  await page.getByText("Karuzela: mieszkanie w Oliwie").click();
  await page.getByRole("button", { name: "Oznacz jako opublikowane" }).click();
  await expect(page.getByText("Oznaczono jako opublikowane")).toBeVisible();

  // Manual entry from the toolbar.
  await page.getByRole("button", { name: "Nowy wpis" }).click();
  await dlg.getByLabel("Tytuł").fill("Newsletter: nowe oferty");
  await dlg.getByLabel("Kanał").selectOption("email");
  await dlg.getByLabel("Data").fill(plus(start, 3));
  await dlg.getByRole("button", { name: "Dodaj wpis" }).click();
  await expect(page.getByText("Dodano wpis do planu")).toBeVisible();

  // Week view.
  await page.goto(`/planner?view=week&date=${target}`);
  await expect(page.getByText("19:15")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/etap2-planner-week.png", fullPage: true });

  // List view: change status inline.
  await page.goto(`/planner?view=list&date=${start}`);
  const rows = page.getByTestId("planner-row");
  await expect(rows).toHaveCount(4);
  await page.getByLabel("Status: Newsletter: nowe oferty").selectOption("for_approval");
  await expect(page.getByText("Status: Do zatwierdzenia")).toBeVisible();
  await page.getByLabel("Filtr statusu").selectOption("published");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Karuzela: mieszkanie w Oliwie");

  // Plan progress reflects manual publishing; persists after reload.
  await page.goto("/planner?view=plans");
  await expect(page.getByTestId("planner-plan")).toContainText("Opublikowane 1/3");
  await page.goto(`/planner?view=month&date=${start}`);
  await page.screenshot({ path: "docs/screenshots/etap2-planner-month.png", fullPage: true });
});
