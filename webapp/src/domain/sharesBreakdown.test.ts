import { describe, it, expect } from "vitest";
import { buildSharesBreakdownRows } from "./sharesBreakdown";

describe("buildSharesBreakdownRows", () => {
  it("lists each broker connection's label and shares, then the manual portion", () => {
    const position = {
      manualSharesOwned: 2,
      brokerHoldings: [{ connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" }],
    };
    const labels = new Map([["conn-1", "Т-Банк"]]);

    expect(buildSharesBreakdownRows(position, labels)).toEqual([
      { label: "Т-Банк", shares: 10 },
      { label: "Вручную", shares: 2 },
    ]);
  });

  it("falls back to the raw connectionId when no label is found", () => {
    const position = {
      manualSharesOwned: 0,
      brokerHoldings: [{ connectionId: "conn-unknown", shares: 5, syncedAt: "2026-01-01" }],
    };
    expect(buildSharesBreakdownRows(position, new Map())).toEqual([
      { label: "conn-unknown", shares: 5 },
      { label: "Вручную", shares: 0 },
    ]);
  });

  it("shows only the manual row when there are no broker holdings", () => {
    const position = { manualSharesOwned: 7, brokerHoldings: [] };
    expect(buildSharesBreakdownRows(position, new Map())).toEqual([{ label: "Вручную", shares: 7 }]);
  });

  it("combines multiple broker connections in order", () => {
    const position = {
      manualSharesOwned: 1,
      brokerHoldings: [
        { connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" },
        { connectionId: "conn-2", shares: 5, syncedAt: "2026-01-01" },
      ],
    };
    const labels = new Map([
      ["conn-1", "Т-Банк"],
      ["conn-2", "БКС"],
    ]);
    expect(buildSharesBreakdownRows(position, labels)).toEqual([
      { label: "Т-Банк", shares: 10 },
      { label: "БКС", shares: 5 },
      { label: "Вручную", shares: 1 },
    ]);
  });
});
