import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

const MAIL_DIR = process.env.E2E_MAIL_DIR ?? "/home/claude/stack/mail";

/** Reads the newest captured e-mail for an address and returns the first link. */
export async function mailLink(to: string, contains = "verify"): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const files = readdirSync(MAIL_DIR).filter((f) => f.endsWith(`-${to}.eml`)).sort();
    const last = files.at(-1);
    if (last) {
      const raw = readFileSync(path.join(MAIL_DIR, last), "utf8").replace(/=\r?\n/g, "").replace(/=3D/g, "=");
      const m = raw.match(/https?:\/\/[^\s"'<>]+/g)?.find((u) => u.includes(contains));
      if (m) return m.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no mail for ${to}`);
}

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}@example.com`;
}

export const PASSWORD = "Bezpieczne-Haslo-2026";

/** Accepts native confirm dialogs (e.g. the one-time media-rights confirmation on first upload). */
const withDialogs = new WeakSet<Page>();
export function acceptDialogs(page: Page) {
  if (withDialogs.has(page)) return;
  withDialogs.add(page);
  page.on("dialog", (d) => void d.accept().catch(() => undefined));
}

export async function signUpAndConfirm(page: Page, email: string, name: string) {
  acceptDialogs(page);
  await page.goto("/signup");
  await page.getByLabel("Imię i nazwisko").fill(name);
  await page.getByLabel("E-mail służbowy").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await expect(page.getByText("Wysłaliśmy link aktywacyjny")).toBeVisible();
  const link = await mailLink(email);
  await page.goto(link);
  await page.waitForURL(/\/onboarding/);
}

/** Creates an office; lands on the onboarding wizard (or, with brand: true, on the branding page). */
export async function createWorkspace(page: Page, name: string, opts: { brand?: boolean } = {}) {
  await page.getByLabel("Nazwa biura").fill(name);
  await page.getByRole("button", { name: "Utwórz biuro" }).click();
  await page.waitForURL(/\/welcome/);
  if (opts.brand) await page.goto("/brand?welcome=1");
}

export async function login(page: Page, email: string) {
  acceptDialogs(page);
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/);
}

/** Creates a property with photos and returns its id. */
export async function createProperty(page: Page, title = "Mieszkanie z balkonem na Mokotowie", photos = ["tests/fixtures/house-1.jpg", "tests/fixtures/house-2.jpg", "tests/fixtures/house-3.jpg"]) {
  await page.goto("/properties/new");
  await page.getByLabel("Nazwa oferty").fill(title);
  await page.getByLabel("Miasto").fill("Warszawa");
  await page.getByLabel("Powierzchnia (m²)").fill("54,5");
  await page.getByLabel("Liczba pokoi").fill("3");
  await page.locator("#price").fill("899000");
  await page.getByRole("button", { name: "Zapisz i dodaj zdjęcia" }).click();
  await page.waitForURL(/\/properties\/[0-9a-f-]+\?created=1/);
  const id = /properties\/([0-9a-f-]+)/.exec(page.url())![1]!;
  if (photos.length) {
    await page.locator('input[type="file"]').setInputFiles(photos);
    await expect(page.getByAltText(`Zdjęcie ${photos.length}`)).toBeVisible();
  }
  return id;
}
