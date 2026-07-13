import { describe, it, expect } from "vitest";
import { computeCalculatedPositionsResult } from "./useCalculatedPositions";
import { LiveData, PortfolioFile } from "../types";

function live(overrides: Partial<LiveData> & { ticker: string }): LiveData {
  return {
    shortName: overrides.ticker,
    indexWeight: 0,
    price: null,
    lotSize: null,
    dividendPerShare: 0,
    status: "in_index",
    ...overrides,
  };
}

function file(overrides: Partial<PortfolioFile> = {}): PortfolioFile {
  return { version: 1, positions: [], sectors: {}, history: [], pairs: [], ...overrides };
}

describe("computeCalculatedPositionsResult", () => {
  it("returns empty defaults when there is no file", () => {
    expect(computeCalculatedPositionsResult(null, new Map())).toEqual({
      calculated: [],
      portfolioValue: 0,
      avgCompliance: null,
      largestSurplus: null,
      largestShortfall: null,
    });
  });

  it("computes portfolioValue and avgCompliance from the calculated positions", () => {
    const f = file({
      positions: [
        { ticker: "GAZP", coefficient: 1, sharesOwned: 10 },
        { ticker: "SBER", coefficient: 2, sharesOwned: 5 },
      ],
    });
    const liveByTicker = new Map([
      ["GAZP", live({ ticker: "GAZP", indexWeight: 60, price: 100 })],
      ["SBER", live({ ticker: "SBER", indexWeight: 40, price: 40 })],
    ]);

    const result = computeCalculatedPositionsResult(f, liveByTicker);

    expect(result.calculated).toHaveLength(2);
    expect(result.portfolioValue).toBe(1200); // 10*100 + 5*40
    expect(result.avgCompliance).not.toBeNull();
  });

  it("gives a null avgCompliance when every position is out of index", () => {
    const f = file({ positions: [{ ticker: "OLD", coefficient: 1, sharesOwned: 3 }] });
    const liveByTicker = new Map([
      ["OLD", live({ ticker: "OLD", status: "out_of_index", price: 50 })],
    ]);

    const result = computeCalculatedPositionsResult(f, liveByTicker);
    expect(result.avgCompliance).toBeNull();
    expect(result.portfolioValue).toBe(150);
  });

  it("resolves sectors via file.sectors overrides falling back to defaults", () => {
    const f = file({
      positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 1 }],
      sectors: { GAZP: "Своё" },
    });
    const liveByTicker = new Map([["GAZP", live({ ticker: "GAZP" })]]);

    const [result] = computeCalculatedPositionsResult(f, liveByTicker).calculated;
    expect(result.sector).toBe("Своё");
  });

  it("computes largestSurplus and largestShortfall from actual-vs-target deviation", () => {
    const f = file({
      positions: [
        { ticker: "GAZP", coefficient: 1, sharesOwned: 10 },
        { ticker: "SBER", coefficient: 1, sharesOwned: 1 },
      ],
    });
    const liveByTicker = new Map([
      ["GAZP", live({ ticker: "GAZP", indexWeight: 90, price: 100 })],
      ["SBER", live({ ticker: "SBER", indexWeight: 10, price: 100 })],
    ]);
    // portfolioValue = 1000 + 100 = 1100
    // GAZP: actualShare ≈ 90.9%, target 90% -> small surplus
    // SBER: actualShare ≈ 9.1%, target 10% -> small shortfall

    const result = computeCalculatedPositionsResult(f, liveByTicker);

    expect(result.largestSurplus?.ticker).toBe("GAZP");
    expect(result.largestShortfall?.ticker).toBe("SBER");
  });

  it("groups a pair into a single combined deviation entry labeled 'TICKER1+TICKER2', counted once for the extremes", () => {
    const f = file({
      positions: [
        { ticker: "SBER", coefficient: 1, sharesOwned: 10 },
        { ticker: "SBERP", coefficient: 1, sharesOwned: 5 },
        { ticker: "GAZP", coefficient: 1, sharesOwned: 1 },
      ],
      pairs: [{ tickers: ["SBER", "SBERP"], coefficient: 1 }],
    });
    const liveByTicker = new Map([
      ["SBER", live({ ticker: "SBER", indexWeight: 9, price: 250 })],
      ["SBERP", live({ ticker: "SBERP", indexWeight: 3, price: 200 })],
      ["GAZP", live({ ticker: "GAZP", indexWeight: 88, price: 10 })],
    ]);
    // portfolioValue = 2500 + 1000 + 10 = 3510
    // pair: combinedIndexWeight = 12, targetAllocation = 12, actualShare = 3500/3510*100 ≈ 99.7 -> large surplus
    // GAZP: targetAllocation = 88, actualShare = 10/3510*100 ≈ 0.28 -> large shortfall

    const result = computeCalculatedPositionsResult(f, liveByTicker);

    expect(result.largestSurplus?.ticker).toBe("SBER+SBERP");
    expect(result.largestShortfall?.ticker).toBe("GAZP");
  });
});
