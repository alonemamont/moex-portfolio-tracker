import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchTbankAccounts, fetchTbankPortfolio, resolveTbankTicker, quantityToShares } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    })
  );
}

describe("fetchTbankAccounts", () => {
  it("posts to UsersService/GetAccounts with a bearer token and returns the accounts array", async () => {
    mockFetchOnce({ accounts: [{ id: "acc-1", name: "Брокерский счёт" }] });

    const accounts = await fetchTbankAccounts("my-token");

    expect(accounts).toEqual([{ id: "acc-1", name: "Брокерский счёт" }]);
    expect(fetch).toHaveBeenCalledWith(
      "https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer my-token" }),
        body: JSON.stringify({}),
      })
    );
  });

  it("throws when the response is not ok", async () => {
    mockFetchOnce({}, false, 401);
    await expect(fetchTbankAccounts("bad-token")).rejects.toThrow(/401/);
  });
});

describe("fetchTbankPortfolio", () => {
  it("posts accountId and currency, returns the positions array", async () => {
    mockFetchOnce({
      positions: [
        { figi: "BBG1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "10", nano: 0 } },
      ],
    });

    const positions = await fetchTbankPortfolio("my-token", "acc-1");

    expect(positions).toEqual([
      { figi: "BBG1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "10", nano: 0 } },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.OperationsService/GetPortfolio",
      expect.objectContaining({
        body: JSON.stringify({ accountId: "acc-1", currency: "RUB" }),
      })
    );
  });
});

describe("resolveTbankTicker", () => {
  it("resolves an instrumentUid to a ticker", async () => {
    mockFetchOnce({ instrument: { ticker: "GAZP" } });
    const ticker = await resolveTbankTicker("my-token", "uid-1");
    expect(ticker).toBe("GAZP");
  });

  it("returns null instead of throwing when resolution fails", async () => {
    mockFetchOnce({}, false, 404);
    const ticker = await resolveTbankTicker("my-token", "unknown-uid");
    expect(ticker).toBeNull();
  });
});

describe("quantityToShares", () => {
  it("converts units+nano to a plain number", () => {
    expect(quantityToShares({ units: "10", nano: 0 })).toBe(10);
  });

  it("adds the fractional nano part", () => {
    expect(quantityToShares({ units: "1", nano: 500000000 })).toBeCloseTo(1.5);
  });
});
