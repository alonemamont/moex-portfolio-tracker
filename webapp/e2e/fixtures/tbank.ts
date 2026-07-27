import { Page } from "@playwright/test";

export async function mockTbankRoutes(page: Page): Promise<void> {
  await page.route("**/invest-public-api.tbank.ru/**", async (route) => {
    const url = route.request().url();
    if (url.includes("UsersService/GetAccounts")) {
      await route.fulfill({ json: { accounts: [{ id: "acc-1", name: "Брокерский счёт" }] } });
    } else if (url.includes("OperationsService/GetPortfolio")) {
      await route.fulfill({
        json: {
          positions: [
            { figi: "FIGI1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "5", nano: 0 } },
          ],
        },
      });
    } else if (url.includes("InstrumentsService/GetInstrumentBy")) {
      await route.fulfill({ json: { instrument: { ticker: "GAZP" } } });
    } else {
      await route.fulfill({ status: 404, body: "unhandled tbank route in test" });
    }
  });
}
