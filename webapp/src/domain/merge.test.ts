import { describe, it, expect } from "vitest";
import { mergeMarketData } from "./merge";

describe("mergeMarketData", () => {
  it("updates a matched ticker and marks it in_index", () => {
    const result = mergeMarketData(
      [{ ticker: "GAZP", coefficient: 1.2, sharesOwned: 50 }],
      [{ ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 }],
      new Map([["GAZP", { shortName: "ГАЗПРОМ ао", price: 92.79, lotSize: 10 }]]),
      new Map([["GAZP", 0]])
    );
    expect(result.positions).toEqual([{ ticker: "GAZP", coefficient: 1.2, sharesOwned: 50 }]);
    expect(result.liveByTicker.get("GAZP")).toEqual({
      ticker: "GAZP",
      shortName: "ГАЗПРОМ ао",
      indexWeight: 9.32,
      price: 92.79,
      lotSize: 10,
      dividendPerShare: 0,
      status: "in_index",
    });
  });

  it("keeps a position that dropped out of the index, zeroes its weight, but still updates price/dividend", () => {
    const result = mergeMarketData(
      [{ ticker: "OLD", coefficient: 1, sharesOwned: 10 }],
      [],
      new Map([["OLD", { shortName: "Старая", price: 55, lotSize: 1 }]]),
      new Map([["OLD", 2.5]])
    );
    expect(result.positions).toEqual([{ ticker: "OLD", coefficient: 1, sharesOwned: 10 }]);
    const live = result.liveByTicker.get("OLD")!;
    expect(live.status).toBe("out_of_index");
    expect(live.indexWeight).toBe(0);
    expect(live.price).toBe(55);
    expect(live.dividendPerShare).toBe(2.5);
  });

  it("appends a new ticker from the index with default coefficient 1 and sharesOwned 0", () => {
    const result = mergeMarketData(
      [],
      [{ ticker: "NEW", shortName: "Новая", weight: 1 }],
      new Map([["NEW", { shortName: "Новая", price: 10, lotSize: 1 }]]),
      new Map([["NEW", 0]])
    );
    expect(result.positions).toEqual([{ ticker: "NEW", coefficient: 1, sharesOwned: 0 }]);
    expect(result.liveByTicker.get("NEW")?.status).toBe("in_index");
  });

  it("matches tickers case-insensitively and does not duplicate on repeat updates", () => {
    const first = mergeMarketData(
      [{ ticker: "sber", coefficient: 1, sharesOwned: 5 }],
      [{ ticker: "SBER", shortName: "Сбербанк", weight: 5 }],
      new Map([["SBER", { shortName: "Сбербанк", price: 300, lotSize: 1 }]]),
      new Map([["SBER", 0]])
    );
    const second = mergeMarketData(
      first.positions,
      [{ ticker: "SBER", shortName: "Сбербанк", weight: 5 }],
      new Map([["SBER", { shortName: "Сбербанк", price: 305, lotSize: 1 }]]),
      new Map([["SBER", 0]])
    );
    expect(second.positions).toHaveLength(1);
    expect(second.positions[0]).toEqual({ ticker: "sber", coefficient: 1, sharesOwned: 5 });
  });

  it("falls back to the previous known price when a ticker is entirely absent from securities (fully delisted)", () => {
    const previousLiveByTicker = new Map([
      [
        "DELISTED",
        {
          ticker: "DELISTED",
          shortName: "Делистнутая",
          indexWeight: 0,
          price: 42,
          lotSize: 1,
          dividendPerShare: 0,
          status: "out_of_index" as const,
        },
      ],
    ]);
    const result = mergeMarketData(
      [{ ticker: "DELISTED", coefficient: 1, sharesOwned: 5 }],
      [],
      new Map(),
      new Map([["DELISTED", 0]]),
      previousLiveByTicker
    );
    const live = result.liveByTicker.get("DELISTED")!;
    expect(live.price).toBe(42);
    expect(live.status).toBe("out_of_index");
  });
});
