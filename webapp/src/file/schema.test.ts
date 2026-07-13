import { describe, it, expect } from "vitest";
import { parsePortfolioFile, PortfolioFileValidationError } from "./schema";

const valid = {
  version: 1,
  positions: [{ ticker: "SBER", coefficient: 1.15, sharesOwned: 100 }],
  sectors: { SBER: "Финансы" },
  history: [
    {
      timestamp: "2026-07-10T09:00:00Z",
      portfolioValue: 1000,
      avgCompliance: 0.1,
      snapshot: [{ ticker: "SBER", price: 300, weight: 5, status: "in_index" }],
    },
  ],
  pairs: [{ tickers: ["SBER", "SBERP"], coefficient: 1 }],
  brokerAccounts: [{ id: "account-1", name: "Основной" }],
  transactions: [
    {
      id: "transaction-1",
      type: "deposit",
      amount: 1500.25,
      currency: "RUB",
      date: "2026-07-13",
      comment: "Пополнение",
      accountId: "account-1",
    },
  ],
};

describe("parsePortfolioFile", () => {
  it("accepts a well-formed file and returns it typed", () => {
    expect(parsePortfolioFile(valid)).toEqual(valid);
  });

  it("accepts an empty positions/sectors/history file", () => {
    const empty = { version: 1, positions: [], sectors: {}, history: [] };
    expect(parsePortfolioFile(empty)).toEqual({
      ...empty,
      pairs: [],
      brokerAccounts: [],
      transactions: [],
    });
  });

  it("defaults brokerAccounts and transactions for a version-1 file created before transactions existed", () => {
    const oldFile = { version: 1, positions: [], sectors: {}, history: [], pairs: [] };
    expect(parsePortfolioFile(oldFile)).toEqual({
      ...oldFile,
      brokerAccounts: [],
      transactions: [],
    });
  });

  it("trims account names/comments and removes an empty comment", () => {
    const parsed = parsePortfolioFile({
      ...valid,
      brokerAccounts: [{ id: "account-1", name: "  Основной  " }],
      transactions: [
        { ...valid.transactions[0], comment: "   " },
        { ...valid.transactions[0], id: "transaction-2", comment: "  заметка  " },
      ],
    });
    expect(parsed.brokerAccounts[0].name).toBe("Основной");
    expect(parsed.transactions[0].comment).toBeUndefined();
    expect(parsed.transactions[1].comment).toBe("заметка");
  });

  it.each([0, -1, Number.POSITIVE_INFINITY, 1.001, 1.00000000001])("rejects invalid transaction amount %s", (amount) => {
    expect(() =>
      parsePortfolioFile({ ...valid, transactions: [{ ...valid.transactions[0], amount }] })
    ).toThrow(PortfolioFileValidationError);
  });

  it.each(["2026-02-30", "13.07.2026", "", "2026-7-13"])("rejects invalid transaction date %s", (date) => {
    expect(() =>
      parsePortfolioFile({ ...valid, transactions: [{ ...valid.transactions[0], date }] })
    ).toThrow(PortfolioFileValidationError);
  });

  it("rejects unsupported transaction types/currencies and a blank account name", () => {
    expect(() => parsePortfolioFile({
      ...valid,
      transactions: [{ ...valid.transactions[0], type: "transfer" }],
    })).toThrow(PortfolioFileValidationError);
    expect(() => parsePortfolioFile({
      ...valid,
      transactions: [{ ...valid.transactions[0], currency: "EUR" }],
    })).toThrow(PortfolioFileValidationError);
    expect(() => parsePortfolioFile({
      ...valid,
      brokerAccounts: [{ id: "account-1", name: "   " }],
      transactions: [],
    })).toThrow(PortfolioFileValidationError);
  });

  it("accepts a future date and every supported currency", () => {
    const parsed = parsePortfolioFile({
      ...valid,
      transactions: (["RUB", "USD", "CNY"] as const).map((currency, index) => ({
        ...valid.transactions[0],
        id: `transaction-${index}`,
        currency,
        date: "2099-12-31",
      })),
    });
    expect(parsed.transactions.map((transaction) => transaction.currency)).toEqual(["RUB", "USD", "CNY"]);
  });

  it.each(["0001-01-01", "0099-12-31"])("accepts a four-digit transaction date below year 100: %s", (date) => {
    const parsed = parsePortfolioFile({
      ...valid,
      transactions: [{ ...valid.transactions[0], date }],
    });
    expect(parsed.transactions[0].date).toBe(date);
  });

  it("rejects duplicate account IDs, duplicate transaction IDs, and duplicate normalized account names", () => {
    expect(() => parsePortfolioFile({
      ...valid,
      brokerAccounts: [{ id: "same", name: "Первый" }, { id: "same", name: "Второй" }],
      transactions: [],
    })).toThrow(/brokerAccounts/);
    expect(() => parsePortfolioFile({
      ...valid,
      transactions: [valid.transactions[0], { ...valid.transactions[0] }],
    })).toThrow(/transactions/);
    expect(() => parsePortfolioFile({
      ...valid,
      brokerAccounts: [{ id: "a", name: " ИИС " }, { id: "b", name: "иис" }],
      transactions: [],
    })).toThrow(/name/);
  });

  it("rejects a transaction whose accountId does not reference brokerAccounts", () => {
    expect(() => parsePortfolioFile({
      ...valid,
      transactions: [{ ...valid.transactions[0], accountId: "missing" }],
    })).toThrow(/accountId/);
  });

  it("rejects a file with the wrong version", () => {
    expect(() => parsePortfolioFile({ ...valid, version: 2 })).toThrow(PortfolioFileValidationError);
  });

  it("rejects a file missing the positions field", () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.positions;
    expect(() => parsePortfolioFile(rest)).toThrow(/positions/);
  });

  it("rejects a position with a non-numeric coefficient", () => {
    const bad = { ...valid, positions: [{ ticker: "SBER", coefficient: "high", sharesOwned: 1 }] };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });

  it("rejects non-object input", () => {
    expect(() => parsePortfolioFile(null)).toThrow(PortfolioFileValidationError);
    expect(() => parsePortfolioFile("not json")).toThrow(PortfolioFileValidationError);
  });

  it("defaults pairs to [] when the field is absent (old files without the pairs field)", () => {
    const withoutPairs: Record<string, unknown> = { ...valid };
    delete withoutPairs.pairs;
    expect(parsePortfolioFile(withoutPairs)).toEqual({ ...withoutPairs, pairs: [] });
  });

  it("rejects a pair with fewer than 2 tickers", () => {
    const bad = { ...valid, pairs: [{ tickers: ["SBER"], coefficient: 1 }] };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });

  it("rejects a pair with a non-numeric coefficient", () => {
    const bad = { ...valid, pairs: [{ tickers: ["SBER", "SBERP"], coefficient: "high" }] };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });
});
