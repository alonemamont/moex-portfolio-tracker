import { describe, it, expect, vi } from "vitest";
import { finamAdapter } from "./adapter";
import * as client from "./client";

describe("finamAdapter.listAccounts", () => {
  it("exchanges the secret for a JWT, lists account ids, and maps them to BrokerAccount", async () => {
    vi.spyOn(client, "exchangeFinamSecret").mockResolvedValue("jwt-abc");
    vi.spyOn(client, "fetchFinamAccountIds").mockResolvedValue(["acc-1", "acc-2"]);

    const accounts = await finamAdapter.listAccounts("my-secret");

    expect(accounts).toEqual([
      { id: "acc-1", name: "acc-1" },
      { id: "acc-2", name: "acc-2" },
    ]);
    expect(client.exchangeFinamSecret).toHaveBeenCalledWith("my-secret");
    expect(client.fetchFinamAccountIds).toHaveBeenCalledWith("jwt-abc");
  });
});

describe("finamAdapter.fetchHoldings", () => {
  it("keeps only EQUITIES positions, uses the resolved ticker, and parses the quantity", async () => {
    vi.spyOn(client, "exchangeFinamSecret").mockResolvedValue("jwt-abc");
    vi.spyOn(client, "fetchFinamAccountDetails").mockResolvedValue({
      account_id: "acc-1",
      positions: [
        { symbol: "SBER@MISX", quantity: { value: "10.0" } },
        { symbol: "RU000A106R95@MISX", quantity: { value: "5.0" } },
      ],
    });
    vi.spyOn(client, "resolveFinamAsset").mockImplementation(async (_jwt, symbol, accId) => {
      expect(accId).toBe("acc-1");
      return symbol === "SBER@MISX"
        ? { ticker: "SBER", type: "EQUITIES" }
        : { ticker: "RU000A106R95", type: "BONDS" };
    });

    const holdings = await finamAdapter.fetchHoldings("my-secret", "acc-1");

    expect(holdings).toEqual([{ ticker: "SBER", shares: 10 }]);
  });

  it("drops a position whose asset fails to resolve", async () => {
    vi.spyOn(client, "exchangeFinamSecret").mockResolvedValue("jwt-abc");
    vi.spyOn(client, "fetchFinamAccountDetails").mockResolvedValue({
      account_id: "acc-1",
      positions: [{ symbol: "SBER@MISX", quantity: { value: "10.0" } }],
    });
    vi.spyOn(client, "resolveFinamAsset").mockResolvedValue(null);

    const holdings = await finamAdapter.fetchHoldings("my-secret", "acc-1");
    expect(holdings).toEqual([]);
  });
});
