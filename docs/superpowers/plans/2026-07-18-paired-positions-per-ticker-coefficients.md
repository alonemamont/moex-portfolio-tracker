# Per-Ticker Coefficients For Paired Positions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each ticker inside a "paired position" (e.g. SBER + SBERP) carry its own coefficient, instead of one coefficient shared by the whole pair.

**Architecture:** `Pair.coefficient: number` becomes `Pair.coefficients: Record<string, number>` (ticker → coefficient). The combined target (used for the shared `targetAllocation`/`actualShare`/`compliance` shown on every row of the pair) becomes `Σ (memberWeight × memberCoefficient)` instead of `combinedWeight × sharedCoefficient`. Each member's own target *shares* (`sharesToBuy`/`buyAmountRub`) are computed independently via the existing solo-position functions (`computeTargetAllocation` + `computeTargetShares`) fed with that member's own coefficient — replacing the old weight-ratio split. Old saved files (`pair.coefficient: number`) are migrated transparently at load time via a zod preprocess step.

**Tech Stack:** TypeScript, React, Zod, Vitest, `@testing-library/react`.

## Global Constraints

- `tsconfig.json`: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules: true`. No `noUncheckedIndexedAccess` — indexing a `Record<string, number>` types as `number`, not `number | undefined`.
- Run all npm commands with cwd `webapp/`.
- No ESLint/Prettier auto-format — match existing formatting by hand.
- Personal files (`portfolio.json`, `positions.csv`, `*.xlsx`/`*.xlsm`) are gitignored — never touch/commit them.
- Spec: `docs/superpowers/specs/2026-07-18-paired-positions-per-ticker-coefficients-design.md`.

---

## Task 1: Data model + schema migration

**Files:**
- Modify: `webapp/src/types.ts:63-66` (`Pair` interface)
- Modify: `webapp/src/file/schema.ts:38-41` (`pairSchema`)
- Modify: `webapp/src/file/schema.test.ts:23` (`valid` fixture), `:189-197` (two reject tests), add one new test

**Interfaces:**
- Produces: `Pair { tickers: string[]; coefficients: Record<string, number> }` (replaces `Pair.coefficient: number`) — consumed by Task 2 (`PairInput`), Task 3 (`buildCalculatedPositions.ts`), Task 4 (`PortfolioTab.tsx`), Task 5 (`PairPositionsModal.tsx`).
- `parsePortfolioFile(raw)` — unchanged signature, now also accepts legacy `{ tickers, coefficient }` pair shape and normalizes it to `{ tickers, coefficients }` before validation.

- [ ] **Step 1: Update `schema.test.ts` fixture and existing pair tests to the new shape, add a migration test**

In `webapp/src/file/schema.test.ts`, change line 23 (`valid` fixture) from:
```ts
  pairs: [{ tickers: ["SBER", "SBERP"], coefficient: 1 }],
```
to:
```ts
  pairs: [{ tickers: ["SBER", "SBERP"], coefficients: { SBER: 1, SBERP: 1 } }],
```

Change the two reject tests (currently lines 189-197):
```ts
  it("rejects a pair with fewer than 2 tickers", () => {
    const bad = { ...valid, pairs: [{ tickers: ["SBER"], coefficients: { SBER: 1 } }] };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });

  it("rejects a pair with a non-numeric coefficient", () => {
    const bad = {
      ...valid,
      pairs: [{ tickers: ["SBER", "SBERP"], coefficients: { SBER: "high", SBERP: 1 } }],
    };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });
```

Add a new test directly after those two:
```ts
  it("migrates an old single-coefficient pair into per-ticker coefficients", () => {
    const oldShape = { ...valid, pairs: [{ tickers: ["SBER", "SBERP"], coefficient: 1.5 }] };
    const result = parsePortfolioFile(oldShape);
    expect(result.pairs).toEqual([
      { tickers: ["SBER", "SBERP"], coefficients: { SBER: 1.5, SBERP: 1.5 } },
    ]);
  });
```

- [ ] **Step 2: Run the schema tests to confirm they fail**

Run: `cd webapp && npx vitest run src/file/schema.test.ts`
Expected: FAIL — `valid` fixture and the two reject tests fail zod validation (schema still expects `coefficient: number`, not `coefficients`), and the new migration test fails (no migration logic yet).

- [ ] **Step 3: Update `Pair` in `types.ts`**

In `webapp/src/types.ts`, replace lines 63-66:
```ts
export interface Pair {
  tickers: string[];
  coefficient: number;
}
```
with:
```ts
export interface Pair {
  tickers: string[];
  coefficients: Record<string, number>;
}
```

- [ ] **Step 4: Update `pairSchema` in `schema.ts` with a migrating preprocess**

In `webapp/src/file/schema.ts`, replace lines 38-41:
```ts
const pairSchema = z.object({
  tickers: z.array(z.string()).min(2),
  coefficient: z.number(),
});
```
with:
```ts
const pairSchema = z.preprocess((raw) => {
  if (raw !== null && typeof raw === "object" && "coefficient" in raw && !("coefficients" in raw)) {
    const { coefficient, tickers, ...rest } = raw as { coefficient: unknown; tickers: unknown };
    const tickerList = Array.isArray(tickers) ? tickers : [];
    const coefficients = Object.fromEntries(tickerList.map((ticker) => [ticker, coefficient]));
    return { ...rest, tickers, coefficients };
  }
  return raw;
}, z.object({
  tickers: z.array(z.string()).min(2),
  coefficients: z.record(z.string(), z.number()),
}));
```

- [ ] **Step 5: Run the schema tests to confirm they pass**

Run: `cd webapp && npx vitest run src/file/schema.test.ts`
Expected: PASS (all tests, including the new migration test)

- [ ] **Step 6: Commit**

```bash
cd webapp
git add src/types.ts src/file/schema.ts src/file/schema.test.ts
git commit -m "feat(pairs): store per-ticker coefficients, migrate old single-coefficient files"
```

---

## Task 2: `calculations.ts` — combined target uses per-member coefficients

**Note:** After this task, `webapp/src/domain/buildCalculatedPositions.ts` will fail to typecheck (it still calls the now-deleted `computeCombinedIndexWeight`/`computePairMemberTargetShares` and passes the old `Pair` shape). This is expected — Task 3 fixes it. Verify this task via its own test file only, not `npm run typecheck`.

**Files:**
- Modify: `webapp/src/domain/calculations.ts:102-152` (`PairInput`, `computeCombinedIndexWeight`, `computePairedTargets`, `computePairMemberTargetShares`)
- Modify: `webapp/src/domain/calculations.test.ts:16-18` (imports), `:222-244` (`computeCombinedIndexWeight` describe — delete), `:246-299` (`computePairedTargets` describe — update + add a case), `:301-318` (`computePairMemberTargetShares` describe — delete)

**Interfaces:**
- Consumes: `Pair`-shaped input `{ tickers: string[]; coefficients: Record<string, number> }` from Task 1.
- Produces: `PairInput { tickers: string[]; coefficients: Record<string, number> }` (was `{ tickers, coefficient }`), `computePairedTargets(pair: PairInput, positions: PairMemberInput[], portfolioValue: number): PairedTargets` — same signature shape and return type as before, only the internal formula and `PairInput` field changed. `computeCombinedIndexWeight` and `computePairMemberTargetShares` no longer exist — Task 3 must use `computeTargetAllocation`/`computeTargetShares` (already exported, unchanged) instead.

- [ ] **Step 1: Update `calculations.test.ts` — imports, delete two describe blocks, rewrite `computePairedTargets` tests**

In `webapp/src/domain/calculations.test.ts`, change the import block (lines 2-20) by removing `computeCombinedIndexWeight` and `computePairMemberTargetShares`:
```ts
import { describe, it, expect } from "vitest";
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computePortfolioValue,
  computeActualShare,
  computeCompliance,
  computeAverageCompliance,
  computeDeviationRub,
  findDeviationExtremes,
  computeDividendYield,
  computeTargetShares,
  computeSharesToBuy,
  computeBuyAmountRub,
  computePairedTargets,
  computeTotalSharesOwned,
} from "./calculations";
```

Delete the whole `describe("computeCombinedIndexWeight", ...)` block (lines 222-244).

Replace the whole `describe("computePairedTargets", ...)` block (lines 246-299) with:
```ts
describe("computePairedTargets", () => {
  const pair = { tickers: ["SBER", "SBERP"], coefficients: { SBER: 2, SBERP: 2 } };

  it("combines indexWeight and value across only the pair's own tickers, ignoring other positions", () => {
    const positions = [
      { ticker: "SBER", indexWeight: 9, status: "in_index" as const, price: 250, sharesOwned: 10 },
      { ticker: "SBERP", indexWeight: 3, status: "in_index" as const, price: 200, sharesOwned: 5 },
      { ticker: "GAZP", indexWeight: 88, status: "in_index" as const, price: 100, sharesOwned: 1 },
    ];
    // targetAllocation = 9*2 + 3*2 = 24
    // combinedActualValueRub = 250*10 + 200*5 = 3500
    // portfolioValue = 3500 (GAZP's 100 excluded on purpose to keep actualShare a round number)
    const result = computePairedTargets(pair, positions, 3500);

    expect(result.targetAllocation).toBe(24);
    expect(result.actualShare).toBeCloseTo(100);
    expect(result.compliance).toBeCloseTo(100 / 24);
  });

  it("treats an out-of-index member's indexWeight as 0 in the combined target but still counts its value", () => {
    const positions = [
      { ticker: "SBER", indexWeight: 9, status: "in_index" as const, price: 250, sharesOwned: 10 },
      { ticker: "SBERP", indexWeight: 3, status: "out_of_index" as const, price: 200, sharesOwned: 5 },
    ];
    // targetAllocation = 9*2 + 0 (SBERP out of index) = 18
    // combinedActualValueRub = 2500 + 1000 = 3500
    const result = computePairedTargets(pair, positions, 3500);

    expect(result.targetAllocation).toBe(18);
    expect(result.actualShare).toBeCloseTo(100);
  });

  it("gives targetAllocation 0 and null compliance when every member is out of index", () => {
    const positions = [
      { ticker: "SBER", indexWeight: 9, status: "out_of_index" as const, price: 250, sharesOwned: 10 },
      { ticker: "SBERP", indexWeight: 3, status: "out_of_index" as const, price: 200, sharesOwned: 5 },
    ];
    const result = computePairedTargets(pair, positions, 3500);

    expect(result.targetAllocation).toBe(0);
    expect(result.compliance).toBeNull();
  });

  it("returns a null actualShare when portfolioValue is 0", () => {
    const positions = [
      { ticker: "SBER", indexWeight: 9, status: "in_index" as const, price: 250, sharesOwned: 10 },
      { ticker: "SBERP", indexWeight: 3, status: "in_index" as const, price: 200, sharesOwned: 5 },
    ];
    const result = computePairedTargets(pair, positions, 0);

    expect(result.actualShare).toBeNull();
    expect(result.compliance).toBeNull();
  });

  it("weights each member's contribution to the combined target by its own coefficient, not a shared one", () => {
    const differentCoeffPair = { tickers: ["SBER", "SBERP"], coefficients: { SBER: 1.15, SBERP: 1.1 } };
    const positions = [
      { ticker: "SBER", indexWeight: 9, status: "in_index" as const, price: 250, sharesOwned: 10 },
      { ticker: "SBERP", indexWeight: 3, status: "in_index" as const, price: 200, sharesOwned: 5 },
    ];
    // targetAllocation = 9*1.15 + 3*1.1 = 10.35 + 3.3 = 13.65
    const result = computePairedTargets(differentCoeffPair, positions, 3500);

    expect(result.targetAllocation).toBeCloseTo(13.65);
  });
});
```

Delete the whole `describe("computePairMemberTargetShares", ...)` block (lines 301-318, now at the end of the file).

- [ ] **Step 2: Run the calculations tests to confirm the new/changed ones fail**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts`
Expected: FAIL — `computePairedTargets` tests fail (source still uses `pair.coefficient`, doesn't have `pair.coefficients`); import errors for the two deleted functions no longer being exported are not yet true (they still exist) so those specific describe blocks are simply gone from this file already, no failure there.

- [ ] **Step 3: Rewrite `calculations.ts` — `PairInput`, `computePairedTargets`, delete two functions**

In `webapp/src/domain/calculations.ts`, replace lines 102-152:
```ts
export interface PairInput {
  tickers: string[];
  coefficient: number;
}

export interface PairMemberInput {
  ticker: string;
  indexWeight: number;
  status: IndexStatus;
  price: number | null;
  sharesOwned: number;
}

export interface PairedTargets {
  targetAllocation: number;
  actualShare: number | null;
  compliance: number | null;
}

export function computeCombinedIndexWeight(
  members: { indexWeight: number; status: IndexStatus }[]
): number {
  return members.reduce((sum, m) => sum + (m.status === "in_index" ? m.indexWeight : 0), 0);
}

export function computePairedTargets(
  pair: PairInput,
  positions: PairMemberInput[],
  portfolioValue: number
): PairedTargets {
  const members = positions.filter((p) => pair.tickers.includes(p.ticker));
  const combinedIndexWeight = computeCombinedIndexWeight(members);
  const targetAllocation = combinedIndexWeight * pair.coefficient;
  const combinedActualValueRub = members.reduce((sum, p) => sum + (p.price ?? 0) * p.sharesOwned, 0);
  const actualShare = computeActualShare(combinedActualValueRub, portfolioValue);
  const compliance = computeCompliance(actualShare, targetAllocation);
  return { targetAllocation, actualShare, compliance };
}

export function computePairMemberTargetShares(
  combinedTargetPct: number,
  combinedIndexWeight: number,
  memberIndexWeight: number,
  portfolioValue: number,
  price: number | null
): number | null {
  if (combinedIndexWeight === 0 || price === null || price === 0) return null;
  const combinedTargetRub = (combinedTargetPct / 100) * portfolioValue;
  const targetValueRub = combinedTargetRub * (memberIndexWeight / combinedIndexWeight);
  return Math.round(targetValueRub / price);
}
```
with:
```ts
export interface PairInput {
  tickers: string[];
  coefficients: Record<string, number>;
}

export interface PairMemberInput {
  ticker: string;
  indexWeight: number;
  status: IndexStatus;
  price: number | null;
  sharesOwned: number;
}

export interface PairedTargets {
  targetAllocation: number;
  actualShare: number | null;
  compliance: number | null;
}

export function computePairedTargets(
  pair: PairInput,
  positions: PairMemberInput[],
  portfolioValue: number
): PairedTargets {
  const members = positions.filter((p) => pair.tickers.includes(p.ticker));
  const targetAllocation = members.reduce(
    (sum, m) => sum + (m.status === "in_index" ? m.indexWeight * pair.coefficients[m.ticker] : 0),
    0
  );
  const combinedActualValueRub = members.reduce((sum, p) => sum + (p.price ?? 0) * p.sharesOwned, 0);
  const actualShare = computeActualShare(combinedActualValueRub, portfolioValue);
  const compliance = computeCompliance(actualShare, targetAllocation);
  return { targetAllocation, actualShare, compliance };
}
```

- [ ] **Step 4: Run the calculations tests to confirm they pass**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd webapp
git add src/domain/calculations.ts src/domain/calculations.test.ts
git commit -m "feat(pairs): weight each pair member's target by its own coefficient"
```

---

## Task 3: `buildCalculatedPositions.ts` — independent per-member target shares

**Files:**
- Modify: `webapp/src/domain/buildCalculatedPositions.ts:1-100` (imports + paired branch)
- Modify: `webapp/src/domain/buildCalculatedPositions.test.ts:116-206` (three existing pair tests + one new test)

**Interfaces:**
- Consumes: `Pair { tickers: string[]; coefficients: Record<string, number> }` (Task 1), `computePairedTargets(pair: PairInput, ...)` (Task 2, `PairInput` now has `coefficients`), `computeTargetAllocation(indexWeight, coefficient, status): number | null` and `computeTargetShares(targetAllocation, portfolioValue, price): number | null` (both pre-existing, unchanged signatures).
- Produces: `buildCalculatedPositions(positions, liveByTicker, resolveSector, pairs?): CalculatedPosition[]` — signature unchanged; a paired member's `coefficient` field in the result is now its own `pair.coefficients[ticker]` instead of the whole pair's shared value.

- [ ] **Step 1: Update `buildCalculatedPositions.test.ts` — three pair tests to the new shape/semantics, add one differing-coefficients test**

In `webapp/src/domain/buildCalculatedPositions.test.ts`, replace the block from the start of `"combines target allocation, actual share and compliance across paired tickers..."` (currently line 116) through the end of `"leaves a ticker outside any pair on the normal per-ticker calculation, unaffected by an unrelated pair"` (currently line 206) — i.e. all four `it(...)` blocks for pairs — with:

```ts
  it("combines target allocation, actual share and compliance across paired tickers, overriding each member's own coefficient with the pair's", () => {
    const positions: Position[] = [
      { ticker: "SBER", coefficient: 1, sharesOwned: 10 },
      { ticker: "SBERP", coefficient: 5, sharesOwned: 5 },
    ];
    const liveByTicker = new Map([
      ["SBER", live({ ticker: "SBER", indexWeight: 9, price: 250 })],
      ["SBERP", live({ ticker: "SBERP", indexWeight: 3, price: 200 })],
    ]);
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficients: { SBER: 2, SBERP: 2 } }];
    // portfolioValue = 10*250 + 5*200 = 3500
    // targetAllocation = 9*2 + 3*2 = 24
    // combinedActualValueRub = 3500, actualShare = 100, compliance = 100/24

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы", pairs);

    const sber = result.find((p) => p.ticker === "SBER")!;
    const sberp = result.find((p) => p.ticker === "SBERP")!;
    expect(sber.targetAllocation).toBe(24);
    expect(sberp.targetAllocation).toBe(24);
    expect(sber.actualShare).toBeCloseTo(100);
    expect(sberp.actualShare).toBeCloseTo(100);
    expect(sber.compliance).toBeCloseTo(100 / 24);
    expect(sberp.compliance).toBeCloseTo(100 / 24);
    expect(sber.coefficient).toBe(2);
    expect(sberp.coefficient).toBe(2);
  });

  it("computes each pair member's target shares from its own weight times its own coefficient, independent of the other member", () => {
    const positions: Position[] = [
      { ticker: "SBER", coefficient: 3, sharesOwned: 10 },
      { ticker: "SBERP", coefficient: 7, sharesOwned: 5 },
    ];
    const liveByTicker = new Map([
      ["SBER", live({ ticker: "SBER", indexWeight: 9, price: 250 })],
      ["SBERP", live({ ticker: "SBERP", indexWeight: 3, price: 200 })],
    ]);
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficients: { SBER: 1, SBERP: 1 } }];
    // portfolioValue = 10*250 + 5*200 = 3500
    // SBER: individualTargetAllocation = 9*1 = 9, targetValueRub = 9/100*3500 = 315, targetShares = round(315/250) = 1, sharesToBuy = 1-10 = -9, buyAmountRub = -2250
    // SBERP: individualTargetAllocation = 3*1 = 3, targetValueRub = 3/100*3500 = 105, targetShares = round(105/200) = 1, sharesToBuy = 1-5 = -4, buyAmountRub = -800

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы", pairs);

    const sber = result.find((p) => p.ticker === "SBER")!;
    expect(sber.sharesToBuy).toBe(-9);
    expect(sber.buyAmountRub).toBe(-2250);

    const sberp = result.find((p) => p.ticker === "SBERP")!;
    expect(sberp.sharesToBuy).toBe(-4);
    expect(sberp.buyAmountRub).toBe(-800);
  });

  it("gives pair members independent target shares when their coefficients differ, without one affecting the other", () => {
    const positions: Position[] = [
      { ticker: "SBER", coefficient: 1, sharesOwned: 10 },
      { ticker: "SBERP", coefficient: 1, sharesOwned: 5 },
    ];
    const liveByTicker = new Map([
      ["SBER", live({ ticker: "SBER", indexWeight: 9, price: 250 })],
      ["SBERP", live({ ticker: "SBERP", indexWeight: 3, price: 200 })],
    ]);
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficients: { SBER: 2, SBERP: 1 } }];
    // portfolioValue = 10*250 + 5*200 = 3500
    // SBER: individualTargetAllocation = 9*2 = 18, targetValueRub = 18/100*3500 = 630, targetShares = round(630/250) = 3, sharesToBuy = 3-10 = -7, buyAmountRub = -1750
    // SBERP: individualTargetAllocation = 3*1 = 3, targetValueRub = 3/100*3500 = 105, targetShares = round(105/200) = 1, sharesToBuy = 1-5 = -4, buyAmountRub = -800 (unchanged from the uniform-coefficient case above)

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы", pairs);

    const sber = result.find((p) => p.ticker === "SBER")!;
    expect(sber.sharesToBuy).toBe(-7);
    expect(sber.buyAmountRub).toBe(-1750);

    const sberp = result.find((p) => p.ticker === "SBERP")!;
    expect(sberp.sharesToBuy).toBe(-4);
    expect(sberp.buyAmountRub).toBe(-800);
  });

  it("gives pair members a null sharesToBuy/buyAmountRub, but a 0 (not null) targetAllocation, when the whole pair is out of index", () => {
    const positions: Position[] = [
      { ticker: "OLD1", coefficient: 1, sharesOwned: 3 },
      { ticker: "OLD2", coefficient: 1, sharesOwned: 2 },
    ];
    const liveByTicker = new Map([
      ["OLD1", live({ ticker: "OLD1", status: "out_of_index", indexWeight: 0, price: 50 })],
      ["OLD2", live({ ticker: "OLD2", status: "out_of_index", indexWeight: 0, price: 30 })],
    ]);
    const pairs: Pair[] = [{ tickers: ["OLD1", "OLD2"], coefficients: { OLD1: 1, OLD2: 1 } }];

    const [old1] = buildCalculatedPositions(positions, liveByTicker, () => "Другое", pairs);

    expect(old1.targetAllocation).toBe(0);
    expect(old1.sharesToBuy).toBeNull();
    expect(old1.buyAmountRub).toBeNull();
  });

  it("leaves a ticker outside any pair on the normal per-ticker calculation, unaffected by an unrelated pair", () => {
    const positions: Position[] = [
      { ticker: "SBER", coefficient: 1, sharesOwned: 10 },
      { ticker: "SBERP", coefficient: 1, sharesOwned: 5 },
      { ticker: "GAZP", coefficient: 2, sharesOwned: 1 },
    ];
    const liveByTicker = new Map([
      ["SBER", live({ ticker: "SBER", indexWeight: 9, price: 250 })],
      ["SBERP", live({ ticker: "SBERP", indexWeight: 3, price: 200 })],
      ["GAZP", live({ ticker: "GAZP", indexWeight: 5, price: 100 })],
    ]);
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficients: { SBER: 1, SBERP: 1 } }];

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы", pairs);

    const gazp = result.find((p) => p.ticker === "GAZP")!;
    expect(gazp.targetAllocation).toBe(10); // 5 * 2, unaffected by the pair
    expect(gazp.coefficient).toBe(2);
  });
```

- [ ] **Step 2: Run the buildCalculatedPositions tests to confirm the pair tests fail**

Run: `cd webapp && npx vitest run src/domain/buildCalculatedPositions.test.ts`
Expected: FAIL on the pair-related tests — source still reads `pair.coefficient` (now `undefined` since `Pair` no longer has that field) and calls the deleted `computeCombinedIndexWeight`/`computePairMemberTargetShares`, so this file currently doesn't even compile via Vite's transform boundary correctly at runtime (accessing `.coefficient` on the new shape yields `undefined`, and the two removed named imports are `undefined` at call time) — expect thrown errors / `NaN`/`undefined` assertion failures, not clean passes.

- [ ] **Step 3: Rewrite the paired branch in `buildCalculatedPositions.ts`**

In `webapp/src/domain/buildCalculatedPositions.ts`, remove `computeCombinedIndexWeight` and `computePairMemberTargetShares` from the import list (lines 2-18):
```ts
import { Position, LiveData, CalculatedPosition, Pair } from "../types";
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computeActualShare,
  computeCompliance,
  computeDividendYield,
  computeTargetShares,
  computeSharesToBuy,
  computeBuyAmountRub,
  computePairedTargets,
  computeTotalSharesOwned,
  sumPositionValues,
  PairedTargets,
} from "./calculations";
```

Replace the paired branch (currently lines 73-91):
```ts
    if (pair) {
      const pairedTargets = pairedTargetsByPair.get(pair)!;
      coefficient = pair.coefficient;
      targetAllocation = pairedTargets.targetAllocation;
      actualShare = pairedTargets.actualShare;
      compliance = pairedTargets.compliance;

      const combinedIndexWeight = computeCombinedIndexWeight(
        memberInputs.filter((m) => pair.tickers.includes(m.ticker))
      );
      const targetShares = computePairMemberTargetShares(
        targetAllocation,
        combinedIndexWeight,
        live.indexWeight,
        portfolioValue,
        live.price
      );
      sharesToBuy = computeSharesToBuy(targetShares, totalShares);
      buyAmountRub = computeBuyAmountRub(sharesToBuy, live.price);
    } else {
```
with:
```ts
    if (pair) {
      const pairedTargets = pairedTargetsByPair.get(pair)!;
      coefficient = pair.coefficients[position.ticker];
      targetAllocation = pairedTargets.targetAllocation;
      actualShare = pairedTargets.actualShare;
      compliance = pairedTargets.compliance;

      const individualTargetAllocation = computeTargetAllocation(live.indexWeight, coefficient, live.status);
      const targetShares = computeTargetShares(individualTargetAllocation, portfolioValue, live.price);
      sharesToBuy = computeSharesToBuy(targetShares, totalShares);
      buyAmountRub = computeBuyAmountRub(sharesToBuy, live.price);
    } else {
```

- [ ] **Step 4: Run the buildCalculatedPositions tests to confirm they pass**

Run: `cd webapp && npx vitest run src/domain/buildCalculatedPositions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd webapp
git add src/domain/buildCalculatedPositions.ts src/domain/buildCalculatedPositions.test.ts
git commit -m "feat(pairs): compute each member's target shares from its own coefficient"
```

---

## Task 4: `PortfolioTab.tsx` — coefficient edits write to the right ticker only

**Files:**
- Modify: `webapp/src/components/PortfolioTab.tsx:137-155` (`updateField`)
- Modify: `webapp/src/components/PortfolioTab.test.tsx` (add one new test)

**Interfaces:**
- Consumes: `Pair { tickers: string[]; coefficients: Record<string, number> }` (Task 1). `PositionsTable`/`PositionCard`'s existing `onChangeCoefficient: (ticker: string, value: number) => void` callback prop (unchanged, already ticker-scoped — no changes needed in those two files).
- Produces: `updateField` behavior — for a paired ticker, only `file.pairs[i].coefficients[ticker]` is updated; the other member(s) of the pair keep their existing coefficients.

- [ ] **Step 1: Add a failing test to `PortfolioTab.test.tsx`**

Add this test inside the file (e.g. in a new `describe("PortfolioTab pair coefficients", ...)` block placed after the existing `describe("PortfolioTab mobile switch", ...)` block):

```tsx
describe("PortfolioTab pair coefficients", () => {
  it("updates only the changed ticker's coefficient within a pair, leaving the other member's coefficient untouched", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    const pairedFile: PortfolioFile = {
      ...sampleFile,
      positions: [
        { ticker: "SBER", coefficient: 1, sharesOwned: 3 },
        { ticker: "SBERP", coefficient: 1, sharesOwned: 5 },
      ],
      pairs: [{ tickers: ["SBER", "SBERP"], coefficients: { SBER: 1.15, SBERP: 1.1 } }],
    };
    renderPortfolioTab(pairedFile);

    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(["1.15", "1.1"]);

    fireEvent.change(inputs[0], { target: { value: "1.3" } });

    const updatedInputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(updatedInputs.map((i) => i.value)).toEqual(["1.3", "1.1"]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd webapp && npx vitest run src/components/PortfolioTab.test.tsx -t "updates only the changed ticker's coefficient"`
Expected: FAIL — `updateField` currently replaces the whole pair's shared `coefficient`, and `Pair` no longer even has that field after Task 1, so this either throws or produces `NaN`/`undefined` in both inputs instead of `["1.3", "1.1"]`.

- [ ] **Step 3: Fix `updateField` in `PortfolioTab.tsx`**

Replace lines 137-155:
```ts
  function updateField(ticker: string, field: "coefficient" | "sharesOwned", value: number) {
    if (!file) return;
    if (field === "coefficient") {
      const pairIndex = file.pairs.findIndex((pair) => pair.tickers.includes(ticker));
      if (pairIndex !== -1) {
        setFile({
          ...file,
          pairs: file.pairs.map((pair, i) => (i === pairIndex ? { ...pair, coefficient: value } : pair)),
        });
        return;
      }
    }
    setFile({
      ...file,
      positions: file.positions.map((p) =>
        p.ticker === ticker ? { ...p, [field]: value } : p
      ),
    });
  }
```
with:
```ts
  function updateField(ticker: string, field: "coefficient" | "sharesOwned", value: number) {
    if (!file) return;
    if (field === "coefficient") {
      const pairIndex = file.pairs.findIndex((pair) => pair.tickers.includes(ticker));
      if (pairIndex !== -1) {
        setFile({
          ...file,
          pairs: file.pairs.map((pair, i) =>
            i === pairIndex
              ? { ...pair, coefficients: { ...pair.coefficients, [ticker]: value } }
              : pair
          ),
        });
        return;
      }
    }
    setFile({
      ...file,
      positions: file.positions.map((p) =>
        p.ticker === ticker ? { ...p, [field]: value } : p
      ),
    });
  }
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd webapp && npx vitest run src/components/PortfolioTab.test.tsx`
Expected: PASS (full file, including the new test and all pre-existing ones)

- [ ] **Step 5: Commit**

```bash
cd webapp
git add src/components/PortfolioTab.tsx src/components/PortfolioTab.test.tsx
git commit -m "fix(pairs): coefficient edits update only the changed ticker's own coefficient"
```

---

## Task 5: `PairPositionsModal.tsx` — per-ticker coefficient inputs

**Files:**
- Modify: `webapp/src/components/PairPositionsModal.tsx` (whole file, 112 lines)

**Interfaces:**
- Consumes: `Pair { tickers: string[]; coefficients: Record<string, number> }` (Task 1). Component props (`existingPositions`, `pairs`, `onSave`, `onClose`) are unchanged.
- Produces: no external interface change — `onSave(pairs: Pair[])` still called with the full `Pair[]` list, just each pair's `coefficients` is now a per-ticker map built either from migrated data or from the modal's own "default coefficient" input applied to all tickers selected at creation time.

- [ ] **Step 1: Rewrite `PairPositionsModal.tsx`**

Replace the whole file:
```tsx
import { useState } from "react";
import { Pair, Position } from "../types";

export function PairPositionsModal({
  existingPositions,
  pairs,
  onSave,
  onClose,
}: {
  existingPositions: Position[];
  pairs: Pair[];
  onSave: (pairs: Pair[]) => void;
  onClose: () => void;
}) {
  const [draftPairs, setDraftPairs] = useState<Pair[]>(pairs);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
  const [newCoefficientInput, setNewCoefficientInput] = useState("1");

  const pairedTickers = new Set(draftPairs.flatMap((p) => p.tickers));
  const availableTickers = existingPositions.filter((p) => !pairedTickers.has(p.ticker));

  const newCoefficient = Number(newCoefficientInput);
  const canAddPair =
    selectedTickers.size >= 2 && newCoefficientInput !== "" && !Number.isNaN(newCoefficient);

  function toggleTicker(ticker: string) {
    setSelectedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }

  function handleRemovePair(index: number) {
    setDraftPairs((prev) => prev.filter((_, i) => i !== index));
  }

  function handleChangeCoefficient(index: number, ticker: string, value: number) {
    setDraftPairs((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, coefficients: { ...p.coefficients, [ticker]: value } } : p
      )
    );
  }

  function handleAddPair() {
    if (!canAddPair) return;
    const tickers = [...selectedTickers];
    const coefficients = Object.fromEntries(tickers.map((ticker) => [ticker, newCoefficient]));
    setDraftPairs((prev) => [...prev, { tickers, coefficients }]);
    setSelectedTickers(new Set());
    setNewCoefficientInput("1");
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Парные позиции">
      <div className="modal">
        <h2>Парные позиции</h2>
        <div className="modal__actions">
          <button type="button" onClick={() => onSave(draftPairs)}>
            Сохранить
          </button>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
        <table>
          <tbody>
            {draftPairs.map((pair, index) => (
              <tr key={pair.tickers.join("+")}>
                <td>
                  {pair.tickers.map((ticker) => (
                    <label key={ticker} className="pair-coefficient-field">
                      {ticker}
                      <input
                        type="number"
                        step="0.01"
                        value={pair.coefficients[ticker]}
                        onChange={(e) => handleChangeCoefficient(index, ticker, Number(e.target.value))}
                      />
                    </label>
                  ))}
                </td>
                <td>
                  <button type="button" onClick={() => handleRemovePair(index)}>
                    Удалить пару
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="modal__divider" />
        <div className="add-ticker__field">
          <input
            type="number"
            step="0.01"
            placeholder="Коэффициент"
            value={newCoefficientInput}
            onChange={(e) => setNewCoefficientInput(e.target.value)}
          />
          <button type="button" onClick={handleAddPair} disabled={!canAddPair}>
            Добавить
          </button>
        </div>
        <div className="add-ticker__field">
          {availableTickers.map((p) => (
            <label key={p.ticker}>
              <input
                type="checkbox"
                checked={selectedTickers.has(p.ticker)}
                onChange={() => toggleTicker(p.ticker)}
              />
              {p.ticker}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors (this is the last file still referencing the old `Pair` shape — after this the whole project should compile clean)

- [ ] **Step 3: Manually verify in the browser**

Run: `cd webapp && npm run dev`, open the app, add two positions (e.g. tickers `SBER` and `SBERP`), open "Парные позиции", select both, set the default coefficient to `1.15`, click "Добавить". Confirm the new pair row shows two separate number inputs, one per ticker, both pre-filled `1.15`. Change one to `1.1`, click "Сохранить", reopen the modal and confirm the value persisted per-ticker (`1.1` / `1.15`, not both changed). Stop the dev server after.

- [ ] **Step 4: Commit**

```bash
cd webapp
git add src/components/PairPositionsModal.tsx
git commit -m "feat(pairs): edit each pair member's coefficient separately in the pairs modal"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd webapp && npm run test`
Expected: all tests PASS

- [ ] **Step 2: Typecheck + build**

Run: `cd webapp && npm run build`
Expected: both tsconfig projects typecheck clean, `vite build` succeeds

- [ ] **Step 3: Lint**

Run: `cd webapp && npm run lint`
Expected: no errors

- [ ] **Step 4: Grep for any remaining references to the old `Pair.coefficient` field**

Run: `cd webapp && grep -rn "pair\.coefficient\b" src --include=*.ts --include=*.tsx`
Expected: no matches (everything now uses `pair.coefficients`)
