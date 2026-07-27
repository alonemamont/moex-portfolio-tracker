import { test, expect } from "@playwright/test";
import { mockIssRoutes } from "./fixtures/iss";

test.beforeEach(async ({ page }) => {
  // Force the input[type=file] + download fallback paths deterministically,
  // instead of the real File System Access picker Playwright can't drive.
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showOpenFilePicker;
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
  });
});

test("start empty, add a ticker, market update runs, and the file downloads", async ({ page }) => {
  // The mocked index composition always seeds GAZP (0 shares) on "start empty",
  // so add a different ticker here to exercise the genuinely-new-ticker path.
  await mockIssRoutes(page, ["SBER"]);
  await page.goto("/");

  await page.getByRole("button", { name: "Начать с пустого портфеля" }).click();

  await expect(page.getByRole("button", { name: "+ Тикер" })).toBeVisible();
  await page.getByRole("button", { name: "+ Тикер" }).click();

  const dialog = page.getByRole("dialog", { name: "Добавить тикер" });
  await dialog.getByPlaceholder("Тикер").fill("SBER");
  await expect(dialog.getByText(/^найден/)).toBeVisible({ timeout: 5000 });
  await dialog.getByPlaceholder("Количество").fill("10");
  await dialog.getByRole("button", { name: "Ок" }).click();

  await expect(page.getByText("SBER").first()).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Сохранить" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("portfolio.json");
});
