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

export interface RebalancePlanLine {
  unitId: string;
  ticker: string;
  lots: number;
  shares: number;
  spendRub: number;
  price: number;
  lotSize: number;
  shortfallRubBefore: number;
}

function effectiveLotSize(lotSize: number | null): number {
  return lotSize === null || lotSize <= 0 ? 1 : lotSize;
}

function lotsAffordable(price: number, lotSize: number, cash: number, rawCap: number): number {
  const cap = Math.min(cash, rawCap);
  if (cap <= 0 || price <= 0) return 0;
  const maxLotsByCash = Math.floor(cap / (price * lotSize));
  return Math.max(0, maxLotsByCash);
}

function allocateMemberLines(
  unit: RebalanceUnit,
  memberBudgets: { member: RebalanceMemberInput; rawRub: number }[],
  unitCash: number
): { lines: RebalancePlanLine[]; spent: number } {
  const ordered = [...memberBudgets].sort(
    (a, b) => (b.member.price ?? 0) - (a.member.price ?? 0)
  );
  let remaining = unitCash;
  const lines: RebalancePlanLine[] = [];
  for (const { member, rawRub } of ordered) {
    if (member.status !== "in_index") continue;
    if (member.price === null || member.price === 0) continue;
    const lotSize = effectiveLotSize(member.lotSize);
    const lots = lotsAffordable(member.price, lotSize, remaining, rawRub);
    if (lots <= 0) continue;
    const shares = lots * lotSize;
    const spendRub = shares * member.price;
    remaining -= spendRub;
    lines.push({
      unitId: unit.unitId,
      ticker: member.ticker,
      lots,
      shares,
      spendRub,
      price: member.price,
      lotSize,
      shortfallRubBefore: unit.shortfallRub,
    });
  }
  return { lines, spent: unitCash - remaining };
}

export function allocateBudget(units: RebalanceUnit[], budgetRub: number): RebalancePlanLine[] {
  const candidates = units.filter((u) => u.shortfallRub > 0);
  if (candidates.length === 0 || budgetRub <= 0) return [];
  const totalShortfall = candidates.reduce((s, u) => s + u.shortfallRub, 0);
  if (totalShortfall <= 0) return [];

  const ordered = [...candidates].sort(
    (a, b) => (b.representativePrice ?? -1) - (a.representativePrice ?? -1)
  );

  let remaining = budgetRub;
  const out: RebalancePlanLine[] = [];

  for (const unit of ordered) {
    if (remaining <= 0) break;
    const rawRub = budgetRub * (unit.shortfallRub / totalShortfall);
    const unitCash = Math.min(rawRub, remaining);

    if (unit.kind === "solo") {
      const { lines, spent } = allocateMemberLines(
        unit,
        unit.members.map((m) => ({ member: m, rawRub: unitCash })),
        unitCash
      );
      out.push(...lines);
      remaining -= spent;
      continue;
    }

    const active = unit.members.filter((m) => m.status === "in_index");
    const weightSum = active.reduce((s, m) => s + m.indexWeight * m.coefficient, 0);
    if (weightSum <= 0) continue;
    const memberBudgets = active.map((m) => ({
      member: m,
      rawRub: unitCash * ((m.indexWeight * m.coefficient) / weightSum),
    }));
    const { lines, spent } = allocateMemberLines(unit, memberBudgets, unitCash);
    out.push(...lines);
    remaining -= spent;
  }

  return out;
}
