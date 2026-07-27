// webapp/src/domain/buildCalculatedPositions.test.ts
import { describe, it, expect } from "vitest";
import { buildCalculatedPositions } from "./buildCalculatedPositions";
import { LiveData, Pair, Position } from "../types";

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

  it("preserves the position's original ticker casing even when liveByTicker is keyed uppercase", () => {
    const positions: Position[] = [{ ticker: "sber", coefficient: 1, sharesOwned: 5 }];
    const liveByTicker = new Map([["SBER", live({ ticker: "SBER", price: 300 })]]);

    const [result] = buildCalculatedPositions(positions, liveByTicker, () => "Финансы");
    expect(result.ticker).toBe("sber");
  });

  it("computes dividendYield as dividendPerShare / price * 100, null when price is missing or 0", () => {
    const positions: Position[] = [
      { ticker: "GAZP", coefficient: 1, sharesOwned: 1 },
      { ticker: "NOPRICE", coefficient: 1, sharesOwned: 1 },
    ];
    const liveByTicker = new Map([
      ["GAZP", live({ ticker: "GAZP", price: 40, dividendPerShare: 2 })],
      ["NOPRICE", live({ ticker: "NOPRICE", price: null, dividendPerShare: 5 })],
    ]);

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Другое");

    expect(result.find((p) => p.ticker === "GAZP")!.dividendYield).toBeCloseTo(5);
    expect(result.find((p) => p.ticker === "NOPRICE")!.dividendYield).toBeNull();
  });

  it("computes sharesToBuy and buyAmountRub from targetAllocation, portfolioValue, price and sharesOwned", () => {
    const positions: Position[] = [
      { ticker: "GAZP", coefficient: 1, sharesOwned: 10 },
      { ticker: "SBER", coefficient: 2, sharesOwned: 5 },
    ];
    const liveByTicker = new Map([
      ["GAZP", live({ ticker: "GAZP", indexWeight: 60, price: 100 })],
      ["SBER", live({ ticker: "SBER", indexWeight: 40, price: 40 })],
    ]);
    // portfolioValue = 10*100 + 5*40 = 1200
    // GAZP: targetAllocation 60, targetShares = round(0.6*1200/100) = 7, sharesToBuy = 7-10 = -3, buyAmountRub = -300
    // SBER: targetAllocation 80, targetShares = round(0.8*1200/40) = 24, sharesToBuy = 24-5 = 19, buyAmountRub = 760

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы");

    const gazp = result.find((p) => p.ticker === "GAZP")!;
    expect(gazp.sharesToBuy).toBe(-3);
    expect(gazp.buyAmountRub).toBe(-300);

    const sber = result.find((p) => p.ticker === "SBER")!;
    expect(sber.sharesToBuy).toBe(19);
    expect(sber.buyAmountRub).toBe(760);
  });

  it("gives an out-of-index position a null sharesToBuy and buyAmountRub", () => {
    const positions: Position[] = [{ ticker: "OLD", coefficient: 1, sharesOwned: 3 }];
    const liveByTicker = new Map([
      ["OLD", live({ ticker: "OLD", status: "out_of_index", indexWeight: 0, price: 50 })],
    ]);

    const [result] = buildCalculatedPositions(positions, liveByTicker, () => "Другое");
    expect(result.sharesToBuy).toBeNull();
    expect(result.buyAmountRub).toBeNull();
  });

  it("combines target allocation, actual share and compliance across paired tickers, overriding each member's own coefficient with the pair's", () => {
    const positions: Position[] = [
      { ticker: "SBER", coefficient: 1, sharesOwned: 10 },
      { ticker: "SBERP", coefficient: 5, sharesOwned: 5 },
    ];
    const liveByTicker = new Map([
      ["SBER", live({ ticker: "SBER", indexWeight: 9, price: 250 })],
      ["SBERP", live({ ticker: "SBERP", indexWeight: 3, price: 200 })],
    ]);
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficients: { SBER: 2, SBERP: 2 } }];
    // portfolioValue = 10*250 + 5*200 = 3500
    // targetAllocation = 9*2 + 3*2 = 24
    // combinedActualValueRub = 3500, actualShare = 100, compliance = 100/24

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы", pairs);

    const sber = result.find((p) => p.ticker === "SBER")!;
    const sberp = result.find((p) => p.ticker === "SBERP")!;
    expect(sber.targetAllocation).toBe(24);
    expect(sberp.targetAllocation).toBe(24);
    expect(sber.actualShare).toBeCloseTo(100);
    expect(sberp.actualShare).toBeCloseTo(100);
    expect(sber.compliance).toBeCloseTo(100 / 24);
    expect(sberp.compliance).toBeCloseTo(100 / 24);
    expect(sber.coefficient).toBe(2);
    expect(sberp.coefficient).toBe(2);
  });

  it("computes each pair member's target shares from its own weight times its own coefficient, independent of the other member", () => {
    const positions: Position[] = [
      { ticker: "SBER", coefficient: 3, sharesOwned: 10 },
      { ticker: "SBERP", coefficient: 7, sharesOwned: 5 },
    ];
    const liveByTicker = new Map([
      ["SBER", live({ ticker: "SBER", indexWeight: 9, price: 250 })],
      ["SBERP", live({ ticker: "SBERP", indexWeight: 3, price: 200 })],
    ]);
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficients: { SBER: 1, SBERP: 1 } }];
    // portfolioValue = 10*250 + 5*200 = 3500
    // SBER: individualTargetAllocation = 9*1 = 9, targetValueRub = 9/100*3500 = 315, targetShares = round(315/250) = 1, sharesToBuy = 1-10 = -9, buyAmountRub = -2250
    // SBERP: individualTargetAllocation = 3*1 = 3, targetValueRub = 3/100*3500 = 105, targetShares = round(105/200) = 1, sharesToBuy = 1-5 = -4, buyAmountRub = -800

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы", pairs);

    const sber = result.find((p) => p.ticker === "SBER")!;
    expect(sber.sharesToBuy).toBe(-9);
    expect(sber.buyAmountRub).toBe(-2250);

    const sberp = result.find((p) => p.ticker === "SBERP")!;
    expect(sberp.sharesToBuy).toBe(-4);
    expect(sberp.buyAmountRub).toBe(-800);
  });

  it("gives pair members independent target shares when their coefficients differ, without one affecting the other", () => {
    const positions: Position[] = [
      { ticker: "SBER", coefficient: 1, sharesOwned: 10 },
      { ticker: "SBERP", coefficient: 1, sharesOwned: 5 },
    ];
    const liveByTicker = new Map([
      ["SBER", live({ ticker: "SBER", indexWeight: 9, price: 250 })],
      ["SBERP", live({ ticker: "SBERP", indexWeight: 3, price: 200 })],
    ]);
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficients: { SBER: 2, SBERP: 1 } }];
    // portfolioValue = 10*250 + 5*200 = 3500
    // SBER: individualTargetAllocation = 9*2 = 18, targetValueRub = 18/100*3500 = 630, targetShares = round(630/250) = 3, sharesToBuy = 3-10 = -7, buyAmountRub = -1750
    // SBERP: individualTargetAllocation = 3*1 = 3, targetValueRub = 3/100*3500 = 105, targetShares = round(105/200) = 1, sharesToBuy = 1-5 = -4, buyAmountRub = -800 (unchanged from the uniform-coefficient case above)

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы", pairs);

    const sber = result.find((p) => p.ticker === "SBER")!;
    expect(sber.sharesToBuy).toBe(-7);
    expect(sber.buyAmountRub).toBe(-1750);

    const sberp = result.find((p) => p.ticker === "SBERP")!;
    expect(sberp.sharesToBuy).toBe(-4);
    expect(sberp.buyAmountRub).toBe(-800);
  });

  it("gives pair members a null sharesToBuy/buyAmountRub, but a 0 (not null) targetAllocation, when the whole pair is out of index", () => {
    const positions: Position[] = [
      { ticker: "OLD1", coefficient: 1, sharesOwned: 3 },
      { ticker: "OLD2", coefficient: 1, sharesOwned: 2 },
    ];
    const liveByTicker = new Map([
      ["OLD1", live({ ticker: "OLD1", status: "out_of_index", indexWeight: 0, price: 50 })],
      ["OLD2", live({ ticker: "OLD2", status: "out_of_index", indexWeight: 0, price: 30 })],
    ]);
    const pairs: Pair[] = [{ tickers: ["OLD1", "OLD2"], coefficients: { OLD1: 1, OLD2: 1 } }];

    const [old1] = buildCalculatedPositions(positions, liveByTicker, () => "Другое", pairs);

    expect(old1.targetAllocation).toBe(0);
    expect(old1.sharesToBuy).toBeNull();
    expect(old1.buyAmountRub).toBeNull();
  });

  it("leaves a ticker outside any pair on the normal per-ticker calculation, unaffected by an unrelated pair", () => {
    const positions: Position[] = [
      { ticker: "SBER", coefficient: 1, sharesOwned: 10 },
      { ticker: "SBERP", coefficient: 1, sharesOwned: 5 },
      { ticker: "GAZP", coefficient: 2, sharesOwned: 1 },
    ];
    const liveByTicker = new Map([
      ["SBER", live({ ticker: "SBER", indexWeight: 9, price: 250 })],
      ["SBERP", live({ ticker: "SBERP", indexWeight: 3, price: 200 })],
      ["GAZP", live({ ticker: "GAZP", indexWeight: 5, price: 100 })],
    ]);
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficients: { SBER: 1, SBERP: 1 } }];

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы", pairs);

    const gazp = result.find((p) => p.ticker === "GAZP")!;
    expect(gazp.targetAllocation).toBe(10); // 5 * 2, unaffected by the pair
    expect(gazp.coefficient).toBe(2);
  });
});

describe("buildCalculatedPositions — broker holdings", () => {
  it("adds broker holdings on top of the manual sharesOwned for positionValue/income/sharesToBuy, and exposes manualSharesOwned separately", () => {
    const positions: Position[] = [
      {
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 2,
        brokerHoldings: [{ connectionId: "conn-1", shares: 8, syncedAt: "2026-01-01" }],
      },
    ];
    const liveByTicker = new Map([
      ["GAZP", live({ ticker: "GAZP", indexWeight: 100, price: 100, dividendPerShare: 1 })],
    ]);

    const [result] = buildCalculatedPositions(positions, liveByTicker, () => "Финансы");

    expect(result.manualSharesOwned).toBe(2);
    expect(result.sharesOwned).toBe(10);
    expect(result.positionValue).toBe(1000);
    expect(result.income).toBe(10);
  });

  it("treats a position with no brokerHoldings field the same as an empty array (old files)", () => {
    const positions: Position[] = [{ ticker: "GAZP", coefficient: 1, sharesOwned: 5 }];
    const liveByTicker = new Map([["GAZP", live({ ticker: "GAZP", price: 10 })]]);

    const [result] = buildCalculatedPositions(positions, liveByTicker, () => "Финансы");

    expect(result.sharesOwned).toBe(5);
    expect(result.manualSharesOwned).toBe(5);
  });
});
