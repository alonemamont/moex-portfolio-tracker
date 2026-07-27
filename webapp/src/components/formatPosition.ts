import { CalculatedPosition } from "../types";

export function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

export type ExpandedField =
  | { kind: "text"; key: string; label: string; value: string }
  | { kind: "coefficient" }
  | { kind: "sharesOwned" };

export function buildExpandedFields(p: CalculatedPosition): ExpandedField[] {
  return [
    { kind: "text", key: "indexWeight", label: "Вес в индексе, %", value: formatNumber(p.indexWeight) },
    { kind: "text", key: "lotSize", label: "Лотность", value: p.lotSize === null ? "—" : String(p.lotSize) },
    { kind: "text", key: "dividendPerShare", label: "Дивиденд", value: formatNumber(p.dividendPerShare) },
    { kind: "text", key: "dividendYield", label: "Див доходность, %", value: formatNumber(p.dividendYield) },
    { kind: "coefficient" },
    { kind: "sharesOwned" },
    { kind: "text", key: "sharesToBuy", label: "Акций купить", value: formatNumber(p.sharesToBuy, 0) },
    { kind: "text", key: "buyAmountRub", label: "Купить на сумму", value: formatNumber(p.buyAmountRub) },
    { kind: "text", key: "targetAllocation", label: "Цель", value: formatNumber(p.targetAllocation) },
    { kind: "text", key: "actualShare", label: "Факт. доля", value: formatNumber(p.actualShare) },
    { kind: "text", key: "positionValue", label: "Стоимость", value: formatNumber(p.positionValue) },
    { kind: "text", key: "income", label: "Доход", value: formatNumber(p.income) },
    { kind: "text", key: "sector", label: "Сектор", value: p.sector },
  ];
}
