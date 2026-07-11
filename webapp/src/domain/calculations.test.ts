import { describe, it, expect } from "vitest";
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computePortfolioValue,
  computeActualShare,
  computeCompliance,
  computeAverageCompliance,
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
