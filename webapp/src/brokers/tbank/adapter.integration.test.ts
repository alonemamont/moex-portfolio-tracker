import { describe, it, expect, vi, afterEach } from "vitest";
import { tbankAdapter } from "./adapter";

const BASE = "https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("tbankAdapter integration (real client, mocked fetch only)", () => {
  it("listAccounts: full chain to GetAccounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === `${BASE}.UsersService/GetAccounts`) {
          expect(init?.method).toBe("POST");
          expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer my-token");
          return jsonResponse({ accounts: [{ id: "acc-1", name: "Брокерский" }] });
        }
        throw new Error(`unexpected URL: ${url}`);
      })
    );

    const accounts = await tbankAdapter.listAccounts("my-token");

    expect(accounts).toEqual([{ id: "acc-1", name: "Брокерский" }]);
  });

  it("fetchHoldings: filters to shares, resolves ticker, converts units+nano, drops failed resolve", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === `${BASE}.OperationsService/GetPortfolio`) {
          expect(JSON.parse(init?.body as string)).toEqual({ accountId: "acc-1", currency: "RUB" });
          return jsonResponse({
            positions: [
              {
                figi: "F1",
                instrumentType: "share",
                instrumentUid: "uid-1",
                quantity: { units: "10", nano: 500000000 },
              },
              {
                figi: "F2",
                instrumentType: "bond",
                instrumentUid: "uid-2",
                quantity: { units: "5", nano: 0 },
              },
              {
                figi: "F3",
                instrumentType: "share",
                instrumentUid: "uid-3",
                quantity: { units: "1", nano: 0 },
              },
            ],
          });
        }
        if (url === `${BASE}.InstrumentsService/GetInstrumentBy`) {
          const body = JSON.parse(init?.body as string);
          if (body.id === "uid-1") return jsonResponse({ instrument: { ticker: "GAZP" } });
          if (body.id === "uid-3") return jsonResponse({}, 500);
          throw new Error(`unexpected instrumentUid: ${body.id}`);
        }
        throw new Error(`unexpected URL: ${url}`);
      })
    );

    const holdings = await tbankAdapter.fetchHoldings("my-token", "acc-1");

    expect(holdings).toEqual([{ ticker: "GAZP", shares: 10.5 }]);
  });
});
