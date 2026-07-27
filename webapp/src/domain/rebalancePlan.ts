import {
  computeAverageCompliance,
  computeActualShare,
  computeCompliance,
  computeDeviationRub,
  computePairedTargets,
} from "./calculations";
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

export interface RebalancePlan {
  mode: RebalanceMode;
  budgetRub: number;
  lines: RebalancePlanLine[];
  spentTotal: number;
  leftoverRub: number;
  avgComplianceBefore: number | null;
  avgComplianceAfter: number | null;
  tradeCount: number;
  emptyReason: RebalanceEmptyReason | null;
  shortfallRubAfterByUnitId: Record<string, number>;
}

export interface BuildRebalancePlanInput {
  calculated: CalculatedPosition[];
  pairs: Pair[];
  portfolioValue: number;
  budgetRub: number;
  mode: RebalanceMode;
  complianceGainThreshold?: number;
}

function sharesAfterByTicker(
  calculated: CalculatedPosition[],
  lines: RebalancePlanLine[]
): Map<string, number> {
  const shares = new Map(calculated.map((p) => [p.ticker, p.sharesOwned] as const));
  for (const line of lines) {
    shares.set(line.ticker, (shares.get(line.ticker) ?? 0) + line.shares);
  }
  return shares;
}

function simulateAvgCompliance(
  calculated: CalculatedPosition[],
  pairs: Pair[],
  sharesAfter: Map<string, number>,
  portfolioValueAfter: number
): number | null {
  const byTicker = new Map(calculated.map((p) => [p.ticker, p] as const));
  const pairByTicker = new Map<string, Pair>();
  for (const pair of pairs) {
    for (const ticker of pair.tickers) pairByTicker.set(ticker, pair);
  }

  const pairedTargetsByPair = new Map<Pair, ReturnType<typeof computePairedTargets>>();
  for (const pair of pairs) {
    const memberInputs = pair.tickers
      .map((ticker) => {
        const p = byTicker.get(ticker);
        if (!p) return null;
        return {
          ticker,
          indexWeight: p.indexWeight,
          status: p.status,
          price: p.price,
          sharesOwned: sharesAfter.get(ticker) ?? p.sharesOwned,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    pairedTargetsByPair.set(pair, computePairedTargets(pair, memberInputs, portfolioValueAfter));
  }

  const compliances: (number | null)[] = [];
  for (const p of calculated) {
    const pair = pairByTicker.get(p.ticker);
    if (pair) {
      compliances.push(pairedTargetsByPair.get(pair)!.compliance);
    } else {
      const shares = sharesAfter.get(p.ticker) ?? p.sharesOwned;
      const positionValue = (p.price ?? 0) * shares;
      const actualShare = computeActualShare(positionValue, portfolioValueAfter);
      compliances.push(computeCompliance(actualShare, p.targetAllocation));
    }
  }
  return computeAverageCompliance(compliances);
}

function shortfallRubAfterByUnitId(
  units: RebalanceUnit[],
  pairs: Pair[],
  calculated: CalculatedPosition[],
  sharesAfter: Map<string, number>,
  portfolioValueAfter: number
): Record<string, number> {
  const byTicker = new Map(calculated.map((p) => [p.ticker, p] as const));
  const out: Record<string, number> = {};

  for (const unit of units) {
    if (unit.kind === "solo") {
      const member = unit.members[0];
      const p = byTicker.get(member.ticker);
      const price = member.price ?? p?.price ?? 0;
      const shares = sharesAfter.get(member.ticker) ?? member.sharesOwned;
      const actualShare = computeActualShare(price * shares, portfolioValueAfter);
      const deviationRub = computeDeviationRub(actualShare, unit.targetAllocation, portfolioValueAfter);
      out[unit.unitId] = deviationRub === null ? 0 : Math.max(0, -deviationRub);
      continue;
    }

    const pair = pairs.find((p) => p.tickers.join("+") === unit.unitId);
    if (!pair) {
      out[unit.unitId] = unit.shortfallRub;
      continue;
    }
    const memberInputs = pair.tickers
      .map((ticker) => {
        const p = byTicker.get(ticker);
        if (!p) return null;
        return {
          ticker,
          indexWeight: p.indexWeight,
          status: p.status,
          price: p.price,
          sharesOwned: sharesAfter.get(ticker) ?? p.sharesOwned,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    const paired = computePairedTargets(pair, memberInputs, portfolioValueAfter);
    const deviationRub = computeDeviationRub(
      paired.actualShare,
      paired.targetAllocation,
      portfolioValueAfter
    );
    out[unit.unitId] = deviationRub === null ? 0 : Math.max(0, -deviationRub);
  }

  return out;
}

interface FinalizePlanInput {
  mode: RebalanceMode;
  budgetRub: number;
  lines: RebalancePlanLine[];
  calculated: CalculatedPosition[];
  pairs: Pair[];
  portfolioValue: number;
  units: RebalanceUnit[];
  avgComplianceBefore: number | null;
}

function finalizePlan(input: FinalizePlanInput): RebalancePlan {
  const { mode, budgetRub, lines, calculated, pairs, portfolioValue, units, avgComplianceBefore } =
    input;
  const spentTotal = lines.reduce((s, l) => s + l.spendRub, 0);
  const leftoverRub = budgetRub - spentTotal;
  const portfolioValueAfter = portfolioValue + spentTotal;
  const sharesAfter = sharesAfterByTicker(calculated, lines);
  const avgComplianceAfter = simulateAvgCompliance(
    calculated,
    pairs,
    sharesAfter,
    portfolioValueAfter
  );

  return {
    mode,
    budgetRub,
    lines,
    spentTotal,
    leftoverRub,
    avgComplianceBefore,
    avgComplianceAfter,
    tradeCount: lines.length,
    emptyReason: null,
    shortfallRubAfterByUnitId: shortfallRubAfterByUnitId(
      units,
      pairs,
      calculated,
      sharesAfter,
      portfolioValueAfter
    ),
  };
}

export function buildRebalancePlan(input: BuildRebalancePlanInput): RebalancePlan {
  const { calculated, pairs, portfolioValue, budgetRub, mode } = input;
  const avgComplianceBefore = computeAverageCompliance(calculated.map((p) => p.compliance));

  const empty = (reason: RebalanceEmptyReason): RebalancePlan => ({
    mode,
    budgetRub,
    lines: [],
    spentTotal: 0,
    leftoverRub: Math.max(0, budgetRub),
    avgComplianceBefore,
    avgComplianceAfter: avgComplianceBefore,
    tradeCount: 0,
    emptyReason: reason,
    shortfallRubAfterByUnitId: {},
  });

  if (budgetRub <= 0) return empty("no_budget");

  const units = collectRebalanceUnits(calculated, pairs, portfolioValue);
  if (units.length === 0) return empty("no_shortfall");

  if (mode === "min_trades") {
    return empty("threshold_not_met");
  }

  const lines = allocateBudget(units, budgetRub);
  if (lines.length === 0) return empty("budget_too_small");

  return finalizePlan({
    mode,
    budgetRub,
    lines,
    calculated,
    pairs,
    portfolioValue,
    units,
    avgComplianceBefore,
  });
}
