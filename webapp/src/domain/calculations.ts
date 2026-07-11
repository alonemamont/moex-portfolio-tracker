import { IndexStatus } from "../types";

export function computeTargetAllocation(
  indexWeight: number,
  coefficient: number,
  status: IndexStatus
): number | null {
  if (status !== "in_index") return null;
  return indexWeight * coefficient;
}

export function computePositionValue(price: number | null, sharesOwned: number): number {
  return (price ?? 0) * sharesOwned;
}

export function computeIncome(dividendPerShare: number, sharesOwned: number): number {
  return dividendPerShare * sharesOwned;
}

export function computePortfolioValue(
  positions: { price: number | null; sharesOwned: number }[]
): number {
  return positions.reduce((sum, p) => sum + computePositionValue(p.price, p.sharesOwned), 0);
}

export function computeActualShare(positionValue: number, portfolioValue: number): number | null {
  if (portfolioValue === 0) return null;
  return (positionValue / portfolioValue) * 100;
}

export function computeCompliance(
  actualShare: number | null,
  targetAllocation: number | null
): number | null {
  if (actualShare === null || targetAllocation === null || targetAllocation === 0) return null;
  return actualShare / targetAllocation;
}

export function computeAverageCompliance(compliances: (number | null)[]): number | null {
  const valid = compliances.filter((c): c is number => c !== null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, c) => sum + c, 0) / valid.length;
}
