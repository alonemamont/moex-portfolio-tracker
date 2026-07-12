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

export function computeDeviationRub(
  actualShare: number | null,
  targetAllocation: number | null,
  portfolioValue: number
): number | null {
  if (actualShare === null || targetAllocation === null) return null;
  return ((actualShare - targetAllocation) * portfolioValue) / 100;
}

export interface DeviationEntry {
  ticker: string;
  deviationRub: number;
}

export function findDeviationExtremes(deviations: DeviationEntry[]): {
  largestSurplus: DeviationEntry | null;
  largestShortfall: DeviationEntry | null;
} {
  if (deviations.length === 0) return { largestSurplus: null, largestShortfall: null };

  let largestSurplus = deviations[0];
  let largestShortfall = deviations[0];
  for (const entry of deviations) {
    if (entry.deviationRub > largestSurplus.deviationRub) largestSurplus = entry;
    if (entry.deviationRub < largestShortfall.deviationRub) largestShortfall = entry;
  }
  return { largestSurplus, largestShortfall };
}

export function computeDividendYield(dividendPerShare: number, price: number | null): number | null {
  if (price === null || price === 0) return null;
  return (dividendPerShare / price) * 100;
}

export function computeTargetShares(
  targetAllocation: number | null,
  portfolioValue: number,
  price: number | null
): number | null {
  if (targetAllocation === null || price === null || price === 0) return null;
  return Math.round(((targetAllocation / 100) * portfolioValue) / price);
}

export function computeSharesToBuy(targetShares: number | null, sharesOwned: number): number | null {
  if (targetShares === null) return null;
  return targetShares - sharesOwned;
}

export function computeBuyAmountRub(sharesToBuy: number | null, price: number | null): number | null {
  if (sharesToBuy === null || price === null) return null;
  return sharesToBuy * price;
}
