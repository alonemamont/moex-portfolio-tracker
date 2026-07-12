import { describe, it, expect } from "vitest";
import { createHistorySnapshot } from "./createHistorySnapshot";
import { CalculatedPosition } from "../types";

function calc(overrides: Partial<CalculatedPosition> & { ticker: string }): CalculatedPosition {
  return {
    coefficient: 1,
    sharesOwned: 0,
    shortName: overrides.ticker,
    indexWeight: 0,
    price: null,
    lotSize: null,
    dividendPerShare: 0,
    status: "in_index",
    sector: "Другое",
    targetAllocation: null,
    actualShare: null,
    compliance: null,
    positionValue: 0,
    income: 0,
    dividendYield: null,
    sharesToBuy: null,
    buyAmountRub: null,
    ...overrides,
  };
}

describe("createHistorySnapshot", () => {
  it("captures per-ticker price/weight/status and portfolio-level aggregates", () => {
    const positions = [
      calc({ ticker: "GAZP", price: 92.79, indexWeight: 9.32, status: "in_index", compliance: 1.1 }),
      calc({ ticker: "OLD", price: 10, indexWeight: 0, status: "out_of_index", compliance: null }),
    ];

    const snapshot = createHistorySnapshot(positions, 1234.5, "2026-07-10T09:00:00Z");

    expect(snapshot.timestamp).toBe("2026-07-10T09:00:00Z");
    expect(snapshot.portfolioValue).toBe(1234.5);
    expect(snapshot.avgCompliance).toBeCloseTo(1.1);
    expect(snapshot.snapshot).toEqual([
      { ticker: "GAZP", price: 92.79, weight: 9.32, status: "in_index" },
      { ticker: "OLD", price: 10, weight: 0, status: "out_of_index" },
    ]);
  });

  it("defaults timestamp to the current time when not provided", () => {
    const before = Date.now();
    const snapshot = createHistorySnapshot([], 0);
    const after = Date.now();
    const parsed = new Date(snapshot.timestamp).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});
