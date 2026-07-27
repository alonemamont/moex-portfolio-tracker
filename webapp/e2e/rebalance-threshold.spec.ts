import { expect, test } from "@playwright/test";
import { mockIssRoutes } from "./fixtures/iss";

test("min-trades preserves an explicitly entered zero threshold", async ({ page }) => {
  await mockIssRoutes(page, {
    composition: [{ ticker: "TST", weight: 100 }],
    securities: {
      TST: { price: 100, lotSize: 1 },
      CSH: { price: 1000, lotSize: 1 },
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Начать с пустого портфеля" }).click();
  await page.getByRole("button", { name: "+ Тикер" }).click();

  const dialog = page.getByRole("dialog", { name: "Добавить тикер" });
  await dialog.getByPlaceholder("Тикер").fill("CSH");
  await expect(dialog.getByText(/^найден/)).toBeVisible();
  await dialog.getByPlaceholder("Количество").fill("100");
  await dialog.getByRole("button", { name: "Ок" }).click();
  await expect(page.getByText("CSH").first()).toBeVisible();

  await page.getByRole("button", { name: "Ребаланс" }).click();
  await page.getByRole("button", { name: "Мин. сделок" }).click();
  await page.getByLabel("Сумма, ₽").fill("100");

  const threshold = page.getByLabel("Порог прироста");
  await expect(threshold).toHaveValue("0.01");
  await expect(page.getByText("Порог прироста соответствия не достигнут")).toBeVisible();
  await expect(page.locator(".rebalance-table tbody tr")).toHaveCount(0);

  await threshold.fill("0");
  await expect(threshold).toHaveValue("0");
  const row = page.locator(".rebalance-table tbody tr").filter({ hasText: "TST" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("TST");
});
