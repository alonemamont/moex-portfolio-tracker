import { describe, it, expect } from "vitest";
import { groupPairedPositions } from "./groupPairedPositions";
import { Pair } from "../types";

function item(ticker: string): { ticker: string } {
  return { ticker };
}

describe("groupPairedPositions", () => {
  it("returns positions unchanged when there are no pairs", () => {
    const positions = [item("A"), item("B"), item("C")];
    expect(groupPairedPositions(positions, [])).toEqual(positions);
  });

  it("moves the second pair member to sit right after the first, per the spec example", () => {
    const positions = [item("A"), item("B"), item("C"), item("D"), item("E")];
    const pairs: Pair[] = [{ tickers: ["C", "E"], coefficients: {} }];

    const result = groupPairedPositions(positions, pairs);

    expect(result.map((p) => p.ticker)).toEqual(["A", "B", "C", "E", "D"]);
  });

  it("orders a pair's members by pair.tickers order, not by their original position order", () => {
    const positions = [item("A"), item("E"), item("B"), item("C"), item("D")];
    const pairs: Pair[] = [{ tickers: ["C", "E"], coefficients: {} }];

    const result = groupPairedPositions(positions, pairs);

    // First-by-original-order member is E (index 1); group sits at E's slot,
    // members ordered per pair.tickers = ["C", "E"] -> C, E.
    expect(result.map((p) => p.ticker)).toEqual(["A", "C", "E", "B", "D"]);
  });

  it("supports pairs with more than two tickers", () => {
    const positions = [item("A"), item("B"), item("C"), item("D")];
    const pairs: Pair[] = [{ tickers: ["D", "B", "A"], coefficients: {} }];

    const result = groupPairedPositions(positions, pairs);

    // First-by-original-order member is A (index 0); group ordered per pair.tickers = D, B, A.
    expect(result.map((p) => p.ticker)).toEqual(["D", "B", "A", "C"]);
  });

  it("handles multiple independent pairs without interference", () => {
    const positions = [item("A"), item("B"), item("C"), item("D")];
    const pairs: Pair[] = [
      { tickers: ["A", "D"], coefficients: {} },
      { tickers: ["C", "B"], coefficients: {} },
    ];

    const result = groupPairedPositions(positions, pairs);

    expect(result.map((p) => p.ticker)).toEqual(["A", "D", "C", "B"]);
  });

  it("leaves a ticker with no matching position out of the emitted group silently", () => {
    const positions = [item("A"), item("B")];
    const pairs: Pair[] = [{ tickers: ["A", "GHOST"], coefficients: {} }];

    const result = groupPairedPositions(positions, pairs);

    expect(result.map((p) => p.ticker)).toEqual(["A", "B"]);
  });

  it("does not throw for an empty position list", () => {
    expect(groupPairedPositions([], [{ tickers: ["A", "B"], coefficients: {} }])).toEqual([]);
  });
});
