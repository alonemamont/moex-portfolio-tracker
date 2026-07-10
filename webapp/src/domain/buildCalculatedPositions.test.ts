// webapp/src/domain/buildCalculatedPositions.test.ts
import { describe, it, expect } from "vitest";
import { buildCalculatedPositions } from "./buildCalculatedPositions";
import { LiveData, Position } from "../types";

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

describe("buildCalculatedPositions", () => {
  it("computes target allocation, actual share, compliance, value and income together", () => {
    const positions: Position[] = [
      { ticker: "GAZP", coefficient: 1, sharesOwned: 10 },
      { ticker: "SBER", coefficient: 2, sharesOwned: 5 },
    ];
    const liveByTicker = new Map([
      ["GAZP", live({ ticker: "GAZP", indexWeight: 60, price: 100, dividendPerShare: 1 })],
      ["SBER", live({ ticker: "SBER", indexWeight: 40, price: 40, dividendPerShare: 2 })],
    ]);

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы");

    // portfolioValue = 10*100 + 5*40 = 1200
    const gazp = result.find((p) => p.ticker === "GAZP")!;
    expect(gazp.positionValue).toBe(1000);
    expect(gazp.targetAllocation).toBe(60);
    expect(gazp.actualShare).toBeCloseTo((1000 / 1200) * 100);
    expect(gazp.compliance).toBeCloseTo(gazp.actualShare! / 60);
    expect(gazp.income).toBe(10);
    expect(gazp.sector).toBe("Финансы");
  });

  it("gives an out-of-index position a null target allocation and compliance but a real position value", () => {
    const positions: Position[] = [{ ticker: "OLD", coefficient: 1, sharesOwned: 3 }];
    const liveByTicker = new Map([
      ["OLD", live({ ticker: "OLD", status: "out_of_index", indexWeight: 0, price: 50, dividendPerShare: 0 })],
    ]);

    const [result] = buildCalculatedPositions(positions, liveByTicker, () => "Другое");
    expect(result.targetAllocation).toBeNull();
    expect(result.compliance).toBeNull();
    expect(result.positionValue).toBe(150);
  });

  it("does not throw for an empty position list", () => {
    expect(buildCalculatedPositions([], new Map(), () => "Другое")).toEqual([]);
  });
});
