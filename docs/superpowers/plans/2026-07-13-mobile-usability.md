# Mobile Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the desktop-only React portfolio tracker to full functional parity on phone-width screens (≤600px), without a separate mobile client.

**Architecture:** One CSS breakpoint (`@media (max-width: 600px)`) layered on the existing `styles.css`, plus a small `useIsMobile()` hook (matchMedia-backed) that lets components pick between two mutually-exclusive render paths where CSS alone can't do the job (positions table → card list, chart tick/legend font size). Everything else is CSS-only.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Vitest, `@testing-library/react` + `@testing-library/jest-dom` (added in this plan — repo currently has zero component-render tests), recharts.

## Global Constraints

- Single breakpoint: `@media (max-width: 600px)`. Above it, desktop layout is pixel-identical to today — no regressions.
- No separate mobile client/route — same components, mobile-first CSS additions to the existing `webapp/src/styles.css`.
- Tablets in portrait (≥600px) keep the current desktop layout, including horizontal table scroll.
- All npm commands run with cwd `webapp/`.
- `tsconfig.json` has `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules: true` — keep new code compliant.
- Editable fields (Коэф-т, Куплено) must keep calling the exact same `onChangeCoefficient`/`onChangeSharesOwned` callbacks already used by `PositionsTable` — only their visual container changes.
- The positions table and the new card list must never both be in the DOM at the same time (JS-level conditional render, not CSS `display:none`).

---

### Task 1: Shared `formatNumber` + `buildExpandedFields` (extract from `PositionsTable`)

**Files:**
- Create: `webapp/src/components/formatPosition.ts`
- Create: `webapp/src/components/formatPosition.test.ts`
- Modify: `webapp/src/components/PositionsTable.tsx:1-6, 62-90` (import shared `formatNumber`, delete local copy)

**Interfaces:**
- Produces: `formatNumber(value: number | null, digits?: number): string`, `buildExpandedFields(p: CalculatedPosition): ExpandedField[]` where `ExpandedField = { kind: "text"; key: string; label: string; value: string } | { kind: "coefficient" } | { kind: "sharesOwned" }`. Task 3 (`PositionCard`) consumes both.

This is pulled out first because both the existing table and the new mobile card need identical number formatting and the same ordered list of "expanded" fields (Вес в индексе, Лотность, Дивиденд, Див доходность, Коэф-т, Куплено, Акций купить, Купить на сумму, Цель, Факт. доля, Стоимость, Доход, Сектор).

- [ ] **Step 1: Write the failing test**

Create `webapp/src/components/formatPosition.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatNumber, buildExpandedFields } from "./formatPosition";
import { CalculatedPosition } from "../types";

function position(overrides: Partial<CalculatedPosition> = {}): CalculatedPosition {
  return {
    ticker: "GAZP",
    coefficient: 1.5,
    sharesOwned: 10,
    shortName: "Газпром",
    indexWeight: 12.3456,
    price: 150.5,
    lotSize: 10,
    dividendPerShare: 5.2,
    status: "in_index",
    sector: "Энергетика",
    targetAllocation: 18.5,
    actualShare: 20.1,
    compliance: 1.09,
    positionValue: 1505,
    income: 52,
    dividendYield: 3.45,
    sharesToBuy: 5,
    buyAmountRub: 752.5,
    ...overrides,
  };
}

describe("formatNumber", () => {
  it("returns an em dash for null", () => {
    expect(formatNumber(null)).toBe("—");
  });

  it("formats with 2 digits by default", () => {
    expect(formatNumber(12.345)).toBe("12.35");
  });

  it("formats with a custom digit count", () => {
    expect(formatNumber(12.6, 0)).toBe("13");
  });
});

describe("buildExpandedFields", () => {
  it("returns the 13 fields in spec order, with coefficient/sharesOwned as input markers", () => {
    const fields = buildExpandedFields(position());

    expect(fields).toEqual([
      { kind: "text", key: "indexWeight", label: "Вес в индексе, %", value: "12.35" },
      { kind: "text", key: "lotSize", label: "Лотность", value: "10" },
      { kind: "text", key: "dividendPerShare", label: "Дивиденд", value: "5.20" },
      { kind: "text", key: "dividendYield", label: "Див доходность, %", value: "3.45" },
      { kind: "coefficient" },
      { kind: "sharesOwned" },
      { kind: "text", key: "sharesToBuy", label: "Акций купить", value: "5" },
      { kind: "text", key: "buyAmountRub", label: "Купить на сумму", value: "752.50" },
      { kind: "text", key: "targetAllocation", label: "Цель", value: "18.50" },
      { kind: "text", key: "actualShare", label: "Факт. доля", value: "20.10" },
      { kind: "text", key: "positionValue", label: "Стоимость", value: "1505.00" },
      { kind: "text", key: "income", label: "Доход", value: "52.00" },
      { kind: "text", key: "sector", label: "Сектор", value: "Энергетика" },
    ]);
  });

  it("shows an em dash for a null lotSize instead of the string 'null'", () => {
    const fields = buildExpandedFields(position({ lotSize: null }));
    expect(fields[1]).toEqual({ kind: "text", key: "lotSize", label: "Лотность", value: "—" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/formatPosition.test.ts`
Expected: FAIL — `Cannot find module './formatPosition'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/components/formatPosition.ts`:

```ts
import { CalculatedPosition } from "../types";

export function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

export type ExpandedField =
  | { kind: "text"; key: string; label: string; value: string }
  | { kind: "coefficient" }
  | { kind: "sharesOwned" };

export function buildExpandedFields(p: CalculatedPosition): ExpandedField[] {
  return [
    { kind: "text", key: "indexWeight", label: "Вес в индексе, %", value: formatNumber(p.indexWeight) },
    { kind: "text", key: "lotSize", label: "Лотность", value: p.lotSize === null ? "—" : String(p.lotSize) },
    { kind: "text", key: "dividendPerShare", label: "Дивиденд", value: formatNumber(p.dividendPerShare) },
    { kind: "text", key: "dividendYield", label: "Див доходность, %", value: formatNumber(p.dividendYield) },
    { kind: "coefficient" },
    { kind: "sharesOwned" },
    { kind: "text", key: "sharesToBuy", label: "Акций купить", value: formatNumber(p.sharesToBuy, 0) },
    { kind: "text", key: "buyAmountRub", label: "Купить на сумму", value: formatNumber(p.buyAmountRub) },
    { kind: "text", key: "targetAllocation", label: "Цель", value: formatNumber(p.targetAllocation) },
    { kind: "text", key: "actualShare", label: "Факт. доля", value: formatNumber(p.actualShare) },
    { kind: "text", key: "positionValue", label: "Стоимость", value: formatNumber(p.positionValue) },
    { kind: "text", key: "income", label: "Доход", value: formatNumber(p.income) },
    { kind: "text", key: "sector", label: "Сектор", value: p.sector },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/formatPosition.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Refactor `PositionsTable` to use the shared `formatNumber`**

In `webapp/src/components/PositionsTable.tsx`, replace:

```ts
import { CalculatedPosition } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}
```

with:

```ts
import { CalculatedPosition } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";
import { formatNumber } from "./formatPosition";
```

No other lines in `PositionsTable.tsx` change — every existing `formatNumber(...)` call site keeps working against the imported function.

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `npm run test`
Expected: all suites PASS, no failures

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add webapp/src/components/formatPosition.ts webapp/src/components/formatPosition.test.ts webapp/src/components/PositionsTable.tsx
git commit -m "refactor: extract shared formatNumber/buildExpandedFields for mobile cards"
```

---

### Task 2: `useIsMobile` hook + test-rendering infrastructure

**Files:**
- Create: `webapp/src/portfolio/useIsMobile.ts`
- Create: `webapp/src/portfolio/useIsMobile.test.ts`
- Create: `webapp/src/setupTests.ts`
- Modify: `webapp/vite.config.ts:11-15` (add `setupFiles`)
- Modify: `webapp/package.json` (new devDependencies, via `npm install`)

**Interfaces:**
- Produces: `useIsMobile(): boolean`, `MOBILE_MEDIA_QUERY = "(max-width: 600px)"`. Consumed by Task 4 (`PortfolioTab`), Task 5 (`Header` — not needed, CSS-only), Task 7 (charts).

The repo has no component-render tests yet (confirmed: no `@testing-library/*` dependency, no `*.test.tsx` under `src/components/`). This task adds that infrastructure since Task 3 onward needs `render`/`renderHook`.

- [ ] **Step 1: Install test-rendering dependencies**

Run (from `webapp/`): `npm install -D @testing-library/react @testing-library/jest-dom`
Expected: `webapp/package.json` gains `@testing-library/react` and `@testing-library/jest-dom` under `devDependencies`; `package-lock.json` updates.

- [ ] **Step 2: Wire up the Vitest setup file**

Create `webapp/src/setupTests.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

In `webapp/vite.config.ts`, change:

```ts
  test: {
    environment: "jsdom",
    globals: true,
    passWithNoTests: true,
  },
```

to:

```ts
  test: {
    environment: "jsdom",
    globals: true,
    passWithNoTests: true,
    setupFiles: ["./src/setupTests.ts"],
  },
```

- [ ] **Step 3: Write the failing test for `useIsMobile`**

Create `webapp/src/portfolio/useIsMobile.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile, MOBILE_MEDIA_QUERY } from "./useIsMobile";

function mockMatchMedia(initialMatches: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: initialMatches,
    media: MOBILE_MEDIA_QUERY,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return {
    setMatches(next: boolean) {
      mql.matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

describe("useIsMobile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when the viewport does not match the mobile query", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when the viewport matches the mobile query", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("updates when the media query match state changes", () => {
    const control = mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => control.setMatches(true));
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/portfolio/useIsMobile.test.ts`
Expected: FAIL — `Cannot find module './useIsMobile'`

- [ ] **Step 5: Write the implementation**

Create `webapp/src/portfolio/useIsMobile.ts`:

```ts
import { useEffect, useState } from "react";

export const MOBILE_MEDIA_QUERY = "(max-width: 600px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_MEDIA_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleChange = () => setIsMobile(mql.matches);
    handleChange();
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/portfolio/useIsMobile.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Run the full suite**

Run: `npm run test`
Expected: all suites PASS

- [ ] **Step 8: Commit**

```bash
git add webapp/package.json webapp/package-lock.json webapp/vite.config.ts webapp/src/setupTests.ts webapp/src/portfolio/useIsMobile.ts webapp/src/portfolio/useIsMobile.test.ts
git commit -m "feat: add useIsMobile hook and testing-library infrastructure"
```

---

### Task 3: `PositionCard` component (collapsed summary + tap-to-expand fields)

**Files:**
- Create: `webapp/src/components/PositionCard.tsx`
- Create: `webapp/src/components/PositionCard.test.tsx`
- Modify: `webapp/src/styles.css` (append `Position card (mobile)` section)

**Interfaces:**
- Consumes: `buildExpandedFields`, `formatNumber` from `./formatPosition` (Task 1); `ComplianceGauge` (existing).
- Produces: `PositionCard({ position: CalculatedPosition; onChangeCoefficient: (ticker: string, value: number) => void; onChangeSharesOwned: (ticker: string, value: number) => void }): JSX.Element`. Consumed by Task 4 (`PositionsCardList`).

Collapsed view shows status dot, ticker, short name, price, `ComplianceGauge`. Tapping the card toggles the expanded `label: value` list (Коэф-т/Куплено stay `<input type="number">`, wired to the same callbacks the table uses).

- [ ] **Step 1: Write the failing test**

Create `webapp/src/components/PositionCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PositionCard } from "./PositionCard";
import { CalculatedPosition } from "../types";

const position: CalculatedPosition = {
  ticker: "GAZP",
  coefficient: 1.5,
  sharesOwned: 10,
  shortName: "Газпром",
  indexWeight: 12.3456,
  price: 150.5,
  lotSize: 10,
  dividendPerShare: 5.2,
  status: "in_index",
  sector: "Энергетика",
  targetAllocation: 18.5,
  actualShare: 20.1,
  compliance: 1.09,
  positionValue: 1505,
  income: 52,
  dividendYield: 3.45,
  sharesToBuy: 5,
  buyAmountRub: 752.5,
};

describe("PositionCard", () => {
  it("shows ticker, short name, price and compliance while collapsed, and hides expanded fields", () => {
    render(
      <PositionCard position={position} onChangeCoefficient={vi.fn()} onChangeSharesOwned={vi.fn()} />
    );

    expect(screen.getByText("GAZP")).toBeInTheDocument();
    expect(screen.getByText("Газпром")).toBeInTheDocument();
    expect(screen.getByText("150.50")).toBeInTheDocument();
    expect(screen.getByText("1.09")).toBeInTheDocument();
    expect(screen.queryByText("Сектор")).not.toBeInTheDocument();
  });

  it("reveals the expanded fields on tap, and hides them again on a second tap", () => {
    render(
      <PositionCard position={position} onChangeCoefficient={vi.fn()} onChangeSharesOwned={vi.fn()} />
    );

    const summary = screen.getByRole("button");
    fireEvent.click(summary);
    expect(screen.getByText("Сектор")).toBeInTheDocument();
    expect(screen.getByText("Энергетика")).toBeInTheDocument();
    expect(screen.getByText("Стоимость")).toBeInTheDocument();
    expect(screen.getByText("1505.00")).toBeInTheDocument();

    fireEvent.click(summary);
    expect(screen.queryByText("Сектор")).not.toBeInTheDocument();
  });

  it("calls onChangeCoefficient and onChangeSharesOwned from the expanded inputs", () => {
    const onChangeCoefficient = vi.fn();
    const onChangeSharesOwned = vi.fn();
    render(
      <PositionCard
        position={position}
        onChangeCoefficient={onChangeCoefficient}
        onChangeSharesOwned={onChangeSharesOwned}
      />
    );

    fireEvent.click(screen.getByRole("button"));
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(2);

    fireEvent.change(inputs[0], { target: { value: "2" } });
    expect(onChangeCoefficient).toHaveBeenCalledWith("GAZP", 2);

    fireEvent.change(inputs[1], { target: { value: "12" } });
    expect(onChangeSharesOwned).toHaveBeenCalledWith("GAZP", 12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PositionCard.test.tsx`
Expected: FAIL — `Cannot find module './PositionCard'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/components/PositionCard.tsx`:

```tsx
import { useState } from "react";
import { CalculatedPosition } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";
import { buildExpandedFields, formatNumber } from "./formatPosition";

export function PositionCard({
  position,
  onChangeCoefficient,
  onChangeSharesOwned,
}: {
  position: CalculatedPosition;
  onChangeCoefficient: (ticker: string, value: number) => void;
  onChangeSharesOwned: (ticker: string, value: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fields = buildExpandedFields(position);

  return (
    <div className="position-card">
      <button
        type="button"
        className="position-card__summary"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className={`status-dot${position.status === "in_index" ? " status-dot--in" : ""}`} />
        <span className="position-card__ticker">{position.ticker}</span>
        <span className="position-card__name">{position.shortName}</span>
        <span className="position-card__price">{formatNumber(position.price)}</span>
        <ComplianceGauge value={position.compliance} />
      </button>
      {expanded && (
        <div className="position-card__details">
          {fields.map((field) => {
            if (field.kind === "coefficient") {
              return (
                <div className="position-card__row" key="coefficient">
                  <span className="position-card__label">Коэф-т</span>
                  <input
                    type="number"
                    step="0.01"
                    value={position.coefficient}
                    onChange={(e) => onChangeCoefficient(position.ticker, Number(e.target.value))}
                  />
                </div>
              );
            }
            if (field.kind === "sharesOwned") {
              return (
                <div className="position-card__row" key="sharesOwned">
                  <span className="position-card__label">Куплено</span>
                  <input
                    type="number"
                    step="1"
                    value={position.sharesOwned}
                    onChange={(e) => onChangeSharesOwned(position.ticker, Number(e.target.value))}
                  />
                </div>
              );
            }
            return (
              <div className="position-card__row" key={field.key}>
                <span className="position-card__label">{field.label}</span>
                <span className="position-card__value">{field.value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PositionCard.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the card styles**

Append to `webapp/src/styles.css`:

```css
/* Position card (mobile) */

.position-card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.position-card {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel-alt);
}

.position-card__summary {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  text-align: left;
}

.position-card__ticker {
  font-family: var(--font-mono);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.position-card__name {
  flex: 1;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.position-card__price {
  font-family: var(--font-mono);
}

.position-card__details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 12px 12px;
}

.position-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.85rem;
}

.position-card__label {
  color: var(--muted);
}

.position-card__row input[type="number"] {
  min-height: 44px;
  min-width: 90px;
  font-size: 16px;
  text-align: right;
}
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add webapp/src/components/PositionCard.tsx webapp/src/components/PositionCard.test.tsx webapp/src/styles.css
git commit -m "feat: add PositionCard for the mobile positions view"
```

---

### Task 4: `PositionsCardList` + wire the table/card switch into `PortfolioTab`

**Files:**
- Create: `webapp/src/components/PositionsCardList.tsx`
- Create: `webapp/src/components/PositionsCardList.test.tsx`
- Modify: `webapp/src/components/PortfolioTab.tsx:1-17, 138-142`
- Create: `webapp/src/components/PortfolioTab.test.tsx`

**Interfaces:**
- Consumes: `PositionCard` (Task 3), `useIsMobile` (Task 2).
- Produces: `PositionsCardList({ positions, onChangeCoefficient, onChangeSharesOwned }): JSX.Element`, rendered by `PortfolioTab` instead of `PositionsTable` when `useIsMobile()` is `true`.

- [ ] **Step 1: Write the failing test for `PositionsCardList`**

Create `webapp/src/components/PositionsCardList.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PositionsCardList } from "./PositionsCardList";
import { CalculatedPosition } from "../types";

function makePosition(overrides: Partial<CalculatedPosition> & { ticker: string }): CalculatedPosition {
  return {
    coefficient: 1,
    sharesOwned: 0,
    shortName: overrides.ticker,
    indexWeight: 0,
    price: null,
    lotSize: null,
    dividendPerShare: 0,
    status: "in_index",
    sector: "—",
    targetAllocation: null,
    actualShare: null,
    compliance: null,
    positionValue: 0,
    income: 0,
    dividendYield: null,
    sharesToBuy: null,
    buyAmountRub: null,
    ...overrides,
  };
}

describe("PositionsCardList", () => {
  it("renders one PositionCard per position", () => {
    const positions = [makePosition({ ticker: "GAZP" }), makePosition({ ticker: "SBER" })];
    render(
      <PositionsCardList positions={positions} onChangeCoefficient={vi.fn()} onChangeSharesOwned={vi.fn()} />
    );

    expect(screen.getByText("GAZP")).toBeInTheDocument();
    expect(screen.getByText("SBER")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PositionsCardList.test.tsx`
Expected: FAIL — `Cannot find module './PositionsCardList'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/components/PositionsCardList.tsx`:

```tsx
import { CalculatedPosition } from "../types";
import { PositionCard } from "./PositionCard";

export function PositionsCardList({
  positions,
  onChangeCoefficient,
  onChangeSharesOwned,
}: {
  positions: CalculatedPosition[];
  onChangeCoefficient: (ticker: string, value: number) => void;
  onChangeSharesOwned: (ticker: string, value: number) => void;
}) {
  return (
    <div className="position-card-list">
      {positions.map((p) => (
        <PositionCard
          key={p.ticker}
          position={p}
          onChangeCoefficient={onChangeCoefficient}
          onChangeSharesOwned={onChangeSharesOwned}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PositionsCardList.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Write the failing test for the `PortfolioTab` switch**

Create `webapp/src/components/PortfolioTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { useEffect } from "react";
import { render } from "@testing-library/react";
import { ErrorProvider } from "../errors/ErrorContext";
import { PortfolioProvider } from "../portfolio/PortfolioContext";
import { usePortfolio } from "../portfolio/usePortfolio";
import { useIsMobile } from "../portfolio/useIsMobile";
import { PortfolioTab } from "./PortfolioTab";
import { PortfolioFile } from "../types";

vi.mock("../portfolio/useIsMobile", () => ({ useIsMobile: vi.fn() }));

const sampleFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 5 }],
  sectors: {},
  history: [],
  pairs: [],
};

function Harness() {
  const { setFile } = usePortfolio();
  useEffect(() => {
    setFile(sampleFile);
  }, [setFile]);
  return <PortfolioTab autoUpdateSignal={0} />;
}

function renderPortfolioTab() {
  return render(
    <ErrorProvider>
      <PortfolioProvider>
        <Harness />
      </PortfolioProvider>
    </ErrorProvider>
  );
}

describe("PortfolioTab mobile switch", () => {
  it("renders the positions table when useIsMobile is false", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    const { container } = renderPortfolioTab();
    expect(container.querySelector(".positions-table")).not.toBeNull();
    expect(container.querySelector(".position-card-list")).toBeNull();
  });

  it("renders the position card list when useIsMobile is true", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const { container } = renderPortfolioTab();
    expect(container.querySelector(".position-card-list")).not.toBeNull();
    expect(container.querySelector(".positions-table")).toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/components/PortfolioTab.test.tsx`
Expected: FAIL — both `.positions-table` and `.position-card-list` are unconditionally absent/present the same way regardless of the mock (since `PortfolioTab` doesn't call `useIsMobile` yet)

- [ ] **Step 7: Wire the switch into `PortfolioTab`**

In `webapp/src/components/PortfolioTab.tsx`, add the import (near the other component imports):

```ts
import { PositionsTable } from "./PositionsTable";
import { PositionsCardList } from "./PositionsCardList";
import { AddTickerModal } from "./AddTickerModal";
import { PairPositionsModal } from "./PairPositionsModal";
import { PortfolioFile } from "../types";
import { useIsMobile } from "../portfolio/useIsMobile";
```

Add the hook call right after the existing `usePortfolio()`/`useErrors()` calls:

```ts
  const { addError, clearBySource } = useErrors();
  const isMobile = useIsMobile();
```

Replace the single `<PositionsTable ... />` render (lines 138-142) with:

```tsx
      {isMobile ? (
        <PositionsCardList
          positions={filteredPositions}
          onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
          onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
        />
      ) : (
        <PositionsTable
          positions={filteredPositions}
          onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
          onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
        />
      )}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/components/PortfolioTab.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add webapp/src/components/PositionsCardList.tsx webapp/src/components/PositionsCardList.test.tsx webapp/src/components/PortfolioTab.tsx webapp/src/components/PortfolioTab.test.tsx
git commit -m "feat: switch between PositionsTable and PositionsCardList below 600px"
```

---

### Task 5: Header mobile menu (`⋮` dropdown)

**Files:**
- Modify: `webapp/src/components/Header.tsx:1, 21-33, 118-159`
- Create: `webapp/src/components/Header.test.tsx`
- Modify: `webapp/src/styles.css` (append `Header (mobile)` section)

**Interfaces:**
- No new props/exports — `Header`'s public signature (`{ onFileLoaded: () => void }`) is unchanged. `handleLoadClick`/`handleSaveClick`/`handleStartEmpty` keep their exact bodies; only their JSX container changes.

Below 600px: brand `select` stays visible, the "Портфель-трекер" text is hidden (spec explicitly allows dropping to "just the icon/brand"), and a new `⋮` button toggles the existing three action buttons in a dropdown.

- [ ] **Step 1: Write the failing test**

Create `webapp/src/components/Header.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorProvider } from "../errors/ErrorContext";
import { PortfolioProvider } from "../portfolio/PortfolioContext";
import { Header } from "./Header";

function renderHeader() {
  return render(
    <ErrorProvider>
      <PortfolioProvider>
        <Header onFileLoaded={vi.fn()} />
      </PortfolioProvider>
    </ErrorProvider>
  );
}

describe("Header mobile menu", () => {
  it("keeps the actions dropdown closed by default", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Меню" })).toBeInTheDocument();
    expect(document.querySelector(".header__actions--open")).toBeNull();
  });

  it("opens the actions dropdown on tap, and closes it again on a second tap", () => {
    renderHeader();
    const menuButton = screen.getByRole("button", { name: "Меню" });

    fireEvent.click(menuButton);
    expect(document.querySelector(".header__actions--open")).not.toBeNull();

    fireEvent.click(menuButton);
    expect(document.querySelector(".header__actions--open")).toBeNull();
  });

  it("closes the dropdown after tapping an action", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    fireEvent.click(screen.getByRole("button", { name: "Начать с пустого портфеля" }));
    expect(document.querySelector(".header__actions--open")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Header.test.tsx`
Expected: FAIL — no element with accessible name "Меню"

- [ ] **Step 3: Update `Header.tsx`**

Change the import line:

```ts
import { useRef } from "react";
```

to:

```ts
import { useRef, useState } from "react";
```

Add local state right after the existing `useRef` line:

```ts
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
```

Replace the final `return (...)` block with:

```tsx
  return (
    <header className="header">
      <h1 className="header__title">
        <select
          className="header__brand"
          value={selectedIndex}
          disabled={!file || isUpdating}
          onChange={handleIndexChange}
        >
          {INDEX_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="header__title-text">Портфель-трекер</span>
      </h1>
      <button
        type="button"
        className="header__menu-toggle"
        aria-label="Меню"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        ⋮
      </button>
      <div className={`header__actions${menuOpen ? " header__actions--open" : ""}`}>
        <button
          type="button"
          onClick={() => {
            setMenuOpen(false);
            handleLoadClick();
          }}
        >
          Загрузить файл
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={handleInputChange}
        />
        {!file && (
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              handleStartEmpty();
            }}
          >
            Начать с пустого портфеля
          </button>
        )}
        {file && (
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              handleSaveClick();
            }}
          >
            Сохранить
          </button>
        )}
      </div>
    </header>
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/Header.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the header mobile CSS**

Append to `webapp/src/styles.css`:

```css
/* Header (mobile) */

.header__menu-toggle {
  display: none;
}

@media (max-width: 600px) {
  .header {
    position: relative;
  }

  .header__title-text {
    display: none;
  }

  .header__menu-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    font-size: 1.1rem;
  }

  .header__actions {
    display: none;
  }

  .header__actions--open {
    display: flex;
    flex-direction: column;
    position: absolute;
    top: 56px;
    right: 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 8px;
    gap: 8px;
    z-index: 250;
    min-width: 200px;
  }

  .header__actions--open button {
    min-height: 44px;
    width: 100%;
  }
}
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add webapp/src/components/Header.tsx webapp/src/components/Header.test.tsx webapp/src/styles.css
git commit -m "feat: collapse header actions into a mobile dropdown menu"
```

---

### Task 6: Global mobile CSS — dashboard scroll, tab touch targets, full-screen modals, global input sizing

**Files:**
- Modify: `webapp/src/styles.css` (append `Mobile (≤600px) — global` section)

**Interfaces:** none (CSS-only; no component changes).

This task has no automated test — CSS breakpoint behavior is verified manually (Step 2) per the spec's own testing section. It's kept as one task because all four rules are reviewed together as a single "mobile stylesheet pass" over already-existing selectors.

- [ ] **Step 1: Add the CSS**

Append to `webapp/src/styles.css`:

```css
/* Mobile (≤600px) — global */

@media (max-width: 600px) {
  .dashboard {
    flex-wrap: nowrap;
    overflow-x: auto;
  }

  .tabs button {
    padding: 12px 10px;
    min-height: 44px;
  }

  .modal-backdrop {
    align-items: stretch;
    justify-content: stretch;
  }

  .modal {
    position: fixed;
    inset: 0;
    width: 100%;
    max-height: 100vh;
    border-radius: 0;
  }

  .modal__actions button {
    flex: 1;
    min-height: 44px;
  }

  button,
  select,
  input[type="number"],
  input[type="text"] {
    min-height: 44px;
  }

  input[type="number"],
  input[type="text"],
  select {
    font-size: 16px;
  }
}
```

- [ ] **Step 2: Manually verify in Chrome DevTools**

Run: `npm run dev` (from `webapp/`)

In Chrome DevTools device toolbar at 375px width, confirm:
- `.dashboard` scrolls horizontally instead of wrapping onto multiple lines.
- Tab buttons (`Портфель`/`Графики`/`Сектора`) have a visibly taller tap zone.
- Opening `AddTickerModal` (`+ Тикер` button) or `PairPositionsModal` (`Парные позиции` button) covers the full screen, no rounded corners, no visible backdrop margin.
- All buttons/inputs/selects reach at least 44px tall; number/text inputs don't trigger iOS auto-zoom (font-size 16px, can't be checked in DevTools directly — note for the real-device pass in Task 8).

- [ ] **Step 3: Run the full suite and typecheck (no functional change expected, but keep the gate)**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add webapp/src/styles.css
git commit -m "style: mobile dashboard scroll, tab touch targets, full-screen modals, global input sizing"
```

---

### Task 7: Charts — responsive tick/legend font size + padding

**Files:**
- Create: `webapp/src/components/chartResponsive.ts`
- Create: `webapp/src/components/chartResponsive.test.ts`
- Modify: `webapp/src/components/HistoryLineChart.tsx:1, 3-9, 16-17`
- Modify: `webapp/src/components/SectorDonutChart.tsx:1, 32`
- Modify: `webapp/src/styles.css` (append `Charts (mobile)` section)

**Interfaces:**
- Produces: `getChartTickFontSize(isMobile: boolean): number`, `getChartLegendFontSize(isMobile: boolean): number`.

Recharts takes `tick`/`Legend` font sizes as inline JS props, not CSS, so the mobile/desktop choice has to happen in JS via `useIsMobile()` (Task 2). Chart padding (a real CSS property on `.history-chart`/`.sector-chart`) stays CSS-only. Full recharts rendering isn't unit-tested here — `ResponsiveContainer` reports zero size under jsdom, making such tests flaky and low-value; only the pure font-size selection is unit-tested, and the visual result is checked manually alongside Task 8.

- [ ] **Step 1: Write the failing test**

Create `webapp/src/components/chartResponsive.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getChartTickFontSize, getChartLegendFontSize } from "./chartResponsive";

describe("chartResponsive", () => {
  it("increases tick font size on mobile", () => {
    expect(getChartTickFontSize(false)).toBe(11);
    expect(getChartTickFontSize(true)).toBe(13);
  });

  it("increases legend font size on mobile", () => {
    expect(getChartLegendFontSize(false)).toBe(12);
    expect(getChartLegendFontSize(true)).toBe(14);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chartResponsive.test.ts`
Expected: FAIL — `Cannot find module './chartResponsive'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/components/chartResponsive.ts`:

```ts
export function getChartTickFontSize(isMobile: boolean): number {
  return isMobile ? 13 : 11;
}

export function getChartLegendFontSize(isMobile: boolean): number {
  return isMobile ? 14 : 12;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/chartResponsive.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire the tick font size into `HistoryLineChart`**

In `webapp/src/components/HistoryLineChart.tsx`, change the import line:

```ts
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
```

to:

```ts
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useIsMobile } from "../portfolio/useIsMobile";
import { getChartTickFontSize } from "./chartResponsive";
```

At the top of the component body, add:

```ts
export function HistoryLineChart({
  data,
  label,
}: {
  data: { x: string; y: number | null }[];
  label: string;
}) {
  const tickFontSize = getChartTickFontSize(useIsMobile());
  return (
```

Replace the two `tick={{ fill: "#8891a0", fontSize: 11 }}` occurrences with `tick={{ fill: "#8891a0", fontSize: tickFontSize }}`.

- [ ] **Step 6: Wire the legend font size into `SectorDonutChart`**

In `webapp/src/components/SectorDonutChart.tsx`, change the import line:

```ts
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CalculatedPosition } from "../types";
```

to:

```ts
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CalculatedPosition } from "../types";
import { useIsMobile } from "../portfolio/useIsMobile";
import { getChartLegendFontSize } from "./chartResponsive";
```

Inside the component, before the early-return, add:

```ts
export function SectorDonutChart({ positions }: { positions: CalculatedPosition[] }) {
  const legendFontSize = getChartLegendFontSize(useIsMobile());
  const bySector = new Map<string, number>();
```

Change `<Legend wrapperStyle={{ color: "#8891a0", fontSize: 12 }} />` to `<Legend wrapperStyle={{ color: "#8891a0", fontSize: legendFontSize }} />`.

- [ ] **Step 7: Add the chart padding CSS**

Append to `webapp/src/styles.css`:

```css
/* Charts (mobile) */

@media (max-width: 600px) {
  .history-chart,
  .sector-chart {
    padding: 8px 10px;
  }
}
```

- [ ] **Step 8: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add webapp/src/components/chartResponsive.ts webapp/src/components/chartResponsive.test.ts webapp/src/components/HistoryLineChart.tsx webapp/src/components/SectorDonutChart.tsx webapp/src/styles.css
git commit -m "style: responsive chart tick/legend font size and padding below 600px"
```

---

### Task 8: Manual mobile QA pass + final gate

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full verification gate**

Run: `npm run build` (from `webapp/`)
Expected: both `tsc` projects and `vite build` succeed with no errors

Run: `npm run lint`
Expected: no errors

Run: `npm run test`
Expected: all suites PASS

- [ ] **Step 2: Chrome DevTools device toolbar pass**

At each of 375px, 390px, 414px width, with a loaded portfolio:
- Header: brand `select` visible, "Портфель-трекер" text hidden, `⋮` opens/closes the dropdown with all three actions reachable and full-width/44px tall.
- Dashboard: 4 metrics scroll horizontally, no wrapping.
- Portfolio tab: positions render as cards, not a table; tapping a card expands the 13-field list in spec order; editing Коэф-т/Куплено updates the same way the desktop table does (compare against a resized-down desktop window before/after).
- Charts tab: line charts readable, larger tick labels than desktop; sector donut legend readable.
- Opening `AddTickerModal`/`PairPositionsModal`/`SectorOverrideModal` (from `Сектора` tab): each covers the full screen, buttons full-width and ≥44px tall, internal scroll works.

- [ ] **Step 3: Real-device pass**

On an actual phone (not just DevTools emulation), confirm:
- Tapping into Коэф-т/Куплено/search inputs does **not** trigger iOS Safari's auto-zoom (this is the one thing DevTools can't verify — depends on the real `font-size: 16px` rendering, not just the emulated viewport).
- Tap targets for the header menu, tab buttons, and card summaries are comfortable with a thumb, not just a mouse pointer.

- [ ] **Step 4: Report results**

If any check in Step 2 or 3 fails, file it as a follow-up — this plan's tasks are already committed individually, so a failure here means adjusting a specific earlier task's CSS/component rather than reopening the whole plan.
