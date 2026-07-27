import { expect, test } from "@playwright/test";
import { mockIssRoutes } from "./fixtures/iss";

test("successful empty dividend update shows no upcoming dates", async ({ page }) => {
  await mockIssRoutes(page, {
    composition: [{ ticker: "GAZP", weight: 100 }],
    securities: {
      GAZP: { price: 100, lotSize: 1 },
      SBER: { price: 100, lotSize: 1 },
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Начать с пустого портфеля" }).click();
  await page.getByRole("button", { name: "+ Тикер" }).click();

  const dialog = page.getByRole("dialog", { name: "Добавить тикер" });
  await dialog.getByPlaceholder("Тикер").fill("SBER");
  await expect(dialog.getByText(/^найден/)).toBeVisible();
  await dialog.getByPlaceholder("Количество").fill("10");
  await dialog.getByRole("button", { name: "Ок" }).click();
  await expect(page.getByText("SBER").first()).toBeVisible();

  await page.getByRole("button", { name: "Дивиденды" }).click();
  await expect(page.getByText("Нажмите Обновить")).toBeVisible();
  await page.getByRole("button", { name: "Обновить дивиденды" }).click();

  await expect(page.getByText("Ближайших отсечек в ISS нет")).toBeVisible();
  await expect(page.locator(".dividends-table")).toHaveCount(0);
  await expect(page.getByText("Нажмите Обновить")).toHaveCount(0);
});
