import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchBrokerSyncPreview } from "./runBrokerSync";
import { PortfolioFile, BrokerConnection } from "../types";

const TBANK_BASE = "https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const connection: BrokerConnection = {
  id: "conn-1",
  brokerId: "tbank",
  accountId: "acc-1",
  label: "Т-Банк",
  encryptedToken: { ciphertext: "c", iv: "i", salt: "s" },
};

function file(): PortfolioFile {
  return {
    version: 1,
    positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 5, brokerHoldings: [] }],
    sectors: {},
    history: [],
    pairs: [],
    brokerConnections: [connection],
    brokerAccounts: [],
    transactions: [],
  };
}

const securitiesXml = `<?xml version="1.0" encoding="UTF-8"?>
<document>
<data id="securities">
<rows>
<row SECID="NEWTICK" BOARDID="TQBR" SHORTNAME="Новая" PREVPRICE="10" LOTSIZE="1" />
</rows>
</data>
<data id="marketdata">
<rows>
<row SECID="NEWTICK" BOARDID="TQBR" LAST="10.5" />
</rows>
</data>
</document>`;

describe("fetchBrokerSyncPreview integration (real registry, real tbankAdapter, real syncDiff)", () => {
  it("resolves an existing ticker, a new tradeable ticker, and a new untradeable ticker end to end", async () => {
    const tickerByUid: Record<string, string> = {
      "uid-gazp": "GAZP",
      "uid-newtick": "NEWTICK",
      "uid-unknowntick": "UNKNOWNTICK",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === `${TBANK_BASE}.OperationsService/GetPortfolio`) {
          return jsonResponse({
            positions: [
              { figi: "F1", instrumentType: "share", instrumentUid: "uid-gazp", quantity: { units: "10", nano: 500000000 } },
              { figi: "F2", instrumentType: "share", instrumentUid: "uid-newtick", quantity: { units: "3", nano: 0 } },
              { figi: "F3", instrumentType: "share", instrumentUid: "uid-unknowntick", quantity: { units: "7", nano: 0 } },
            ],
          });
        }
        if (url === `${TBANK_BASE}.InstrumentsService/GetInstrumentBy`) {
          const body = JSON.parse(init?.body as string);
          const ticker = tickerByUid[body.id];
          if (!ticker) throw new Error(`unexpected instrumentUid: ${body.id}`);
          return jsonResponse({ instrument: { ticker } });
        }
        if (url.startsWith("https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.xml")) {
          expect(url).toContain("securities=NEWTICK,UNKNOWNTICK");
          return new Response(securitiesXml, { status: 200 });
        }
        throw new Error(`unexpected URL: ${url}`);
      })
    );

    const rows = await fetchBrokerSyncPreview(file(), connection, "my-token");

    expect(rows).toEqual(
      expect.arrayContaining([
        { ticker: "GAZP", status: "existing", previousShares: 0, newShares: 10.5 },
        { ticker: "NEWTICK", status: "new", previousShares: 0, newShares: 3 },
        { ticker: "UNKNOWNTICK", status: "unresolved", previousShares: 0, newShares: 0 },
      ])
    );
    expect(rows).toHaveLength(3);
  });
});
