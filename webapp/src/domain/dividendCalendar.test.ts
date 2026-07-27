import { describe, expect, it } from "vitest";
import {
  buildUpcomingDividendRows,
  localTodayISO,
  mergeDividendSnapshot,
  normalizeTicker,
  ownedTickersWithShares,
  parseDividendHistoryRows,
  resolveDividendEmptyReason,
  sumExpectedIncome,
} from "./dividendCalendar";

describe("normalizeTicker", () => {
  it("trims and uppercases", () => {
    expect(normalizeTicker(" sber ")).toBe("SBER");
  });
});

describe("parseDividendHistoryRows", () => {
  it("keeps valid rows sorted by date asc", () => {
    const events = parseDividendHistoryRows("sber", [
      { registryclosedate: "2025-07-18", value: "34.84" },
      { registryclosedate: "2024-07-11", value: "33.3" },
    ]);
    expect(events).toEqual([
      { ticker: "SBER", registryCloseDate: "2024-07-11", valuePerShare: 33.3 },
      { ticker: "SBER", registryCloseDate: "2025-07-18", valuePerShare: 34.84 },
    ]);
  });

  it("drops bad dates, non-finite, and non-positive values", () => {
    const events = parseDividendHistoryRows("GAZP", [
      { registryclosedate: "2024-02-31", value: "10" },
      { registryclosedate: "not-a-date", value: "10" },
      { registryclosedate: "2026-07-01", value: "abc" },
      { registryclosedate: "2026-07-01", value: "0" },
      { registryclosedate: "2026-07-01", value: "-1" },
      { registryclosedate: "2026-07-02", value: "5" },
    ]);
    expect(events).toEqual([{ ticker: "GAZP", registryCloseDate: "2026-07-02", valuePerShare: 5 }]);
  });

  it("dedupes by date|value and treats empty input as success []", () => {
    expect(parseDividendHistoryRows("SBER", [])).toEqual([]);
    const events = parseDividendHistoryRows("SBER", [
      { registryclosedate: "2026-07-18", value: "34.84" },
      { registryclosedate: "2026-07-18", value: "34.84" },
      { registryclosedate: "2026-07-18", value: "10" },
    ]);
    expect(events).toEqual([
      { ticker: "SBER", registryCloseDate: "2026-07-18", valuePerShare: 10 },
      { ticker: "SBER", registryCloseDate: "2026-07-18", valuePerShare: 34.84 },
    ]);
  });
});

describe("ownedTickersWithShares", () => {
  it("includes broker holdings in total shares and normalizes tickers", () => {
    expect(
      ownedTickersWithShares([
        { ticker: " sber ", coefficient: 1, sharesOwned: 0, brokerHoldings: [{ connectionId: "c", shares: 10, syncedAt: "t" }] },
        { ticker: "GAZP", coefficient: 1, sharesOwned: 0 },
        { ticker: "LKOH", coefficient: 1, sharesOwned: 5 },
      ])
    ).toEqual(["SBER", "LKOH"]);
  });
});

describe("mergeDividendSnapshot", () => {
  const previous = [
    { ticker: "SBER", registryCloseDate: "2026-08-01", valuePerShare: 30 },
    { ticker: "GAZP", registryCloseDate: "2026-09-01", valuePerShare: 10 },
    { ticker: "OLD", registryCloseDate: "2026-10-01", valuePerShare: 1 },
  ];

  it("replaces succeeded ticker tape, keeps failed, drops not-owned", () => {
    const eventsByTicker = new Map([
      ["SBER", [{ ticker: "SBER", registryCloseDate: "2026-11-01", valuePerShare: 40 }]],
    ]);
    const merged = mergeDividendSnapshot({
      previous,
      ownedNow: ["SBER", "GAZP"],
      eventsByTicker,
      succeededTickers: ["SBER"],
    });
    expect(merged).toEqual([
      { ticker: "GAZP", registryCloseDate: "2026-09-01", valuePerShare: 10 },
      { ticker: "SBER", registryCloseDate: "2026-11-01", valuePerShare: 40 },
    ]);
  });
});

describe("buildUpcomingDividendRows", () => {
  it("includes today, excludes yesterday, computes income and yield", () => {
    const rows = buildUpcomingDividendRows({
      today: "2026-07-27",
      events: [
        { ticker: "SBER", registryCloseDate: "2026-07-26", valuePerShare: 10 },
        { ticker: "SBER", registryCloseDate: "2026-07-27", valuePerShare: 20 },
        { ticker: "GAZP", registryCloseDate: "2026-08-01", valuePerShare: 5 },
      ],
      positions: [
        { ticker: "sber", sharesOwned: 2, price: 100 },
        { ticker: "GAZP", sharesOwned: 10, price: null },
      ],
    });
    expect(rows).toEqual([
      {
        ticker: "SBER",
        registryCloseDate: "2026-07-27",
        valuePerShare: 20,
        sharesOwned: 2,
        expectedIncome: 40,
        eventYieldPct: 20,
      },
      {
        ticker: "GAZP",
        registryCloseDate: "2026-08-01",
        valuePerShare: 5,
        sharesOwned: 10,
        expectedIncome: 50,
        eventYieldPct: null,
      },
    ]);
    expect(sumExpectedIncome(rows)).toBe(90);
  });

  it("returns null yield for zero or negative price", () => {
    const rows = buildUpcomingDividendRows({
      today: "2026-07-27",
      events: [{ ticker: "SBER", registryCloseDate: "2026-07-27", valuePerShare: 10 }],
      positions: [{ ticker: "SBER", sharesOwned: 1, price: 0 }],
    });
    expect(rows[0].eventYieldPct).toBeNull();
  });

  it("hides events for tickers with sharesOwned 0 after join", () => {
    const rows = buildUpcomingDividendRows({
      today: "2026-07-27",
      events: [{ ticker: "SBER", registryCloseDate: "2026-07-27", valuePerShare: 10 }],
      positions: [{ ticker: "SBER", sharesOwned: 0, price: 100 }],
    });
    expect(rows).toEqual([]);
  });
});

describe("resolveDividendEmptyReason", () => {
  it("uses priority: no_positions > never_fetched > no_upcoming", () => {
    expect(
      resolveDividendEmptyReason({ hasOwnedShares: false, dividendsFetchedAt: null, upcomingCount: 0 })
    ).toBe("no_positions");
    expect(
      resolveDividendEmptyReason({ hasOwnedShares: true, dividendsFetchedAt: null, upcomingCount: 0 })
    ).toBe("never_fetched");
    expect(
      resolveDividendEmptyReason({
        hasOwnedShares: true,
        dividendsFetchedAt: "2026-07-27T00:00:00.000Z",
        upcomingCount: 0,
      })
    ).toBe("no_upcoming");
    expect(
      resolveDividendEmptyReason({
        hasOwnedShares: true,
        dividendsFetchedAt: "2026-07-27T00:00:00.000Z",
        upcomingCount: 1,
      })
    ).toBeNull();
  });
});

describe("localTodayISO", () => {
  it("formats local calendar date as YYYY-MM-DD", () => {
    expect(localTodayISO(new Date(2026, 6, 27, 23, 59, 0))).toBe("2026-07-27");
  });
});

