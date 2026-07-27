import { describe, it, expect } from "vitest";
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computePortfolioValue,
  computeActualShare,
  computeCompliance,
  computeAverageCompliance,
  computeDeviationRub,
  findDeviationExtremes,
  computeDividendYield,
  computeTargetShares,
  computeSharesToBuy,
  computeBuyAmountRub,
  computePairedTargets,
  computeTotalSharesOwned,
} from "./calculations";

describe("computeTargetAllocation", () => {
  it("multiplies index weight by coefficient for an in_index position", () => {
    expect(computeTargetAllocation(9.32, 1.5, "in_index")).toBeCloseTo(13.98);
  });

  it("returns null for an out_of_index position regardless of weight", () => {
    expect(computeTargetAllocation(0, 1.5, "out_of_index")).toBeNull();
  });
});

describe("computePositionValue", () => {
  it("multiplies price by shares owned", () => {
    expect(computePositionValue(92.79, 100)).toBeCloseTo(9279);
  });

  it("treats a null price as 0 instead of throwing", () => {
    expect(computePositionValue(null, 100)).toBe(0);
  });
});

describe("computeIncome", () => {
  it("multiplies dividend per share by shares owned", () => {
    expect(computeIncome(34.84, 10)).toBeCloseTo(348.4);
  });

  it("is 0 when no shares are owned", () => {
    expect(computeIncome(34.84, 0)).toBe(0);
  });
});

describe("computePortfolioValue", () => {
  it("sums price * sharesOwned across all positions, including out-of-index ones", () => {
    const total = computePortfolioValue([
      { price: 100, sharesOwned: 2 },
      { price: 50, sharesOwned: 4 },
      { price: null, sharesOwned: 10 },
    ]);
    expect(total).toBe(400);
  });

  it("is 0 for an empty portfolio", () => {
    expect(computePortfolioValue([])).toBe(0);
  });
});

describe("computeActualShare", () => {
  it("expresses position value as a percentage of total portfolio value", () => {
    expect(computeActualShare(400, 2000)).toBeCloseTo(20);
  });

  it("returns null instead of dividing by zero when the portfolio is empty", () => {
    expect(computeActualShare(0, 0)).toBeNull();
  });
});

describe("computeCompliance", () => {
  it("expresses actual share as a ratio of target allocation", () => {
    expect(computeCompliance(20, 10)).toBe(2);
  });

  it("returns null when target allocation is 0 (out-of-index position)", () => {
    expect(computeCompliance(5, 0)).toBeNull();
  });

  it("returns null when actualShare or targetAllocation is null", () => {
    expect(computeCompliance(null, 10)).toBeNull();
    expect(computeCompliance(5, null)).toBeNull();
  });
});

describe("computeAverageCompliance", () => {
  it("averages only non-null compliance values, regardless of list size", () => {
    expect(computeAverageCompliance([1, 2, null, 3, null])).toBeCloseTo(2);
  });

  it("returns null when every value is null or the list is empty", () => {
    expect(computeAverageCompliance([null, null])).toBeNull();
    expect(computeAverageCompliance([])).toBeNull();
  });
});

describe("computeDeviationRub", () => {
  it("expresses the actual-vs-target share gap in roubles", () => {
    // (15% - 10%) * 1000 / 100 = 50
    expect(computeDeviationRub(15, 10, 1000)).toBeCloseTo(50);
  });

  it("is negative when actual share is below target (shortfall)", () => {
    expect(computeDeviationRub(5, 10, 1000)).toBeCloseTo(-50);
  });

  it("returns null when actualShare is null", () => {
    expect(computeDeviationRub(null, 10, 1000)).toBeNull();
  });

  it("returns null when targetAllocation is null (out-of-index position)", () => {
    expect(computeDeviationRub(15, null, 1000)).toBeNull();
  });
});

describe("findDeviationExtremes", () => {
  it("picks the max as largestSurplus and the min as largestShortfall", () => {
    const deviations = [
      { ticker: "A", deviationRub: 50 },
      { ticker: "B", deviationRub: -80 },
      { ticker: "C", deviationRub: 20 },
    ];
    expect(findDeviationExtremes(deviations)).toEqual({
      largestSurplus: { ticker: "A", deviationRub: 50 },
      largestShortfall: { ticker: "B", deviationRub: -80 },
    });
  });

  it("returns the same single entry for both when there is only one", () => {
    const deviations = [{ ticker: "A", deviationRub: 10 }];
    expect(findDeviationExtremes(deviations)).toEqual({
      largestSurplus: { ticker: "A", deviationRub: 10 },
      largestShortfall: { ticker: "A", deviationRub: 10 },
    });
  });

  it("returns null for both when the list is empty", () => {
    expect(findDeviationExtremes([])).toEqual({ largestSurplus: null, largestShortfall: null });
  });
});

describe("computeDividendYield", () => {
  it("expresses dividend per share as a percentage of price", () => {
    expect(computeDividendYield(2, 40)).toBeCloseTo(5);
  });

  it("returns null when price is 0", () => {
    expect(computeDividendYield(2, 0)).toBeNull();
  });

  it("returns null when price is null (no live price)", () => {
    expect(computeDividendYield(2, null)).toBeNull();
  });

  it("is 0 (not null) when there is no dividend but price is valid", () => {
    expect(computeDividendYield(0, 40)).toBe(0);
  });
});

describe("computeTargetShares", () => {
  it("rounds targetAllocation% of portfolioValue divided by price to whole shares", () => {
    // 50% of 1000 / 100 = 5
    expect(computeTargetShares(50, 1000, 100)).toBe(5);
  });

  it("rounds to the nearest whole share", () => {
    // 60% of 1200 / 100 = 7.2 -> 7
    expect(computeTargetShares(60, 1200, 100)).toBe(7);
  });

  it("returns null when targetAllocation is null (out of index)", () => {
    expect(computeTargetShares(null, 1000, 100)).toBeNull();
  });

  it("returns null when price is null", () => {
    expect(computeTargetShares(50, 1000, null)).toBeNull();
  });

  it("returns null when price is 0", () => {
    expect(computeTargetShares(50, 1000, 0)).toBeNull();
  });
});

describe("computeSharesToBuy", () => {
  it("is targetShares minus sharesOwned when more shares are needed", () => {
    expect(computeSharesToBuy(5, 3)).toBe(2);
  });

  it("is negative when the position already holds more than the target (sell signal)", () => {
    expect(computeSharesToBuy(2, 5)).toBe(-3);
  });

  it("returns null when targetShares is null", () => {
    expect(computeSharesToBuy(null, 3)).toBeNull();
  });
});

describe("computeBuyAmountRub", () => {
  it("multiplies sharesToBuy by price", () => {
    expect(computeBuyAmountRub(2, 100)).toBe(200);
  });

  it("is negative for a sell signal (negative sharesToBuy)", () => {
    expect(computeBuyAmountRub(-3, 50)).toBe(-150);
  });

  it("returns null when sharesToBuy is null", () => {
    expect(computeBuyAmountRub(null, 100)).toBeNull();
  });

  it("returns null when price is null", () => {
    expect(computeBuyAmountRub(2, null)).toBeNull();
  });
});

describe("computePairedTargets", () => {
  const pair = { tickers: ["SBER", "SBERP"], coefficients: { SBER: 2, SBERP: 2 } };

  it("combines indexWeight and value across only the pair's own tickers, ignoring other positions", () => {
    const positions = [
      { ticker: "SBER", indexWeight: 9, status: "in_index" as const, price: 250, sharesOwned: 10 },
      { ticker: "SBERP", indexWeight: 3, status: "in_index" as const, price: 200, sharesOwned: 5 },
      { ticker: "GAZP", indexWeight: 88, status: "in_index" as const, price: 100, sharesOwned: 1 },
    ];
    // targetAllocation = 9*2 + 3*2 = 24
    // combinedActualValueRub = 250*10 + 200*5 = 3500
    // portfolioValue = 3500 (GAZP's 100 excluded on purpose to keep actualShare a round number)
    const result = computePairedTargets(pair, positions, 3500);

    expect(result.targetAllocation).toBe(24);
    expect(result.actualShare).toBeCloseTo(100);
    expect(result.compliance).toBeCloseTo(100 / 24);
  });

  it("treats an out-of-index member's indexWeight as 0 in the combined target but still counts its value", () => {
    const positions = [
      { ticker: "SBER", indexWeight: 9, status: "in_index" as const, price: 250, sharesOwned: 10 },
      { ticker: "SBERP", indexWeight: 3, status: "out_of_index" as const, price: 200, sharesOwned: 5 },
    ];
    // targetAllocation = 9*2 + 0 (SBERP out of index) = 18
    // combinedActualValueRub = 2500 + 1000 = 3500
    const result = computePairedTargets(pair, positions, 3500);

    expect(result.targetAllocation).toBe(18);
    expect(result.actualShare).toBeCloseTo(100);
  });

  it("gives targetAllocation 0 and null compliance when every member is out of index", () => {
    const positions = [
      { ticker: "SBER", indexWeight: 9, status: "out_of_index" as const, price: 250, sharesOwned: 10 },
      { ticker: "SBERP", indexWeight: 3, status: "out_of_index" as const, price: 200, sharesOwned: 5 },
    ];
    const result = computePairedTargets(pair, positions, 3500);

    expect(result.targetAllocation).toBe(0);
    expect(result.compliance).toBeNull();
  });

  it("returns a null actualShare when portfolioValue is 0", () => {
    const positions = [
      { ticker: "SBER", indexWeight: 9, status: "in_index" as const, price: 250, sharesOwned: 10 },
      { ticker: "SBERP", indexWeight: 3, status: "in_index" as const, price: 200, sharesOwned: 5 },
    ];
    const result = computePairedTargets(pair, positions, 0);

    expect(result.actualShare).toBeNull();
    expect(result.compliance).toBeNull();
  });

  it("weights each member's contribution to the combined target by its own coefficient, not a shared one", () => {
    const differentCoeffPair = { tickers: ["SBER", "SBERP"], coefficients: { SBER: 1.15, SBERP: 1.1 } };
    const positions = [
      { ticker: "SBER", indexWeight: 9, status: "in_index" as const, price: 250, sharesOwned: 10 },
      { ticker: "SBERP", indexWeight: 3, status: "in_index" as const, price: 200, sharesOwned: 5 },
    ];
    // targetAllocation = 9*1.15 + 3*1.1 = 10.35 + 3.3 = 13.65
    const result = computePairedTargets(differentCoeffPair, positions, 3500);

    expect(result.targetAllocation).toBeCloseTo(13.65);
  });
});

describe("computeTotalSharesOwned", () => {
  it("returns the manual sharesOwned when there are no broker holdings", () => {
    expect(computeTotalSharesOwned({ sharesOwned: 10, brokerHoldings: [] })).toBe(10);
  });

  it("returns the manual sharesOwned when brokerHoldings is undefined (old file without broker sync)", () => {
    expect(computeTotalSharesOwned({ sharesOwned: 10, brokerHoldings: undefined })).toBe(10);
  });

  it("sums manual shares with every broker holding's shares", () => {
    const position = {
      sharesOwned: 2,
      brokerHoldings: [
        { connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" },
        { connectionId: "conn-2", shares: 5, syncedAt: "2026-01-01" },
      ],
    };
    expect(computeTotalSharesOwned(position)).toBe(17);
  });
});
