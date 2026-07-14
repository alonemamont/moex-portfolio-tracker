import { Page } from "@playwright/test";

const COMPOSITION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<document><data id="analytics"><rows>
<row indexid="IMOEX" tradedate="2026-07-09" ticker="GAZP" shortnames="ГАЗПРОМ ао" secids="GAZP" weight="9.32" />
</rows></data></document>`;

function securitiesXml(ticker: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<document>
<data id="securities"><rows><row SECID="${ticker}" BOARDID="TQBR" SHORTNAME="${ticker} ао" PREVPRICE="100" LOTSIZE="1" /></rows></data>
<data id="marketdata"><rows><row SECID="${ticker}" BOARDID="TQBR" LAST="101.5" /></rows></data>
</document>`;
}

const EMPTY_DIVIDENDS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<document><data id="dividends"><rows></rows></data></document>`;

export async function mockIssRoutes(page: Page, tickers: string[] = ["GAZP"]): Promise<void> {
  await page.route("**/iss.moex.com/iss/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/analytics/")) {
      await route.fulfill({ status: 200, body: COMPOSITION_XML, contentType: "application/xml" });
    } else if (url.includes("securities.xml")) {
      const requested = tickers.find((t) => url.includes(t)) ?? tickers[0];
      await route.fulfill({ status: 200, body: securitiesXml(requested), contentType: "application/xml" });
    } else {
      await route.fulfill({ status: 200, body: EMPTY_DIVIDENDS_XML, contentType: "application/xml" });
    }
  });
}
