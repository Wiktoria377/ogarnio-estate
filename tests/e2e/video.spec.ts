import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { createProperty, createWorkspace, signUpAndConfirm, uniqueEmail } from "./helpers";

// System ffprobe, or the one shipped with Remotion's compositor.
const FFPROBE = existsSync("/usr/bin/ffprobe") ? "/usr/bin/ffprobe" : "node_modules/@remotion/compositor-linux-x64-gnu/ffprobe";

test("video studio: AI script → edit → approve → MP4 render → download", async ({ page }) => {
  test.setTimeout(600_000);
  await signUpAndConfirm(page, uniqueEmail("reel"), "Wideo Testowe");
  await createWorkspace(page, "Biuro Wideo Łódź");
  const property = await createProperty(page);

  // Wizard: 10 s film (2 photo scenes), two photos picked in order, cinematic style.
  await page.goto(`/video/new?property=${property}`);
  await page.getByRole("button", { name: /^10 s/ }).click();
  const photos = page.getByRole("button", { name: /^Zdjęcie/ });
  await photos.nth(2).click();
  await photos.nth(0).click();
  await page.getByRole("button", { name: /Kinowy premium/ }).click();
  await page.getByRole("button", { name: "Napisz scenariusz" }).click();
  await page.waitForURL(/\/video\/[0-9a-f-]+$/, { timeout: 60_000 });
  const id = page.url().split("/").pop()!;

  await expect(page.getByText("Scenariusz czeka na akceptację")).toBeVisible();
  await expect(page.getByTestId("video-scene")).toHaveCount(2);
  await expect(page.getByTestId("reel-preview").locator("div").first()).toBeVisible();

  // Edit texts and scene order.
  await page.getByLabel("Hak (pierwsza sekunda)").fill("Twoje nowe mieszkanie");
  await page.getByLabel("Nagłówek sceny 1").fill("Jasny salon");
  await page.getByLabel("Nagłówek sceny 2").fill("Balkon od podwórza");
  await page.getByRole("button", { name: "Scena 2 wcześniej" }).click();
  await expect(page.getByLabel("Nagłówek sceny 1")).toHaveValue("Balkon od podwórza");
  await page.getByLabel("Ruch kamery w scenie 1").selectOption("pan_left");

  // Music: own file with rights confirmation.
  await page.getByLabel("Plik muzyki").setInputFiles("tests/fixtures/tone.wav");
  await page.getByLabel("Nazwa utworu").fill("Dżingiel biura");
  await expect(page.getByRole("button", { name: "Dodaj utwór" })).toBeDisabled();
  await page.getByText("Potwierdzam, że biuro ma prawo").click();
  await page.getByRole("button", { name: "Dodaj utwór" }).click();
  await expect(page.getByText("Dodano utwór do biblioteki biura")).toBeVisible();
  await expect(page.getByLabel("Utwór")).toHaveValue(/[0-9a-f-]{36}/);

  // Approve (also saves), then render through the job queue.
  await page.getByRole("button", { name: /Zatwierdź scenariusz/ }).click();
  await expect(page.getByText("Scenariusz zatwierdzony", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Renderuj MP4" }).click();
  await expect(page.getByText("Render MP4 dodany do kolejki")).toBeVisible();
  await expect(page.getByTestId("rendered-video")).toBeVisible({ timeout: 420_000 });
  await page.screenshot({ path: "docs/screenshots/etap2-video-editor.png", fullPage: true });

  // Download the MP4 and inspect it.
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Pobierz MP4/ }).click()]);
  const file = (await dl.path())!;
  const bytes = readFileSync(file);
  expect(bytes.subarray(4, 8).toString()).toBe("ftyp");
  const probe = JSON.parse(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration", "-of", "json", file], { encoding: "utf8" })) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string }[]; format: { duration: string } };
  const video = probe.streams.find((s) => s.codec_type === "video")!;
  expect(video.codec_name).toBe("h264");
  expect([video.width, video.height]).toEqual([1080, 1920]);
  expect(video.r_frame_rate).toBe("30/1");
  expect(probe.streams.some((s) => s.codec_type === "audio")).toBe(true);
  expect(Math.abs(Number(probe.format.duration) - 10)).toBeLessThan(0.3);

  // Range requests work for the player.
  const range = await page.request.get(`/api/video/${id}/file`, { headers: { Range: "bytes=0-99" } });
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(100);

  // After reload the edits persist; the library shows the video.
  await page.reload();
  await expect(page.getByLabel("Nagłówek sceny 1")).toHaveValue("Balkon od podwórza");
  await page.goto("/video");
  await expect(page.getByText("MP4 · v")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/etap2-video-list.png", fullPage: true });
});
