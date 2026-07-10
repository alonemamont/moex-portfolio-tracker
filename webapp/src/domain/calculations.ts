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
