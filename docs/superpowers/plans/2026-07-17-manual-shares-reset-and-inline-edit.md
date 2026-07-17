# Manual Shares Reset & Inline-Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "reset manual shares" button (with confirmation modal showing affected positions) and change the "Куплено → Штук" cell to show the total (manual + broker) by default, switching to an editable manual-value input on click.

**Architecture:** Two independent, self-contained components. `SharesOwnedCell.tsx` owns display/edit toggle state for one cell and is dropped into both `PositionsTable.tsx` (desktop) and `PositionCard.tsx` (mobile), replacing their existing always-visible `<input>`. `ResetManualSharesModal.tsx` is a presentational confirm dialog (rows in, `onConfirm`/`onClose` callbacks out) wired into `PortfolioTab.tsx`, which owns the actual `file.positions` mutation — same "dumb component, smart parent" split already used by `AddTickerModal`/`PairPositionsModal` and `SharesBreakdownPopover`.

**Tech Stack:** React 18 + TypeScript (strict), Vitest + @testing-library/react + jest-dom (see `webapp/src/setupTests.ts`), no new dependencies.

## Global Constraints

- `tsconfig.json` strict mode: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules: true` — no unused imports/params.
- No ESLint/Prettier auto-format config — match existing file formatting by hand (2-space indent, double quotes, semicolons).
- Russian-language UI copy throughout, matching existing tone (`"Куплено"`, `"Вручную"`, `"Обновить"`, `"Отмена"`).
- Coefficients and broker holdings are out of scope for both features — never read or written by the new code beyond what already exists.
- Run `npm run typecheck` and `npm run test` from `webapp/` (there is no root `package.json`).

---

## File Structure

- **Create:** `webapp/src/components/SharesOwnedCell.tsx` — display/edit toggle for one shares cell. Single responsibility: given `manualSharesOwned`, `total`, `onChange`, render a clickable total display or an editable manual-value input.
- **Create:** `webapp/src/components/SharesOwnedCell.test.tsx`.
- **Modify:** `webapp/src/components/PositionsTable.tsx:1-5,129-142` — swap the raw `<input>` for `<SharesOwnedCell>`.
- **Modify:** `webapp/src/components/PositionCard.tsx:1-6,52-70` — same swap.
- **Modify:** `webapp/src/components/PositionCard.test.tsx` — rewrite the test that currently expects two spinbuttons up front (shares cell no longer renders an input until clicked).
- **Modify:** `webapp/src/styles.css` — add `.shares-owned-cell__display`, reusing the same visual box as the input it replaces; extend the existing `.position-card__row input[type="number"]` selector to also cover it.
- **Create:** `webapp/src/components/ResetManualSharesModal.tsx` — confirm dialog with collapsible details table. Single responsibility: render summary/details/actions for a given list of affected positions; no knowledge of `file` or portfolio state.
- **Create:** `webapp/src/components/ResetManualSharesModal.test.tsx`.
- **Modify:** `webapp/src/components/PortfolioTab.tsx` — add the reset button, affected-positions computation, modal state, and the `file.positions` mutation on confirm.
- **Modify:** `webapp/src/components/PortfolioTab.test.tsx` — extend `sampleFile` with a second position and add reset-button/modal coverage.

---

## Task 1: Build the SharesOwnedCell component

**Files:**
- Create: `webapp/src/components/SharesOwnedCell.tsx`
- Test: `webapp/src/components/SharesOwnedCell.test.tsx`

**Interfaces:**
- Produces: `export function SharesOwnedCell({ manualSharesOwned, total, onChange }: { manualSharesOwned: number; total: number; onChange: (value: number) => void })`. Task 2 imports this and passes `manualSharesOwned={p.manualSharesOwned}`, `total={p.sharesOwned}`, `onChange={(value) => onChangeSharesOwned(p.ticker, value)}`.

- [ ] **Step 1: Write the failing tests**

Create `webapp/src/components/SharesOwnedCell.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SharesOwnedCell } from "./SharesOwnedCell";

describe("SharesOwnedCell", () => {
  it("shows the total in display mode, with no input present", () => {
    render(<SharesOwnedCell manualSharesOwned={2} total={12} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "12" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("switches to an input showing the manual value on click", () => {
    render(<SharesOwnedCell manualSharesOwned={2} total={12} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "12" }));

    const input = screen.getByRole("spinbutton", { name: "Куплено вручную" });
    expect(input).toHaveValue(2);
    expect(screen.queryByRole("button", { name: "12" })).not.toBeInTheDocument();
  });

  it("calls onChange on every keystroke while editing", () => {
    const onChange = vi.fn();
    render(<SharesOwnedCell manualSharesOwned={2} total={12} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "12" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Куплено вручную" }), {
      target: { value: "5" },
    });

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("exits edit mode and shows the display button again on blur", () => {
    render(<SharesOwnedCell manualSharesOwned={2} total={12} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "12" }));
    fireEvent.blur(screen.getByRole("spinbutton", { name: "Куплено вручную" }));

    expect(screen.getByRole("button", { name: "12" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("exits edit mode on Enter and on Escape", () => {
    render(<SharesOwnedCell manualSharesOwned={2} total={12} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "12" }));
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Куплено вручную" }), { key: "Enter" });
    expect(screen.getByRole("button", { name: "12" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "12" }));
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Куплено вручную" }), { key: "Escape" });
    expect(screen.getByRole("button", { name: "12" })).toBeInTheDocument();
  });

  it("re-seeds the input from the latest manualSharesOwned each time edit mode is entered", () => {
    const { rerender } = render(
      <SharesOwnedCell manualSharesOwned={2} total={12} onChange={vi.fn()} />
    );
    rerender(<SharesOwnedCell manualSharesOwned={7} total={17} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "17" }));
    expect(screen.getByRole("spinbutton", { name: "Куплено вручную" })).toHaveValue(7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webapp && npx vitest run src/components/SharesOwnedCell.test.tsx`
Expected: FAIL — module `./SharesOwnedCell` does not exist.

- [ ] **Step 3: Write the implementation**

Create `webapp/src/components/SharesOwnedCell.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";

export function SharesOwnedCell({
  manualSharesOwned,
  total,
  onChange,
}: {
  manualSharesOwned: number;
  total: number;
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="1"
        aria-label="Куплено вручную"
        value={manualSharesOwned}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") inputRef.current?.blur();
        }}
      />
    );
  }

  return (
    <button type="button" className="shares-owned-cell__display" onClick={() => setEditing(true)}>
      {total}
    </button>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webapp && npx vitest run src/components/SharesOwnedCell.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/components/SharesOwnedCell.tsx webapp/src/components/SharesOwnedCell.test.tsx
git commit -m "feat: add click-to-edit SharesOwnedCell component"
```

---

## Task 2: Wire SharesOwnedCell into PositionsTable and PositionCard

**Files:**
- Modify: `webapp/src/components/PositionsTable.tsx:1-5,129-142`
- Modify: `webapp/src/components/PositionCard.tsx:1-6,52-70`
- Modify: `webapp/src/components/PositionCard.test.tsx`
- Modify: `webapp/src/styles.css`

**Interfaces:**
- Consumes: `SharesOwnedCell` from `./SharesOwnedCell` (Task 1).

- [ ] **Step 1: Update the PositionCard test that assumes an always-visible shares input**

In `webapp/src/components/PositionCard.test.tsx`, replace the test `"calls onChangeCoefficient and onChangeSharesOwned from the expanded inputs"` (lines 67-88) with:

```tsx
  it("calls onChangeCoefficient from the coefficient input, and onChangeSharesOwned after clicking into the shares cell", () => {
    const onChangeCoefficient = vi.fn();
    const onChangeSharesOwned = vi.fn();
    render(
      <PositionCard
        position={position}
        brokerConnectionsById={new Map()}
        onChangeCoefficient={onChangeCoefficient}
        onChangeSharesOwned={onChangeSharesOwned}
      />
    );

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    expect(onChangeCoefficient).toHaveBeenCalledWith("GAZP", 2);

    fireEvent.click(screen.getByRole("button", { name: "10" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Куплено вручную" }), {
      target: { value: "12" },
    });
    expect(onChangeSharesOwned).toHaveBeenCalledWith("GAZP", 12);
  });
```

(`position.sharesOwned` is `10` in the fixture at the top of this file, so the collapsed shares cell's button name is `"10"`.)

- [ ] **Step 2: Run the PositionCard tests to verify the updated one fails**

Run: `cd webapp && npx vitest run src/components/PositionCard.test.tsx`
Expected: FAIL on the test from Step 1 — current code renders a spinbutton for shares immediately, so `getAllByRole("spinbutton")` has length 2 and there is no button named `"10"`.

- [ ] **Step 3: Update PositionCard.tsx**

Change the imports at the top of `webapp/src/components/PositionCard.tsx`:

```ts
import { useState } from "react";
import { CalculatedPosition } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";
import { buildExpandedFields, formatNumber } from "./formatPosition";
import { buildSharesBreakdownRows } from "../domain/sharesBreakdown";
import { SharesBreakdownPopover } from "./SharesBreakdownPopover";
```

to:

```ts
import { useState } from "react";
import { CalculatedPosition } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";
import { buildExpandedFields, formatNumber } from "./formatPosition";
import { buildSharesBreakdownRows } from "../domain/sharesBreakdown";
import { SharesBreakdownPopover } from "./SharesBreakdownPopover";
import { SharesOwnedCell } from "./SharesOwnedCell";
```

Then replace the `sharesOwned` field block (lines 52-70):

```tsx
            if (field.kind === "sharesOwned") {
              return (
                <div className="position-card__row" key="sharesOwned">
                  <span className="position-card__label">Куплено</span>
                  <input
                    type="number"
                    step="1"
                    value={position.manualSharesOwned}
                    onChange={(e) => onChangeSharesOwned(position.ticker, Number(e.target.value))}
                  />
                  {position.brokerHoldings && position.brokerHoldings.length > 0 && (
                    <SharesBreakdownPopover
                      rows={buildSharesBreakdownRows(position, brokerConnectionsById)}
                      total={position.sharesOwned}
                    />
                  )}
                </div>
              );
            }
```

with:

```tsx
            if (field.kind === "sharesOwned") {
              return (
                <div className="position-card__row" key="sharesOwned">
                  <span className="position-card__label">Куплено</span>
                  <SharesOwnedCell
                    manualSharesOwned={position.manualSharesOwned}
                    total={position.sharesOwned}
                    onChange={(value) => onChangeSharesOwned(position.ticker, value)}
                  />
                  {position.brokerHoldings && position.brokerHoldings.length > 0 && (
                    <SharesBreakdownPopover
                      rows={buildSharesBreakdownRows(position, brokerConnectionsById)}
                      total={position.sharesOwned}
                    />
                  )}
                </div>
              );
            }
```

- [ ] **Step 4: Update PositionsTable.tsx**

Change the imports at the top of `webapp/src/components/PositionsTable.tsx`:

```ts
import { CalculatedPosition, Pair } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";
import { buildSharesBreakdownRows } from "../domain/sharesBreakdown";
import { SharesBreakdownPopover } from "./SharesBreakdownPopover";
import { formatNumber } from "./formatPosition";
```

to:

```ts
import { CalculatedPosition, Pair } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";
import { buildSharesBreakdownRows } from "../domain/sharesBreakdown";
import { SharesBreakdownPopover } from "./SharesBreakdownPopover";
import { SharesOwnedCell } from "./SharesOwnedCell";
import { formatNumber } from "./formatPosition";
```

Then replace the shares cell (lines 129-142):

```tsx
              <td className="num td-editable">
                <input
                  type="number"
                  step="1"
                  value={p.manualSharesOwned}
                  onChange={(e) => onChangeSharesOwned(p.ticker, Number(e.target.value))}
                />
                {p.brokerHoldings && p.brokerHoldings.length > 0 && (
                  <SharesBreakdownPopover
                    rows={buildSharesBreakdownRows(p, brokerConnectionsById)}
                    total={p.sharesOwned}
                  />
                )}
              </td>
```

with:

```tsx
              <td className="num td-editable">
                <SharesOwnedCell
                  manualSharesOwned={p.manualSharesOwned}
                  total={p.sharesOwned}
                  onChange={(value) => onChangeSharesOwned(p.ticker, value)}
                />
                {p.brokerHoldings && p.brokerHoldings.length > 0 && (
                  <SharesBreakdownPopover
                    rows={buildSharesBreakdownRows(p, brokerConnectionsById)}
                    total={p.sharesOwned}
                  />
                )}
              </td>
```

- [ ] **Step 5: Add CSS for the display button**

In `webapp/src/styles.css`, immediately after the `.positions-table input[type="number"]:focus { border-bottom-color: var(--accent); }` rule (around line 428, right before `.positions-table td.td-editable`), insert:

```css
.shares-owned-cell__display {
  width: 72px;
  text-align: right;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  border-radius: 0;
  padding: 2px 2px;
  font-family: var(--font-mono);
  font-size: inherit;
  color: var(--fg);
  cursor: pointer;
}

.shares-owned-cell__display:hover,
.shares-owned-cell__display:focus {
  border-bottom-color: var(--accent);
}
```

Then update the mobile sizing rule (around line 823) from:

```css
.position-card__row input[type="number"] {
  min-height: 44px;
  min-width: 90px;
  font-size: 16px;
  text-align: right;
}
```

to:

```css
.position-card__row input[type="number"],
.position-card__row .shares-owned-cell__display {
  min-height: 44px;
  min-width: 90px;
  font-size: 16px;
  text-align: right;
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `cd webapp && npm run typecheck && npm test`
Expected: no unused-import errors, all tests pass including the updated `PositionCard.test.tsx`.

- [ ] **Step 7: Manual visual check**

Run: `cd webapp && npm run dev`
Open the app, confirm the "Куплено → Штук" column shows a plain number (the total) by default, clicking it turns it into an editable input showing the manual value, typing updates the total live in other rows/totals as expected, and blurring (or clicking elsewhere) reverts to the display total. Do the same check on a narrow viewport (mobile card view).

- [ ] **Step 8: Commit**

```bash
git add webapp/src/components/SharesOwnedCell.tsx webapp/src/components/PositionsTable.tsx webapp/src/components/PositionCard.tsx webapp/src/components/PositionCard.test.tsx webapp/src/styles.css
git commit -m "feat: show total shares by default, edit manual value on click"
```

---

## Task 3: Build the ResetManualSharesModal component

**Files:**
- Create: `webapp/src/components/ResetManualSharesModal.tsx`
- Test: `webapp/src/components/ResetManualSharesModal.test.tsx`

**Interfaces:**
- Produces: `export function ResetManualSharesModal({ positions, onConfirm, onClose }: { positions: { ticker: string; shortName: string; manualSharesOwned: number }[]; onConfirm: () => void; onClose: () => void })`. Task 4 imports this and computes `positions` from the currently filtered/visible `CalculatedPosition[]`.

- [ ] **Step 1: Write the failing tests**

Create `webapp/src/components/ResetManualSharesModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResetManualSharesModal } from "./ResetManualSharesModal";

const positions = [
  { ticker: "GAZP", shortName: "Газпром", manualSharesOwned: 5 },
  { ticker: "SBER", shortName: "Сбербанк", manualSharesOwned: 3 },
];

describe("ResetManualSharesModal", () => {
  it("shows the count of affected positions and keeps details collapsed by default", () => {
    render(<ResetManualSharesModal positions={positions} onConfirm={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("Будет обнулено позиций: 2")).toBeInTheDocument();
    expect(screen.queryByText("GAZP")).not.toBeInTheDocument();
  });

  it("reveals the affected positions table on Детали, and hides it again on a second click", () => {
    render(<ResetManualSharesModal positions={positions} onConfirm={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Детали" }));
    expect(screen.getByText("GAZP")).toBeInTheDocument();
    expect(screen.getByText("5 → 0")).toBeInTheDocument();
    expect(screen.getByText("SBER")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Скрыть детали" }));
    expect(screen.queryByText("GAZP")).not.toBeInTheDocument();
  });

  it("calls onConfirm when Обнулить is clicked", () => {
    const onConfirm = vi.fn();
    render(<ResetManualSharesModal positions={positions} onConfirm={onConfirm} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onClose and not onConfirm when Отмена is clicked", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ResetManualSharesModal positions={positions} onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webapp && npx vitest run src/components/ResetManualSharesModal.test.tsx`
Expected: FAIL — module `./ResetManualSharesModal` does not exist.

- [ ] **Step 3: Write the implementation**

Create `webapp/src/components/ResetManualSharesModal.tsx`:

```tsx
import { useState } from "react";

export function ResetManualSharesModal({
  positions,
  onConfirm,
  onClose,
}: {
  positions: { ticker: string; shortName: string; manualSharesOwned: number }[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Обнулить вручную введённое количество">
      <div className="modal">
        <h2>Обнулить вручную введённое количество</h2>
        <p>{`Будет обнулено позиций: ${positions.length}`}</p>
        <button type="button" onClick={() => setShowDetails((prev) => !prev)}>
          {showDetails ? "Скрыть детали" : "Детали"}
        </button>
        {showDetails && (
          <table>
            <tbody>
              {positions.map((p) => (
                <tr key={p.ticker}>
                  <td>{p.ticker}</td>
                  <td>{p.shortName}</td>
                  <td>{`${p.manualSharesOwned} → 0`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="modal__actions">
          <button type="button" onClick={onConfirm}>
            Обнулить
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webapp && npx vitest run src/components/ResetManualSharesModal.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/components/ResetManualSharesModal.tsx webapp/src/components/ResetManualSharesModal.test.tsx
git commit -m "feat: add ResetManualSharesModal confirm dialog"
```

---

## Task 4: Wire the reset button into PortfolioTab

**Files:**
- Modify: `webapp/src/components/PortfolioTab.tsx`
- Modify: `webapp/src/components/PortfolioTab.test.tsx`

**Interfaces:**
- Consumes: `ResetManualSharesModal` from `./ResetManualSharesModal` (Task 3).

- [ ] **Step 1: Extend the test fixture and write the failing tests**

In `webapp/src/components/PortfolioTab.test.tsx`, change `sampleFile` (lines 13-22) from:

```ts
const sampleFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 5 }],
  sectors: {},
  history: [],
  pairs: [],
  brokerConnections: [],
  brokerAccounts: [],
  transactions: [],
};
```

to:

```ts
const sampleFile: PortfolioFile = {
  version: 1,
  positions: [
    { ticker: "GAZP", coefficient: 1, sharesOwned: 5 },
    { ticker: "SBER", coefficient: 1, sharesOwned: 3 },
  ],
  sectors: {},
  history: [],
  pairs: [],
  brokerConnections: [],
  brokerAccounts: [],
  transactions: [],
};
```

Then append a new `describe` block after the existing `describe("PortfolioTab mobile switch", ...)` block, at the end of the file:

```tsx
describe("PortfolioTab manual shares reset", () => {
  it("disables the reset button when no visible position has a non-zero manual value", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab();

    const search = screen.getByPlaceholderText("Поиск по тикеру или названию");
    fireEvent.change(search, { target: { value: "NOPE" } });

    expect(screen.getByRole("button", { name: "Сбросить вручную введённое" })).toBeDisabled();
  });

  it("resets manual shares only for currently visible positions with a non-zero manual value", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab();

    const search = screen.getByPlaceholderText("Поиск по тикеру или названию");
    fireEvent.change(search, { target: { value: "GAZP" } });

    const resetButton = screen.getByRole("button", { name: "Сбросить вручную введённое" });
    expect(resetButton).not.toBeDisabled();
    fireEvent.click(resetButton);
    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));

    fireEvent.change(search, { target: { value: "" } });

    expect(screen.getByRole("button", { name: "0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3" })).toBeInTheDocument();
  });
});
```

Add `screen` and `fireEvent` to the existing `@testing-library/react` import at the top of the file (currently `import { render } from "@testing-library/react";`), changing it to:

```ts
import { render, screen, fireEvent } from "@testing-library/react";
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd webapp && npx vitest run src/components/PortfolioTab.test.tsx`
Expected: FAIL — no button named `"Сбросить вручную введённое"` exists yet.

- [ ] **Step 3: Wire the button, state, and modal into PortfolioTab.tsx**

Add the import, near the other component imports (after `import { PairPositionsModal } from "./PairPositionsModal";`):

```ts
import { ResetManualSharesModal } from "./ResetManualSharesModal";
```

Add a new state declaration next to `showPairPositions`:

```ts
const [showResetManualShares, setShowResetManualShares] = useState(false);
```

After the `brokerConnectionsById` memo, add:

```ts
const affectedPositions = filteredPositions.filter((p) => p.manualSharesOwned !== 0);
```

Add the button to `.action-row`, after the "Парные позиции" button:

```tsx
        <button
          type="button"
          onClick={() => setShowResetManualShares(true)}
          disabled={isUpdating || affectedPositions.length === 0}
        >
          Сбросить вручную введённое
        </button>
```

Add the modal render, after the `showPairPositions && (...)` block, before the closing `</div>` of `.portfolio-tab`:

```tsx
      {showResetManualShares && (
        <ResetManualSharesModal
          positions={affectedPositions.map((p) => ({
            ticker: p.ticker,
            shortName: p.shortName,
            manualSharesOwned: p.manualSharesOwned,
          }))}
          onConfirm={() => {
            if (!file) return;
            const tickers = new Set(affectedPositions.map((p) => p.ticker));
            setFile({
              ...file,
              positions: file.positions.map((p) =>
                tickers.has(p.ticker) ? { ...p, sharesOwned: 0 } : p
              ),
            });
            setShowResetManualShares(false);
          }}
          onClose={() => setShowResetManualShares(false)}
        />
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/components/PortfolioTab.test.tsx`
Expected: PASS (4 tests: 2 existing mobile-switch tests + 2 new reset tests)

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `cd webapp && npm run typecheck && npm test`
Expected: no unused-import errors, all tests pass.

- [ ] **Step 6: Manual visual check**

Run: `cd webapp && npm run dev`
Open the app, type a manual quantity into a position, confirm the new "Сбросить вручную введённое" button is enabled; click it, click "Детали" and confirm the affected position and its current value → 0 are listed; click "Обнулить" and confirm the quantity resets to 0 (and, if that position has broker holdings, the total drops by exactly the manual portion). Confirm the button is disabled again once no visible position has a manual value, and that filtering the search box down to a subset only offers to reset the visible ones.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/components/PortfolioTab.tsx webapp/src/components/PortfolioTab.test.tsx
git commit -m "feat: add button to reset manually entered share quantities"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 (reset button, scoped to visible positions, confirm modal with collapsible details) → Tasks 3-4. Part 2 (click-to-edit cell showing total by default, manual value while editing) → Tasks 1-2. Both desktop (`PositionsTable`) and mobile (`PositionCard`) call sites updated in Task 2.
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact command with expected output.
- **Type consistency:** `SharesOwnedCell` props (`manualSharesOwned`, `total`, `onChange`) match between Task 1's definition and Task 2's two call sites. `ResetManualSharesModal` props (`positions: {ticker, shortName, manualSharesOwned}[]`, `onConfirm`, `onClose`) match between Task 3's definition and Task 4's call site.
- **Scope check:** Coefficients and broker holdings are untouched by every task — confirmed no task reads or writes `coefficient` or `brokerHoldings` outside of what already existed (the coefficient input keeps its existing behavior in Task 2's edits; the reset mutation in Task 4 only ever sets `sharesOwned`).
