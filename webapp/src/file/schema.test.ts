import { describe, it, expect } from "vitest";
import { parsePortfolioFile, PortfolioFileValidationError } from "./schema";

const valid = {
  version: 1,
  positions: [
    {
      ticker: "SBER",
      coefficient: 1.15,
      sharesOwned: 100,
      brokerHoldings: [{ connectionId: "conn-1", shares: 5, syncedAt: "2026-07-10T09:00:00Z" }],
    },
  ],
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
  brokerConnections: [
    {
      id: "conn-1",
      brokerId: "tbank",
      accountId: "acc-1",
      label: "Т-Банк — брокерский счёт",
      encryptedToken: { ciphertext: "Y2lwaGVy", iv: "aXY=", salt: "c2FsdA==" },
    },
  ],
};

describe("parsePortfolioFile", () => {
  it("accepts a well-formed file and returns it typed", () => {
    expect(parsePortfolioFile(valid)).toEqual(valid);
  });

  it("accepts an empty positions/sectors/history file", () => {
    const empty = { version: 1, positions: [], sectors: {}, history: [] };
    expect(parsePortfolioFile(empty)).toEqual({ ...empty, pairs: [], brokerConnections: [] });
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
    const bad = {
      ...valid,
      positions: [{ ticker: "SBER", coefficient: "high", sharesOwned: 1, brokerHoldings: [] }],
    };
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

  it("defaults position.brokerHoldings to [] when absent (old files without broker sync)", () => {
    const oldPosition = { ticker: "SBER", coefficient: 1.15, sharesOwned: 100 };
    const oldFile = { ...valid, positions: [oldPosition] };
    const result = parsePortfolioFile(oldFile);
    expect(result.positions[0].brokerHoldings).toEqual([]);
  });

  it("defaults brokerConnections to [] when absent (old files without broker sync)", () => {
    const withoutConnections: Record<string, unknown> = { ...valid };
    delete withoutConnections.brokerConnections;
    expect(parsePortfolioFile(withoutConnections)).toEqual({ ...withoutConnections, brokerConnections: [] });
  });

  it("rejects a brokerConnection missing encryptedToken fields", () => {
    const bad = {
      ...valid,
      brokerConnections: [
        {
          id: "conn-1",
          brokerId: "tbank",
          accountId: "acc-1",
          label: "X",
          encryptedToken: { ciphertext: "c", iv: "i" },
        },
      ],
    };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });

  it("rejects a brokerHolding missing shares", () => {
    const bad = {
      ...valid,
      positions: [
        {
          ticker: "SBER",
          coefficient: 1,
          sharesOwned: 1,
          brokerHoldings: [{ connectionId: "c", syncedAt: "2026-01-01" }],
        },
      ],
    };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });
});
