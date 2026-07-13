# Paired Positions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user group two or more tickers (e.g. a common and a preferred share of the same company) into a "pair" with one shared coefficient, so index compliance is computed against the group's combined weight and combined value instead of per-ticker.

**Architecture:** `pairs: Pair[]` is added to the persisted `PortfolioFile` (schema + type). Three new pure functions in `domain/calculations.ts` compute the combined target/actual/compliance and the per-member proportional buy targets; `domain/buildCalculatedPositions.ts` wires them in as a branch that overrides the normal per-ticker calculation for paired tickers, including overriding `CalculatedPosition.coefficient` with the shared `pair.coefficient` (this is what makes the existing "Коэф-т" input in `PositionsTable.tsx` show/edit the group value with no changes to that component). `useCalculatedPositions.ts` groups pair members into one combined entry (label `TICKER1+TICKER2`) before finding the largest-surplus/largest-shortfall dashboard stats, so a pair is never counted twice. A new `PairPositionsModal.tsx` (same pattern as `SectorOverrideModal.tsx`) lets the user create/edit/delete pairs from a new button in `PortfolioTab.tsx`'s action row; `updateField`'s `"coefficient"` branch is extended to write to `pair.coefficient` instead of `position.coefficient` when the edited ticker belongs to a pair.

**Tech Stack:** React 18 + TypeScript (strict), Zod for file schema, Vitest for domain-logic unit tests. No component-rendering test library (`@testing-library/react`) is installed — component changes (`PairPositionsModal.tsx`, `PortfolioTab.tsx`) are verified via `npm run build` (typecheck), `npm run lint`, and a manual check in the Vite dev server, matching this codebase's existing test boundary (pure logic is unit-tested; JSX is not).

## Global Constraints

- All commands run from `webapp/` (there is no root `package.json`).
- `tsconfig.json` has `strict: true`, `noUnusedLocals`, `noUnusedParameters` — remove any import/variable that becomes unused.
- The pair invariants ("a ticker cannot be in more than one pair", "`pairs[].tickers` may only reference tickers present in `positions[]`") are enforced in the UI by construction, not by a runtime check or the zod schema: `PairPositionsModal`'s "add pair" checkbox list only ever offers `existingPositions` tickers that are not already in a draft pair (Task 5). Do not add extra validation code for this.
- `position.coefficient` on a paired ticker is never read or written once it is in a pair — the pair's own `pair.coefficient` is the single source of truth (spec §2). Do not attempt to keep the two fields in sync.
- No changes to `webapp/src/iss/` — this spec is pure domain/UI, no new network dependency.
- Cyrillic labels must match the spec text exactly (character-for-character), since this is a Russian-language UI: "Парные позиции", "Удалить пару", "Добавить".

---

## Task 1: `pairs` field on the portfolio file schema and type

**Files:**
- Modify: `webapp/src/file/schema.ts` (add `pairSchema`, `pairs` field on `portfolioFileSchema`)
- Test: `webapp/src/file/schema.test.ts`
- Modify: `webapp/src/types.ts` (add `Pair` interface, `PortfolioFile.pairs`)
- Modify: `webapp/src/file/createEmptyPortfolio.ts` (seed `pairs: []`)
- Modify: `webapp/src/portfolio/switchIndex.test.ts`, `webapp/src/portfolio/runMarketUpdate.test.ts`, `webapp/src/file/savePortfolioFile.test.ts`, `webapp/src/portfolio/useCalculatedPositions.test.ts` (fixture literals need the new required field to keep compiling)

**Interfaces:**
- Consumes: nothing new.
- Produces: `interface Pair { tickers: string[]; coefficient: number }`; `PortfolioFile.pairs: Pair[]` — consumed by Tasks 3, 4, 5, 6.

- [ ] **Step 1: Write failing schema tests for `pairs`**

In `webapp/src/file/schema.test.ts`, change the `valid` fixture from:

```ts
const valid = {
  version: 1,
  positions: [{ ticker: "SBER", coefficient: 1.15, sharesOwned: 100 }],
  sectors: { SBER: "Финансы" },
  history: [
    {
      timestamp: "2026-07-10T09:00:00Z",
      portfolioValue: 1000,
      avgCompliance: 0.1,
      snapshot: [{ ticker: "SBER", price: 300, weight: 5, status: "in_index" }],
    },
  ],
};
```

to:

```ts
const valid = {
  version: 1,
  positions: [{ ticker: "SBER", coefficient: 1.15, sharesOwned: 100 }],
  sectors: { SBER: "Финансы" },
  history: [
    {
      timestamp: "2026-07-10T09:00:00Z",
      portfolioValue: 1000,
      avgCompliance: 0.1,
      snapshot: [{ ticker: "SBER", price: 300, weight: 5, status: "in_index" }],
    },
  ],
  pairs: [{ tickers: ["SBER", "SBERP"], coefficient: 1 }],
};
```

Then append these tests inside the `describe("parsePortfolioFile", ...)` block:

```ts
  it("defaults pairs to [] when the field is absent (old files without the pairs field)", () => {
    const { pairs, ...withoutPairs } = valid;
    expect(parsePortfolioFile(withoutPairs)).toEqual({ ...withoutPairs, pairs: [] });
  });

  it("rejects a pair with fewer than 2 tickers", () => {
    const bad = { ...valid, pairs: [{ tickers: ["SBER"], coefficient: 1 }] };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });

  it("rejects a pair with a non-numeric coefficient", () => {
    const bad = { ...valid, pairs: [{ tickers: ["SBER", "SBERP"], coefficient: "high" }] };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });
```

Also update the "accepts an empty positions/sectors/history file" test:

```ts
  it("accepts an empty positions/sectors/history file", () => {
    const empty = { version: 1, positions: [], sectors: {}, history: [] };
    expect(parsePortfolioFile(empty)).toEqual({ ...empty, pairs: [] });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webapp && npx vitest run src/file/schema.test.ts`
Expected: FAIL — `parsePortfolioFile(valid)` returns an object without a `pairs` key, so `toEqual(valid)` (which now includes `pairs`) fails; the new `pairs`-specific tests fail because nothing strips/validates the field yet.

- [ ] **Step 3: Add `pairSchema` and the `pairs` field**

In `webapp/src/file/schema.ts`, change:

```ts
const portfolioFileSchema = z.object({
  version: z.literal(1),
  positions: z.array(positionSchema),
  sectors: z.record(z.string()),
  history: z.array(historySnapshotSchema),
});
```

to:

```ts
const pairSchema = z.object({
  tickers: z.array(z.string()).min(2),
  coefficient: z.number(),
});

const portfolioFileSchema = z.object({
  version: z.literal(1),
  positions: z.array(positionSchema),
  sectors: z.record(z.string()),
  history: z.array(historySnapshotSchema),
  pairs: z.array(pairSchema).default([]),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webapp && npx vitest run src/file/schema.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Add the `Pair` type and `PortfolioFile.pairs`**

In `webapp/src/types.ts`, change:

```ts
export interface PortfolioFile {
  version: 1;
  positions: Position[];
  sectors: Record<string, string>;
  history: HistorySnapshot[];
}
```

to:

```ts
export interface Pair {
  tickers: string[];
  coefficient: number;
}

export interface PortfolioFile {
  version: 1;
  positions: Position[];
  sectors: Record<string, string>;
  history: HistorySnapshot[];
  pairs: Pair[];
}
```

- [ ] **Step 6: Fix every place that builds a `PortfolioFile` literal so the project still compiles**

`PortfolioFile` now requires `pairs`. Fix these four fixtures (all of them build a *typed* `PortfolioFile` literal directly — anything that only reads/spreads an existing `file` is unaffected):

In `webapp/src/file/createEmptyPortfolio.ts`, change:

```ts
  return {
    version: 1,
    positions: composition.map((c) => ({ ticker: c.ticker, coefficient: 1, sharesOwned: 0 })),
    sectors: {},
    history: [],
  };
```

to:

```ts
  return {
    version: 1,
    positions: composition.map((c) => ({ ticker: c.ticker, coefficient: 1, sharesOwned: 0 })),
    sectors: {},
    history: [],
    pairs: [],
  };
```

In `webapp/src/portfolio/switchIndex.test.ts`, change:

```ts
const baseFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 10 }],
  sectors: {},
  history: [{ timestamp: "2026-07-10T00:00:00.000Z", portfolioValue: 100, avgCompliance: 1, snapshot: [] }],
};
```

to:

```ts
const baseFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 10 }],
  sectors: {},
  history: [{ timestamp: "2026-07-10T00:00:00.000Z", portfolioValue: 100, avgCompliance: 1, snapshot: [] }],
  pairs: [],
};
```

In `webapp/src/portfolio/runMarketUpdate.test.ts`, change:

```ts
const baseFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 10 }],
  sectors: {},
  history: [],
};
```

to:

```ts
const baseFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 10 }],
  sectors: {},
  history: [],
  pairs: [],
};
```

In `webapp/src/file/savePortfolioFile.test.ts`, change:

```ts
const sample: PortfolioFile = { version: 1, positions: [], sectors: {}, history: [] };
```

to:

```ts
const sample: PortfolioFile = { version: 1, positions: [], sectors: {}, history: [], pairs: [] };
```

In `webapp/src/portfolio/useCalculatedPositions.test.ts`, change the `file` helper from:

```ts
function file(overrides: Partial<PortfolioFile> = {}): PortfolioFile {
  return { version: 1, positions: [], sectors: {}, history: [], ...overrides };
}
```

to:

```ts
function file(overrides: Partial<PortfolioFile> = {}): PortfolioFile {
  return { version: 1, positions: [], sectors: {}, history: [], pairs: [], ...overrides };
}
```

- [ ] **Step 7: Full test run + typecheck**

Run: `cd webapp && npm run test`
Expected: all tests pass.

Run: `cd webapp && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add webapp/src/file/schema.ts webapp/src/file/schema.test.ts webapp/src/types.ts webapp/src/file/createEmptyPortfolio.ts webapp/src/portfolio/switchIndex.test.ts webapp/src/portfolio/runMarketUpdate.test.ts webapp/src/file/savePortfolioFile.test.ts webapp/src/portfolio/useCalculatedPositions.test.ts
git commit -m "feat: add pairs field to portfolio file schema and type"
```

---

## Task 2: Domain — pure pair-target calculation functions

**Files:**
- Modify: `webapp/src/domain/calculations.ts` (add `computeCombinedIndexWeight`, `computePairedTargets`, `computePairMemberTargetShares`, `PairInput`, `PairMemberInput`, `PairedTargets`)
- Test: `webapp/src/domain/calculations.test.ts`

**Interfaces:**
- Consumes: `IndexStatus` (`webapp/src/types.ts`, already exists); `computeActualShare`, `computeCompliance` (already exist in this file).
- Produces:
  - `interface PairInput { tickers: string[]; coefficient: number }`
  - `interface PairMemberInput { ticker: string; indexWeight: number; status: IndexStatus; price: number | null; sharesOwned: number }`
  - `interface PairedTargets { targetAllocation: number; actualShare: number | null; compliance: number | null }`
  - `computeCombinedIndexWeight(members: { indexWeight: number; status: IndexStatus }[]): number`
  - `computePairedTargets(pair: PairInput, positions: PairMemberInput[], portfolioValue: number): PairedTargets`
  - `computePairMemberTargetShares(combinedTargetPct: number, combinedIndexWeight: number, memberIndexWeight: number, portfolioValue: number, price: number | null): number | null`

  All four are consumed by Task 3 (`buildCalculatedPositions.ts`).

- [ ] **Step 1: Write failing tests**

In `webapp/src/domain/calculations.test.ts`, add `computeCombinedIndexWeight, computePairedTargets, computePairMemberTargetShares` to the import list at the top of the file (same pattern as the existing imports), then append:

```ts
describe("computeCombinedIndexWeight", () => {
  it("sums indexWeight only for in_index members", () => {
    expect(
      computeCombinedIndexWeight([
        { indexWeight: 9, status: "in_index" },
        { indexWeight: 3, status: "in_index" },
      ])
    ).toBe(12);
  });

  it("treats an out_of_index member's weight as 0", () => {
    expect(
      computeCombinedIndexWeight([
        { indexWeight: 9, status: "in_index" },
        { indexWeight: 5, status: "out_of_index" },
      ])
    ).toBe(9);
  });

  it("is 0 for an empty member list", () => {
    expect(computeCombinedIndexWeight([])).toBe(0);
  });
});

describe("computePairedTargets", () => {
  const pair = { tickers: ["SBER", "SBERP"], coefficient: 2 };

  it("combines indexWeight and value across only the pair's own tickers, ignoring other positions", () => {
    const positions = [
      { ticker: "SBER", indexWeight: 9, status: "in_index" as const, price: 250, sharesOwned: 10 },
      { ticker: "SBERP", indexWeight: 3, status: "in_index" as const, price: 200, sharesOwned: 5 },
      { ticker: "GAZP", indexWeight: 88, status: "in_index" as const, price: 100, sharesOwned: 1 },
    ];
    // combinedIndexWeight = 9+3 = 12, targetAllocation = 12*2 = 24
    // combinedActualValueRub = 250*10 + 200*5 = 3500
    // portfolioValue = 3500 (GAZP's 100 excluded on purpose to keep actualShare a round number)
    const result = computePairedTargets(pair, positions, 3500);

    expect(result.targetAllocation).toBe(24);
    expect(result.actualShare).toBeCloseTo(100);
    expect(result.compliance).toBeCloseTo(100 / 24);
  });

  it("treats an out-of-index member's indexWeight as 0 in the combined weight but still counts its value", () => {
    const positions = [
      { ticker: "SBER", indexWeight: 9, status: "in_index" as const, price: 250, sharesOwned: 10 },
      { ticker: "SBERP", indexWeight: 3, status: "out_of_index" as const, price: 200, sharesOwned: 5 },
    ];
    // combinedIndexWeight = 9 (SBERP's weight dropped), targetAllocation = 9*2 = 18
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
});

describe("computePairMemberTargetShares", () => {
  it("splits the combined target proportionally to the member's own indexWeight and rounds to whole shares", () => {
    // combinedTargetRub = 12/100 * 3500 = 420; SBER's share = 420 * 9/12 = 315; 315/250 = 1.26 -> 1
    expect(computePairMemberTargetShares(12, 12, 9, 3500, 250)).toBe(1);
  });

  it("returns null when the combined index weight is 0", () => {
    expect(computePairMemberTargetShares(0, 0, 0, 3500, 250)).toBeNull();
  });

  it("returns null when price is null", () => {
    expect(computePairMemberTargetShares(12, 12, 9, 3500, null)).toBeNull();
  });

  it("returns null when price is 0", () => {
    expect(computePairMemberTargetShares(12, 12, 9, 3500, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts -t "computeCombinedIndexWeight"`
Expected: FAIL — none of the three functions are exported from `./calculations` yet.

- [ ] **Step 3: Implement the three functions**

Append to `webapp/src/domain/calculations.ts`:

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts`
Expected: PASS, all tests green (including the pre-existing ones — this step is also a regression check).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/domain/calculations.ts webapp/src/domain/calculations.test.ts
git commit -m "feat: add pure pair-target calculation functions"
```

---

## Task 3: `buildCalculatedPositions` — pair-aware branch

**Files:**
- Modify: `webapp/src/domain/buildCalculatedPositions.ts`
- Test: `webapp/src/domain/buildCalculatedPositions.test.ts`

**Interfaces:**
- Consumes: `Pair` (`webapp/src/types.ts`, Task 1); `computeCombinedIndexWeight`, `computePairedTargets`, `computePairMemberTargetShares`, `PairedTargets` (`webapp/src/domain/calculations.ts`, Task 2).
- Produces: `buildCalculatedPositions(positions, liveByTicker, resolveSector, pairs: Pair[] = [])` — the 4th parameter is new and optional (defaults to `[]`), so every existing 3-argument call site keeps compiling unchanged. For a ticker that belongs to a pair, the returned `CalculatedPosition` gets: `coefficient` = `pair.coefficient` (not `position.coefficient`); `targetAllocation`/`actualShare`/`compliance` = the pair's combined values (identical across every member); `sharesToBuy`/`buyAmountRub` = this member's own proportional share of the group's target. Consumed by Task 4 (`useCalculatedPositions.ts`, `runMarketUpdate.ts`).

- [ ] **Step 1: Write failing tests**

In `webapp/src/domain/buildCalculatedPositions.test.ts`, add `Pair` to the type import:

```ts
import { LiveData, Pair, Position } from "../types";
```

Then append these tests inside the `describe("buildCalculatedPositions", ...)` block:

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
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficient: 2 }];
    // portfolioValue = 10*250 + 5*200 = 3500
    // combinedIndexWeight = 9+3 = 12, targetAllocation = 12*2 = 24
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

  it("splits sharesToBuy/buyAmountRub across pair members proportionally to their own share of the combined index weight", () => {
    const positions: Position[] = [
      { ticker: "SBER", coefficient: 1, sharesOwned: 10 },
      { ticker: "SBERP", coefficient: 1, sharesOwned: 5 },
    ];
    const liveByTicker = new Map([
      ["SBER", live({ ticker: "SBER", indexWeight: 9, price: 250 })],
      ["SBERP", live({ ticker: "SBERP", indexWeight: 3, price: 200 })],
    ]);
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficient: 1 }];
    // portfolioValue = 10*250 + 5*200 = 3500
    // combinedIndexWeight = 12, targetAllocation = 12, combinedTargetRub = 12/100*3500 = 420
    // SBER: targetValueRub = 420*9/12 = 315, targetShares = round(315/250) = 1, sharesToBuy = 1-10 = -9, buyAmountRub = -2250
    // SBERP: targetValueRub = 420*3/12 = 105, targetShares = round(105/200) = 1, sharesToBuy = 1-5 = -4, buyAmountRub = -800

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы", pairs);

    const sber = result.find((p) => p.ticker === "SBER")!;
    expect(sber.sharesToBuy).toBe(-9);
    expect(sber.buyAmountRub).toBe(-2250);

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
    const pairs: Pair[] = [{ tickers: ["OLD1", "OLD2"], coefficient: 1 }];

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
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficient: 1 }];

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы", pairs);

    const gazp = result.find((p) => p.ticker === "GAZP")!;
    expect(gazp.targetAllocation).toBe(10); // 5 * 2, unaffected by the pair
    expect(gazp.coefficient).toBe(2);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webapp && npx vitest run src/domain/buildCalculatedPositions.test.ts`
Expected: FAIL — `buildCalculatedPositions` does not accept a 4th argument yet (TypeScript error) and, once that's ignored, pair members get the normal per-ticker `targetAllocation`/`coefficient` instead of the combined ones.

- [ ] **Step 3: Wire the pair branch into `buildCalculatedPositions`**

Replace the full contents of `webapp/src/domain/buildCalculatedPositions.ts` with:

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
  computeCombinedIndexWeight,
  computePairedTargets,
  computePairMemberTargetShares,
  PairedTargets,
} from "./calculations";

export function buildCalculatedPositions(
  positions: Position[],
  liveByTicker: Map<string, LiveData>,
  resolveSector: (ticker: string) => string,
  pairs: Pair[] = []
): CalculatedPosition[] {
  const withLive = positions.map((position) => {
    const live = liveByTicker.get(position.ticker.toUpperCase());
    const fallbackLive: LiveData = {
      ticker: position.ticker,
      shortName: position.ticker,
      indexWeight: 0,
      price: null,
      lotSize: null,
      dividendPerShare: 0,
      status: "out_of_index",
    };
    const resolvedLive = live ?? fallbackLive;
    const positionValue = computePositionValue(resolvedLive.price, position.sharesOwned);
    return { position, live: resolvedLive, positionValue };
  });

  const portfolioValue = withLive.reduce((sum, { positionValue }) => sum + positionValue, 0);

  const pairByTicker = new Map<string, Pair>();
  for (const pair of pairs) {
    for (const ticker of pair.tickers) pairByTicker.set(ticker, pair);
  }

  const memberInputs = withLive.map(({ position, live }) => ({
    ticker: position.ticker,
    indexWeight: live.indexWeight,
    status: live.status,
    price: live.price,
    sharesOwned: position.sharesOwned,
  }));

  const pairedTargetsByPair = new Map<Pair, PairedTargets>();
  for (const pair of pairs) {
    pairedTargetsByPair.set(pair, computePairedTargets(pair, memberInputs, portfolioValue));
  }

  return withLive.map(({ position, live, positionValue }) => {
    const pair = pairByTicker.get(position.ticker);

    let coefficient: number;
    let targetAllocation: number | null;
    let actualShare: number | null;
    let compliance: number | null;
    let sharesToBuy: number | null;
    let buyAmountRub: number | null;

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
      sharesToBuy = computeSharesToBuy(targetShares, position.sharesOwned);
      buyAmountRub = computeBuyAmountRub(sharesToBuy, live.price);
    } else {
      coefficient = position.coefficient;
      targetAllocation = computeTargetAllocation(live.indexWeight, position.coefficient, live.status);
      actualShare = computeActualShare(positionValue, portfolioValue);
      compliance = computeCompliance(actualShare, targetAllocation);
      const targetShares = computeTargetShares(targetAllocation, portfolioValue, live.price);
      sharesToBuy = computeSharesToBuy(targetShares, position.sharesOwned);
      buyAmountRub = computeBuyAmountRub(sharesToBuy, live.price);
    }

    const income = computeIncome(live.dividendPerShare, position.sharesOwned);
    const dividendYield = computeDividendYield(live.dividendPerShare, live.price);

    return {
      ...position,
      ...live,
      ticker: position.ticker,
      coefficient,
      sector: resolveSector(position.ticker),
      targetAllocation,
      actualShare,
      compliance,
      positionValue,
      income,
      dividendYield,
      sharesToBuy,
      buyAmountRub,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webapp && npx vitest run src/domain/buildCalculatedPositions.test.ts`
Expected: PASS, all tests green (including the pre-existing non-pair tests — `pairs` defaults to `[]` so their behavior is unchanged).

- [ ] **Step 5: Full test run + typecheck**

Run: `cd webapp && npm run test`
Expected: all tests pass.

Run: `cd webapp && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/domain/buildCalculatedPositions.ts webapp/src/domain/buildCalculatedPositions.test.ts
git commit -m "feat: compute combined targets for paired tickers in buildCalculatedPositions"
```

---

## Task 4: Thread `pairs` through `useCalculatedPositions`/`runMarketUpdate`, group dashboard extremes by pair

**Files:**
- Modify: `webapp/src/portfolio/useCalculatedPositions.ts`
- Test: `webapp/src/portfolio/useCalculatedPositions.test.ts`
- Modify: `webapp/src/portfolio/runMarketUpdate.ts`

**Interfaces:**
- Consumes: `PortfolioFile.pairs` (Task 1); `buildCalculatedPositions(..., pairs)` (Task 3).
- Produces: no new exports — `CalculatedPositionsResult.largestSurplus`/`largestShortfall` (already exist) now report one combined `DeviationEntry` per pair, labeled `"TICKER1+TICKER2"`, instead of one entry per member. Consumed by `Dashboard.tsx` — no changes needed there since it already just renders `entry.ticker` as a string label.

- [ ] **Step 1: Write a failing test for the combined pair deviation label**

In `webapp/src/portfolio/useCalculatedPositions.test.ts`, append this test inside the `describe("computeCalculatedPositionsResult", ...)` block:

```ts
  it("groups a pair into a single combined deviation entry labeled 'TICKER1+TICKER2', counted once for the extremes", () => {
    const f = file({
      positions: [
        { ticker: "SBER", coefficient: 1, sharesOwned: 10 },
        { ticker: "SBERP", coefficient: 1, sharesOwned: 5 },
        { ticker: "GAZP", coefficient: 1, sharesOwned: 1 },
      ],
      pairs: [{ tickers: ["SBER", "SBERP"], coefficient: 1 }],
    });
    const liveByTicker = new Map([
      ["SBER", live({ ticker: "SBER", indexWeight: 9, price: 250 })],
      ["SBERP", live({ ticker: "SBERP", indexWeight: 3, price: 200 })],
      ["GAZP", live({ ticker: "GAZP", indexWeight: 88, price: 10 })],
    ]);
    // portfolioValue = 2500 + 1000 + 10 = 3510
    // pair: combinedIndexWeight = 12, targetAllocation = 12, actualShare = 3500/3510*100 ≈ 99.7 -> large surplus
    // GAZP: targetAllocation = 88, actualShare = 10/3510*100 ≈ 0.28 -> large shortfall

    const result = computeCalculatedPositionsResult(f, liveByTicker);

    expect(result.largestSurplus?.ticker).toBe("SBER+SBERP");
    expect(result.largestShortfall?.ticker).toBe("GAZP");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/portfolio/useCalculatedPositions.test.ts -t "groups a pair"`
Expected: FAIL — today every position (including pair members) becomes its own `DeviationEntry`, so `largestSurplus?.ticker` is `"SBER"` or `"SBERP"` (whichever the extreme-finding loop keeps), never the combined `"SBER+SBERP"` label.

- [ ] **Step 3: Group pair members before finding extremes, and pass `file.pairs` into `buildCalculatedPositions`**

In `webapp/src/portfolio/useCalculatedPositions.ts`, change the body of `computeCalculatedPositionsResult` from:

```ts
  const resolveSector = createSectorResolver(SECTORS_DEFAULT, file.sectors);
  const calculated = buildCalculatedPositions(file.positions, liveByTicker, resolveSector);
  const portfolioValue = calculated.reduce((sum, p) => sum + p.positionValue, 0);
  const avgCompliance = computeAverageCompliance(calculated.map((p) => p.compliance));

  const deviations: DeviationEntry[] = calculated
    .filter((p) => p.targetAllocation !== null && p.actualShare !== null)
    .map((p) => ({
      ticker: p.ticker,
      deviationRub: computeDeviationRub(p.actualShare, p.targetAllocation, portfolioValue) as number,
    }));
  const { largestSurplus, largestShortfall } = findDeviationExtremes(deviations);

  return { calculated, portfolioValue, avgCompliance, largestSurplus, largestShortfall };
```

to:

```ts
  const resolveSector = createSectorResolver(SECTORS_DEFAULT, file.sectors);
  const calculated = buildCalculatedPositions(file.positions, liveByTicker, resolveSector, file.pairs);
  const portfolioValue = calculated.reduce((sum, p) => sum + p.positionValue, 0);
  const avgCompliance = computeAverageCompliance(calculated.map((p) => p.compliance));

  const pairedTickers = new Set(file.pairs.flatMap((pair) => pair.tickers));

  const soloDeviations: DeviationEntry[] = calculated
    .filter((p) => !pairedTickers.has(p.ticker) && p.targetAllocation !== null && p.actualShare !== null)
    .map((p) => ({
      ticker: p.ticker,
      deviationRub: computeDeviationRub(p.actualShare, p.targetAllocation, portfolioValue) as number,
    }));

  const pairDeviations: DeviationEntry[] = file.pairs.flatMap((pair) => {
    const member = calculated.find((p) => pair.tickers.includes(p.ticker));
    if (!member || member.targetAllocation === null || member.actualShare === null) return [];
    return [
      {
        ticker: pair.tickers.join("+"),
        deviationRub: computeDeviationRub(member.actualShare, member.targetAllocation, portfolioValue) as number,
      },
    ];
  });

  const { largestSurplus, largestShortfall } = findDeviationExtremes([...soloDeviations, ...pairDeviations]);

  return { calculated, portfolioValue, avgCompliance, largestSurplus, largestShortfall };
```

(Every member of a pair carries the same `targetAllocation`/`actualShare` per Task 3, so picking `calculated.find(...)` — the first member — is enough to read the group's combined deviation once.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/portfolio/useCalculatedPositions.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Pass `pairs` into the `buildCalculatedPositions` call used for history snapshots**

In `webapp/src/portfolio/runMarketUpdate.ts`, change:

```ts
  const resolveSector = createSectorResolver(SECTORS_DEFAULT, currentFile.sectors);
  const calculated = buildCalculatedPositions(positions, liveByTicker, resolveSector);
  const portfolioValue = calculated.reduce((sum, p) => sum + p.positionValue, 0);
```

to:

```ts
  const resolveSector = createSectorResolver(SECTORS_DEFAULT, currentFile.sectors);
  const calculated = buildCalculatedPositions(positions, liveByTicker, resolveSector, currentFile.pairs);
  const portfolioValue = calculated.reduce((sum, p) => sum + p.positionValue, 0);
```

- [ ] **Step 6: Full test run + typecheck**

Run: `cd webapp && npm run test`
Expected: all tests pass.

Run: `cd webapp && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/portfolio/useCalculatedPositions.ts webapp/src/portfolio/useCalculatedPositions.test.ts webapp/src/portfolio/runMarketUpdate.ts
git commit -m "feat: group paired tickers into one dashboard deviation entry"
```

---

## Task 5: `PairPositionsModal` component

**Files:**
- Create: `webapp/src/components/PairPositionsModal.tsx`

**Interfaces:**
- Consumes: `Position`, `Pair` (`webapp/src/types.ts`, Task 1).
- Produces: `PairPositionsModal({ existingPositions: Position[]; pairs: Pair[]; onSave: (pairs: Pair[]) => void; onClose: () => void })` — consumed by Task 6 (`PortfolioTab.tsx`).

No automated rendering test exists for modal components in this repo (no `@testing-library/react` installed, and `SectorOverrideModal.tsx`/`AddTickerModal.tsx` have none either) — verified via `npm run build`, `npm run lint`, and a manual dev-server check in Task 6 (once the modal is actually reachable from a button).

- [ ] **Step 1: Create the component**

Write `webapp/src/components/PairPositionsModal.tsx`:

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

  function handleChangeCoefficient(index: number, value: number) {
    setDraftPairs((prev) => prev.map((p, i) => (i === index ? { ...p, coefficient: value } : p)));
  }

  function handleAddPair() {
    if (!canAddPair) return;
    setDraftPairs((prev) => [...prev, { tickers: [...selectedTickers], coefficient: newCoefficient }]);
    setSelectedTickers(new Set());
    setNewCoefficientInput("1");
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Парные позиции">
      <div className="modal">
        <h2>Парные позиции</h2>
        <table>
          <tbody>
            {draftPairs.map((pair, index) => (
              <tr key={pair.tickers.join("+")}>
                <td>{pair.tickers.join(" + ")}</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={pair.coefficient}
                    onChange={(e) => handleChangeCoefficient(index, Number(e.target.value))}
                  />
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
        <div className="modal__actions">
          <button type="button" onClick={() => onSave(draftPairs)}>
            Сохранить
          </button>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note on the invariants from the Global Constraints section: `availableTickers` already excludes every ticker in `draftPairs` (a ticker can't be checked into a second pair), and the checkbox list is built only from `existingPositions` (a pair can never reference a ticker outside `positions[]`) — both invariants hold by construction, no extra validation needed.

- [ ] **Step 2: Typecheck**

Run: `cd webapp && npm run build`
Expected: exits 0, no TypeScript errors. (The component isn't imported anywhere yet, so this only checks it compiles standalone; `noUnusedLocals`/`noUnusedParameters` won't flag it since it's a full file, not an unused import elsewhere.)

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/PairPositionsModal.tsx
git commit -m "feat: add PairPositionsModal component"
```

---

## Task 6: Wire the modal into `PortfolioTab` and redirect coefficient edits for paired tickers

**Files:**
- Modify: `webapp/src/components/PortfolioTab.tsx`

**Interfaces:**
- Consumes: `PairPositionsModal` (Task 5); `PortfolioFile.pairs` (Task 1).
- Produces: nothing new — this is the final task in the plan.

- [ ] **Step 1: Add the button, modal state, and pair-aware `updateField`**

In `webapp/src/components/PortfolioTab.tsx`, change the import block from:

```ts
import { PositionsTable } from "./PositionsTable";
import { AddTickerModal } from "./AddTickerModal";
import { PortfolioFile } from "../types";
```

to:

```ts
import { PositionsTable } from "./PositionsTable";
import { AddTickerModal } from "./AddTickerModal";
import { PairPositionsModal } from "./PairPositionsModal";
import { PortfolioFile } from "../types";
```

Change:

```ts
  const [search, setSearch] = useState(() => loadSearchPref());
  const [hideEmpty, setHideEmpty] = useState(() => loadHideEmptyPref());
  const [showAddTicker, setShowAddTicker] = useState(false);
```

to:

```ts
  const [search, setSearch] = useState(() => loadSearchPref());
  const [hideEmpty, setHideEmpty] = useState(() => loadHideEmptyPref());
  const [showAddTicker, setShowAddTicker] = useState(false);
  const [showPairPositions, setShowPairPositions] = useState(false);
```

Change `updateField` from:

```ts
  function updateField(ticker: string, field: "coefficient" | "sharesOwned", value: number) {
    if (!file) return;
    setFile({
      ...file,
      positions: file.positions.map((p) =>
        p.ticker === ticker ? { ...p, [field]: value } : p
      ),
    });
  }
```

to:

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

Change the action row from:

```tsx
      <div className="action-row">
        <button type="button" onClick={() => handleUpdate()} disabled={isUpdating}>
          {isUpdating ? "Обновление…" : "Обновить"}
        </button>
        <button type="button" onClick={() => setShowAddTicker(true)} disabled={isUpdating}>
          + Тикер
        </button>
      </div>
```

to:

```tsx
      <div className="action-row">
        <button type="button" onClick={() => handleUpdate()} disabled={isUpdating}>
          {isUpdating ? "Обновление…" : "Обновить"}
        </button>
        <button type="button" onClick={() => setShowAddTicker(true)} disabled={isUpdating}>
          + Тикер
        </button>
        <button type="button" onClick={() => setShowPairPositions(true)} disabled={isUpdating}>
          Парные позиции
        </button>
      </div>
```

Change the modal-rendering block at the end of the returned JSX from:

```tsx
      {showAddTicker && (
        <AddTickerModal
          existingPositions={file.positions}
          onConfirm={handleAddTicker}
          onClose={() => setShowAddTicker(false)}
        />
      )}
```

to:

```tsx
      {showAddTicker && (
        <AddTickerModal
          existingPositions={file.positions}
          onConfirm={handleAddTicker}
          onClose={() => setShowAddTicker(false)}
        />
      )}
      {showPairPositions && (
        <PairPositionsModal
          existingPositions={file.positions}
          pairs={file.pairs}
          onSave={(pairs) => {
            setFile({ ...file, pairs });
            setShowPairPositions(false);
          }}
          onClose={() => setShowPairPositions(false)}
        />
      )}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd webapp && npm run build`
Expected: exits 0, no TypeScript errors.

Run: `cd webapp && npm run lint`
Expected: exits 0, no lint errors.

- [ ] **Step 3: Full test run (regression check)**

Run: `cd webapp && npm run test`
Expected: all tests still pass (this task touches no test files, but confirms the pair-aware `updateField` didn't break anything else).

- [ ] **Step 4: Manual verification in dev server**

Run: `cd webapp && npm run dev`

With a portfolio loaded that has at least two tickers (e.g. `SBER` and a second ticker added via "+ Тикер" — add `SBERP` if it isn't already in the portfolio):

1. Click "Парные позиции". Expected: modal opens, empty pair list, checkboxes for every current ticker, "Добавить" disabled.
2. Check two tickers (e.g. `SBER` and `SBERP`), leave coefficient at `1`, click "Добавить". Expected: a new row appears above the form with both tickers, and both tickers disappear from the checkbox list.
3. Change the pair's coefficient input to `2`, click "Сохранить". Expected: modal closes; in the positions table, both `SBER` and `SBERP` now show the *same* value (`2`) in the "Коэф-т" column, and identical values in "Цель"/"Факт. доля"/"Соответствие".
4. Edit the "Коэф-т" input directly on the `SBER` row in the table (not via the modal) to `3`. Expected: the `SBERP` row's "Коэф-т" cell also updates to `3` (single shared value).
5. Check the dashboard's "Наибольший избыток"/"Наибольшая недостача" stat blocks: if the pair is the extreme, its label reads `SBER+SBERP` (not just one ticker).
6. Reopen "Парные позиции", click "Удалить пару". Expected: the pair is removed; both tickers reappear in the checkbox list and go back to their own individual "Коэф-т" values in the table.

Stop the dev server after confirming (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/components/PortfolioTab.tsx
git commit -m "feat: add pair positions modal and pair-aware coefficient editing to PortfolioTab"
```
