import { describe, it, expect } from "vitest";
import { filterPositions } from "./filterPositions";
import { CalculatedPosition } from "../types";

function makePosition(overrides: Partial<CalculatedPosition>): CalculatedPosition {
  return {
    ticker: "SBER",
    shortName: "Сбербанк",
    coefficient: 1,
    sharesOwned: 0,
    indexWeight: 1,
    price: 100,
    lotSize: 10,
    dividendPerShare: 0,
    status: "in_index",
    sector: "Финансы",
    targetAllocation: 1,
    actualShare: 1,
    compliance: 1,
    positionValue: 0,
    income: 0,
    ...overrides,
  };
}

describe("filterPositions", () => {
  const positions = [
    makePosition({ ticker: "SBER", shortName: "Сбербанк", sharesOwned: 10 }),
    makePosition({ ticker: "GAZP", shortName: "Газпром", sharesOwned: 0 }),
    makePosition({ ticker: "LKOH", shortName: "Лукойл", sharesOwned: 5 }),
  ];

  it("returns all positions when search is empty and hideEmpty is false", () => {
    expect(filterPositions(positions, "", false)).toHaveLength(3);
  });

  it("filters by ticker substring, case-insensitive", () => {
    const result = filterPositions(positions, "sber", false);
    expect(result.map((p) => p.ticker)).toEqual(["SBER"]);
  });

  it("filters by shortName substring, case-insensitive", () => {
    const result = filterPositions(positions, "газпром", false);
    expect(result.map((p) => p.ticker)).toEqual(["GAZP"]);
  });

  it("hides positions with sharesOwned === 0 when hideEmpty is true", () => {
    const result = filterPositions(positions, "", true);
    expect(result.map((p) => p.ticker)).toEqual(["SBER", "LKOH"]);
  });

  it("combines search and hideEmpty with AND semantics", () => {
    const result = filterPositions(positions, "GAZP", true);
    expect(result).toHaveLength(0);
  });

  it("treats whitespace-only search as empty", () => {
    expect(filterPositions(positions, "   ", false)).toHaveLength(3);
  });
});
