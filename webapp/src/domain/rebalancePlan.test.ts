import { describe, expect, it } from "vitest";
import { collectRebalanceUnits } from "./rebalancePlan";
import { CalculatedPosition, Pair } from "../types";

function pos(partial: Partial<CalculatedPosition> & Pick<CalculatedPosition, "ticker">): CalculatedPosition {
  return {
    coefficient: 1,
    sharesOwned: 0,
    shortName: partial.ticker,
    indexWeight: 0,
    price: 100,
    lotSize: 1,
    dividendPerShare: 0,
    status: "in_index",
    sector: "",
    targetAllocation: 10,
    actualShare: 5,
    compliance: 0.5,
    positionValue: 0,
    income: 0,
    dividendYield: null,
    sharesToBuy: null,
    buyAmountRub: null,
    manualSharesOwned: 0,
    ...partial,
  };
}

describe("collectRebalanceUnits", () => {
  it("builds a solo unit with positive shortfallRub", () => {
    const calculated = [
      pos({
        ticker: "GAZP",
        targetAllocation: 10,
        actualShare: 5,
        price: 200,
        lotSize: 10,
        sharesOwned: 5,
        indexWeight: 10,
        status: "in_index",
      }),
    ];
    // deviationRub = (5-10)*1000/100 = -50 → shortfall 50
    const units = collectRebalanceUnits(calculated, [], 1000);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      unitId: "GAZP",
      kind: "solo",
      shortfallRub: 50,
      representativePrice: 200,
    });
  });

  it("skips overweight solos and out-of-index solos", () => {
    const calculated = [
      pos({ ticker: "FAT", targetAllocation: 10, actualShare: 20, status: "in_index" }),
      pos({ ticker: "OLD", targetAllocation: null, actualShare: 5, status: "out_of_index" }),
    ];
    expect(collectRebalanceUnits(calculated, [], 1000)).toEqual([]);
  });

  it("builds one pair unit from paired members using shared target/actual", () => {
    const pairs: Pair[] = [
      { tickers: ["SBER", "SBERP"], coefficients: { SBER: 1.2, SBERP: 0.8 } },
    ];
    const calculated = [
      pos({
        ticker: "SBER",
        targetAllocation: 12,
        actualShare: 6,
        price: 300,
        lotSize: 1,
        sharesOwned: 10,
        indexWeight: 9,
        status: "in_index",
        coefficient: 1, // ignored for pair collect; pair coefficients used later
      }),
      pos({
        ticker: "SBERP",
        targetAllocation: 12,
        actualShare: 6,
        price: 250,
        lotSize: 1,
        sharesOwned: 5,
        indexWeight: 3,
        status: "in_index",
        coefficient: 1,
      }),
    ];
    const units = collectRebalanceUnits(calculated, pairs, 1000);
    expect(units).toHaveLength(1);
    expect(units[0].unitId).toBe("SBER+SBERP");
    expect(units[0].kind).toBe("pair");
    expect(units[0].shortfallRub).toBe(60); // (6-12)*1000/100 = -60
    expect(units[0].representativePrice).toBe(300);
    expect(units[0].members.map((m) => m.ticker)).toEqual(["SBER", "SBERP"]);
    expect(units[0].members[0].coefficient).toBe(1.2);
    expect(units[0].members[1].coefficient).toBe(0.8);
  });

  it("skips a pair when targetAllocation is 0", () => {
    const pairs: Pair[] = [{ tickers: ["A", "B"], coefficients: { A: 1, B: 1 } }];
    const calculated = [
      pos({ ticker: "A", targetAllocation: 0, actualShare: 0, status: "out_of_index" }),
      pos({ ticker: "B", targetAllocation: 0, actualShare: 0, status: "out_of_index" }),
    ];
    expect(collectRebalanceUnits(calculated, pairs, 1000)).toEqual([]);
  });
});
