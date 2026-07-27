import { expect, test } from "@playwright/test";
import { mockIssRoutes } from "./fixtures/iss";

test("dividend update requests SBER only on click and renders expected income", async ({ page }) => {
  const dividendRequests: string[] = [];
  await mockIssRoutes(page, {
    composition: [{ ticker: "GAZP", weight: 100 }],
    securities: {
      GAZP: { price: 100, lotSize: 1 },
      SBER: { price: 100, lotSize: 1 },
    },
    dividendsByTicker: {
      SBER: [{ registryCloseDate: "2099-01-01", value: 12.5 }],
    },
  });
  page.on("request", (request) => {
    if (/\/securities\/SBER\/dividends\.xml(?:\?|$)/.test(request.url())) {
      dividendRequests.push(request.url());
    }
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
  expect(dividendRequests).toEqual([]);

  await page.getByRole("button", { name: "Дивиденды" }).click();
  await page.getByRole("button", { name: "Обновить дивиденды" }).click();
  await expect.poll(() => dividendRequests.length).toBe(1);
  expect(dividendRequests[0]).toContain("/securities/SBER/dividends.xml");

  const row = page.locator(".dividends-table tbody tr").filter({ hasText: "SBER" });
  await expect(row).toContainText("2099-01-01");
  await expect(row).toContainText("12.5");
  await expect(row).toContainText("10");
  await expect(row).toContainText("125");
  await expect(page.locator(".dividends-table tfoot")).toContainText("125");
});
