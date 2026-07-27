import { expect, test } from "@playwright/test";
import { mockIssRoutes } from "./fixtures/iss";

test("dividends disable update when portfolio has only zero-share positions", async ({ page }) => {
  await mockIssRoutes(page, {
    composition: [{ ticker: "GAZP", weight: 100 }],
    securities: { GAZP: { price: 100, lotSize: 1 } },
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Начать с пустого портфеля" }).click();
  await page.getByRole("button", { name: "Дивиденды" }).click();

  await expect(page.getByRole("button", { name: "Обновить дивиденды" })).toBeDisabled();
  await expect(page.getByText("Нет позиций с акциями")).toBeVisible();
});
