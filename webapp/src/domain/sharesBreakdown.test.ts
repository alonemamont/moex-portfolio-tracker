import { describe, it, expect } from "vitest";
import { buildSharesBreakdownTooltip } from "./sharesBreakdown";

describe("buildSharesBreakdownTooltip", () => {
  it("lists each broker connection's label and shares, then the manual portion, then the total", () => {
    const position = {
      manualSharesOwned: 2,
      sharesOwned: 12,
      brokerHoldings: [{ connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" }],
    };
    const labels = new Map([["conn-1", "Т-Банк"]]);

    expect(buildSharesBreakdownTooltip(position, labels)).toBe("Т-Банк: 10, Вручную: 2 = 12");
  });

  it("falls back to the raw connectionId when no label is found", () => {
    const position = {
      manualSharesOwned: 0,
      sharesOwned: 5,
      brokerHoldings: [{ connectionId: "conn-unknown", shares: 5, syncedAt: "2026-01-01" }],
    };
    expect(buildSharesBreakdownTooltip(position, new Map())).toBe("conn-unknown: 5, Вручную: 0 = 5");
  });

  it("shows only the manual portion when there are no broker holdings", () => {
    const position = { manualSharesOwned: 7, sharesOwned: 7, brokerHoldings: [] };
    expect(buildSharesBreakdownTooltip(position, new Map())).toBe("Вручную: 7 = 7");
  });

  it("combines multiple broker connections in order", () => {
    const position = {
      manualSharesOwned: 1,
      sharesOwned: 16,
      brokerHoldings: [
        { connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" },
        { connectionId: "conn-2", shares: 5, syncedAt: "2026-01-01" },
      ],
    };
    const labels = new Map([
      ["conn-1", "Т-Банк"],
      ["conn-2", "БКС"],
    ]);
    expect(buildSharesBreakdownTooltip(position, labels)).toBe("Т-Банк: 10, БКС: 5, Вручную: 1 = 16");
  });
});
