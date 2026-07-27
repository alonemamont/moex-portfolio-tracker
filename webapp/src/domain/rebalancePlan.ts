import { computeDeviationRub } from "./calculations";
import { CalculatedPosition, Pair } from "../types";

export type RebalanceMode = "budget" | "free_cash" | "min_trades";

export type RebalanceEmptyReason =
  | "no_budget"
  | "no_shortfall"
  | "budget_too_small"
  | "threshold_not_met";

export interface RebalanceMemberInput {
  ticker: string;
  price: number | null;
  lotSize: number | null;
  sharesOwned: number;
  indexWeight: number;
  status: "in_index" | "out_of_index";
  coefficient: number;
}

export interface RebalanceUnit {
  unitId: string;
  kind: "solo" | "pair";
  shortfallRub: number;
  targetAllocation: number;
  actualShare: number | null;
  representativePrice: number | null;
  members: RebalanceMemberInput[];
}

function memberFromCalculated(
  p: CalculatedPosition,
  coefficient: number
): RebalanceMemberInput {
  return {
    ticker: p.ticker,
    price: p.price,
    lotSize: p.lotSize,
    sharesOwned: p.sharesOwned,
    indexWeight: p.indexWeight,
    status: p.status,
    coefficient,
  };
}

function maxInIndexPrice(members: RebalanceMemberInput[]): number | null {
  let max: number | null = null;
  for (const m of members) {
    if (m.status !== "in_index") continue;
    if (m.price === null || m.price === 0) continue;
    if (max === null || m.price > max) max = m.price;
  }
  return max;
}

export function collectRebalanceUnits(
  calculated: CalculatedPosition[],
  pairs: Pair[],
  portfolioValue: number
): RebalanceUnit[] {
  const pairedTickers = new Set(pairs.flatMap((p) => p.tickers));
  const byTicker = new Map(calculated.map((p) => [p.ticker, p] as const));
  const units: RebalanceUnit[] = [];

  for (const pair of pairs) {
    const membersCalc = pair.tickers
      .map((t) => byTicker.get(t))
      .filter((p): p is CalculatedPosition => p !== undefined);
    if (membersCalc.length === 0) continue;
    const head = membersCalc[0];
    if (head.targetAllocation === null || head.targetAllocation <= 0) continue;
    if (membersCalc.every((p) => p.status !== "in_index")) continue;
    const deviationRub = computeDeviationRub(
      head.actualShare,
      head.targetAllocation,
      portfolioValue
    );
    if (deviationRub === null) continue;
    const shortfallRub = Math.max(0, -deviationRub);
    if (shortfallRub === 0) continue;
    const members = membersCalc.map((p) =>
      memberFromCalculated(p, pair.coefficients[p.ticker] ?? 1)
    );
    units.push({
      unitId: pair.tickers.join("+"),
      kind: "pair",
      shortfallRub,
      targetAllocation: head.targetAllocation,
      actualShare: head.actualShare,
      representativePrice: maxInIndexPrice(members),
      members,
    });
  }

  for (const p of calculated) {
    if (pairedTickers.has(p.ticker)) continue;
    if (p.status !== "in_index") continue;
    if (p.targetAllocation === null || p.targetAllocation <= 0) continue;
    const deviationRub = computeDeviationRub(p.actualShare, p.targetAllocation, portfolioValue);
    if (deviationRub === null) continue;
    const shortfallRub = Math.max(0, -deviationRub);
    if (shortfallRub === 0) continue;
    const members = [memberFromCalculated(p, p.coefficient)];
    units.push({
      unitId: p.ticker,
      kind: "solo",
      shortfallRub,
      targetAllocation: p.targetAllocation,
      actualShare: p.actualShare,
      representativePrice: maxInIndexPrice(members),
      members,
    });
  }

  return units;
}
