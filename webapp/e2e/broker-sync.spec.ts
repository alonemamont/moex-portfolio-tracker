import { test, expect } from "@playwright/test";
import { mockIssRoutes } from "./fixtures/iss";
import { mockTbankRoutes } from "./fixtures/tbank";

test("connect a tbank account, preview the diff, and apply it", async ({ page }) => {
  await mockIssRoutes(page, ["GAZP"]);
  await mockTbankRoutes(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Начать с пустого портфеля" }).click();
  await page.getByRole("button", { name: "Брокеры" }).click();
  await page.getByRole("button", { name: "Добавить подключение" }).click();

  await page.getByPlaceholder("Токен").fill("fake-tbank-token");
  await page.getByRole("button", { name: "Проверить и продолжить" }).click();
  await expect(page.getByPlaceholder("Название подключения")).toBeVisible();

  await page.getByPlaceholder("Название подключения").fill("Мой Т-Банк");
  await page.getByPlaceholder("Пароль-фраза для шифрования токена").fill("test-passphrase-123");
  await page.getByRole("button", { name: "Добавить" }).click();

  await page.getByRole("button", { name: "Синхронизировать" }).click();
  await page.getByPlaceholder("Пароль-фраза").fill("test-passphrase-123");
  await page.getByRole("dialog").getByRole("button", { name: "Ок", exact: true }).click();

  await expect(page.getByText("Синхронизация: Мой Т-Банк")).toBeVisible();
  await expect(page.getByText("GAZP").first()).toBeVisible();

  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByText("Синхронизация: Мой Т-Банк")).not.toBeVisible();
});
