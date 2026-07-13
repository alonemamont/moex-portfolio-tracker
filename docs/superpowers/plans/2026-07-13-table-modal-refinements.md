# Table/Modal Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nine точечных UI-правок: порядок элементов в модалке пар, группировка/выделение пар в общей таблице, переупорядочивание и двухуровневые заголовки колонок, форматирование денежных сумм, фильтр «Только в индексе».

**Architecture:** Pure-function grouping (`groupPairedPositions`) runs inside `useCalculatedPositions` right after `buildCalculatedPositions`, so every consumer (table, dashboard) already sees grouped order. `filterPositions` gains `pairs` + `onlyInIndex` params and expands the passing-ticker set to whole pairs. `PositionsTable` gets a reordered, two-row `<thead>`, paired-row CSS classes, and two new money formatters. `PairPositionsModal` JSX is reordered with no logic change. All existing tests must keep passing; new pure functions get their own unit tests per repo convention (see `filterPositions.test.ts`, `tablePrefs.test.ts`).

**Tech Stack:** React + TypeScript (strict), Vitest, no CSS framework (hand-written `styles.css`).

## Global Constraints

- All npm commands run with cwd `webapp/`.
- `tsconfig.json` strict mode incl. `noUnusedLocals`, `noUnusedParameters` — no dead params/vars.
- No ESLint/Prettier auto-format — match existing hand formatting exactly.
- No changes to `domain/buildCalculatedPositions.ts`, `domain/calculations.ts`, `file/schema.ts`, `iss/` (per spec "Затрагиваемые файлы").
- Money formatting uses `ru-RU` locale (non-breaking space thousands separator) — never `en-US` or manual string splitting.
- `localStorage` persistence helpers must swallow read/write errors exactly like the existing `loadHideEmptyPref`/`saveHideEmptyPref` pattern (try/catch, default fallback, no throw).

---

### Task 1: `groupPairedPositions` domain function

**Files:**
- Create: `webapp/src/domain/groupPairedPositions.ts`
- Test: `webapp/src/domain/groupPairedPositions.test.ts`

**Interfaces:**
- Produces: `groupPairedPositions<T extends { ticker: string }>(positions: T[], pairs: Pair[]): T[]` — used by Task 2 (`useCalculatedPositions.ts`).

Rule (from spec §2.1): a pair occupies the position of the **first-by-original-order** member; the other members are pulled to sit immediately after it, in `pair.tickers` order. Positions outside any pair keep their relative order untouched.

Example: `A, B, C(paired with E), D, E` → `A, B, C, E, D`.

- [ ] **Step 1: Write the failing tests**

```ts
// webapp/src/domain/groupPairedPositions.test.ts
import { describe, it, expect } from "vitest";
import { groupPairedPositions } from "./groupPairedPositions";
import { Pair } from "../types";

function item(ticker: string): { ticker: string } {
  return { ticker };
}

describe("groupPairedPositions", () => {
  it("returns positions unchanged when there are no pairs", () => {
    const positions = [item("A"), item("B"), item("C")];
    expect(groupPairedPositions(positions, [])).toEqual(positions);
  });

  it("moves the second pair member to sit right after the first, per the spec example", () => {
    const positions = [item("A"), item("B"), item("C"), item("D"), item("E")];
    const pairs: Pair[] = [{ tickers: ["C", "E"], coefficient: 1 }];

    const result = groupPairedPositions(positions, pairs);

    expect(result.map((p) => p.ticker)).toEqual(["A", "B", "C", "E", "D"]);
  });

  it("orders a pair's members by pair.tickers order, not by their original position order", () => {
    const positions = [item("A"), item("E"), item("B"), item("C"), item("D")];
    const pairs: Pair[] = [{ tickers: ["C", "E"], coefficient: 1 }];

    const result = groupPairedPositions(positions, pairs);

    // First-by-original-order member is E (index 1); group sits at E's slot,
    // members ordered per pair.tickers = ["C", "E"] -> C, E.
    expect(result.map((p) => p.ticker)).toEqual(["A", "C", "E", "B", "D"]);
  });

  it("supports pairs with more than two tickers", () => {
    const positions = [item("A"), item("B"), item("C"), item("D")];
    const pairs: Pair[] = [{ tickers: ["D", "B", "A"], coefficient: 1 }];

    const result = groupPairedPositions(positions, pairs);

    // First-by-original-order member is A (index 0); group ordered per pair.tickers = D, B, A.
    expect(result.map((p) => p.ticker)).toEqual(["D", "B", "A", "C"]);
  });

  it("handles multiple independent pairs without interference", () => {
    const positions = [item("A"), item("B"), item("C"), item("D")];
    const pairs: Pair[] = [
      { tickers: ["A", "D"], coefficient: 1 },
      { tickers: ["C", "B"], coefficient: 1 },
    ];

    const result = groupPairedPositions(positions, pairs);

    expect(result.map((p) => p.ticker)).toEqual(["A", "D", "C", "B"]);
  });

  it("leaves a ticker with no matching position out of the emitted group silently", () => {
    const positions = [item("A"), item("B")];
    const pairs: Pair[] = [{ tickers: ["A", "GHOST"], coefficient: 1 }];

    const result = groupPairedPositions(positions, pairs);

    expect(result.map((p) => p.ticker)).toEqual(["A", "B"]);
  });

  it("does not throw for an empty position list", () => {
    expect(groupPairedPositions([], [{ tickers: ["A", "B"], coefficient: 1 }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/groupPairedPositions.test.ts`
Expected: FAIL — `Cannot find module './groupPairedPositions'`

- [ ] **Step 3: Write the implementation**

```ts
// webapp/src/domain/groupPairedPositions.ts
import { Pair } from "../types";

export function groupPairedPositions<T extends { ticker: string }>(
  positions: T[],
  pairs: Pair[]
): T[] {
  if (pairs.length === 0) return positions;

  const tickerToPair = new Map<string, Pair>();
  for (const pair of pairs) {
    for (const ticker of pair.tickers) {
      tickerToPair.set(ticker, pair);
    }
  }

  const byTicker = new Map(positions.map((p) => [p.ticker, p] as const));
  const emittedPairs = new Set<Pair>();
  const result: T[] = [];

  for (const position of positions) {
    const pair = tickerToPair.get(position.ticker);
    if (!pair) {
      result.push(position);
      continue;
    }
    if (emittedPairs.has(pair)) continue;
    emittedPairs.add(pair);
    for (const ticker of pair.tickers) {
      const member = byTicker.get(ticker);
      if (member) result.push(member);
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/groupPairedPositions.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/domain/groupPairedPositions.ts webapp/src/domain/groupPairedPositions.test.ts
git commit -m "feat: add groupPairedPositions for adjacent pair ordering"
```

---

### Task 2: Wire `groupPairedPositions` into `useCalculatedPositions`

**Files:**
- Modify: `webapp/src/portfolio/useCalculatedPositions.ts:1-33` (imports + `computeCalculatedPositionsResult` body)
- Test: `webapp/src/portfolio/useCalculatedPositions.test.ts` (append new test)

**Interfaces:**
- Consumes: `groupPairedPositions<T extends { ticker: string }>(positions: T[], pairs: Pair[]): T[]` from Task 1.
- Produces: `calculated` in `CalculatedPositionsResult` is now grouped — consumed downstream by `PositionsTable` (Task 7) and `filterPositions` (Task 3), both of which rely on the array already being in grouped order.

- [ ] **Step 1: Write the failing test**

Append to `webapp/src/portfolio/useCalculatedPositions.test.ts`, inside the existing `describe("computeCalculatedPositionsResult", ...)` block, after the last `it(...)`:

```ts
  it("groups paired positions so members sit adjacent, at the first member's original slot", () => {
    const f = file({
      positions: [
        { ticker: "A", coefficient: 1, sharesOwned: 1 },
        { ticker: "B", coefficient: 1, sharesOwned: 1 },
        { ticker: "C", coefficient: 1, sharesOwned: 1 },
        { ticker: "D", coefficient: 1, sharesOwned: 1 },
        { ticker: "E", coefficient: 1, sharesOwned: 1 },
      ],
      pairs: [{ tickers: ["C", "E"], coefficient: 1 }],
    });
    const liveByTicker = new Map(
      ["A", "B", "C", "D", "E"].map((ticker) => [ticker, live({ ticker, price: 10 })])
    );

    const result = computeCalculatedPositionsResult(f, liveByTicker);

    expect(result.calculated.map((p) => p.ticker)).toEqual(["A", "B", "C", "E", "D"]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/portfolio/useCalculatedPositions.test.ts -t "groups paired positions"`
Expected: FAIL — `calculated` order is `["A", "B", "C", "D", "E"]`, not `["A", "B", "C", "E", "D"]`

- [ ] **Step 3: Implement**

In `webapp/src/portfolio/useCalculatedPositions.ts`, add the import at line 6 (after the `calculations` import):

```ts
import { groupPairedPositions } from "../domain/groupPairedPositions";
```

Then change line 32 from:

```ts
  const calculated = buildCalculatedPositions(file.positions, liveByTicker, resolveSector, file.pairs);
```

to:

```ts
  const calculated = groupPairedPositions(
    buildCalculatedPositions(file.positions, liveByTicker, resolveSector, file.pairs),
    file.pairs
  );
```

Everything below that line (`portfolioValue`, `avgCompliance`, `pairedTickers`, `soloDeviations`, `pairDeviations`) already consumes `calculated` and needs no further change — grouping only reorders, it doesn't change membership or values.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/portfolio/useCalculatedPositions.test.ts`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS (grouping is a no-op for every existing test, since none of them assert on ordering with pairs present in a way that grouping would break — `buildCalculatedPositions.test.ts` doesn't pass `pairs` at all, and the existing pair-dashboard tests only check `find()`/membership, not array order)

- [ ] **Step 6: Commit**

```bash
git add webapp/src/portfolio/useCalculatedPositions.ts webapp/src/portfolio/useCalculatedPositions.test.ts
git commit -m "feat: group paired positions adjacently in calculated positions"
```

---

### Task 3: `filterPositions` — add `pairs` and `onlyInIndex`

**Files:**
- Modify: `webapp/src/portfolio/filterPositions.ts` (full rewrite of the function body)
- Modify (tests): `webapp/src/portfolio/filterPositions.test.ts` (update every existing call site + add new tests)

**Interfaces:**
- Consumes: `Pair` type from `../types` (`{ tickers: string[]; coefficient: number }`).
- Produces: new signature `filterPositions(positions: CalculatedPosition[], pairs: Pair[], search: string, hideEmpty: boolean, onlyInIndex: boolean): CalculatedPosition[]` — consumed by `PortfolioTab.tsx` (Task 5).

Note the parameter order matches the spec exactly: `positions, pairs, search, hideEmpty, onlyInIndex`. This is a breaking signature change — every existing call in the test file must be updated in the same commit or the suite won't compile (`noUnusedParameters`/strict TS).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `webapp/src/portfolio/filterPositions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filterPositions } from "./filterPositions";
import { CalculatedPosition, Pair } from "../types";

function makePosition(overrides: Partial<CalculatedPosition>): CalculatedPosition {
  return {
    ticker: "SBER",
    shortName: "Сбербанк",
    coefficient: 1,
    sharesOwned: 0,
    indexWeight: 1,
    price: 100,
    lotSize: 10,
    dividendPerShare: 0,
    status: "in_index",
    sector: "Финансы",
    targetAllocation: 1,
    actualShare: 1,
    compliance: 1,
    positionValue: 0,
    income: 0,
    dividendYield: null,
    sharesToBuy: null,
    buyAmountRub: null,
    ...overrides,
  };
}

describe("filterPositions", () => {
  const positions = [
    makePosition({ ticker: "SBER", shortName: "Сбербанк", sharesOwned: 10 }),
    makePosition({ ticker: "GAZP", shortName: "Газпром", sharesOwned: 0 }),
    makePosition({ ticker: "LKOH", shortName: "Лукойл", sharesOwned: 5 }),
  ];
  const noPairs: Pair[] = [];

  it("returns all positions when search is empty and hideEmpty/onlyInIndex are false", () => {
    expect(filterPositions(positions, noPairs, "", false, false)).toHaveLength(3);
  });

  it("filters by ticker substring, case-insensitive", () => {
    const result = filterPositions(positions, noPairs, "sber", false, false);
    expect(result.map((p) => p.ticker)).toEqual(["SBER"]);
  });

  it("filters by shortName substring, case-insensitive", () => {
    const result = filterPositions(positions, noPairs, "газпром", false, false);
    expect(result.map((p) => p.ticker)).toEqual(["GAZP"]);
  });

  it("hides positions with sharesOwned === 0 when hideEmpty is true", () => {
    const result = filterPositions(positions, noPairs, "", true, false);
    expect(result.map((p) => p.ticker)).toEqual(["SBER", "LKOH"]);
  });

  it("combines search and hideEmpty with AND semantics", () => {
    const result = filterPositions(positions, noPairs, "GAZP", true, false);
    expect(result).toHaveLength(0);
  });

  it("treats whitespace-only search as empty", () => {
    expect(filterPositions(positions, noPairs, "   ", false, false)).toHaveLength(3);
  });

  it("keeps only in_index positions when onlyInIndex is true", () => {
    const mixed = [
      makePosition({ ticker: "SBER", status: "in_index" }),
      makePosition({ ticker: "OLD", status: "out_of_index" }),
    ];
    const result = filterPositions(mixed, noPairs, "", false, true);
    expect(result.map((p) => p.ticker)).toEqual(["SBER"]);
  });

  it("combines onlyInIndex with hideEmpty and search using AND semantics", () => {
    const mixed = [
      makePosition({ ticker: "SBER", status: "in_index", sharesOwned: 5 }),
      makePosition({ ticker: "SBERP", status: "out_of_index", sharesOwned: 5 }),
      makePosition({ ticker: "GAZP", status: "in_index", sharesOwned: 0 }),
    ];
    const result = filterPositions(mixed, noPairs, "", true, true);
    expect(result.map((p) => p.ticker)).toEqual(["SBER"]);
  });

  it("pulls in every pair member when at least one member passes its own filters", () => {
    const mixed = [
      makePosition({ ticker: "SBER", status: "in_index", sharesOwned: 10 }),
      makePosition({ ticker: "SBERP", status: "in_index", sharesOwned: 0 }),
      makePosition({ ticker: "GAZP", status: "in_index", sharesOwned: 0 }),
    ];
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficient: 1 }];

    // hideEmpty=true: SBER passes on its own (sharesOwned=10), SBERP would not,
    // but SBERP must be pulled in because it shares a pair with SBER.
    const result = filterPositions(mixed, pairs, "", true, false);
    expect(result.map((p) => p.ticker)).toEqual(["SBER", "SBERP"]);
  });

  it("drops a whole pair when none of its members pass their own filters", () => {
    const mixed = [
      makePosition({ ticker: "SBER", status: "in_index", sharesOwned: 0 }),
      makePosition({ ticker: "SBERP", status: "in_index", sharesOwned: 0 }),
      makePosition({ ticker: "GAZP", status: "in_index", sharesOwned: 10 }),
    ];
    const pairs: Pair[] = [{ tickers: ["SBER", "SBERP"], coefficient: 1 }];

    const result = filterPositions(mixed, pairs, "", true, false);
    expect(result.map((p) => p.ticker)).toEqual(["GAZP"]);
  });

  it("preserves the already-grouped input order of the result", () => {
    const mixed = [
      makePosition({ ticker: "A", sharesOwned: 1 }),
      makePosition({ ticker: "C", sharesOwned: 1 }),
      makePosition({ ticker: "E", sharesOwned: 1 }),
      makePosition({ ticker: "D", sharesOwned: 1 }),
    ];
    const pairs: Pair[] = [{ tickers: ["C", "E"], coefficient: 1 }];

    const result = filterPositions(mixed, pairs, "", false, false);
    expect(result.map((p) => p.ticker)).toEqual(["A", "C", "E", "D"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/portfolio/filterPositions.test.ts`
Expected: FAIL (TS compile error — too many/wrong-order arguments against the old 3-arg signature)

- [ ] **Step 3: Implement**

Replace the full contents of `webapp/src/portfolio/filterPositions.ts`:

```ts
import { CalculatedPosition, Pair } from "../types";

export function filterPositions(
  positions: CalculatedPosition[],
  pairs: Pair[],
  search: string,
  hideEmpty: boolean,
  onlyInIndex: boolean
): CalculatedPosition[] {
  const query = search.trim().toLowerCase();

  function passesOwnFilters(p: CalculatedPosition): boolean {
    if (hideEmpty && p.sharesOwned === 0) return false;
    if (onlyInIndex && p.status !== "in_index") return false;
    if (query === "") return true;
    return (
      p.ticker.toLowerCase().includes(query) ||
      p.shortName.toLowerCase().includes(query)
    );
  }

  const passingTickers = new Set(
    positions.filter(passesOwnFilters).map((p) => p.ticker)
  );

  for (const pair of pairs) {
    if (pair.tickers.some((ticker) => passingTickers.has(ticker))) {
      for (const ticker of pair.tickers) passingTickers.add(ticker);
    }
  }

  return positions.filter((p) => passingTickers.has(p.ticker));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/portfolio/filterPositions.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/portfolio/filterPositions.ts webapp/src/portfolio/filterPositions.test.ts
git commit -m "feat: filterPositions expands passing set to whole pairs, adds onlyInIndex"
```

---

### Task 4: `tablePrefs` — `onlyInIndex` persistence

**Files:**
- Modify: `webapp/src/portfolio/tablePrefs.ts`
- Modify (tests): `webapp/src/portfolio/tablePrefs.test.ts` (append new `describe` block)

**Interfaces:**
- Produces: `loadOnlyInIndexPref(): boolean`, `saveOnlyInIndexPref(value: boolean): void` — consumed by `PortfolioTab.tsx` (Task 5).

- [ ] **Step 1: Write the failing tests**

Append to `webapp/src/portfolio/tablePrefs.test.ts`:

```ts
import {
  loadOnlyInIndexPref,
  saveOnlyInIndexPref,
} from "./tablePrefs";
```

(add to the existing import block at the top of the file rather than a second `import` statement — i.e. change line 2-7 to include the two new names)

Then append at the end of the file:

```ts
describe("onlyInIndex pref", () => {
  it("defaults to false when nothing stored", () => {
    expect(loadOnlyInIndexPref()).toBe(false);
  });

  it("round-trips true", () => {
    saveOnlyInIndexPref(true);
    expect(loadOnlyInIndexPref()).toBe(true);
  });

  it("round-trips false after being true", () => {
    saveOnlyInIndexPref(true);
    saveOnlyInIndexPref(false);
    expect(loadOnlyInIndexPref()).toBe(false);
  });

  it("returns default when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadOnlyInIndexPref()).toBe(false);
  });

  it("does not throw when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveOnlyInIndexPref(true)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/portfolio/tablePrefs.test.ts`
Expected: FAIL — `loadOnlyInIndexPref`/`saveOnlyInIndexPref` not exported

- [ ] **Step 3: Implement**

In `webapp/src/portfolio/tablePrefs.ts`, add a new key constant after line 2:

```ts
const ONLY_IN_INDEX_KEY = "portfolio.onlyInIndex";
```

Append at the end of the file (after `saveHideEmptyPref`):

```ts

export function loadOnlyInIndexPref(): boolean {
  try {
    return localStorage.getItem(ONLY_IN_INDEX_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveOnlyInIndexPref(value: boolean): void {
  try {
    localStorage.setItem(ONLY_IN_INDEX_KEY, String(value));
  } catch {
    // Swallow error — persistence is best-effort
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/portfolio/tablePrefs.test.ts`
Expected: PASS (all tests, old + new 5)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/portfolio/tablePrefs.ts webapp/src/portfolio/tablePrefs.test.ts
git commit -m "feat: add onlyInIndex localStorage preference"
```

---

### Task 5: `PortfolioTab.tsx` — wire `onlyInIndex` checkbox and pass `pairs` to `filterPositions`

**Files:**
- Modify: `webapp/src/components/PortfolioTab.tsx`

**Interfaces:**
- Consumes: `filterPositions(positions, pairs, search, hideEmpty, onlyInIndex)` (Task 3), `loadOnlyInIndexPref`/`saveOnlyInIndexPref` (Task 4).

No dedicated test file exists for `PortfolioTab.tsx` today (component-level tests aren't part of this codebase's convention — see `Glob` of `*.test.ts*`, none match `PortfolioTab`). Verification for this task is manual (Step 4) plus the full suite staying green.

- [ ] **Step 1: Update the import block**

In `webapp/src/components/PortfolioTab.tsx`, change lines 7-12 from:

```ts
import {
  loadSearchPref,
  saveSearchPref,
  loadHideEmptyPref,
  saveHideEmptyPref,
} from "../portfolio/tablePrefs";
```

to:

```ts
import {
  loadSearchPref,
  saveSearchPref,
  loadHideEmptyPref,
  saveHideEmptyPref,
  loadOnlyInIndexPref,
  saveOnlyInIndexPref,
} from "../portfolio/tablePrefs";
```

- [ ] **Step 2: Add state and persistence effect**

Change line 27 from:

```ts
  const [hideEmpty, setHideEmpty] = useState(() => loadHideEmptyPref());
```

to:

```ts
  const [hideEmpty, setHideEmpty] = useState(() => loadHideEmptyPref());
  const [onlyInIndex, setOnlyInIndex] = useState(() => loadOnlyInIndexPref());
```

Change lines 35-37 (the `hideEmpty` persistence effect) — insert a matching effect immediately after it:

```ts
  useEffect(() => {
    saveHideEmptyPref(hideEmpty);
  }, [hideEmpty]);

  useEffect(() => {
    saveOnlyInIndexPref(onlyInIndex);
  }, [onlyInIndex]);
```

- [ ] **Step 3: Pass `pairs` and `onlyInIndex` into `filterPositions`, add the checkbox**

Change lines 71-74 from:

```ts
  const filteredPositions = useMemo(
    () => filterPositions(calculated, search, hideEmpty),
    [calculated, search, hideEmpty]
  );
```

to:

```ts
  const filteredPositions = useMemo(
    () => filterPositions(calculated, file?.pairs ?? [], search, hideEmpty, onlyInIndex),
    [calculated, file, search, hideEmpty, onlyInIndex]
  );
```

Change the `.controls-row` block (lines 122-137) from:

```tsx
      <div className="controls-row">
        <input
          type="text"
          placeholder="Поиск по тикеру или названию"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
          />
          Скрывать пустые позиции
        </label>
      </div>
```

to:

```tsx
      <div className="controls-row">
        <input
          type="text"
          placeholder="Поиск по тикеру или названию"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
          />
          Скрывать пустые позиции
        </label>
        <label>
          <input
            type="checkbox"
            checked={onlyInIndex}
            onChange={(e) => setOnlyInIndex(e.target.checked)}
          />
          Только в индексе
        </label>
      </div>
```

Note: `filteredPositions` is computed by a `useMemo` that runs *before* the `if (!file) return null;` early return at line 76, so `file` may be `null` at that point — hence `file?.pairs ?? []` rather than `file.pairs`. This mirrors how `calculated` (from `useCalculatedPositions()`, also called before the early return) already tolerates a null file.

- [ ] **Step 4: Manual verification**

Run: `npm run dev` (from `webapp/`)
Open the app, load a portfolio with at least one pair and one out-of-index position.
Confirm:
- New "Только в индексе" checkbox appears next to "Скрывать пустые позиции".
- Checking it hides out-of-index rows; unchecking restores them.
- Reloading the page preserves the last checkbox state (localStorage).
- With a pair where one member is out-of-index and hideEmpty+onlyInIndex are both on, if the in-index member still has shares, both members remain visible together.

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npm run typecheck`
Expected: no errors

Run: `npx vitest run`
Expected: PASS, all suites

- [ ] **Step 6: Commit**

```bash
git add webapp/src/components/PortfolioTab.tsx
git commit -m "feat: add \"only in index\" filter checkbox to portfolio tab"
```

---

### Task 6: `PairPositionsModal.tsx` — reorder JSX, add `.modal__divider`

**Files:**
- Modify: `webapp/src/components/PairPositionsModal.tsx:50-108` (JSX return block only — no logic changes)
- Modify: `webapp/src/styles.css` (add `.modal__divider` near `.modal__actions`, line 254-258)

**Interfaces:** none — purely presentational reorder, no prop/state signature changes. `draftPairs`, `selectedTickers`, `newCoefficientInput`, `handleAddPair`, `handleRemovePair`, `handleChangeCoefficient` (lines 15-48) are untouched.

No component test exists for `PairPositionsModal` (see `Glob` — no match). Verification is manual (Step 3).

- [ ] **Step 1: Reorder the JSX**

Replace the `return (...)` block in `webapp/src/components/PairPositionsModal.tsx` (lines 50-108) with:

```tsx
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
```

This matches spec §1's order: title, actions, existing-pairs table, divider, then a dedicated add-pair block (coefficient input + button) placed *before* the ticker checkbox list (per spec item 5: "выносятся ... в отдельный div перед списком тикеров"), with the ticker list as its own block after.

- [ ] **Step 2: Add `.modal__divider` to `styles.css`**

In `webapp/src/styles.css`, insert after the `.modal__actions` rule (after line 258, before `.add-ticker__field` at line 260):

```css
.modal__divider {
  border: none;
  border-top: 1px solid var(--line);
  margin: 14px 0;
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev` (from `webapp/`)
Open "Парные позиции" modal. Confirm top-to-bottom order: title, Сохранить/Отмена buttons, existing-pairs table, horizontal divider line, coefficient input + "Добавить" button, ticker checkbox list. Confirm adding/removing a pair still works exactly as before.

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `npm run typecheck`
Expected: no errors

Run: `npx vitest run`
Expected: PASS, all suites (no test touches this component, so this is a regression guard on the rest of the app, e.g. `merge.test.ts` / `schema.test.ts` involving `Pair`)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/components/PairPositionsModal.tsx webapp/src/styles.css
git commit -m "feat: reorder pair positions modal layout, add divider"
```

---

### Task 7: `PositionsTable.tsx` — column reorder, two-row header, paired-row highlighting, money formatting

**Files:**
- Modify: `webapp/src/components/PositionsTable.tsx` (full rewrite — header, body, formatters, props)
- Modify: `webapp/src/styles.css` (paired-row classes + header group centering, appended near line 340 / 352)

**Interfaces:**
- Consumes: `Pair` type from `../types`; `groupPairedPositions`-produced already-adjacent `positions` prop (Task 2) — this component does *not* call `groupPairedPositions` itself, it only relies on the input already being grouped.
- Produces: new prop `pairs: Pair[]` added to `PositionsTable`'s props — `PortfolioTab.tsx` (already modified in Task 5) must pass `file.pairs` (or `file?.pairs ?? []`) as this new prop. This task includes that one-line call-site update.

No component test exists for `PositionsTable` (see `Glob` — no match). Verification is manual (Step 4).

- [ ] **Step 1: Rewrite `PositionsTable.tsx`**

Replace the full contents of `webapp/src/components/PositionsTable.tsx`:

```tsx
import { CalculatedPosition, Pair } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

function formatMoney(value: number | null, digits = 2): string {
  if (value === null) return "—";
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatMoneyTruncated(value: number): string {
  return Math.trunc(value).toLocaleString("ru-RU");
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

function pairRowClass(
  ticker: string,
  index: number,
  positions: CalculatedPosition[],
  pairedTickers: Map<string, Pair>
): string {
  const pair = pairedTickers.get(ticker);
  if (!pair) return "";

  const prevTicker = index > 0 ? positions[index - 1].ticker : undefined;
  const nextTicker = index < positions.length - 1 ? positions[index + 1].ticker : undefined;
  const isFirst = prevTicker === undefined || pairedTickers.get(prevTicker) !== pair;
  const isLast = nextTicker === undefined || pairedTickers.get(nextTicker) !== pair;

  let className = "paired-row";
  if (isFirst) className += " paired-row--first";
  if (isLast) className += " paired-row--last";
  return className;
}

export function PositionsTable({
  positions,
  pairs,
  onChangeCoefficient,
  onChangeSharesOwned,
}: {
  positions: CalculatedPosition[];
  pairs: Pair[];
  onChangeCoefficient: (ticker: string, value: number) => void;
  onChangeSharesOwned: (ticker: string, value: number) => void;
}) {
  const pairedTickers = new Map<string, Pair>();
  for (const pair of pairs) {
    for (const ticker of pair.tickers) pairedTickers.set(ticker, pair);
  }

  return (
    <div className="table-scroll">
      <table className="positions-table">
        <thead>
          <tr>
            <th rowSpan={2}></th>
            <th rowSpan={2}>Тикер</th>
            <th rowSpan={2}>Название</th>
            <th rowSpan={2} className="num">Вес в индексе, %</th>
            <th rowSpan={2} className="num">
              {headerWithHint("Факт. вес, %", "Текущая доля позиции в стоимости портфеля, %")}
            </th>
            <th rowSpan={2} className="num">Цена</th>
            <th rowSpan={2} className="num">Лотность</th>
            <th rowSpan={2} className="num">
              {headerWithHint("Коэф-т", "Множитель к весу в индексе при расчёте целевой доли")}
            </th>
            <th colSpan={2} className="num th-group">Куплено</th>
            <th colSpan={2} className="num th-group">Купить</th>
            <th rowSpan={2} className="num">
              {headerWithHint("Цель", "Целевая доля = вес в индексе × коэффициент")}
            </th>
            <th rowSpan={2} className="num">
              {headerWithHint("Соответствие", "Факт. доля ÷ Цель (1.0 = точное совпадение)")}
            </th>
            <th rowSpan={2} className="num">Дивиденд</th>
            <th rowSpan={2} className="num">Див доходность, %</th>
            <th rowSpan={2} className="num">
              {headerWithHint("Доход", "Дивиденд на акцию × количество акций")}
            </th>
            <th rowSpan={2}>Сектор</th>
          </tr>
          <tr>
            <th className="num">Штук</th>
            <th className="num">Стоимость</th>
            <th className="num">Штук</th>
            <th className="num">На сумму</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, index) => (
            <tr key={p.ticker} className={pairRowClass(p.ticker, index, positions, pairedTickers)}>
              <td>
                <span className={`status-dot${p.status === "in_index" ? " status-dot--in" : ""}`} />
              </td>
              <td>{p.ticker}</td>
              <td>{p.shortName}</td>
              <td className="num">{formatNumber(p.indexWeight)}</td>
              <td className="num">{formatNumber(p.actualShare)}</td>
              <td className="num">{formatMoney(p.price)}</td>
              <td className="num">{p.lotSize ?? "—"}</td>
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
              <td className="num">{formatMoneyTruncated(p.positionValue)}</td>
              <td className="num">{formatNumber(p.sharesToBuy, 0)}</td>
              <td className="num">{formatMoney(p.buyAmountRub)}</td>
              <td className="num">{formatNumber(p.targetAllocation)}</td>
              <td className="num">
                <ComplianceGauge value={p.compliance} />
              </td>
              <td className="num">{formatMoney(p.dividendPerShare)}</td>
              <td className="num">{formatNumber(p.dividendYield)}</td>
              <td className="num">{formatMoney(p.income)}</td>
              <td>{p.sector}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Column order check against spec §3 target (`статус | Тикер | Название | Вес в индексе, % | Факт. вес, % | Цена | Лотность | Коэф-т | Куплено{штук, стоимость} | Купить{штук, на сумму} | Цель | Соответствие | Дивиденд | Див доходность, % | Доход | Сектор`) — matches header row and body `<td>` order above exactly.

- [ ] **Step 2: Update `PortfolioTab.tsx` call site to pass `pairs`**

In `webapp/src/components/PortfolioTab.tsx`, the `<PositionsTable ... />` element (around line 138-142) currently reads:

```tsx
      <PositionsTable
        positions={filteredPositions}
        onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
        onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
      />
```

Change to:

```tsx
      <PositionsTable
        positions={filteredPositions}
        pairs={file.pairs}
        onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
        onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
      />
```

(`file.pairs`, not `file?.pairs ?? []`, is safe here because this JSX is inside the `return` that comes after the `if (!file) return null;` guard at line 76 — unlike the `filteredPositions` `useMemo` in Task 5, which runs before that guard.)

- [ ] **Step 3: Add CSS for paired rows and grouped headers**

In `webapp/src/styles.css`, after the `.positions-table tbody tr:nth-child(even)` rule (after line 340), insert:

```css
.positions-table th.th-group {
  text-align: center;
}

.positions-table tbody tr.paired-row {
  background: var(--panel-alt);
}

.positions-table tbody tr.paired-row:nth-child(even) {
  background: var(--panel-alt);
}

.positions-table tbody tr.paired-row td:first-child {
  border-left: 2px solid var(--accent);
}

.positions-table tbody tr.paired-row--first td {
  border-top: 1px solid var(--accent);
}

.positions-table tbody tr.paired-row--last td {
  border-bottom: 1px solid var(--accent);
}
```

`tr.paired-row:nth-child(even)` (same specificity class count as the plain `tbody tr:nth-child(even)` rule but declared later in the file) ensures the paired background wins over zebra striping regardless of odd/even position, per spec §2.2 ("paired-row фон переопределяет zebra через больший specificity/порядок правил").

- [ ] **Step 4: Manual verification**

Run: `npm run dev` (from `webapp/`)
Load a portfolio with at least one 2-member pair and some out-of-index/zero-share positions. Confirm:
- Column order matches spec: статус, Тикер, Название, Вес в индексе %, Факт. вес %, Цена, Лотность, Коэф-т, Куплено (Штук/Стоимость), Купить (Штук/На сумму), Цель, Соответствие, Дивиденд, Див доходность %, Доход, Сектор.
- "Куплено" and "Купить" each span two centered sub-columns in row 2 of the header.
- Rows belonging to the same pair sit adjacent, share a slightly darker background than zebra striping, and have a left accent border running continuously from the first to the last row of the group, with top/bottom accent borders capping the group.
- Цена, Купить на сумму, Дивиденд, Доход show 2 decimal places with `ru-RU` thousands separators (e.g. `1 234,56`).
- Стоимость shows 0 decimals, always rounded down (test with a position whose value has a fractional part, e.g. verify `1234.99` shows `1 234` not `1 235`).
- Editing coefficient/sharesOwned inputs still works.

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npm run typecheck`
Expected: no errors

Run: `npx vitest run`
Expected: PASS, all suites

- [ ] **Step 6: Commit**

```bash
git add webapp/src/components/PositionsTable.tsx webapp/src/components/PortfolioTab.tsx webapp/src/styles.css
git commit -m "feat: reorder table columns, two-row header, paired-row highlight, money formatting"
```

---

### Task 8: Full-suite regression check and final review

**Files:** none (verification-only task)

- [ ] **Step 1: Run the full build (typecheck + bundle)**

Run: `npm run build` (from `webapp/`)
Expected: succeeds with no TypeScript errors from either tsconfig project, `vite build` completes

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run` (from `webapp/`)
Expected: PASS, every suite listed by `Glob webapp/src/**/*.test.ts*` plus the two new files from Task 1 and updates from Tasks 2-4

- [ ] **Step 3: Run lint**

Run: `npm run lint` (from `webapp/`)
Expected: no errors

- [ ] **Step 4: Manual end-to-end walkthrough**

Run: `npm run dev` (from `webapp/`)
Walk through, in order: open pair modal (order per §1) → close → toggle "Только в индексе" and "Скрывать пустые позиции" together with a paired position that has one in-index and one out-of-index member → confirm table column order and two-row header → confirm money formatting on Цена/Стоимость/Купить на сумму/Дивиденд/Доход → confirm paired-row highlight renders correctly at top, middle, and bottom of the table (test with a pair at row 1 and a pair at the last row).

- [ ] **Step 5: No commit — this task is verification-only**

If any step fails, return to the relevant task above, fix, and re-commit there rather than adding a new fixup commit here.

---

## Self-Review Notes

- **Spec coverage:** §1 modal reorder → Task 6. §2.1 grouping → Task 1+2. §2.2 highlighting → Task 7. §2.3 filter pair union → Task 3. §3 column reorder/two-row header → Task 7. §4 onlyInIndex filter → Tasks 3, 4, 5. §5 money formatting → Task 7. "Затрагиваемые файлы" list is fully covered: `PairPositionsModal.tsx` (6), `styles.css` (6, 7), `groupPairedPositions.ts` (1), `useCalculatedPositions.ts` (2), `filterPositions.ts` (3), `tablePrefs.ts` (4), `PositionsTable.tsx` (7), `PortfolioTab.tsx` (5, 7).
- **Placeholder scan:** none found — every step has literal code.
- **Type consistency:** `groupPairedPositions<T extends { ticker: string }>` (Task 1) called with `CalculatedPosition[]` (Task 2) — satisfies the constraint since `CalculatedPosition` has `ticker: string`. `filterPositions` signature `(positions, pairs, search, hideEmpty, onlyInIndex)` used identically in Task 3 tests, Task 5 call site. `PositionsTable` new `pairs` prop threaded from Task 5's `file.pairs` through to Task 7's call-site update — consistent.
