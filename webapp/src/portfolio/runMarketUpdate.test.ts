import { describe, it, expect, vi, afterEach } from "vitest";
import { mergeCompletedMarketUpdate, runMarketUpdate } from "./runMarketUpdate";
import * as marketDataModule from "../iss/marketData";
import { PortfolioFile, LiveData } from "../types";

afterEach(() => vi.restoreAllMocks());

const baseFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 10 }],
  sectors: {},
  history: [],
  pairs: [],
  brokerConnections: [],
  brokerAccounts: [],
  transactions: [],
};

describe("mergeCompletedMarketUpdate", () => {
  it("keeps concurrent broker connections, broker accounts, and transactions from the latest file", () => {
    const latest: PortfolioFile = {
      ...baseFile,
      brokerConnections: [
        {
          id: "conn-1",
          brokerId: "tbank",
          accountId: "acc-1",
          label: "Т-Банк",
          encryptedToken: { ciphertext: "c", iv: "i", salt: "s" },
        },
      ],
      brokerAccounts: [{ id: "account-1", name: "Broker" }],
      transactions: [
        {
          id: "transaction-1",
          type: "deposit",
          amount: 1000,
          currency: "RUB",
          date: "2026-07-13",
          accountId: "account-1",
        },
      ],
    };
    const completedMarketUpdate: PortfolioFile = {
      ...baseFile,
      history: [
        {
          timestamp: "2026-07-13T10:00:00.000Z",
          portfolioValue: 1000,
          avgCompliance: null,
          snapshot: [],
        },
      ],
    };

    const merged = mergeCompletedMarketUpdate(latest, completedMarketUpdate);

    expect(merged.brokerConnections).toEqual(latest.brokerConnections);
    expect(merged.brokerAccounts).toEqual(latest.brokerAccounts);
    expect(merged.transactions).toEqual(latest.transactions);
    expect(merged.history).toEqual(completedMarketUpdate.history);
  });
});

describe("runMarketUpdate", () => {
  it("merges fresh market data into positions and appends a history snapshot", async () => {
    vi.spyOn(marketDataModule, "fetchMarketData").mockResolvedValue({
      composition: [{ ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 }],
      securities: new Map([["GAZP", { shortName: "ГАЗПРОМ ао", price: 92.79, lotSize: 10 }]]),
      dividends: new Map([["GAZP", 0]]),
    });

    const { file: updated, liveByTicker } = await runMarketUpdate(baseFile);

    expect(updated.positions).toEqual(baseFile.positions);
    expect(updated.history).toHaveLength(1);
    expect(updated.history[0].portfolioValue).toBeCloseTo(927.9);
    expect(updated.sectors).toEqual(baseFile.sectors);
    expect(liveByTicker.get("GAZP")?.price).toBe(92.79);
  });

  it("propagates the underlying fetch error without mutating the file", async () => {
    vi.spyOn(marketDataModule, "fetchMarketData").mockRejectedValue(new Error("ISS down"));
    await expect(runMarketUpdate(baseFile)).rejects.toThrow("ISS down");
  });

  it("threads previousLiveByTicker into the merge so a ticker missing from securities keeps its last known price", async () => {
    vi.spyOn(marketDataModule, "fetchMarketData").mockResolvedValue({
      composition: [],
      securities: new Map(),
      dividends: new Map([["GAZP", 0]]),
    });
    const previousLiveByTicker = new Map<string, LiveData>([
      [
        "GAZP",
        {
          ticker: "GAZP",
          shortName: "ГАЗПРОМ ао",
          indexWeight: 0,
          price: 92.79,
          lotSize: 10,
          dividendPerShare: 0,
          status: "out_of_index",
        },
      ],
    ]);

    const { liveByTicker } = await runMarketUpdate(baseFile, previousLiveByTicker);

    expect(liveByTicker.get("GAZP")?.price).toBe(92.79);
  });

  it("forwards the given indexId to fetchMarketData, defaulting to IMOEX", async () => {
    const fetchSpy = vi.spyOn(marketDataModule, "fetchMarketData").mockResolvedValue({
      composition: [],
      securities: new Map(),
      dividends: new Map(),
    });

    await runMarketUpdate(baseFile);
    expect(fetchSpy).toHaveBeenLastCalledWith(["GAZP"], "IMOEX");

    await runMarketUpdate(baseFile, new Map(), "MOEXBC");
    expect(fetchSpy).toHaveBeenLastCalledWith(["GAZP"], "MOEXBC");
  });
});
