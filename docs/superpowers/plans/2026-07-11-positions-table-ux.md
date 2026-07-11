# Таблица позиций: поиск, фильтр пустых, тултипы — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ticker/name search, a "hide empty positions" checkbox, and hover tooltips on computed table headers to the portfolio positions table, with search/checkbox state persisted in localStorage.

**Architecture:** Two new pure/testable helper modules under `webapp/src/portfolio/` (a filter predicate and localStorage read/write helpers), wired into `PortfolioTab.tsx` via `useState`/`useEffect`/`useMemo`. `PositionsTable.tsx` gets tooltip markup on 5 header cells. Pure CSS `:hover` tooltip, no new dependencies.

**Tech Stack:** React 18 + TypeScript (strict), Vitest (jsdom environment, globals on), no new npm packages.

## Global Constraints

- Run all npm commands with cwd `webapp/`.
- `tsconfig.json` strict mode: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules: true` — code must satisfy these.
- No ESLint/Prettier auto-format config — match existing formatting by hand (2-space indent, double quotes, semicolons, as seen in existing files).
- No new runtime dependencies (spec: pure CSS tooltip, no tooltip library).
- Filtering is view-only: `.portfolio-summary` totals (`portfolioValue`, `avgCompliance`) must keep computing from the **unfiltered** `calculated` array.
- "Empty position" = `sharesOwned === 0` exactly (status field irrelevant).
- localStorage keys: `portfolio.search`, `portfolio.hideEmpty` (exact strings).
- Tooltip text only on these 5 headers — Коэф-т, Цель, Факт. доля, Соответствие, Доход — verbatim text given in Task 4.
- Per project CLAUDE.md: for UI changes, start the dev server and manually exercise the feature in a browser before declaring done (Task 6).

---

### Task 1: `filterPositions` pure helper

**Files:**
- Create: `webapp/src/portfolio/filterPositions.ts`
- Test: `webapp/src/portfolio/filterPositions.test.ts`

**Interfaces:**
- Consumes: `CalculatedPosition` from `webapp/src/types.ts` (fields used: `ticker: string`, `shortName: string`, `sharesOwned: number`).
- Produces: `filterPositions(positions: CalculatedPosition[], search: string, hideEmpty: boolean): CalculatedPosition[]` — used by Task 3.

- [ ] **Step 1: Write the failing test**

Create `webapp/src/portfolio/filterPositions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filterPositions } from "./filterPositions";
import { CalculatedPosition } from "../types";

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
    ...overrides,
  };
}

describe("filterPositions", () => {
  const positions = [
    makePosition({ ticker: "SBER", shortName: "Сбербанк", sharesOwned: 10 }),
    makePosition({ ticker: "GAZP", shortName: "Газпром", sharesOwned: 0 }),
    makePosition({ ticker: "LKOH", shortName: "Лукойл", sharesOwned: 5 }),
  ];

  it("returns all positions when search is empty and hideEmpty is false", () => {
    expect(filterPositions(positions, "", false)).toHaveLength(3);
  });

  it("filters by ticker substring, case-insensitive", () => {
    const result = filterPositions(positions, "sber", false);
    expect(result.map((p) => p.ticker)).toEqual(["SBER"]);
  });

  it("filters by shortName substring, case-insensitive", () => {
    const result = filterPositions(positions, "газпром", false);
    expect(result.map((p) => p.ticker)).toEqual(["GAZP"]);
  });

  it("hides positions with sharesOwned === 0 when hideEmpty is true", () => {
    const result = filterPositions(positions, "", true);
    expect(result.map((p) => p.ticker)).toEqual(["SBER", "LKOH"]);
  });

  it("combines search and hideEmpty with AND semantics", () => {
    const result = filterPositions(positions, "GAZP", true);
    expect(result).toHaveLength(0);
  });

  it("treats whitespace-only search as empty", () => {
    expect(filterPositions(positions, "   ", false)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/portfolio/filterPositions.test.ts`
Expected: FAIL — `Cannot find module './filterPositions'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `webapp/src/portfolio/filterPositions.ts`:

```ts
import { CalculatedPosition } from "../types";

export function filterPositions(
  positions: CalculatedPosition[],
  search: string,
  hideEmpty: boolean
): CalculatedPosition[] {
  const query = search.trim().toLowerCase();
  return positions.filter((p) => {
    if (hideEmpty && p.sharesOwned === 0) return false;
    if (query === "") return true;
    return (
      p.ticker.toLowerCase().includes(query) ||
      p.shortName.toLowerCase().includes(query)
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/portfolio/filterPositions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/portfolio/filterPositions.ts webapp/src/portfolio/filterPositions.test.ts
git commit -m "feat: add filterPositions helper for table search/hide-empty"
```

---

### Task 2: `tablePrefs` localStorage helpers

**Files:**
- Create: `webapp/src/portfolio/tablePrefs.ts`
- Test: `webapp/src/portfolio/tablePrefs.test.ts`

**Interfaces:**
- Consumes: browser `localStorage` global (available in jsdom test environment per `vite.config.ts` `test.environment: "jsdom"`).
- Produces: `loadSearchPref(): string`, `saveSearchPref(value: string): void`, `loadHideEmptyPref(): boolean`, `saveHideEmptyPref(value: boolean): void` — used by Task 3.

- [ ] **Step 1: Write the failing test**

Create `webapp/src/portfolio/tablePrefs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSearchPref,
  saveSearchPref,
  loadHideEmptyPref,
  saveHideEmptyPref,
} from "./tablePrefs";

beforeEach(() => {
  localStorage.clear();
});

describe("search pref", () => {
  it("defaults to empty string when nothing stored", () => {
    expect(loadSearchPref()).toBe("");
  });

  it("round-trips a saved value", () => {
    saveSearchPref("sber");
    expect(loadSearchPref()).toBe("sber");
  });
});

describe("hideEmpty pref", () => {
  it("defaults to false when nothing stored", () => {
    expect(loadHideEmptyPref()).toBe(false);
  });

  it("round-trips true", () => {
    saveHideEmptyPref(true);
    expect(loadHideEmptyPref()).toBe(true);
  });

  it("round-trips false after being true", () => {
    saveHideEmptyPref(true);
    saveHideEmptyPref(false);
    expect(loadHideEmptyPref()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/portfolio/tablePrefs.test.ts`
Expected: FAIL — `Cannot find module './tablePrefs'`.

- [ ] **Step 3: Write minimal implementation**

Create `webapp/src/portfolio/tablePrefs.ts`:

```ts
const SEARCH_KEY = "portfolio.search";
const HIDE_EMPTY_KEY = "portfolio.hideEmpty";

export function loadSearchPref(): string {
  return localStorage.getItem(SEARCH_KEY) ?? "";
}

export function saveSearchPref(value: string): void {
  localStorage.setItem(SEARCH_KEY, value);
}

export function loadHideEmptyPref(): boolean {
  return localStorage.getItem(HIDE_EMPTY_KEY) === "true";
}

export function saveHideEmptyPref(value: boolean): void {
  localStorage.setItem(HIDE_EMPTY_KEY, String(value));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/portfolio/tablePrefs.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/portfolio/tablePrefs.ts webapp/src/portfolio/tablePrefs.test.ts
git commit -m "feat: add localStorage helpers for table search/hide-empty prefs"
```

---

### Task 3: Wire filters + controls row into `PortfolioTab`

**Files:**
- Modify: `webapp/src/components/PortfolioTab.tsx`

**Interfaces:**
- Consumes: `filterPositions` from `../portfolio/filterPositions` (Task 1); `loadSearchPref`, `saveSearchPref`, `loadHideEmptyPref`, `saveHideEmptyPref` from `../portfolio/tablePrefs` (Task 2).
- Produces: no new exports — `PositionsTable` now receives `filteredPositions` instead of `calculated` as its `positions` prop (prop name on `PositionsTable` itself is unchanged, only which array is passed).

This task has no isolated unit test (it's a component wiring change with no existing component-test infra in this repo — see Global Constraints on manual browser verification, done in Task 6). Verify via typecheck + build after editing.

- [ ] **Step 1: Add imports**

In `webapp/src/components/PortfolioTab.tsx`, replace the import block at the top:

```ts
import { useMemo, useEffect, useRef, useState } from "react";
import { usePortfolio } from "../portfolio/PortfolioContext";
import { useErrors } from "../errors/ErrorContext";
import { runMarketUpdate } from "../portfolio/runMarketUpdate";
import { buildCalculatedPositions } from "../domain/buildCalculatedPositions";
import { createSectorResolver } from "../domain/sectors";
import { SECTORS_DEFAULT } from "../data/sectorsDefault";
import { PositionsTable } from "./PositionsTable";
```

with:

```ts
import { useMemo, useEffect, useRef, useState } from "react";
import { usePortfolio } from "../portfolio/PortfolioContext";
import { useErrors } from "../errors/ErrorContext";
import { runMarketUpdate } from "../portfolio/runMarketUpdate";
import { buildCalculatedPositions } from "../domain/buildCalculatedPositions";
import { createSectorResolver } from "../domain/sectors";
import { SECTORS_DEFAULT } from "../data/sectorsDefault";
import { filterPositions } from "../portfolio/filterPositions";
import {
  loadSearchPref,
  saveSearchPref,
  loadHideEmptyPref,
  saveHideEmptyPref,
} from "../portfolio/tablePrefs";
import { PositionsTable } from "./PositionsTable";
```

- [ ] **Step 2: Add search/hideEmpty state with localStorage sync**

Directly below the existing `const lastAutoSignal = useRef(0);` line, add:

```ts
  const [search, setSearch] = useState(() => loadSearchPref());
  const [hideEmpty, setHideEmpty] = useState(() => loadHideEmptyPref());

  useEffect(() => {
    saveSearchPref(search);
  }, [search]);

  useEffect(() => {
    saveHideEmptyPref(hideEmpty);
  }, [hideEmpty]);
```

- [ ] **Step 3: Add `filteredPositions` memo below the existing `calculated` memo**

The existing `calculated` `useMemo` block stays unchanged. Immediately after its closing `}, [file, liveByTicker]);`, add:

```ts
  const filteredPositions = useMemo(
    () => filterPositions(calculated, search, hideEmpty),
    [calculated, search, hideEmpty]
  );
```

- [ ] **Step 4: Add the controls row and pass `filteredPositions` to the table**

Replace:

```tsx
      <PositionsTable
        positions={calculated}
        onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
        onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
      />
```

with:

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
      <PositionsTable
        positions={filteredPositions}
        onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
        onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
      />
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` (cwd `webapp/`)
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/components/PortfolioTab.tsx
git commit -m "feat: wire search/hide-empty filters into portfolio table"
```

---

### Task 4: Header tooltips in `PositionsTable`

**Files:**
- Modify: `webapp/src/components/PositionsTable.tsx`

**Interfaces:**
- Consumes: nothing new (no prop/type changes).
- Produces: nothing new — purely internal JSX markup change.

- [ ] **Step 1: Add a small header-with-tooltip helper and use it for the 5 computed columns**

Replace the `<thead>` block:

```tsx
      <thead>
        <tr>
          <th>Тикер</th>
          <th>Название</th>
          <th>Вес в индексе</th>
          <th>Цена</th>
          <th>Лотность</th>
          <th>Сектор</th>
          <th>Дивиденд</th>
          <th>Статус</th>
          <th>Коэф-т</th>
          <th>Куплено</th>
          <th>Цель</th>
          <th>Факт. доля</th>
          <th>Соответствие</th>
          <th>Стоимость</th>
          <th>Доход</th>
        </tr>
      </thead>
```

with:

```tsx
      <thead>
        <tr>
          <th>Тикер</th>
          <th>Название</th>
          <th>Вес в индексе</th>
          <th>Цена</th>
          <th>Лотность</th>
          <th>Сектор</th>
          <th>Дивиденд</th>
          <th>Статус</th>
          <th>{headerWithHint("Коэф-т", "Множитель к весу в индексе при расчёте целевой доли")}</th>
          <th>Куплено</th>
          <th>{headerWithHint("Цель", "Целевая доля = вес в индексе × коэффициент")}</th>
          <th>{headerWithHint("Факт. доля", "Текущая доля позиции в стоимости портфеля, %")}</th>
          <th>{headerWithHint("Соответствие", "Факт. доля ÷ Цель (1.0 = точное совпадение)")}</th>
          <th>Стоимость</th>
          <th>{headerWithHint("Доход", "Дивиденд на акцию × количество акций")}</th>
        </tr>
      </thead>
```

- [ ] **Step 2: Add the `headerWithHint` helper above the `PositionsTable` component**

Insert directly after the existing `formatNumber` function and before `export function PositionsTable`:

```tsx
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
```

Note: this requires `<>...</>` (React Fragment) support, already implicit via the existing JSX/TSX setup — no new import needed since `PositionsTable.tsx` is already a `.tsx` file using JSX.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` (cwd `webapp/`)
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add webapp/src/components/PositionsTable.tsx
git commit -m "feat: add hover tooltips to computed table headers"
```

---

### Task 5: CSS for controls row and tooltip

**Files:**
- Modify: `webapp/src/styles.css`

**Interfaces:**
- Consumes: `.controls-row` class used in `PortfolioTab.tsx` (Task 3); `.th-hint` / `data-tooltip` used in `PositionsTable.tsx` (Task 4).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Append controls-row and tooltip rules to the end of `webapp/src/styles.css`**

Append after the existing `.modal__actions` rule (end of file):

```css

.controls-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.controls-row input[type="text"] {
  padding: 4px 8px;
  min-width: 240px;
}

.controls-row label {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.positions-table th {
  position: relative;
}

.th-hint {
  display: inline-block;
  margin-left: 4px;
  width: 14px;
  height: 14px;
  line-height: 14px;
  text-align: center;
  border-radius: 50%;
  border: 1px solid #999;
  font-size: 10px;
  font-weight: normal;
  color: #666;
  cursor: help;
}

.th-hint[data-tooltip]:hover::after,
.th-hint[data-tooltip]:focus::after {
  content: attr(data-tooltip);
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  margin-top: 4px;
  padding: 6px 10px;
  background: #333;
  color: #fff;
  font-size: 12px;
  font-weight: normal;
  white-space: normal;
  width: 220px;
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}
```

- [ ] **Step 2: Visually spot-check the CSS is syntactically valid**

Run: `npm run build` (cwd `webapp/`) — Vite/esbuild will fail the build on malformed CSS.
Expected: build succeeds (this also typechecks both tsconfig projects per the `npm run build` script).

- [ ] **Step 3: Commit**

```bash
git add webapp/src/styles.css
git commit -m "style: add controls row and header tooltip styles"
```

---

### Task 6: Full verification pass

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test` (cwd `webapp/`)
Expected: all tests pass, including the new `filterPositions.test.ts` and `tablePrefs.test.ts`.

- [ ] **Step 2: Run lint**

Run: `npm run lint` (cwd `webapp/`)
Expected: no errors.

- [ ] **Step 3: Run build**

Run: `npm run build` (cwd `webapp/`)
Expected: typecheck (both tsconfig projects) + `vite build` succeed.

- [ ] **Step 4: Manual browser verification**

Run: `npm run dev` (cwd `webapp/`), open the app at `http://127.0.0.1:<port>` (per `vite.config.ts`, dev server binds to `127.0.0.1` — do not try `localhost` or `::1` if it fails to load).

Check, on the Portfolio tab:
- Typing in the search box filters rows by ticker and by name (Cyrillic input included).
- Clearing the search box restores all rows.
- Checking "Скрывать пустые позиции" hides rows where the "Куплено" input is 0; unchecking restores them.
- "Общая стоимость" / "Среднее соответствие" in the summary line do NOT change when search/hide-empty filters are applied (they reflect the full unfiltered portfolio).
- Reloading the page preserves the search text and checkbox state (localStorage persistence).
- Hovering (and tab-focusing, for keyboard a11y) the `?` markers next to Коэф-т, Цель, Факт. доля, Соответствие, Доход shows the tooltip text; other headers have no `?` marker.

Stop the dev server after verification.

- [ ] **Step 5: Commit (only if Step 4 required fixes)**

If manual verification surfaced no issues, no commit needed for this task. If fixes were required, commit them with an appropriate message describing the fix.

---

## Self-Review Notes

- Spec coverage: §1 search → Task 1 + 3; §2 hide-empty checkbox → Task 1 + 3; §3 AND combination + summary untouched → Task 1 (AND logic) + Task 3 Step 4 (summary line unchanged, not touched) + Task 6 Step 4 (manual check); §4 localStorage persistence → Task 2 + 3; §5 tooltips → Task 4 + 5; §6 files touched → matches Tasks 3/4/5 exactly (`PortfolioTab.tsx`, `PositionsTable.tsx`, `styles.css`), plus two new small helper files in `webapp/src/portfolio/` which keeps `domain/` untouched as the spec requires.
- No placeholders: every step has complete code, no TBD/TODO.
- Type consistency: `filterPositions(positions: CalculatedPosition[], search: string, hideEmpty: boolean): CalculatedPosition[]` is identical across Task 1's implementation and Task 3's usage. `loadSearchPref`/`saveSearchPref`/`loadHideEmptyPref`/`saveHideEmptyPref` names and signatures match between Task 2 and Task 3.
