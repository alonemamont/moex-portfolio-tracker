# Rebalance Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only «Ребаланс» tab that builds a buy-only purchase plan under a ruble budget (full proportional, free-cash label, or min-trades auto-K), respecting the currently selected index.

**Architecture:** Pure domain module `rebalancePlan.ts` builds candidate units (solo ticker or pair), allocates budget proportional to shortfall ₽, lot-rounds expensive-first, optionally shrinks the unit set for `min_trades`, and simulates post-plan avg compliance — never mutating `PortfolioFile`. `RebalanceTab` reads `useCalculatedPositions` + `selectedIndex` and only exports CSV/TSV.

**Tech Stack:** TypeScript, React 18, Vitest, Testing Library. Run npm from `webapp/`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-rebalance-modes-design.md`
- Buy-only; read-only panel (no `setFile` / no apply)
- Follows Header `selectedIndex` via existing calculated positions (no second index selector)
- Web + desktop (Tauri) same UI; no mobile/card layout
- `tsconfig` strict + `noUnusedLocals` / `noUnusedParameters`
- Match existing formatting by hand; no Prettier
- Never commit personal `portfolio.json` / `positions.csv` / xlsx

## File Structure

| File | Responsibility |
|---|---|
| `webapp/src/domain/rebalancePlan.ts` | Types, collect units, allocate, lot-round, min_trades, compliance sim, CSV helpers |
| `webapp/src/domain/rebalancePlan.test.ts` | Domain Vitest coverage |
| `webapp/src/components/RebalanceTab.tsx` | Tab UI: mode, budget, threshold, table, export |
| `webapp/src/components/RebalanceTab.test.tsx` | Render + no `setFile` + empty states |
| `webapp/src/App.tsx` | Register «Ребаланс» tab |
| `webapp/src/styles.css` | Minimal `.rebalance-*` rules matching existing tab styles |

---

### Task 1: Types + collect shortfall units

**Files:**
- Create: `webapp/src/domain/rebalancePlan.ts`
- Create: `webapp/src/domain/rebalancePlan.test.ts`

**Interfaces:**
- Produces:
```ts
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
  coefficient: number; // pair member: pair.coefficients[ticker]; solo unused at collect
}

export interface RebalanceUnit {
  unitId: string; // ticker or "SBER+SBERP"
  kind: "solo" | "pair";
  shortfallRub: number;
  targetAllocation: number;
  actualShare: number | null;
  /** max valid in_index member price; null if none */
  representativePrice: number | null;
  members: RebalanceMemberInput[];
}

export function collectRebalanceUnits(
  calculated: CalculatedPosition[],
  pairs: Pair[],
  portfolioValue: number
): RebalanceUnit[];
```
- Consumes: `computeDeviationRub` from `domain/calculations.ts`; `CalculatedPosition`, `Pair` from `types.ts`

- [ ] **Step 1: Write failing tests for `collectRebalanceUnits`**

Create `webapp/src/domain/rebalancePlan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { collectRebalanceUnits } from "./rebalancePlan";
import { CalculatedPosition, Pair } from "../types";

function pos(partial: Partial<CalculatedPosition> & Pick<CalculatedPosition, "ticker">): CalculatedPosition {
  return {
    coefficient: 1,
    sharesOwned: 0,
    shortName: partial.ticker,
    indexWeight: 0,
    price: 100,
    lotSize: 1,
    dividendPerShare: 0,
    status: "in_index",
    sector: "",
    targetAllocation: 10,
    actualShare: 5,
    compliance: 0.5,
    positionValue: 0,
    income: 0,
    dividendYield: null,
    sharesToBuy: null,
    buyAmountRub: null,
    manualSharesOwned: 0,
    ...partial,
  };
}

describe("collectRebalanceUnits", () => {
  it("builds a solo unit with positive shortfallRub", () => {
    const calculated = [
      pos({
        ticker: "GAZP",
        targetAllocation: 10,
        actualShare: 5,
        price: 200,
        lotSize: 10,
        sharesOwned: 5,
        indexWeight: 10,
        status: "in_index",
      }),
    ];
    // deviationRub = (5-10)*1000/100 = -50 → shortfall 50
    const units = collectRebalanceUnits(calculated, [], 1000);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      unitId: "GAZP",
      kind: "solo",
      shortfallRub: 50,
      representativePrice: 200,
    });
  });

  it("skips overweight solos and out-of-index solos", () => {
    const calculated = [
      pos({ ticker: "FAT", targetAllocation: 10, actualShare: 20, status: "in_index" }),
      pos({ ticker: "OLD", targetAllocation: null, actualShare: 5, status: "out_of_index" }),
    ];
    expect(collectRebalanceUnits(calculated, [], 1000)).toEqual([]);
  });

  it("builds one pair unit from paired members using shared target/actual", () => {
    const pairs: Pair[] = [
      { tickers: ["SBER", "SBERP"], coefficients: { SBER: 1.2, SBERP: 0.8 } },
    ];
    const calculated = [
      pos({
        ticker: "SBER",
        targetAllocation: 12,
        actualShare: 6,
        price: 300,
        lotSize: 1,
        sharesOwned: 10,
        indexWeight: 9,
        status: "in_index",
        coefficient: 1, // ignored for pair collect; pair coefficients used later
      }),
      pos({
        ticker: "SBERP",
        targetAllocation: 12,
        actualShare: 6,
        price: 250,
        lotSize: 1,
        sharesOwned: 5,
        indexWeight: 3,
        status: "in_index",
        coefficient: 1,
      }),
    ];
    const units = collectRebalanceUnits(calculated, pairs, 1000);
    expect(units).toHaveLength(1);
    expect(units[0].unitId).toBe("SBER+SBERP");
    expect(units[0].kind).toBe("pair");
    expect(units[0].shortfallRub).toBe(60); // (6-12)*1000/100 = -60
    expect(units[0].representativePrice).toBe(300);
    expect(units[0].members.map((m) => m.ticker)).toEqual(["SBER", "SBERP"]);
    expect(units[0].members[0].coefficient).toBe(1.2);
    expect(units[0].members[1].coefficient).toBe(0.8);
  });

  it("skips a pair when targetAllocation is 0", () => {
    const pairs: Pair[] = [{ tickers: ["A", "B"], coefficients: { A: 1, B: 1 } }];
    const calculated = [
      pos({ ticker: "A", targetAllocation: 0, actualShare: 0, status: "out_of_index" }),
      pos({ ticker: "B", targetAllocation: 0, actualShare: 0, status: "out_of_index" }),
    ];
    expect(collectRebalanceUnits(calculated, pairs, 1000)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/domain/rebalancePlan.test.ts`

Expected: FAIL — module/export missing.

- [ ] **Step 3: Implement `collectRebalanceUnits`**

Create `webapp/src/domain/rebalancePlan.ts`:

```ts
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
    sharesOwned: p.sharesOwned, // already includes broker holdings in CalculatedPosition
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
```

Note: `CalculatedPosition.sharesOwned` is total shares after broker merge (see `buildCalculatedPositions`) — use that field, not `manualSharesOwned`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webapp && npx vitest run src/domain/rebalancePlan.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add webapp/src/domain/rebalancePlan.ts webapp/src/domain/rebalancePlan.test.ts
git commit -m "feat(rebalance): collect shortfall units for buy-only plan"
```

---

### Task 2: Proportional lot-round allocation (`allocateBudget`)

**Files:**
- Modify: `webapp/src/domain/rebalancePlan.ts`
- Modify: `webapp/src/domain/rebalancePlan.test.ts`

**Interfaces:**
- Consumes: `RebalanceUnit` from Task 1
- Produces:
```ts
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

export function allocateBudget(
  units: RebalanceUnit[],
  budgetRub: number
): RebalancePlanLine[];
```
- `budget` and `free_cash` both call this same function (UI-only label difference).

**Lot-round rules (encode in tests):**
1. Keep only units with `shortfallRub > 0`.
2. `rawRub_i = budgetRub * shortfall_i / sum(shortfall)`.
3. Sort units by `representativePrice` desc (`null` prices last).
4. For each unit, `remaining` starts as full budget and shrinks after each realized spend.
5. Solo: try to spend up to `min(rawRub_i, remaining)` via floor lots; `lotSize null → 1`; skip if `price` null/0.
6. Pair: split that unit’s `min(rawRub, remaining)` across **in_index** members ∝ `indexWeight * coefficient` (normalize; if sum weights 0, skip unit); then lot-round members price-desc against a **unit-local** remaining that starts at the unit’s allocation; unused returns to global `remaining`.
7. Never emit negative lots; omit lines with `lots === 0`.

- [ ] **Step 1: Write failing allocation tests**

Append to `rebalancePlan.test.ts`:

```ts
import { allocateBudget, RebalanceUnit } from "./rebalancePlan";

function soloUnit(over: Partial<RebalanceUnit> & Pick<RebalanceUnit, "unitId" | "shortfallRub">): RebalanceUnit {
  const ticker = over.unitId;
  const price = over.representativePrice ?? 100;
  return {
    kind: "solo",
    targetAllocation: 10,
    actualShare: 5,
    representativePrice: price,
    members: [
      {
        ticker,
        price,
        lotSize: 1,
        sharesOwned: 0,
        indexWeight: 10,
        status: "in_index",
        coefficient: 1,
      },
    ],
    ...over,
  };
}

describe("allocateBudget", () => {
  it("splits budget proportional to shortfall then lot-rounds", () => {
    const units = [
      soloUnit({
        unitId: "EXP",
        shortfallRub: 100,
        representativePrice: 200,
        members: [
          {
            ticker: "EXP",
            price: 200,
            lotSize: 1,
            sharesOwned: 0,
            indexWeight: 1,
            status: "in_index",
            coefficient: 1,
          },
        ],
      }),
      soloUnit({
        unitId: "CHEAP",
        shortfallRub: 100,
        representativePrice: 50,
        members: [
          {
            ticker: "CHEAP",
            price: 50,
            lotSize: 1,
            sharesOwned: 0,
            indexWeight: 1,
            status: "in_index",
            coefficient: 1,
          },
        ],
      }),
    ];
    // budget 300 → raw 150 each. Visit EXP first: floor(150/200)=0 lots → 0 spend.
    // CHEAP: floor(150/50)=3 → spend 150. Total spend 150.
    // Wait — after EXP spends 0, remaining still 300; CHEAP target min(150,300)=150 → 3 lots.
    const lines = allocateBudget(units, 300);
    expect(lines.map((l) => l.ticker)).toEqual(["CHEAP"]);
    expect(lines[0]).toMatchObject({ lots: 3, shares: 3, spendRub: 150 });
    expect(lines.every((l) => l.lots > 0)).toBe(true);
  });

  it("processes expensive unit before cheap when both can buy", () => {
    const units = [
      soloUnit({
        unitId: "CHEAP",
        shortfallRub: 100,
        representativePrice: 50,
        members: [
          {
            ticker: "CHEAP",
            price: 50,
            lotSize: 1,
            sharesOwned: 0,
            indexWeight: 1,
            status: "in_index",
            coefficient: 1,
          },
        ],
      }),
      soloUnit({
        unitId: "EXP",
        shortfallRub: 100,
        representativePrice: 100,
        members: [
          {
            ticker: "EXP",
            price: 100,
            lotSize: 1,
            sharesOwned: 0,
            indexWeight: 1,
            status: "in_index",
            coefficient: 1,
          },
        ],
      }),
    ];
    // budget 200 → raw 100 each. EXP first: 1 lot ×100; CHEAP: 2 lots ×50.
    const lines = allocateBudget(units, 200);
    expect(lines).toEqual([
      expect.objectContaining({ ticker: "EXP", lots: 1, spendRub: 100 }),
      expect.objectContaining({ ticker: "CHEAP", lots: 2, spendRub: 100 }),
    ]);
  });

  it("splits pair rawRub by indexWeight*coefficient and skips out_of_index member", () => {
    const unit: RebalanceUnit = {
      unitId: "SBER+SBERP",
      kind: "pair",
      shortfallRub: 100,
      targetAllocation: 12,
      actualShare: 0,
      representativePrice: 300,
      members: [
        {
          ticker: "SBER",
          price: 300,
          lotSize: 1,
          sharesOwned: 0,
          indexWeight: 9,
          status: "in_index",
          coefficient: 1,
        },
        {
          ticker: "SBERP",
          price: 200,
          lotSize: 1,
          sharesOwned: 0,
          indexWeight: 3,
          status: "in_index",
          coefficient: 1,
        },
        {
          ticker: "GHOST",
          price: 100,
          lotSize: 1,
          sharesOwned: 0,
          indexWeight: 5,
          status: "out_of_index",
          coefficient: 1,
        },
      ],
    };
    // Only SBER+SBERP weights 9+3=12. budget 1200 → all to this unit.
    // SBER raw 900 → 3 lots; SBERP raw 300 → 1 lot. Visit SBER first (price 300).
    const lines = allocateBudget([unit], 1200);
    expect(lines.map((l) => l.ticker)).toEqual(["SBER", "SBERP"]);
    expect(lines.find((l) => l.ticker === "SBER")).toMatchObject({ lots: 3, spendRub: 900 });
    expect(lines.find((l) => l.ticker === "SBERP")).toMatchObject({ lots: 1, spendRub: 200 });
    // leftover 100 from SBERP lot floor stays unspent (returned to global remaining; no more units)
  });

  it("skips members with null or zero price", () => {
    const units = [
      soloUnit({
        unitId: "DEAD",
        shortfallRub: 100,
        representativePrice: null,
        members: [
          {
            ticker: "DEAD",
            price: null,
            lotSize: 1,
            sharesOwned: 0,
            indexWeight: 1,
            status: "in_index",
            coefficient: 1,
          },
        ],
      }),
    ];
    expect(allocateBudget(units, 1000)).toEqual([]);
  });

  it("treats null lotSize as 1", () => {
    const units = [
      soloUnit({
        unitId: "X",
        shortfallRub: 100,
        representativePrice: 10,
        members: [
          {
            ticker: "X",
            price: 10,
            lotSize: null,
            sharesOwned: 0,
            indexWeight: 1,
            status: "in_index",
            coefficient: 1,
          },
        ],
      }),
    ];
    const lines = allocateBudget(units, 25);
    expect(lines[0]).toMatchObject({ lots: 2, shares: 2, spendRub: 20 });
  });
});
```

Fix the first test’s comment if implementation spends leftover differently — assertions above are the source of truth: EXP with raw 150 and price 200 buys 0; CHEAP buys 3×50=150.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd webapp && npx vitest run src/domain/rebalancePlan.test.ts -t allocateBudget`

Expected: FAIL — `allocateBudget` not exported.

- [ ] **Step 3: Implement `allocateBudget` (+ private helpers)**

Add to `rebalancePlan.ts`:

```ts
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
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd webapp && npx vitest run src/domain/rebalancePlan.test.ts`

Expected: PASS. If pair leftover assertion fails on exact spend, adjust expected `SBERP` spend only after verifying floor math; do not weaken buy-only / proportional invariants.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/domain/rebalancePlan.ts webapp/src/domain/rebalancePlan.test.ts
git commit -m "feat(rebalance): allocate budget proportional to shortfall with lot rounding"
```

---

### Task 3: Compliance simulation + `buildRebalancePlan` for budget/free_cash

**Files:**
- Modify: `webapp/src/domain/rebalancePlan.ts`
- Modify: `webapp/src/domain/rebalancePlan.test.ts`

**Interfaces:**
- Consumes: `collectRebalanceUnits`, `allocateBudget`, `computeAverageCompliance`, `computeActualShare`, `computeCompliance`, `computePairedTargets` from calculations
- Produces:
```ts
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
  /** per ticker shortfall after sim; unit-level for display */
  shortfallRubAfterByUnitId: Record<string, number>;
}

export interface BuildRebalancePlanInput {
  calculated: CalculatedPosition[];
  pairs: Pair[];
  portfolioValue: number;
  budgetRub: number;
  mode: RebalanceMode;
  complianceGainThreshold?: number; // default 0.01; used in Task 4
}

export function buildRebalancePlan(input: BuildRebalancePlanInput): RebalancePlan;
```

**Avg compliance before/after:** match Dashboard — `computeAverageCompliance(calculated.map(p => p.compliance))` on current rows. After: clone share counts with plan purchases added per ticker, rebuild compliance per solo/pair the same way `buildCalculatedPositions` does (solo: `computeCompliance(actualShare, targetAllocation)`; pair: `computePairedTargets` then assign that compliance to each member). Then average member compliances again (same double-count behavior as Dashboard).

**Empty reasons for this task:**
- `budgetRub <= 0` → `no_budget`, empty lines
- units empty → `no_shortfall`
- units exist but `lines.length === 0` after allocate → `budget_too_small`
- `mode` `budget` | `free_cash` must produce **identical** plans for same numeric budget (assert in test)

- [ ] **Step 1: Write failing `buildRebalancePlan` tests**

```ts
import { buildRebalancePlan } from "./rebalancePlan";

describe("buildRebalancePlan budget/free_cash", () => {
  const gazp = pos({
    ticker: "GAZP",
    targetAllocation: 50,
    actualShare: 0,
    compliance: 0,
    price: 100,
    lotSize: 1,
    sharesOwned: 0,
    indexWeight: 50,
    positionValue: 0,
    status: "in_index",
  });
  // Need a second in-index row so portfolioValue / compliance averaging is stable — use a fully funded filler:
  const filler = pos({
    ticker: "LKOH",
    targetAllocation: 50,
    actualShare: 100,
    compliance: 2,
    price: 100,
    lotSize: 1,
    sharesOwned: 10,
    indexWeight: 50,
    positionValue: 1000,
    status: "in_index",
  });

  it("returns no_budget when budget is 0", () => {
    const plan = buildRebalancePlan({
      calculated: [gazp, filler],
      pairs: [],
      portfolioValue: 1000,
      budgetRub: 0,
      mode: "budget",
    });
    expect(plan.emptyReason).toBe("no_budget");
    expect(plan.lines).toEqual([]);
  });

  it("budget and free_cash produce the same lines for the same amount", () => {
    const input = {
      calculated: [gazp, filler],
      pairs: [],
      portfolioValue: 1000,
      budgetRub: 500,
    };
    const a = buildRebalancePlan({ ...input, mode: "budget" });
    const b = buildRebalancePlan({ ...input, mode: "free_cash" });
    expect(a.lines).toEqual(b.lines);
    expect(a.spentTotal).toBe(b.spentTotal);
    expect(a.emptyReason).toBeNull();
    expect(a.spentTotal).toBeLessThanOrEqual(500);
    expect(a.lines.every((l) => l.lots > 0)).toBe(true);
  });

  it("sets budget_too_small when nothing is affordable", () => {
    const expensive = pos({
      ticker: "EXP",
      targetAllocation: 100,
      actualShare: 0,
      compliance: 0,
      price: 10_000,
      lotSize: 1,
      sharesOwned: 0,
      indexWeight: 100,
      positionValue: 0,
      status: "in_index",
    });
    const plan = buildRebalancePlan({
      calculated: [expensive],
      pairs: [],
      portfolioValue: 1,
      budgetRub: 100,
      mode: "budget",
    });
    expect(plan.emptyReason).toBe("budget_too_small");
    expect(plan.lines).toEqual([]);
  });

  it("reports avgComplianceAfter >= avgComplianceBefore when buys fill a shortfall", () => {
    const plan = buildRebalancePlan({
      calculated: [gazp, filler],
      pairs: [],
      portfolioValue: 1000,
      budgetRub: 500,
      mode: "budget",
    });
    expect(plan.avgComplianceBefore).not.toBeNull();
    expect(plan.avgComplianceAfter).not.toBeNull();
    expect(plan.avgComplianceAfter!).toBeGreaterThanOrEqual(plan.avgComplianceBefore!);
  });
});
```

Tune fixture numbers if compliance inequality is flaky — keep the invariant `spentTotal <= budget` and identical modes.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd webapp && npx vitest run src/domain/rebalancePlan.test.ts -t buildRebalancePlan`

- [ ] **Step 3: Implement simulation + `buildRebalancePlan` (budget paths only; min_trades stub calls allocate on all units for now OR throw — prefer implement full signature with `mode === "min_trades"` deferred to Task 4 by branching to a placeholder that still allocates all units so types compile, then Task 4 replaces branch)**

Recommended: in Task 3, `min_trades` still uses full `allocateBudget` (wrong behavior) — **do not**; instead:

```ts
Task 3 only handles `budget` | `free_cash`. For `min_trades`, return `empty("threshold_not_met")` until Task 4 replaces the branch (Task 3 tests must not assert min_trades success).

```ts
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
    return empty("threshold_not_met"); // Task 4 replaces this branch
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
```

Implement `finalizePlan` / `simulateAvgCompliance` / `shortfallRubAfterByUnitId`:
- `spentTotal = sum(line.spendRub)`, `leftoverRub = budgetRub - spentTotal`, `tradeCount = lines.length`
- shares after: copy `sharesOwned` per ticker, add each line’s `shares`
- portfolio value after = `portfolioValue + spentTotal`
- solo compliance: `computeActualShare(price * sharesAfter, valueAfter)` + `computeCompliance`
- pair compliance: `computePairedTargets(pair, membersWithSharesAfter, valueAfter)`
- `avgComplianceAfter = computeAverageCompliance` over the same per-row list shape as Dashboard
- for each collected unit, recompute `shortfallRubAfter = max(0, -deviationRub)` with post-buy actual/target

- [ ] **Step 4: Run — expect PASS** for budget/free_cash tests

- [ ] **Step 5: Commit**

```bash
git add webapp/src/domain/rebalancePlan.ts webapp/src/domain/rebalancePlan.test.ts
git commit -m "feat(rebalance): build budget/free_cash plans with compliance simulation"
```

---

### Task 4: `min_trades` auto-K

**Files:**
- Modify: `webapp/src/domain/rebalancePlan.ts`
- Modify: `webapp/src/domain/rebalancePlan.test.ts`

**Interfaces:**
- Extends `buildRebalancePlan` — uses `complianceGainThreshold` default `0.01`
- Algorithm:
  1. Sort all shortfall units by `shortfallRub` desc
  2. `S = []`, `prevCompliance = avgComplianceBefore` (current portfolio, no buys)
  3. For each candidate `u` in order: `S2 = S + [u]`, `lines = allocateBudget(S2, budgetRub)`, simulate `nextCompliance`
  4. If `nextCompliance - prevCompliance >= threshold` (treat nulls as no gain), accept: `S = S2`, `prevCompliance = nextCompliance`
  5. Else **stop** (do not try further smaller units)
  6. If `S` empty → `threshold_not_met`
  7. Else finalize with `allocateBudget(S, budgetRub)`

- [ ] **Step 1: Write failing min_trades tests**

Use this shared multi-shortfall fixture (portfolioValue 10_000):

```ts
const multiShortfall = [
  pos({
    ticker: "BIG",
    targetAllocation: 40,
    actualShare: 0,
    compliance: 0,
    price: 100,
    lotSize: 1,
    sharesOwned: 0,
    indexWeight: 40,
    positionValue: 0,
    status: "in_index",
  }),
  pos({
    ticker: "MID",
    targetAllocation: 30,
    actualShare: 10,
    compliance: 10 / 30,
    price: 100,
    lotSize: 1,
    sharesOwned: 10,
    indexWeight: 30,
    positionValue: 1000,
    status: "in_index",
  }),
  pos({
    ticker: "SMALL",
    targetAllocation: 20,
    actualShare: 15,
    compliance: 15 / 20,
    price: 100,
    lotSize: 1,
    sharesOwned: 15,
    indexWeight: 20,
    positionValue: 1500,
    status: "in_index",
  }),
  pos({
    ticker: "OK",
    targetAllocation: 10,
    actualShare: 75,
    compliance: 75 / 10,
    price: 100,
    lotSize: 1,
    sharesOwned: 75,
    indexWeight: 10,
    positionValue: 7500,
    status: "in_index",
  }),
];
```

```ts
describe("buildRebalancePlan min_trades", () => {
  it("requires budget", () => {
    const plan = buildRebalancePlan({
      calculated: multiShortfall,
      pairs: [],
      portfolioValue: 10_000,
      budgetRub: 0,
      mode: "min_trades",
    });
    expect(plan.emptyReason).toBe("no_budget");
  });

  it("stops adding units when compliance gain is below threshold", () => {
    const plan = buildRebalancePlan({
      calculated: multiShortfall,
      pairs: [],
      portfolioValue: 10_000,
      budgetRub: 5000,
      mode: "min_trades",
      complianceGainThreshold: 0.5,
    });
    const unitIds = [...new Set(plan.lines.map((l) => l.unitId))];
    expect(unitIds.length).toBeLessThanOrEqual(1);
    if (plan.lines.length > 0) {
      expect(unitIds[0]).toBe("BIG");
    }
  });

  it("returns threshold_not_met when even the first unit cannot clear the threshold", () => {
    const plan = buildRebalancePlan({
      calculated: multiShortfall,
      pairs: [],
      portfolioValue: 10_000,
      budgetRub: 100,
      mode: "min_trades",
      complianceGainThreshold: 10,
    });
    expect(plan.emptyReason).toBe("threshold_not_met");
    expect(plan.lines).toEqual([]);
  });

  it("touches fewer or equal units than full budget mode at a high threshold", () => {
    const base = {
      calculated: multiShortfall,
      pairs: [] as Pair[],
      portfolioValue: 10_000,
      budgetRub: 5000,
    };
    const full = buildRebalancePlan({ ...base, mode: "budget" });
    const few = buildRebalancePlan({
      ...base,
      mode: "min_trades",
      complianceGainThreshold: 0.05,
    });
    const count = (p: { lines: { unitId: string }[] }) => new Set(p.lines.map((l) => l.unitId)).size;
    expect(count(few)).toBeLessThanOrEqual(count(full));
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (still `threshold_not_met` stub or wrong set)

- [ ] **Step 3: Replace min_trades branch with auto-K implementation**

- [ ] **Step 4: Run full domain file — PASS**

Run: `cd webapp && npx vitest run src/domain/rebalancePlan.test.ts`

- [ ] **Step 5: Commit**

```bash
git add webapp/src/domain/rebalancePlan.ts webapp/src/domain/rebalancePlan.test.ts
git commit -m "feat(rebalance): add min_trades auto-K unit selection"
```

---

### Task 5: CSV/TSV export helpers

**Files:**
- Modify: `webapp/src/domain/rebalancePlan.ts`
- Modify: `webapp/src/domain/rebalancePlan.test.ts`

**Interfaces:**
```ts
export function planToTsv(plan: RebalancePlan): string;
export function planToCsv(plan: RebalancePlan): string;
```

Header row: `unitId,ticker,lots,shares,spendRub,price,lotSize`  
TSV = tab-separated; CSV = comma-separated with no extra quoting unless ticker somehow has comma (tickers are MOEX codes — no quotes needed). Include only `lines` (not summary). Empty plan → header-only string ending with `\n`.

- [ ] **Step 1: Failing tests for TSV/CSV**

Reuse the Task 3 `gazp` + `filler` fixture (portfolioValue 1000, budget 500) so `plan.lines.length >= 1`.

```ts
describe("plan export", () => {
  const exportInput = {
    calculated: [gazp, filler],
    pairs: [] as Pair[],
    portfolioValue: 1000,
    budgetRub: 500,
    mode: "budget" as const,
  };

  it("planToTsv includes header and tab-separated rows", () => {
    const plan = buildRebalancePlan(exportInput);
    expect(plan.lines.length).toBeGreaterThan(0);
    const text = planToTsv(plan);
    const rows = text.trimEnd().split("\n");
    expect(rows[0]).toBe("unitId\tticker\tlots\tshares\tspendRub\tprice\tlotSize");
    expect(rows.length).toBe(1 + plan.lines.length);
    expect(rows[1].split("\t")[1]).toBe(plan.lines[0].ticker);
  });

  it("planToCsv uses commas", () => {
    const plan = buildRebalancePlan(exportInput);
    expect(planToCsv(plan).split("\n")[0]).toBe(
      "unitId,ticker,lots,shares,spendRub,price,lotSize"
    );
  });

  it("header-only when plan has no lines", () => {
    const plan = buildRebalancePlan({ ...exportInput, budgetRub: 0 });
    expect(planToTsv(plan)).toBe("unitId\tticker\tlots\tshares\tspendRub\tprice\tlotSize\n");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement exporters**

- [ ] **Step 4: PASS + commit**

```bash
git add webapp/src/domain/rebalancePlan.ts webapp/src/domain/rebalancePlan.test.ts
git commit -m "feat(rebalance): export plan as TSV and CSV"
```

---

### Task 6: `RebalanceTab` UI + App wiring

**Files:**
- Create: `webapp/src/components/RebalanceTab.tsx`
- Create: `webapp/src/components/RebalanceTab.test.tsx`
- Modify: `webapp/src/App.tsx` (add tab type + nav button + render)
- Modify: `webapp/src/styles.css` (minimal layout; reuse `.tabs` / table patterns from portfolio)

**Interfaces:**
- Consumes: `usePortfolio()` → `file`, `selectedIndex` (read-only badge); `useCalculatedPositions()`; `buildRebalancePlan`, `planToTsv`, `planToCsv`
- Must **not** call `setFile`
- Local state: `mode`, `budgetRub` (`""` | number input), `threshold` (string/number, default 0.01, visible only for `min_trades`)

**UI copy (Russian):**
- Tab: `Ребаланс`
- Modes: `На сумму` | `Свободный кэш` | `Мин. сделок`
- Hint: `Рекомендации, портфель не меняется`
- Index badge: `Индекс: {selectedIndex}`
- Empty reasons mapped:
  - `no_budget` → `Укажите сумму бюджета`
  - `no_shortfall` → `Нечего докупать — нет недостачи`
  - `budget_too_small` → `Бюджет слишком мал для одного лота`
  - `threshold_not_met` → `Порог прироста соответствия не достигнут`
- Table columns per spec; summaries: spent / leftover / compliance before→after / tradeCount
- Buttons: `Копировать TSV`, `Скачать CSV` (use `navigator.clipboard.writeText` + anchor download blob); disabled when `lines.length === 0`

- [ ] **Step 1: Write component tests**

Export a presentational `RebalancePanel` from the same file (keeps provider noise out of tests):

```tsx
export interface RebalancePanelProps {
  selectedIndex: string;
  mode: RebalanceMode;
  budgetInput: string;
  thresholdInput: string;
  plan: RebalancePlan;
  onModeChange: (mode: RebalanceMode) => void;
  onBudgetChange: (value: string) => void;
  onThresholdChange: (value: string) => void;
  onCopyTsv: () => void;
  onDownloadCsv: () => void;
}
```

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RebalancePanel } from "./RebalanceTab";
import { RebalancePlan } from "../domain/rebalancePlan";

const emptyPlan = (over: Partial<RebalancePlan> = {}): RebalancePlan => ({
  mode: "budget",
  budgetRub: 0,
  lines: [],
  spentTotal: 0,
  leftoverRub: 0,
  avgComplianceBefore: null,
  avgComplianceAfter: null,
  tradeCount: 0,
  emptyReason: "no_budget",
  shortfallRubAfterByUnitId: {},
  ...over,
});

describe("RebalancePanel", () => {
  it("shows index badge and no-budget empty copy", () => {
    render(
      <RebalancePanel
        selectedIndex="IMOEX"
        mode="budget"
        budgetInput=""
        thresholdInput="0.01"
        plan={emptyPlan()}
        onModeChange={vi.fn()}
        onBudgetChange={vi.fn()}
        onThresholdChange={vi.fn()}
        onCopyTsv={vi.fn()}
        onDownloadCsv={vi.fn()}
      />
    );
    expect(screen.getByText(/Индекс:\s*IMOEX/)).toBeInTheDocument();
    expect(screen.getByText("Укажите сумму бюджета")).toBeInTheDocument();
    expect(screen.getByText(/портфель не меняется/i)).toBeInTheDocument();
  });

  it("calls onModeChange when selecting free cash", () => {
    const onModeChange = vi.fn();
    render(
      <RebalancePanel
        selectedIndex="MOEXBC"
        mode="budget"
        budgetInput="1000"
        thresholdInput="0.01"
        plan={emptyPlan({ emptyReason: "no_shortfall", budgetRub: 1000 })}
        onModeChange={onModeChange}
        onBudgetChange={vi.fn()}
        onThresholdChange={vi.fn()}
        onCopyTsv={vi.fn()}
        onDownloadCsv={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Свободный кэш" }));
    expect(onModeChange).toHaveBeenCalledWith("free_cash");
  });

  it("disables export actions when there are no lines", () => {
    render(
      <RebalancePanel
        selectedIndex="IMOEX"
        mode="budget"
        budgetInput="1000"
        thresholdInput="0.01"
        plan={emptyPlan({ emptyReason: "no_shortfall", budgetRub: 1000 })}
        onModeChange={vi.fn()}
        onBudgetChange={vi.fn()}
        onThresholdChange={vi.fn()}
        onCopyTsv={vi.fn()}
        onDownloadCsv={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Копировать TSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Скачать CSV" })).toBeDisabled();
  });
});
```

`RebalanceTab` wires hooks → `buildRebalancePlan` → `RebalancePanel` and must not call `setFile` (implementer: do not destructure `setFile` from `usePortfolio`).

- [ ] **Step 2: Run — FAIL**

Run: `cd webapp && npx vitest run src/components/RebalanceTab.test.tsx`

- [ ] **Step 3: Implement `RebalanceTab` + wire `App.tsx`**

`App.tsx` changes:

```ts
type Tab = "portfolio" | "charts" | "sectors" | "transactions" | "rebalance";
// ...
<button type="button" onClick={() => setTab("rebalance")} disabled={tab === "rebalance"}>
  Ребаланс
</button>
// ...
{tab === "rebalance" && <RebalanceTab />}
```

Parse budget input: empty → treat as 0 → `no_budget`. `free_cash` vs `budget` only change labels on the amount field (`Сумма, ₽` vs `Свободный кэш, ₽`).

- [ ] **Step 4: Add minimal CSS** under existing patterns (`.rebalance-toolbar`, `.rebalance-table`, `.rebalance-hint`)

- [ ] **Step 5: Run component + domain tests PASS**

```bash
cd webapp && npx vitest run src/domain/rebalancePlan.test.ts src/components/RebalanceTab.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/components/RebalanceTab.tsx webapp/src/components/RebalanceTab.test.tsx webapp/src/App.tsx webapp/src/styles.css
git commit -m "feat(rebalance): add read-only Rebalance tab for web and desktop"
```

---

### Task 7: Verification pass

**Files:** none new (fix only)

- [ ] **Step 1: Typecheck**

Run: `cd webapp && npm run typecheck`

Expected: PASS

- [ ] **Step 2: Full unit tests**

Run: `cd webapp && npm run test`

Expected: PASS (fix any unrelated flake only if caused by this branch)

- [ ] **Step 3: Manual smoke (web)**

Run: `cd webapp && npm run dev`  
Load portfolio → Update → Ребаланс → enter budget → confirm plan changes when switching index in Header → confirm save file still needs explicit Header save (tab did not dirty positions) → copy TSV / download CSV works.

- [ ] **Step 4: Commit only if smoke fixed leftover gaps; otherwise done**

If README should mention the tab, add one bullet under Возможности and commit:

```bash
git add README.md
git commit -m "docs(readme): mention rebalance recommendations tab"
```

(Only if README edit is small and accurate — skip if user prefers docs later.)

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Buy-only proportional + lot-round price-desc | 2 |
| Pair = one unit, split by weight×coef | 1, 2 |
| `budget` / `free_cash` same math | 3 |
| `min_trades` auto-K + threshold | 4 |
| Read-only / no PortfolioFile writes | 6 |
| Follows `selectedIndex` | 6 (via calculated positions) |
| Export TSV/CSV | 5, 6 |
| Empty reasons | 3, 4, 6 |
| Web + desktop, no mobile layout | 6 |
| Domain tests listed in spec §8 | 1–5 |
| Compliance simulation | 3 |

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-27-rebalance-modes.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
