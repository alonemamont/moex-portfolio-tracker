import { Page } from "@playwright/test";

export interface IssCompositionEntry {
  ticker: string;
  weight: number;
  shortName?: string;
}

export interface IssSecurityFixture {
  price: number;
  lotSize: number;
  shortName?: string;
}

export interface IssDividendFixture {
  registryCloseDate: string;
  value: number;
}

export interface MockIssRoutesOptions {
  composition?: IssCompositionEntry[];
  securities?: Record<string, IssSecurityFixture>;
  dividendsByTicker?: Record<string, IssDividendFixture[]>;
}

const DEFAULT_COMPOSITION = [{ ticker: "GAZP", weight: 100 }];

function dividendXml(events: IssDividendFixture[] = []): string {
  const rows = events
    .map(
      ({ registryCloseDate, value }) =>
        `<row registryclosedate="${registryCloseDate}" value="${value}" />`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<document><data id="dividends"><rows>${rows}</rows></data></document>`;
}

function compositionXml(composition: IssCompositionEntry[]): string {
  const rows = composition
    .map(
      ({ ticker, weight, shortName = ticker }) =>
        `<row indexid="IMOEX" tradedate="2026-07-09" ticker="${ticker}" shortnames="${shortName}" secids="${ticker}" weight="${weight}" />`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<document><data id="analytics"><rows>${rows}</rows></data></document>`;
}

function securitiesXml(
  tickers: string[],
  securities: Record<string, IssSecurityFixture>
): string {
  const securityRows = tickers
    .map((ticker) => {
      const security = securities[ticker];
      return `<row SECID="${ticker}" BOARDID="TQBR" SHORTNAME="${security.shortName ?? ticker}" PREVPRICE="${security.price}" LOTSIZE="${security.lotSize}" />`;
    })
    .join("\n");
  const marketRows = tickers
    .map((ticker) => {
      const security = securities[ticker];
      return `<row SECID="${ticker}" BOARDID="TQBR" LAST="${security.price}" />`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<document><data id="securities"><rows>${securityRows}</rows></data>
<data id="marketdata"><rows>${marketRows}</rows></data></document>`;
}

export async function mockIssRoutes(
  page: Page,
  options: MockIssRoutesOptions | string[] = ["GAZP"]
): Promise<void> {
  const normalizedOptions = Array.isArray(options)
    ? {
        composition: DEFAULT_COMPOSITION,
        securities: Object.fromEntries(
          ["GAZP", ...options].map((ticker) => [
            ticker.toUpperCase(),
            { price: 101.5, lotSize: 1 },
          ])
        ),
      }
    : options;
  const composition = normalizedOptions.composition ?? DEFAULT_COMPOSITION;
  const securities = Object.fromEntries(
    Object.entries(normalizedOptions.securities ?? {}).map(([ticker, security]) => [
      ticker.toUpperCase(),
      security,
    ])
  ) as Record<string, IssSecurityFixture>;
  const dividendsByTicker = Object.fromEntries(
    Object.entries(normalizedOptions.dividendsByTicker ?? {}).map(([ticker, dividends]) => [
      ticker.toUpperCase(),
      dividends,
    ])
  ) as Record<string, IssDividendFixture[]>;

  await page.route("**/iss.moex.com/iss/**", async (route) => {
    const url = route.request().url();
    const requestedTickers = (new URL(url).searchParams.get("securities") ?? "")
      .split(",")
      .map((ticker) => ticker.trim().toUpperCase())
      .filter((ticker) => ticker !== "" && securities[ticker] !== undefined);

    if (url.includes("/analytics/")) {
      await route.fulfill({ status: 200, body: compositionXml(composition), contentType: "application/xml" });
    } else if (url.includes("securities.xml")) {
      await route.fulfill({ status: 200, body: securitiesXml(requestedTickers, securities), contentType: "application/xml" });
    } else {
      const match = url.match(/\/securities\/([^/]+)\/dividends\.xml(?:\?|$)/);
      if (!match) throw new Error(`Unexpected mocked ISS route: ${url}`);
      const ticker = decodeURIComponent(match[1]).toUpperCase();
      await route.fulfill({
        status: 200,
        body: dividendXml(dividendsByTicker[ticker] ?? []),
        contentType: "application/xml",
      });
    }
  });
}
