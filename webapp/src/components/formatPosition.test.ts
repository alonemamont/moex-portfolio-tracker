import { describe, it, expect } from "vitest";
import { formatNumber, buildExpandedFields } from "./formatPosition";
import { CalculatedPosition } from "../types";

function position(overrides: Partial<CalculatedPosition> = {}): CalculatedPosition {
  return {
    ticker: "GAZP",
    coefficient: 1.5,
    sharesOwned: 10,
    manualSharesOwned: 10,
    shortName: "Газпром",
    indexWeight: 12.3456,
    price: 150.5,
    lotSize: 10,
    dividendPerShare: 5.2,
    status: "in_index",
    sector: "Энергетика",
    targetAllocation: 18.5,
    actualShare: 20.1,
    compliance: 1.09,
    positionValue: 1505,
    income: 52,
    dividendYield: 3.45,
    sharesToBuy: 5,
    buyAmountRub: 752.5,
    ...overrides,
  };
}

describe("formatNumber", () => {
  it("returns an em dash for null", () => {
    expect(formatNumber(null)).toBe("—");
  });

  it("formats with 2 digits by default", () => {
    expect(formatNumber(12.345)).toBe("12.35");
  });

  it("formats with a custom digit count", () => {
    expect(formatNumber(12.6, 0)).toBe("13");
  });
});

describe("buildExpandedFields", () => {
  it("returns the 13 fields in spec order, with coefficient/sharesOwned as input markers", () => {
    const fields = buildExpandedFields(position());

    expect(fields).toEqual([
      { kind: "text", key: "indexWeight", label: "Вес в индексе, %", value: "12.35" },
      { kind: "text", key: "lotSize", label: "Лотность", value: "10" },
      { kind: "text", key: "dividendPerShare", label: "Дивиденд", value: "5.20" },
      { kind: "text", key: "dividendYield", label: "Див доходность, %", value: "3.45" },
      { kind: "coefficient" },
      { kind: "sharesOwned" },
      { kind: "text", key: "sharesToBuy", label: "Акций купить", value: "5" },
      { kind: "text", key: "buyAmountRub", label: "Купить на сумму", value: "752.50" },
      { kind: "text", key: "targetAllocation", label: "Цель", value: "18.50" },
      { kind: "text", key: "actualShare", label: "Факт. доля", value: "20.10" },
      { kind: "text", key: "positionValue", label: "Стоимость", value: "1505.00" },
      { kind: "text", key: "income", label: "Доход", value: "52.00" },
      { kind: "text", key: "sector", label: "Сектор", value: "Энергетика" },
    ]);
  });

  it("shows an em dash for a null lotSize instead of the string 'null'", () => {
    const fields = buildExpandedFields(position({ lotSize: null }));
    expect(fields[1]).toEqual({ kind: "text", key: "lotSize", label: "Лотность", value: "—" });
  });
});
