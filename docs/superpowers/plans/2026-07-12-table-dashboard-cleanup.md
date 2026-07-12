# Table/Dashboard Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eight small UI/calculation fixes to `PositionsTable`, `Dashboard`, and CSS: tooltip regression fix, two new dashboard stat blocks, three new calculated table columns, an editable-cell highlight, and a column reorder (Сектор to the end, Статус collapsed to a leading icon).

**Architecture:** New pure calculation functions go in `webapp/src/domain/calculations.ts` (same style as existing `compute*` functions), wired into `CalculatedPosition` via `buildCalculatedPositions.ts` and into `CalculatedPositionsResult` via `useCalculatedPositions.ts`. `PositionsTable.tsx` and `Dashboard.tsx` are presentation-only and get updated last, once every field they render already exists and is unit-tested.

**Tech Stack:** React 18 + TypeScript (strict), Vitest for domain-logic unit tests. No component-rendering test library (`@testing-library/react`) is installed in this repo — `PositionsTable.tsx`/`Dashboard.tsx` changes are verified via `npm run build` (typecheck), `npm run lint`, and a manual check in the Vite dev server, matching this codebase's existing test boundary (pure logic is unit-tested; JSX is not).

## Global Constraints

- All commands run from `webapp/` (there is no root `package.json`).
- `tsconfig.json` has `strict: true`, `noUnusedLocals`, `noUnusedParameters` — remove any import/variable that becomes unused (e.g. `STATUS_LABELS` in Task 6).
- No changes to `file/schema.ts` or `iss/` — this spec only touches display/calculation, not the persisted file shape or the ISS client.
- Negative values (oversupply / sell signal) are shown as-is with a plain minus sign — no parentheses or other special negative formatting.
- Cyrillic labels/tooltips must match the spec text exactly (character-for-character), since this is a Russian-language UI.
- The "paired positions" (common/preferred combined compliance) domain is a separate, larger spec — out of scope here.

---

## Task 1: Fix table header tooltip CSS regression

**Files:**
- Modify: `webapp/src/styles.css:330-334` (`.table-scroll`), `webapp/src/styles.css:375-391` (`.th-hint`)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (pure CSS fix, no new selectors consumed by later tasks).

No automated test exists for CSS rendering in this repo; this task is verified by reading the computed rule interaction and by a manual dev-server check.

- [ ] **Step 1: Add `position: relative` to `.th-hint`**

In `webapp/src/styles.css`, find:

```css
.th-hint {
  display: inline-block;
  margin-left: 4px;
  width: 13px;
  height: 13px;
  line-height: 13px;
  text-align: center;
  border-radius: 50%;
  border: 1px solid var(--muted);
  font-size: 9px;
  font-weight: normal;
  text-transform: none;
  letter-spacing: 0;
  color: var(--muted);
  cursor: help;
  font-family: var(--font-body);
}
```

Replace with:

```css
.th-hint {
  position: relative;
  display: inline-block;
  margin-left: 4px;
  width: 13px;
  height: 13px;
  line-height: 13px;
  text-align: center;
  border-radius: 50%;
  border: 1px solid var(--muted);
  font-size: 9px;
  font-weight: normal;
  text-transform: none;
  letter-spacing: 0;
  color: var(--muted);
  cursor: help;
  font-family: var(--font-body);
}
```

Reason: `.th-hint[data-tooltip]::after` uses `position: absolute`, but without a positioned ancestor it anchors to the nearest positioned element up the tree instead of next to the `?` icon.

- [ ] **Step 2: Add `overflow-y: visible` to `.table-scroll`**

Find:

```css
.table-scroll {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
```

Replace with:

```css
.table-scroll {
  overflow-x: auto;
  overflow-y: visible;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
```

Reason: setting only `overflow-x` makes the browser compute `overflow-y: auto`, which also clips the tooltip popup vertically. Horizontal scroll is preserved; vertical clipping is removed.

- [ ] **Step 3: Typecheck (CSS has no build step of its own, but confirm nothing else broke)**

Run: `cd webapp && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Manual verification in dev server**

Run: `cd webapp && npm run dev`
Open the app, hover (or Tab-focus) the `?` icon next to "Коэф-т", "Цель", "Факт. доля", "Соответствие", or "Доход" in the table header. Expected: tooltip text appears directly below the icon and is not clipped.
Stop the dev server after confirming (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/styles.css
git commit -m "fix: table header tooltip clipped by missing position/overflow"
```

---

## Task 2: Dashboard — largest surplus / largest shortfall stat blocks

**Files:**
- Modify: `webapp/src/domain/calculations.ts` (add `computeDeviationRub`, `DeviationEntry`, `findDeviationExtremes`)
- Test: `webapp/src/domain/calculations.test.ts`
- Modify: `webapp/src/portfolio/useCalculatedPositions.ts` (wire deviations into `CalculatedPositionsResult`)
- Test: `webapp/src/portfolio/useCalculatedPositions.test.ts`
- Modify: `webapp/src/components/Dashboard.tsx` (render two new stat blocks)

**Interfaces:**
- Consumes: `CalculatedPosition.actualShare`, `CalculatedPosition.targetAllocation`, `CalculatedPosition.ticker` (all already exist in `webapp/src/types.ts`).
- Produces: `computeDeviationRub(actualShare: number | null, targetAllocation: number | null, portfolioValue: number): number | null`; `interface DeviationEntry { ticker: string; deviationRub: number }`; `findDeviationExtremes(deviations: DeviationEntry[]): { largestSurplus: DeviationEntry | null; largestShortfall: DeviationEntry | null }`. `CalculatedPositionsResult` gains `largestSurplus: DeviationEntry | null` and `largestShortfall: DeviationEntry | null` — later tasks do not depend on these.

- [ ] **Step 1: Write failing tests for `computeDeviationRub`**

In `webapp/src/domain/calculations.test.ts`, add (import list at top of the file also needs `computeDeviationRub` and `findDeviationExtremes` added — see Step imports below):

```ts
describe("computeDeviationRub", () => {
  it("expresses the actual-vs-target share gap in roubles", () => {
    // (15% - 10%) * 1000 / 100 = 50
    expect(computeDeviationRub(15, 10, 1000)).toBeCloseTo(50);
  });

  it("is negative when actual share is below target (shortfall)", () => {
    expect(computeDeviationRub(5, 10, 1000)).toBeCloseTo(-50);
  });

  it("returns null when actualShare is null", () => {
    expect(computeDeviationRub(null, 10, 1000)).toBeNull();
  });

  it("returns null when targetAllocation is null (out-of-index position)", () => {
    expect(computeDeviationRub(15, null, 1000)).toBeNull();
  });
});

describe("findDeviationExtremes", () => {
  it("picks the max as largestSurplus and the min as largestShortfall", () => {
    const deviations = [
      { ticker: "A", deviationRub: 50 },
      { ticker: "B", deviationRub: -80 },
      { ticker: "C", deviationRub: 20 },
    ];
    expect(findDeviationExtremes(deviations)).toEqual({
      largestSurplus: { ticker: "A", deviationRub: 50 },
      largestShortfall: { ticker: "B", deviationRub: -80 },
    });
  });

  it("returns the same single entry for both when there is only one", () => {
    const deviations = [{ ticker: "A", deviationRub: 10 }];
    expect(findDeviationExtremes(deviations)).toEqual({
      largestSurplus: { ticker: "A", deviationRub: 10 },
      largestShortfall: { ticker: "A", deviationRub: 10 },
    });
  });

  it("returns null for both when the list is empty", () => {
    expect(findDeviationExtremes([])).toEqual({ largestSurplus: null, largestShortfall: null });
  });
});
```

Update the top import in `webapp/src/domain/calculations.test.ts` from:

```ts
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computePortfolioValue,
  computeActualShare,
  computeCompliance,
  computeAverageCompliance,
} from "./calculations";
```

to:

```ts
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
} from "./calculations";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts`
Expected: FAIL — `computeDeviationRub` and `findDeviationExtremes` are not exported from `./calculations`.

- [ ] **Step 3: Implement `computeDeviationRub` and `findDeviationExtremes`**

Append to `webapp/src/domain/calculations.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Update `useCalculatedPositions.test.ts` for the new result fields**

The first test in `webapp/src/portfolio/useCalculatedPositions.test.ts` asserts the full shape of the empty-file result with `toEqual`, so it must be updated in lockstep with the implementation (this is the "failing test" for this half of the task). Change:

```ts
  it("returns empty defaults when there is no file", () => {
    expect(computeCalculatedPositionsResult(null, new Map())).toEqual({
      calculated: [],
      portfolioValue: 0,
      avgCompliance: null,
    });
  });
```

to:

```ts
  it("returns empty defaults when there is no file", () => {
    expect(computeCalculatedPositionsResult(null, new Map())).toEqual({
      calculated: [],
      portfolioValue: 0,
      avgCompliance: null,
      largestSurplus: null,
      largestShortfall: null,
    });
  });
```

Also append a new test to the same `describe` block:

```ts
  it("computes largestSurplus and largestShortfall from actual-vs-target deviation", () => {
    const f = file({
      positions: [
        { ticker: "GAZP", coefficient: 1, sharesOwned: 10 },
        { ticker: "SBER", coefficient: 1, sharesOwned: 1 },
      ],
    });
    const liveByTicker = new Map([
      ["GAZP", live({ ticker: "GAZP", indexWeight: 90, price: 100 })],
      ["SBER", live({ ticker: "SBER", indexWeight: 10, price: 100 })],
    ]);
    // portfolioValue = 1000 + 100 = 1100
    // GAZP: actualShare ≈ 90.9%, target 90% -> small surplus
    // SBER: actualShare ≈ 9.1%, target 10% -> small shortfall

    const result = computeCalculatedPositionsResult(f, liveByTicker);

    expect(result.largestSurplus?.ticker).toBe("GAZP");
    expect(result.largestShortfall?.ticker).toBe("SBER");
  });
```

- [ ] **Step 6: Run the new test to verify it fails**

Run: `cd webapp && npx vitest run src/portfolio/useCalculatedPositions.test.ts`
Expected: FAIL — `result.largestSurplus` is `undefined` (property does not exist yet), and the `toEqual` assertion in the first test fails because the actual object is missing the two new keys.

- [ ] **Step 7: Wire deviations into `computeCalculatedPositionsResult`**

In `webapp/src/portfolio/useCalculatedPositions.ts`, change the import line from:

```ts
import { computeAverageCompliance } from "../domain/calculations";
```

to:

```ts
import { computeAverageCompliance, computeDeviationRub, findDeviationExtremes, DeviationEntry } from "../domain/calculations";
```

Change the `CalculatedPositionsResult` interface from:

```ts
export interface CalculatedPositionsResult {
  calculated: CalculatedPosition[];
  portfolioValue: number;
  avgCompliance: number | null;
}
```

to:

```ts
export interface CalculatedPositionsResult {
  calculated: CalculatedPosition[];
  portfolioValue: number;
  avgCompliance: number | null;
  largestSurplus: DeviationEntry | null;
  largestShortfall: DeviationEntry | null;
}
```

Change the body of `computeCalculatedPositionsResult` from:

```ts
export function computeCalculatedPositionsResult(
  file: PortfolioFile | null,
  liveByTicker: Map<string, LiveData>
): CalculatedPositionsResult {
  if (!file) return { calculated: [], portfolioValue: 0, avgCompliance: null };

  const resolveSector = createSectorResolver(SECTORS_DEFAULT, file.sectors);
  const calculated = buildCalculatedPositions(file.positions, liveByTicker, resolveSector);
  const portfolioValue = calculated.reduce((sum, p) => sum + p.positionValue, 0);
  const avgCompliance = computeAverageCompliance(calculated.map((p) => p.compliance));

  return { calculated, portfolioValue, avgCompliance };
}
```

to:

```ts
export function computeCalculatedPositionsResult(
  file: PortfolioFile | null,
  liveByTicker: Map<string, LiveData>
): CalculatedPositionsResult {
  if (!file) {
    return {
      calculated: [],
      portfolioValue: 0,
      avgCompliance: null,
      largestSurplus: null,
      largestShortfall: null,
    };
  }

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
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd webapp && npx vitest run src/portfolio/useCalculatedPositions.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 9: Render the two new stat blocks in `Dashboard.tsx`**

Replace the full contents of `webapp/src/components/Dashboard.tsx` with:

```tsx
import { usePortfolio } from "../portfolio/usePortfolio";
import { useCalculatedPositions } from "../portfolio/useCalculatedPositions";
import { DeviationEntry } from "../domain/calculations";

function formatDeviationEntry(entry: DeviationEntry | null): string {
  if (entry === null) return "—";
  const sign = entry.deviationRub >= 0 ? "+" : "-";
  const amount = Math.round(Math.abs(entry.deviationRub)).toLocaleString("ru-RU");
  return `${entry.ticker} ${sign}₽${amount}`;
}

export function Dashboard() {
  const { file } = usePortfolio();
  const { portfolioValue, avgCompliance, largestSurplus, largestShortfall } = useCalculatedPositions();

  if (!file) return null;

  return (
    <div className="dashboard">
      <span data-label="Общая стоимость">{portfolioValue.toFixed(2)}</span>
      <span data-label="Среднее соответствие">
        {avgCompliance === null ? "—" : avgCompliance.toFixed(2)}
      </span>
      <span data-label="Наибольший избыток">{formatDeviationEntry(largestSurplus)}</span>
      <span data-label="Наибольшая недостача">{formatDeviationEntry(largestShortfall)}</span>
    </div>
  );
}
```

- [ ] **Step 10: Full test run + typecheck**

Run: `cd webapp && npm run test`
Expected: all tests pass, including the updated `useCalculatedPositions.test.ts` and `calculations.test.ts`.

Run: `cd webapp && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 11: Manual verification in dev server**

Run: `cd webapp && npm run dev`
Open the app with a portfolio loaded. Expected: dashboard bar shows four stat blocks now — "Общая стоимость", "Среднее соответствие", "Наибольший избыток" (e.g. `SBER +₽12 340`), "Наибольшая недостача". Stop the dev server after confirming.

- [ ] **Step 12: Commit**

```bash
git add webapp/src/domain/calculations.ts webapp/src/domain/calculations.test.ts webapp/src/portfolio/useCalculatedPositions.ts webapp/src/portfolio/useCalculatedPositions.test.ts webapp/src/components/Dashboard.tsx
git commit -m "feat: add largest-surplus/largest-shortfall stat blocks to dashboard"
```

---

## Task 3: Domain — `dividendYield` field

**Files:**
- Modify: `webapp/src/domain/calculations.ts` (add `computeDividendYield`)
- Test: `webapp/src/domain/calculations.test.ts`
- Modify: `webapp/src/types.ts` (add `dividendYield` to `CalculatedPosition`)
- Modify: `webapp/src/domain/buildCalculatedPositions.ts` (compute and attach the field)
- Test: `webapp/src/domain/buildCalculatedPositions.test.ts`

**Interfaces:**
- Consumes: `LiveData.dividendPerShare` (`number`), `LiveData.price` (`number | null`) — both already exist.
- Produces: `computeDividendYield(dividendPerShare: number, price: number | null): number | null`; `CalculatedPosition.dividendYield: number | null` — consumed by Task 5 (table column).

- [ ] **Step 1: Write failing tests for `computeDividendYield`**

In `webapp/src/domain/calculations.test.ts`, add `computeDividendYield` to the import list (same pattern as Task 2 Step 1), then add:

```ts
describe("computeDividendYield", () => {
  it("expresses dividend per share as a percentage of price", () => {
    expect(computeDividendYield(2, 40)).toBeCloseTo(5);
  });

  it("returns null when price is 0", () => {
    expect(computeDividendYield(2, 0)).toBeNull();
  });

  it("returns null when price is null (no live price)", () => {
    expect(computeDividendYield(2, null)).toBeNull();
  });

  it("is 0 (not null) when there is no dividend but price is valid", () => {
    expect(computeDividendYield(0, 40)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts -t "computeDividendYield"`
Expected: FAIL — `computeDividendYield` is not exported from `./calculations`.

- [ ] **Step 3: Implement `computeDividendYield`**

Append to `webapp/src/domain/calculations.ts`:

```ts
export function computeDividendYield(dividendPerShare: number, price: number | null): number | null {
  if (price === null || price === 0) return null;
  return (dividendPerShare / price) * 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts -t "computeDividendYield"`
Expected: PASS.

- [ ] **Step 5: Add `dividendYield` to `CalculatedPosition`**

In `webapp/src/types.ts`, change:

```ts
export interface CalculatedPosition extends Position, LiveData {
  sector: string;
  targetAllocation: number | null;
  actualShare: number | null;
  compliance: number | null;
  positionValue: number;
  income: number;
}
```

to:

```ts
export interface CalculatedPosition extends Position, LiveData {
  sector: string;
  targetAllocation: number | null;
  actualShare: number | null;
  compliance: number | null;
  positionValue: number;
  income: number;
  dividendYield: number | null;
}
```

- [ ] **Step 6: Write failing test in `buildCalculatedPositions.test.ts`**

In `webapp/src/domain/buildCalculatedPositions.test.ts`, add a new test inside the existing `describe("buildCalculatedPositions", ...)` block:

```ts
  it("computes dividendYield as dividendPerShare / price * 100, null when price is missing or 0", () => {
    const positions: Position[] = [
      { ticker: "GAZP", coefficient: 1, sharesOwned: 1 },
      { ticker: "NOPRICE", coefficient: 1, sharesOwned: 1 },
    ];
    const liveByTicker = new Map([
      ["GAZP", live({ ticker: "GAZP", price: 40, dividendPerShare: 2 })],
      ["NOPRICE", live({ ticker: "NOPRICE", price: null, dividendPerShare: 5 })],
    ]);

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Другое");

    expect(result.find((p) => p.ticker === "GAZP")!.dividendYield).toBeCloseTo(5);
    expect(result.find((p) => p.ticker === "NOPRICE")!.dividendYield).toBeNull();
  });
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/domain/buildCalculatedPositions.test.ts`
Expected: FAIL — `dividendYield` is `undefined`, not the expected number/null (and TypeScript will also flag the missing field once `CalculatedPosition` requires it — that's expected at this point since `buildCalculatedPositions.ts` hasn't been updated yet).

- [ ] **Step 8: Wire `computeDividendYield` into `buildCalculatedPositions`**

In `webapp/src/domain/buildCalculatedPositions.ts`, change the import from:

```ts
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computeActualShare,
  computeCompliance,
} from "./calculations";
```

to:

```ts
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computeActualShare,
  computeCompliance,
  computeDividendYield,
} from "./calculations";
```

Change the return map body from:

```ts
  return withLive.map(({ position, live, positionValue }) => {
    const targetAllocation = computeTargetAllocation(live.indexWeight, position.coefficient, live.status);
    const actualShare = computeActualShare(positionValue, portfolioValue);
    const compliance = computeCompliance(actualShare, targetAllocation);
    const income = computeIncome(live.dividendPerShare, position.sharesOwned);

    return {
      ...position,
      ...live,
      ticker: position.ticker,
      sector: resolveSector(position.ticker),
      targetAllocation,
      actualShare,
      compliance,
      positionValue,
      income,
    };
  });
```

to:

```ts
  return withLive.map(({ position, live, positionValue }) => {
    const targetAllocation = computeTargetAllocation(live.indexWeight, position.coefficient, live.status);
    const actualShare = computeActualShare(positionValue, portfolioValue);
    const compliance = computeCompliance(actualShare, targetAllocation);
    const income = computeIncome(live.dividendPerShare, position.sharesOwned);
    const dividendYield = computeDividendYield(live.dividendPerShare, live.price);

    return {
      ...position,
      ...live,
      ticker: position.ticker,
      sector: resolveSector(position.ticker),
      targetAllocation,
      actualShare,
      compliance,
      positionValue,
      income,
      dividendYield,
    };
  });
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/domain/buildCalculatedPositions.test.ts`
Expected: PASS.

- [ ] **Step 10: Full test run + typecheck**

Run: `cd webapp && npm run test`
Expected: all tests pass.

Run: `cd webapp && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 11: Commit**

```bash
git add webapp/src/domain/calculations.ts webapp/src/domain/calculations.test.ts webapp/src/types.ts webapp/src/domain/buildCalculatedPositions.ts webapp/src/domain/buildCalculatedPositions.test.ts
git commit -m "feat: compute dividendYield on CalculatedPosition"
```

---

## Task 4: Domain — `sharesToBuy` and `buyAmountRub` fields

**Files:**
- Modify: `webapp/src/domain/calculations.ts` (add `computeTargetShares`, `computeSharesToBuy`, `computeBuyAmountRub`)
- Test: `webapp/src/domain/calculations.test.ts`
- Modify: `webapp/src/types.ts` (add `sharesToBuy`, `buyAmountRub` to `CalculatedPosition`)
- Modify: `webapp/src/domain/buildCalculatedPositions.ts` (compute and attach the fields)
- Test: `webapp/src/domain/buildCalculatedPositions.test.ts`

**Interfaces:**
- Consumes: `CalculatedPosition.targetAllocation` (already exists), `portfolioValue` (already computed locally in `buildCalculatedPositions.ts`), `LiveData.price`, `Position.sharesOwned`.
- Produces: `computeTargetShares(targetAllocation: number | null, portfolioValue: number, price: number | null): number | null`; `computeSharesToBuy(targetShares: number | null, sharesOwned: number): number | null`; `computeBuyAmountRub(sharesToBuy: number | null, price: number | null): number | null`; `CalculatedPosition.sharesToBuy: number | null`; `CalculatedPosition.buyAmountRub: number | null` — consumed by Task 5 (table columns). Note: `targetShares` itself is an intermediate value, not stored on `CalculatedPosition`.

- [ ] **Step 1: Write failing tests for the three pure functions**

In `webapp/src/domain/calculations.test.ts`, add `computeTargetShares, computeSharesToBuy, computeBuyAmountRub` to the import list, then add:

```ts
describe("computeTargetShares", () => {
  it("rounds targetAllocation% of portfolioValue divided by price to whole shares", () => {
    // 50% of 1000 / 100 = 5
    expect(computeTargetShares(50, 1000, 100)).toBe(5);
  });

  it("rounds to the nearest whole share", () => {
    // 60% of 1200 / 100 = 7.2 -> 7
    expect(computeTargetShares(60, 1200, 100)).toBe(7);
  });

  it("returns null when targetAllocation is null (out of index)", () => {
    expect(computeTargetShares(null, 1000, 100)).toBeNull();
  });

  it("returns null when price is null", () => {
    expect(computeTargetShares(50, 1000, null)).toBeNull();
  });

  it("returns null when price is 0", () => {
    expect(computeTargetShares(50, 1000, 0)).toBeNull();
  });
});

describe("computeSharesToBuy", () => {
  it("is targetShares minus sharesOwned when more shares are needed", () => {
    expect(computeSharesToBuy(5, 3)).toBe(2);
  });

  it("is negative when the position already holds more than the target (sell signal)", () => {
    expect(computeSharesToBuy(2, 5)).toBe(-3);
  });

  it("returns null when targetShares is null", () => {
    expect(computeSharesToBuy(null, 3)).toBeNull();
  });
});

describe("computeBuyAmountRub", () => {
  it("multiplies sharesToBuy by price", () => {
    expect(computeBuyAmountRub(2, 100)).toBe(200);
  });

  it("is negative for a sell signal (negative sharesToBuy)", () => {
    expect(computeBuyAmountRub(-3, 50)).toBe(-150);
  });

  it("returns null when sharesToBuy is null", () => {
    expect(computeBuyAmountRub(null, 100)).toBeNull();
  });

  it("returns null when price is null", () => {
    expect(computeBuyAmountRub(2, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts -t "computeTargetShares"`
Expected: FAIL — none of the three functions are exported yet.

- [ ] **Step 3: Implement the three functions**

Append to `webapp/src/domain/calculations.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Add `sharesToBuy` and `buyAmountRub` to `CalculatedPosition`**

In `webapp/src/types.ts`, change:

```ts
export interface CalculatedPosition extends Position, LiveData {
  sector: string;
  targetAllocation: number | null;
  actualShare: number | null;
  compliance: number | null;
  positionValue: number;
  income: number;
  dividendYield: number | null;
}
```

to:

```ts
export interface CalculatedPosition extends Position, LiveData {
  sector: string;
  targetAllocation: number | null;
  actualShare: number | null;
  compliance: number | null;
  positionValue: number;
  income: number;
  dividendYield: number | null;
  sharesToBuy: number | null;
  buyAmountRub: number | null;
}
```

- [ ] **Step 6: Write failing test in `buildCalculatedPositions.test.ts`**

Add to the `describe("buildCalculatedPositions", ...)` block in `webapp/src/domain/buildCalculatedPositions.test.ts`:

```ts
  it("computes sharesToBuy and buyAmountRub from targetAllocation, portfolioValue, price and sharesOwned", () => {
    const positions: Position[] = [
      { ticker: "GAZP", coefficient: 1, sharesOwned: 10 },
      { ticker: "SBER", coefficient: 2, sharesOwned: 5 },
    ];
    const liveByTicker = new Map([
      ["GAZP", live({ ticker: "GAZP", indexWeight: 60, price: 100 })],
      ["SBER", live({ ticker: "SBER", indexWeight: 40, price: 40 })],
    ]);
    // portfolioValue = 10*100 + 5*40 = 1200
    // GAZP: targetAllocation 60, targetShares = round(0.6*1200/100) = 7, sharesToBuy = 7-10 = -3, buyAmountRub = -300
    // SBER: targetAllocation 80, targetShares = round(0.8*1200/40) = 24, sharesToBuy = 24-5 = 19, buyAmountRub = 760

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы");

    const gazp = result.find((p) => p.ticker === "GAZP")!;
    expect(gazp.sharesToBuy).toBe(-3);
    expect(gazp.buyAmountRub).toBe(-300);

    const sber = result.find((p) => p.ticker === "SBER")!;
    expect(sber.sharesToBuy).toBe(19);
    expect(sber.buyAmountRub).toBe(760);
  });

  it("gives an out-of-index position a null sharesToBuy and buyAmountRub", () => {
    const positions: Position[] = [{ ticker: "OLD", coefficient: 1, sharesOwned: 3 }];
    const liveByTicker = new Map([
      ["OLD", live({ ticker: "OLD", status: "out_of_index", indexWeight: 0, price: 50 })],
    ]);

    const [result] = buildCalculatedPositions(positions, liveByTicker, () => "Другое");
    expect(result.sharesToBuy).toBeNull();
    expect(result.buyAmountRub).toBeNull();
  });
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/domain/buildCalculatedPositions.test.ts`
Expected: FAIL — `sharesToBuy`/`buyAmountRub` are `undefined`.

- [ ] **Step 8: Wire the three functions into `buildCalculatedPositions`**

In `webapp/src/domain/buildCalculatedPositions.ts`, change the import from:

```ts
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computeActualShare,
  computeCompliance,
  computeDividendYield,
} from "./calculations";
```

to:

```ts
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
} from "./calculations";
```

Change the return map body from:

```ts
  return withLive.map(({ position, live, positionValue }) => {
    const targetAllocation = computeTargetAllocation(live.indexWeight, position.coefficient, live.status);
    const actualShare = computeActualShare(positionValue, portfolioValue);
    const compliance = computeCompliance(actualShare, targetAllocation);
    const income = computeIncome(live.dividendPerShare, position.sharesOwned);
    const dividendYield = computeDividendYield(live.dividendPerShare, live.price);

    return {
      ...position,
      ...live,
      ticker: position.ticker,
      sector: resolveSector(position.ticker),
      targetAllocation,
      actualShare,
      compliance,
      positionValue,
      income,
      dividendYield,
    };
  });
```

to:

```ts
  return withLive.map(({ position, live, positionValue }) => {
    const targetAllocation = computeTargetAllocation(live.indexWeight, position.coefficient, live.status);
    const actualShare = computeActualShare(positionValue, portfolioValue);
    const compliance = computeCompliance(actualShare, targetAllocation);
    const income = computeIncome(live.dividendPerShare, position.sharesOwned);
    const dividendYield = computeDividendYield(live.dividendPerShare, live.price);
    const targetShares = computeTargetShares(targetAllocation, portfolioValue, live.price);
    const sharesToBuy = computeSharesToBuy(targetShares, position.sharesOwned);
    const buyAmountRub = computeBuyAmountRub(sharesToBuy, live.price);

    return {
      ...position,
      ...live,
      ticker: position.ticker,
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
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/domain/buildCalculatedPositions.test.ts`
Expected: PASS.

- [ ] **Step 10: Full test run + typecheck**

Run: `cd webapp && npm run test`
Expected: all tests pass.

Run: `cd webapp && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 11: Commit**

```bash
git add webapp/src/domain/calculations.ts webapp/src/domain/calculations.test.ts webapp/src/types.ts webapp/src/domain/buildCalculatedPositions.ts webapp/src/domain/buildCalculatedPositions.test.ts
git commit -m "feat: compute sharesToBuy and buyAmountRub on CalculatedPosition"
```

---

## Task 5: PositionsTable — header rename, three new columns, editable-cell highlight

**Files:**
- Modify: `webapp/src/styles.css` (add `--editable-bg` var and `.td-editable` rule)
- Modify: `webapp/src/components/PositionsTable.tsx` (header rename, new columns, highlight class)

**Interfaces:**
- Consumes: `CalculatedPosition.dividendYield`, `CalculatedPosition.sharesToBuy`, `CalculatedPosition.buyAmountRub` (all added in Tasks 3–4).
- Produces: `.td-editable` CSS class, consumed again (moved, not redefined) by Task 6.

No automated rendering test exists for `PositionsTable.tsx` in this repo (no `@testing-library/react` installed) — verified via `npm run build`, `npm run lint`, and a manual dev-server check.

- [ ] **Step 1: Add the `.td-editable` highlight styles**

In `webapp/src/styles.css`, add `--editable-bg` to the `:root` block. Change:

```css
  --accent: #35d0c0;
  --accent-dim: rgba(53, 208, 192, 0.14);
```

to:

```css
  --accent: #35d0c0;
  --accent-dim: rgba(53, 208, 192, 0.14);
  --editable-bg: rgba(53, 208, 192, 0.08);
```

Then, right after the existing `.positions-table input[type="number"]:focus` rule, add:

```css
.positions-table td.td-editable {
  background: var(--editable-bg);
}
```

(`--editable-bg` is a lighter, distinct tone from `--accent-dim` so the editable-cell highlight stays visually distinguishable from the row hover state, per the spec.)

- [ ] **Step 2: Update `PositionsTable.tsx` — header rename, new columns, highlight class**

Replace the full contents of `webapp/src/components/PositionsTable.tsx` with:

```tsx
import { CalculatedPosition, STATUS_LABELS } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

function headerWithHint(label: string, hint: string) {
  return (
    <>
      {label}
      <span className="th-hint" data-tooltip={hint} tabIndex={0}>
        ?
      </span>
    </>
  );
}

export function PositionsTable({
  positions,
  onChangeCoefficient,
  onChangeSharesOwned,
}: {
  positions: CalculatedPosition[];
  onChangeCoefficient: (ticker: string, value: number) => void;
  onChangeSharesOwned: (ticker: string, value: number) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="positions-table">
        <thead>
          <tr>
            <th>Тикер</th>
            <th>Название</th>
            <th className="num">Вес в индексе, %</th>
            <th className="num">Цена</th>
            <th className="num">Лотность</th>
            <th>Сектор</th>
            <th className="num">Дивиденд</th>
            <th className="num">Див доходность, %</th>
            <th>Статус</th>
            <th className="num">{headerWithHint("Коэф-т", "Множитель к весу в индексе при расчёте целевой доли")}</th>
            <th className="num">Куплено</th>
            <th className="num">{headerWithHint("Акций купить", "Целое число акций до целевой доли; минус — продать")}</th>
            <th className="num">Купить на сумму</th>
            <th className="num">{headerWithHint("Цель", "Целевая доля = вес в индексе × коэффициент")}</th>
            <th className="num">{headerWithHint("Факт. доля", "Текущая доля позиции в стоимости портфеля, %")}</th>
            <th className="num">{headerWithHint("Соответствие", "Факт. доля ÷ Цель (1.0 = точное совпадение)")}</th>
            <th className="num">Стоимость</th>
            <th className="num">{headerWithHint("Доход", "Дивиденд на акцию × количество акций")}</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.ticker}>
              <td>{p.ticker}</td>
              <td>{p.shortName}</td>
              <td className="num">{formatNumber(p.indexWeight)}</td>
              <td className="num">{formatNumber(p.price)}</td>
              <td className="num">{p.lotSize ?? "—"}</td>
              <td>{p.sector}</td>
              <td className="num">{formatNumber(p.dividendPerShare)}</td>
              <td className="num">{formatNumber(p.dividendYield)}</td>
              <td>
                <span className={`status-dot${p.status === "in_index" ? " status-dot--in" : ""}`}>
                  {STATUS_LABELS[p.status]}
                </span>
              </td>
              <td className="num td-editable">
                <input
                  type="number"
                  step="0.01"
                  value={p.coefficient}
                  onChange={(e) => onChangeCoefficient(p.ticker, Number(e.target.value))}
                />
              </td>
              <td className="num td-editable">
                <input
                  type="number"
                  step="1"
                  value={p.sharesOwned}
                  onChange={(e) => onChangeSharesOwned(p.ticker, Number(e.target.value))}
                />
              </td>
              <td className="num">{formatNumber(p.sharesToBuy, 0)}</td>
              <td className="num">{formatNumber(p.buyAmountRub)}</td>
              <td className="num">{formatNumber(p.targetAllocation)}</td>
              <td className="num">{formatNumber(p.actualShare)}</td>
              <td className="num">
                <ComplianceGauge value={p.compliance} />
              </td>
              <td className="num">{formatNumber(p.positionValue)}</td>
              <td className="num">{formatNumber(p.income)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd webapp && npm run build`
Expected: exits 0, no TypeScript errors.

Run: `cd webapp && npm run lint`
Expected: exits 0, no lint errors.

- [ ] **Step 4: Full test run (regression check)**

Run: `cd webapp && npm run test`
Expected: all tests still pass (this task touches no test files, but confirms the new `CalculatedPosition` fields didn't break anything consumed elsewhere).

- [ ] **Step 5: Manual verification in dev server**

Run: `cd webapp && npm run dev`
Open the app. Expected: header "Вес в индексе" now reads "Вес в индексе, %"; a "Див доходность, %" column appears right after "Дивиденд"; "Акций купить" and "Купить на сумму" columns appear right after "Куплено" (with the `?` tooltip on "Акций купить" working); the "Коэф-т" and "Куплено" input cells now show a faint accent-tinted background distinct from row hover. Stop the dev server after confirming.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/styles.css webapp/src/components/PositionsTable.tsx
git commit -m "feat: add dividend yield, buy-target columns, and editable-cell highlight to positions table"
```

---

## Task 6: PositionsTable — move Сектор to the end, collapse Статус to a leading icon

**Files:**
- Modify: `webapp/src/components/PositionsTable.tsx` (column reorder, remove `STATUS_LABELS` usage/import)
- Modify: `webapp/src/styles.css:355-359` (`.positions-table td:first-child` → `:nth-child(2)`, since the ticker is no longer the first cell)

**Interfaces:**
- Consumes: `CalculatedPosition.status`, `CalculatedPosition.sector` (already exist).
- Produces: nothing consumed by later tasks — this is the final task in the plan.

- [ ] **Step 1: Fix the ticker-styling CSS selector before reordering**

The status icon becomes the new first `<td>` in this task, so the existing "bold monospace ticker" styling — which targets `:first-child` — must move to the new second cell (the ticker), otherwise it would incorrectly apply to the icon cell and the ticker would lose its styling.

In `webapp/src/styles.css`, change:

```css
.positions-table td:first-child {
  font-family: var(--font-mono);
  font-weight: 600;
  letter-spacing: 0.02em;
}
```

to:

```css
.positions-table td:nth-child(2) {
  font-family: var(--font-mono);
  font-weight: 600;
  letter-spacing: 0.02em;
}
```

- [ ] **Step 2: Reorder `PositionsTable.tsx` — Сектор to the end, Статус to a leading icon-only column**

Replace the full contents of `webapp/src/components/PositionsTable.tsx` with:

```tsx
import { CalculatedPosition } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

function headerWithHint(label: string, hint: string) {
  return (
    <>
      {label}
      <span className="th-hint" data-tooltip={hint} tabIndex={0}>
        ?
      </span>
    </>
  );
}

export function PositionsTable({
  positions,
  onChangeCoefficient,
  onChangeSharesOwned,
}: {
  positions: CalculatedPosition[];
  onChangeCoefficient: (ticker: string, value: number) => void;
  onChangeSharesOwned: (ticker: string, value: number) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="positions-table">
        <thead>
          <tr>
            <th></th>
            <th>Тикер</th>
            <th>Название</th>
            <th className="num">Вес в индексе, %</th>
            <th className="num">Цена</th>
            <th className="num">Лотность</th>
            <th className="num">Дивиденд</th>
            <th className="num">Див доходность, %</th>
            <th className="num">{headerWithHint("Коэф-т", "Множитель к весу в индексе при расчёте целевой доли")}</th>
            <th className="num">Куплено</th>
            <th className="num">{headerWithHint("Акций купить", "Целое число акций до целевой доли; минус — продать")}</th>
            <th className="num">Купить на сумму</th>
            <th className="num">{headerWithHint("Цель", "Целевая доля = вес в индексе × коэффициент")}</th>
            <th className="num">{headerWithHint("Факт. доля", "Текущая доля позиции в стоимости портфеля, %")}</th>
            <th className="num">{headerWithHint("Соответствие", "Факт. доля ÷ Цель (1.0 = точное совпадение)")}</th>
            <th className="num">Стоимость</th>
            <th className="num">{headerWithHint("Доход", "Дивиденд на акцию × количество акций")}</th>
            <th>Сектор</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.ticker}>
              <td>
                <span className={`status-dot${p.status === "in_index" ? " status-dot--in" : ""}`} />
              </td>
              <td>{p.ticker}</td>
              <td>{p.shortName}</td>
              <td className="num">{formatNumber(p.indexWeight)}</td>
              <td className="num">{formatNumber(p.price)}</td>
              <td className="num">{p.lotSize ?? "—"}</td>
              <td className="num">{formatNumber(p.dividendPerShare)}</td>
              <td className="num">{formatNumber(p.dividendYield)}</td>
              <td className="num td-editable">
                <input
                  type="number"
                  step="0.01"
                  value={p.coefficient}
                  onChange={(e) => onChangeCoefficient(p.ticker, Number(e.target.value))}
                />
              </td>
              <td className="num td-editable">
                <input
                  type="number"
                  step="1"
                  value={p.sharesOwned}
                  onChange={(e) => onChangeSharesOwned(p.ticker, Number(e.target.value))}
                />
              </td>
              <td className="num">{formatNumber(p.sharesToBuy, 0)}</td>
              <td className="num">{formatNumber(p.buyAmountRub)}</td>
              <td className="num">{formatNumber(p.targetAllocation)}</td>
              <td className="num">{formatNumber(p.actualShare)}</td>
              <td className="num">
                <ComplianceGauge value={p.compliance} />
              </td>
              <td className="num">{formatNumber(p.positionValue)}</td>
              <td className="num">{formatNumber(p.income)}</td>
              <td>{p.sector}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Note `STATUS_LABELS` is no longer imported from `../types` — the icon-only cell no longer renders the text label, and `noUnusedLocals` would fail the build if the import were left in.

- [ ] **Step 3: Typecheck and lint**

Run: `cd webapp && npm run build`
Expected: exits 0, no TypeScript errors, no unused-import error.

Run: `cd webapp && npm run lint`
Expected: exits 0, no lint errors.

- [ ] **Step 4: Full test run (regression check)**

Run: `cd webapp && npm run test`
Expected: all tests still pass.

- [ ] **Step 5: Manual verification in dev server**

Run: `cd webapp && npm run dev`
Open the app. Expected: first column has no header text and shows only the status dot (green dot for in-index positions, grey for out-of-index) directly before the ticker; the ticker still renders in bold monospace; "Сектор" is now the last column, after "Доход". Stop the dev server after confirming.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/components/PositionsTable.tsx webapp/src/styles.css
git commit -m "refactor: move sector column to end, collapse status column to a leading icon"
```
