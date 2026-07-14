import { describe, it, expect, vi } from "vitest";
import { tbankAdapter } from "./adapter";
import * as client from "./client";

describe("tbankAdapter.listAccounts", () => {
  it("maps raw T-Invest accounts to BrokerAccount", async () => {
    vi.spyOn(client, "fetchTbankAccounts").mockResolvedValue([{ id: "acc-1", name: "ИИС" }]);
    const accounts = await tbankAdapter.listAccounts("token");
    expect(accounts).toEqual([{ id: "acc-1", name: "ИИС" }]);
  });
});

describe("tbankAdapter.fetchHoldings", () => {
  it("keeps only share positions, resolves each to a ticker, and converts quantity to shares", async () => {
    vi.spyOn(client, "fetchTbankPortfolio").mockResolvedValue([
      { figi: "BBG1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "10", nano: 0 } },
      { figi: "BBG2", instrumentType: "bond", instrumentUid: "uid-2", quantity: { units: "5", nano: 0 } },
    ]);
    vi.spyOn(client, "resolveTbankTicker").mockImplementation(async (_token, uid) =>
      uid === "uid-1" ? "GAZP" : null
    );

    const holdings = await tbankAdapter.fetchHoldings("token", "acc-1");

    expect(holdings).toEqual([{ ticker: "GAZP", shares: 10 }]);
  });

  it("drops a position whose ticker fails to resolve", async () => {
    vi.spyOn(client, "fetchTbankPortfolio").mockResolvedValue([
      { figi: "BBG1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "10", nano: 0 } },
    ]);
    vi.spyOn(client, "resolveTbankTicker").mockResolvedValue(null);

    const holdings = await tbankAdapter.fetchHoldings("token", "acc-1");
    expect(holdings).toEqual([]);
  });
});
