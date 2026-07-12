import { describe, it, expect, vi, afterEach } from "vitest";
import { switchIndex } from "./runMarketUpdate";
import * as marketDataModule from "../iss/marketData";
import { PortfolioFile } from "../types";

afterEach(() => vi.restoreAllMocks());

const baseFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 10 }],
  sectors: {},
  history: [{ timestamp: "2026-07-10T00:00:00.000Z", portfolioValue: 100, avgCompliance: 1, snapshot: [] }],
};

describe("switchIndex", () => {
  it("merges the new index's composition into positions without appending a history snapshot", async () => {
    const fetchSpy = vi.spyOn(marketDataModule, "fetchMarketData").mockResolvedValue({
      composition: [
        { ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 12.44 },
        { ticker: "LKOH", shortName: "ЛУКОЙЛ", weight: 16.12 },
      ],
      securities: new Map([
        ["GAZP", { shortName: "ГАЗПРОМ ао", price: 92.79, lotSize: 10 }],
        ["LKOH", { shortName: "ЛУКОЙЛ", price: 7000, lotSize: 1 }],
      ]),
      dividends: new Map([["GAZP", 0], ["LKOH", 0]]),
    });

    const { file: updated, liveByTicker } = await switchIndex(baseFile, new Map(), "MOEXBC");

    expect(fetchSpy).toHaveBeenCalledWith(["GAZP"], "MOEXBC");
    expect(updated.history).toBe(baseFile.history);
    expect(updated.history).toHaveLength(1);
    expect(updated.positions.map((p) => p.ticker)).toEqual(["GAZP", "LKOH"]);
    expect(updated.positions.find((p) => p.ticker === "LKOH")?.sharesOwned).toBe(0);
    expect(updated.positions.find((p) => p.ticker === "GAZP")?.sharesOwned).toBe(10);
    expect(liveByTicker.get("LKOH")?.indexWeight).toBe(16.12);
  });

  it("propagates the underlying fetch error without mutating the file", async () => {
    vi.spyOn(marketDataModule, "fetchMarketData").mockRejectedValue(new Error("ISS down"));
    await expect(switchIndex(baseFile, new Map(), "MOEXBC")).rejects.toThrow("ISS down");
  });
});
