import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createProperty, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

test("carousel from a property: AI copy, edit, save, PNG + ZIP, persists after reload", async ({ page }) => {
  test.setTimeout(240_000);
  await signUpAndConfirm(page, uniqueEmail("gfx"), "Grafik Testowy");
  await createWorkspace(page, "Grafika Nieruchomości");
  const propertyId = await createProperty(page);

  await page.goto(`/graphics/new?property=${propertyId}&format=carousel`);
  await page.getByRole("button", { name: /Łuk premium/ }).click();
  await page.getByRole("button", { name: "Utwórz i edytuj" }).click();
  await page.waitForURL(/\/graphics\/[0-9a-f-]+$/);
  const preview = page.getByTestId("graphic-preview");
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1080);
  // Fact slots come from the record, never from AI.
  await expect(page.locator("#slot-price")).toHaveValue(/899\s?000/);
  await expect(page.getByRole("button", { name: /^Slajd \d+:/ })).toHaveCount(6);

  // AI copy (offline test provider in CI) fills creative slots only and autosaves.
  await page.getByRole("button", { name: "Teksty z AI" }).click();
  await page.getByRole("button", { name: "Generuj teksty" }).click();
  await expect(page.getByText(/Wstawiono teksty z AI/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#slot-price")).toHaveValue(/899\s?000/);
  await expect(page.locator("#slot-title")).not.toHaveValue("");

  // On-canvas editing on the cover: select, drag, inline text, resize, hide/unhide.
  await expect(page.getByText("Odświeżam podgląd")).toHaveCount(0, { timeout: 30_000 });
  const title = page.locator('[data-element="title"]');
  await title.click();
  await expect(page.getByTestId("element-panel")).toBeVisible();
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 - 20, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 - 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("element-panel")).toContainText(/Przesunięcie: [1-9]\d* × -[1-9]\d* px/);
  await expect(page.getByText("Odświeżam podgląd")).toHaveCount(0, { timeout: 30_000 });
  await page.locator('[data-element="title"]').dblclick();
  const inline = page.getByRole("textbox", { name: /Edytuj: Nagłówek/ });
  await inline.fill("Słoneczne mieszkanie na Mokotowie");
  await inline.press("Control+Enter");
  await expect(page.locator("#slot-title")).toHaveValue("Słoneczne mieszkanie na Mokotowie");
  await page.getByLabel("Rozmiar elementu").fill("1.2");
  await page.getByLabel("Czcionka elementu").selectOption({ index: 2 });
  await page.getByRole("button", { name: "Ukryj" }).click();
  await expect(page.getByText("Ukryte na tym slajdzie:")).toBeVisible();
  await page.getByRole("button", { name: "Nagłówek", exact: true }).click();
  await expect(page.getByText("Ukryte na tym slajdzie:")).toHaveCount(0);
  // Undo restores the previous step.
  await page.getByRole("button", { name: /Cofnij/ }).click();
  await expect(page.getByText("Ukryte na tym slajdzie:")).toBeVisible();
  await page.getByRole("button", { name: /Ponów/ }).click();
  await expect(page.getByText("Ukryte na tym slajdzie:")).toHaveCount(0);
  // Photo crop: zoom slider on the cover photo.
  await page.locator('[data-element="photo0"]').click({ position: { x: 10, y: 10 } });
  await page.getByLabel("Powiększenie zdjęcia").fill("1.4");
  await expect(page.getByTestId("element-panel")).toContainText("140%");

  // Manual edit on slide 3 + new slide.
  await page.getByRole("button", { name: /^Slajd 3:/ }).click();
  await page.locator("#slot-title").fill("Co zyskujesz na co dzień");
  await page.getByRole("button", { name: "Dodaj" }).click();
  await page.getByRole("menuitem", { name: "Kontakt i CTA" }).click();
  await expect(page.getByRole("button", { name: /^Slajd \d+:/ })).toHaveCount(7);
  await page.getByRole("button", { name: "Duplikuj slajd" }).click();
  await expect(page.getByRole("button", { name: /^Slajd \d+:/ })).toHaveCount(8);
  await page.getByRole("button", { name: "Usuń slajd" }).click();
  await expect(page.getByRole("button", { name: /^Slajd \d+:/ })).toHaveCount(7);
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByText("Zapisano nową wersję grafiki")).toBeVisible();

  // PNG of the current slide.
  await page.getByRole("button", { name: "Pobierz" }).click();
  const [png] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Slajd 4 \(PNG\)/ }).click()]);
  const pngBytes = readFileSync((await png.path())!);
  expect(pngBytes.subarray(1, 4).toString()).toBe("PNG");
  expect(pngBytes.readUInt32BE(16)).toBe(1080);
  expect(pngBytes.readUInt32BE(20)).toBe(1350);

  await page.getByRole("button", { name: "Pobierz" }).click();
  const [jpg] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Slajd 4 \(JPG\)/ }).click()]);
  const jpgBytes = readFileSync((await jpg.path())!);
  expect(jpgBytes[0]).toBe(0xff);
  expect(jpgBytes[1]).toBe(0xd8);

  await page.getByRole("button", { name: "Pobierz" }).click();
  const [zip] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /ZIP, PNG/ }).click()]);
  expect(zip.suggestedFilename()).toMatch(/\.zip$/);
  expect(readFileSync((await zip.path())!).subarray(0, 2).toString()).toBe("PK");

  await page.getByRole("button", { name: "Pobierz" }).click();
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /PDF/ }).click()]);
  const pdfBytes = readFileSync((await pdf.path())!);
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect((pdfBytes.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBe(7);

  // Reload: everything persisted, versions recorded.
  await page.reload();
  await expect(page.getByRole("button", { name: /^Slajd \d+:/ })).toHaveCount(7);
  await page.getByRole("button", { name: /^Slajd 3:/ }).click();
  await expect(page.locator("#slot-title")).toHaveValue("Co zyskujesz na co dzień");
  await page.getByRole("tab", { name: "Wersje" }).click();
  await expect(page.getByText("Teksty z AI")).toBeVisible();
  await page.getByRole("tab", { name: "Treść" }).click();
  await expect(page.getByTestId("graphic-preview")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Odświeżam podgląd")).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "docs/screenshots/graphics-editor.png", fullPage: true });

  // The cover keeps the canvas edits after reload.
  await page.getByRole("button", { name: /^Slajd 1:/ }).click();
  await expect(page.locator("#slot-title")).toHaveValue("Słoneczne mieszkanie na Mokotowie");

  // Save the look as an office template and start a new graphic from it.
  await page.getByRole("button", { name: "Więcej" }).click();
  await page.getByRole("menuitem", { name: "Zapisz jako szablon biura" }).click();
  await page.getByLabel("Nazwa szablonu").fill("Karuzela premium E2E");
  await page.getByRole("button", { name: "Zapisz szablon" }).click();
  await expect(page.getByText("Zapisano szablon „Karuzela premium E2E”")).toBeVisible();
  await page.goto(`/graphics/new?property=${propertyId}`);
  await expect(page.getByText("Szablony Twojego biura")).toBeVisible();
  await page.getByRole("button", { name: /Karuzela premium E2E/ }).click();
  await page.getByRole("button", { name: "Utwórz i edytuj" }).click();
  await page.waitForURL(/\/graphics\/[0-9a-f-]+$/);
  await expect(page.getByRole("button", { name: /^Slajd \d+:/ })).toHaveCount(7);
  await expect(page.locator("#slot-price")).toHaveValue(/899\s?000/);

  await page.goto("/graphics");
  await expect(page.getByRole("img").first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/graphics-gallery.png", fullPage: true });
});
