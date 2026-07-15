import { test, expect } from "@playwright/test";

test("browser build blocks T-Bank sync and keeps Finam available", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Начать с пустого портфеля" }).click();
  await page.getByRole("button", { name: "Брокеры" }).click();
  await page.getByRole("button", { name: "Добавить подключение" }).click();

  await page.getByPlaceholder("Токен").fill("fake-tbank-token");
  await expect(page.getByRole("button", { name: "Проверить и продолжить" })).toBeDisabled();
  await expect(page.getByText("Синхронизация с Т-Банком доступна в приложении для Windows.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Скачать portable-версию" })).toHaveAttribute(
    "href",
    "https://github.com/alonemamont/moex-portfolio-tracker/releases/latest"
  );

  await page.getByLabel("Брокер", { exact: true }).selectOption("finam");
  await page.getByPlaceholder("Токен").fill("fake-finam-token");
  await expect(page.getByRole("button", { name: "Проверить и продолжить" })).toBeEnabled();
});
