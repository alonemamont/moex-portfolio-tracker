import { describe, it, expect, vi } from "vitest";
import { validateTicker } from "./tickerValidation";
import { Position } from "../types";
import { SecurityInfo } from "../iss/client";

const positions: Position[] = [{ ticker: "GAZP", coefficient: 1, sharesOwned: 0 }];

describe("validateTicker", () => {
  it("returns idle for an empty ticker", async () => {
    const fetchSecurities = vi.fn();
    await expect(validateTicker("", positions, fetchSecurities)).resolves.toEqual({ kind: "idle" });
    expect(fetchSecurities).not.toHaveBeenCalled();
  });

  it("returns duplicate when the ticker already exists in positions, case-insensitively", async () => {
    const fetchSecurities = vi.fn();
    await expect(validateTicker("gazp", positions, fetchSecurities)).resolves.toEqual({
      kind: "duplicate",
    });
    expect(fetchSecurities).not.toHaveBeenCalled();
  });

  it("returns found with the shortName when the ticker exists in ISS", async () => {
    const fetchSecurities = vi.fn(
      async (): Promise<Map<string, SecurityInfo>> =>
        new Map([["SBER", { shortName: "Сбербанк", price: 300, lotSize: 10 }]])
    );
    await expect(validateTicker("sber", positions, fetchSecurities)).resolves.toEqual({
      kind: "found",
      shortName: "Сбербанк",
    });
    expect(fetchSecurities).toHaveBeenCalledWith(["SBER"]);
  });

  it("returns not_found when ISS has no entry for the ticker", async () => {
    const fetchSecurities = vi.fn(async (): Promise<Map<string, SecurityInfo>> => new Map());
    await expect(validateTicker("NOPE", positions, fetchSecurities)).resolves.toEqual({
      kind: "not_found",
    });
  });
});
