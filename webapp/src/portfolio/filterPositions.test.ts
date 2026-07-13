import { describe, it, expect } from "vitest";
import { filterPositions } from "./filterPositions";
import { CalculatedPosition, Pair } from "../types";

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
    dividendYield: null,
    sharesToBuy: null,
    buyAmountRub: null,
    ...overrides,
  };
}

describe("filterPositions", () => {
  const positions = [
    makePosition({ ticker: "SBER", shortName: "Сбербанк", sharesOwned: 10 }),
    makePosition({ ticker: "GAZP", shortName: "Газпром", sharesOwned: 0 }),
    makePosition({ ticker: "LKOH", shortName: "Лукойл", sharesOwned: 5 }),
  ];
  const noPairs: Pair[] = [];

  it("returns all positions when search is empty and hideEmpty/onlyInIndex are false", () => {
    expect(filterPositions(positions, noPairs, "", false, false)).toHaveLength(3);
  });

  it("filters by ticker substring, case-insensitive", () => {
    const result = filterPositions(positions, noPairs, "sber", false, false);
    expect(result.map((p) => p.ticker)).toEqual(["SBER"]);
  });

  it("filters by shortName substring, case-insensitive", () => {
    const result = filterPositions(positions, noPairs, "газпром", false, false);
    expect(result.map((p) => p.ticker)).toEqual(["GAZP"]);
  });

  it("hides positions with sharesOwned === 0 when hideEmpty is true", () => {
    const result = filterPositions(positions, noPairs, "", true, false);
    expect(result.map((p) => p.ticker)).toEqual(["SBER", "LKOH"]);
  });

  it("combines search and hideEmpty with AND semantics", () => {
    const result = filterPositions(positions, noPairs, "GAZP", true, false);
    expect(result).toHaveLength(0);
  });

  it("treats whitespace-only search as empty", () => {
    expect(filterPositions(positions, noPairs, "   ", false, false)).toHaveLength(3);
  });

  it("keeps only in_index positions when onlyInIndex is true", () => {
    const mixed = [
      makePosition({ ticker: "SBER", status: "in_index" }),
      makePosition({ ticker: "OLD", status: "out_of_index" }),
    ];
    const result = filterPositions(mixed, noPairs, "", false, true);
    expect(result.map((p) => p.ticker)).toEqual(["SBER"]);
  });

  it("combines onlyInIndex with hideEmpty and search using AND semantics", () => {
    const mixed = [
      makePosition({ ticker: "SBER", status: "in_index", sharesOwned: 5 }),
      makePosition({ ticker: "SBERP", status: "out_of_index", sharesOwned: 5 }),
      makePosition({ ticker: "GAZP", status: "in_index", sharesOwned: 0 }),
    ];
    const result = filterPositions(mixed, noPairs, "", true, true);
    expect(result.map((p) => p.ticker)).toEqual(["SBER"]);
  });

  it("pulls in every pair member when at least one member passes its own filters", () => {
    const mixed = [
      makePosition({ ticker: "SBER", status: "in_index", sharesOwned: 10 }),
      makePosition({ ticker: "SBERP", status: "in_index", sharesOwned: 0 }),
      makePosition({ ticker: "GAZP", status: "in_index", sharesOwned: 0 }),
    ];
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficient: 1 }];

    // hideEmpty=true: SBER passes on its own (sharesOwned=10), SBERP would not,
    // but SBERP must be pulled in because it shares a pair with SBER.
    const result = filterPositions(mixed, pairs, "", true, false);
    expect(result.map((p) => p.ticker)).toEqual(["SBER", "SBERP"]);
  });

  it("drops a whole pair when none of its members pass their own filters", () => {
    const mixed = [
      makePosition({ ticker: "SBER", status: "in_index", sharesOwned: 0 }),
      makePosition({ ticker: "SBERP", status: "in_index", sharesOwned: 0 }),
      makePosition({ ticker: "GAZP", status: "in_index", sharesOwned: 10 }),
    ];
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficient: 1 }];

    const result = filterPositions(mixed, pairs, "", true, false);
    expect(result.map((p) => p.ticker)).toEqual(["GAZP"]);
  });

  it("preserves the already-grouped input order of the result", () => {
    const mixed = [
      makePosition({ ticker: "A", sharesOwned: 1 }),
      makePosition({ ticker: "C", sharesOwned: 1 }),
      makePosition({ ticker: "E", sharesOwned: 1 }),
      makePosition({ ticker: "D", sharesOwned: 1 }),
    ];
    const pairs: Pair[] = [{ tickers: ["C", "E"], coefficient: 1 }];

    const result = filterPositions(mixed, pairs, "", false, false);
    expect(result.map((p) => p.ticker)).toEqual(["A", "C", "E", "D"]);
  });
});
