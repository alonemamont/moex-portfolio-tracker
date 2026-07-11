// webapp/src/iss/marketData.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchMarketData } from "./marketData";
import * as client from "./client";

afterEach(() => vi.restoreAllMocks());

describe("fetchMarketData", () => {
  it("unions existing portfolio tickers with the fresh index composition before fetching securities/dividends", async () => {
    vi.spyOn(client, "fetchIndexComposition").mockResolvedValue([
      { ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 },
    ]);
    const securitiesSpy = vi
      .spyOn(client, "fetchSecurities")
      .mockResolvedValue(new Map([["GAZP", { shortName: "ГАЗПРОМ ао", price: 92.79, lotSize: 10 }]]));
    const dividendsSpy = vi
      .spyOn(client, "fetchDividendsForTickers")
      .mockResolvedValue(new Map([["GAZP", 0]]));

    const result = await fetchMarketData(["DELISTED"]);

    expect(securitiesSpy).toHaveBeenCalledWith(expect.arrayContaining(["GAZP", "DELISTED"]));
    expect(dividendsSpy).toHaveBeenCalledWith(expect.arrayContaining(["GAZP", "DELISTED"]));
    expect(result.composition).toHaveLength(1);
  });

  it("propagates a composition failure without calling securities/dividends", async () => {
    vi.spyOn(client, "fetchIndexComposition").mockRejectedValue(new Error("network down"));
    const securitiesSpy = vi.spyOn(client, "fetchSecurities");

    await expect(fetchMarketData([])).rejects.toThrow("network down");
    expect(securitiesSpy).not.toHaveBeenCalled();
  });

  it("propagates a securities failure (all-or-nothing)", async () => {
    vi.spyOn(client, "fetchIndexComposition").mockResolvedValue([]);
    vi.spyOn(client, "fetchSecurities").mockRejectedValue(new Error("securities down"));
    vi.spyOn(client, "fetchDividendsForTickers").mockResolvedValue(new Map());

    await expect(fetchMarketData([])).rejects.toThrow("securities down");
  });
});
