import { describe, it, expect, vi, afterEach } from "vitest";
import { createEmptyPortfolio } from "./createEmptyPortfolio";
import * as client from "../iss/client";
import { DEFAULT_INDEX_ID } from "../domain/indices";

afterEach(() => vi.restoreAllMocks());

describe("createEmptyPortfolio", () => {
  it("seeds one position per current index ticker with coefficient 1 and sharesOwned 0", async () => {
    vi.spyOn(client, "fetchIndexComposition").mockResolvedValue([
      { ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 },
      { ticker: "SBER", shortName: "Сбербанк", weight: 5.1 },
    ]);

    const file = await createEmptyPortfolio();

    expect(file.version).toBe(1);
    expect(file.positions).toEqual([
      { ticker: "GAZP", coefficient: 1, sharesOwned: 0 },
      { ticker: "SBER", coefficient: 1, sharesOwned: 0 },
    ]);
    expect(file.sectors).toEqual({});
    expect(file.history).toEqual([]);
  });

  it("calls fetchIndexComposition with DEFAULT_INDEX_ID", async () => {
    const compositionSpy = vi.spyOn(client, "fetchIndexComposition").mockResolvedValue([
      { ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 },
    ]);

    await createEmptyPortfolio();

    expect(compositionSpy).toHaveBeenCalledWith(DEFAULT_INDEX_ID);
  });
});
