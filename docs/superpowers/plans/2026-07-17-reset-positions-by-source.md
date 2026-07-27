# Reset Positions by Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Сбросить вручную введённое" button with "Сбросить позиции", which opens a source picker (ручные позиции / one option per broker connection) before showing the existing-style confirmation modal, scoped to the chosen source.

**Architecture:** Two new small modal components (`ResetSourceModal`, and `ResetPositionsModal` generalized from the existing `ResetManualSharesModal`) plus a single `resetFlow` state machine in `PortfolioTab.tsx` that drives which modal is shown and what data/handler it gets. No new files outside `webapp/src/components/`; no domain-layer changes.

**Tech Stack:** React 18 + TypeScript (strict), Vitest + @testing-library/react (`webapp/src/setupTests.ts`), no new dependencies.

## Global Constraints

- Reuse existing `.modal-backdrop` / `.modal` / `.modal__actions` CSS — no new CSS classes or files.
- No Escape/backdrop-click dismissal on either modal, matching `AddTickerModal`/`PairPositionsModal`/today's reset modal.
- Broker-source reset deletes the matching `brokerHoldings[]` entries (filters them out) — it does NOT write a `shares: 0` entry. A later broker sync may reintroduce them; that's expected, not a bug to prevent.
- Reset scope is per `brokerConnection` (by `connectionId`), never grouped by `brokerId` — two connections of the same broker are two separate, independently-resettable options.
- If `file.brokerConnections` is empty, the source list contains only "Ручные позиции" (no empty broker section).
- "Visible" scope for every source = the same `filteredPositions` (search/hide-empty/only-in-index) already used by the table/cards today.
- Coefficients (`Коэф-т`) are never touched by any part of this feature.

---

### Task 1: `ResetPositionsModal` component (generalized confirmation modal)

**Files:**
- Create: `webapp/src/components/ResetPositionsModal.tsx`
- Create: `webapp/src/components/ResetPositionsModal.test.tsx`

**Interfaces:**
- Produces: `ResetPositionsModal(props: { title: string; positions: { ticker: string; shortName: string; currentValue: number }[]; onConfirm: () => void; onBack: () => void; onClose: () => void }): JSX.Element` — used by Task 3.

This is a new file that coexists with the still-in-use `webapp/src/components/ResetManualSharesModal.tsx` until Task 3 removes it — no other file references `ResetPositionsModal` yet, so this task is fully self-contained.

- [ ] **Step 1: Write the failing test file**

Create `webapp/src/components/ResetPositionsModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResetPositionsModal } from "./ResetPositionsModal";

const positions = [
  { ticker: "GAZP", shortName: "Газпром", currentValue: 5 },
  { ticker: "SBER", shortName: "Сбербанк", currentValue: 3 },
];

describe("ResetPositionsModal", () => {
  it("renders the given title and the count of affected positions, details collapsed by default", () => {
    render(
      <ResetPositionsModal
        title="Обнулить вручную введённое количество"
        positions={positions}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Обнулить вручную введённое количество")).toBeInTheDocument();
    expect(screen.getByText("Будет обнулено позиций: 2")).toBeInTheDocument();
    expect(screen.queryByText("GAZP")).not.toBeInTheDocument();
  });

  it("reveals the affected positions table on Детали, and hides it again on a second click", () => {
    render(
      <ResetPositionsModal
        title="Обнулить холдинги брокера «Т-Банк»"
        positions={positions}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Детали" }));
    expect(screen.getByText("GAZP")).toBeInTheDocument();
    expect(screen.getByText("5 → 0")).toBeInTheDocument();
    expect(screen.getByText("SBER")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Скрыть детали" }));
    expect(screen.queryByText("GAZP")).not.toBeInTheDocument();
  });

  it("calls onConfirm when Обнулить is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ResetPositionsModal
        title="t"
        positions={positions}
        onConfirm={onConfirm}
        onBack={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onBack, not onConfirm or onClose, when Назад is clicked", () => {
    const onConfirm = vi.fn();
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(
      <ResetPositionsModal
        title="t"
        positions={positions}
        onConfirm={onConfirm}
        onBack={onBack}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBack).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose and not onConfirm or onBack when Отмена is clicked", () => {
    const onConfirm = vi.fn();
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(
      <ResetPositionsModal
        title="t"
        positions={positions}
        onConfirm={onConfirm}
        onBack={onBack}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/components/ResetPositionsModal.test.tsx`
Expected: FAIL — `Failed to resolve import "./ResetPositionsModal"` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `webapp/src/components/ResetPositionsModal.tsx`:

```tsx
import { useState } from "react";

export function ResetPositionsModal({
  title,
  positions,
  onConfirm,
  onBack,
  onClose,
}: {
  title: string;
  positions: { ticker: string; shortName: string; currentValue: number }[];
  onConfirm: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="modal-backdrop" role="dialog" aria-label={title}>
      <div className="modal">
        <h2>{title}</h2>
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
                  <td>{`${p.currentValue} → 0`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="modal__actions">
          <button type="button" onClick={onConfirm}>
            Обнулить
          </button>
          <button type="button" onClick={onBack}>
            Назад
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/components/ResetPositionsModal.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/components/ResetPositionsModal.tsx webapp/src/components/ResetPositionsModal.test.tsx
git commit -m "feat: add ResetPositionsModal (generalized confirm step for reset flow)"
```

---

### Task 2: `ResetSourceModal` component (source picker)

**Files:**
- Create: `webapp/src/components/ResetSourceModal.tsx`
- Create: `webapp/src/components/ResetSourceModal.test.tsx`

**Interfaces:**
- Produces: `ResetSourceModal(props: { options: { key: string; label: string; count: number }[]; onSelect: (key: string) => void; onClose: () => void }): JSX.Element` — used by Task 3.

Independent of Task 1 — no shared code, safe to do in either order.

- [ ] **Step 1: Write the failing test file**

Create `webapp/src/components/ResetSourceModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResetSourceModal } from "./ResetSourceModal";

const options = [
  { key: "manual", label: "Ручные позиции", count: 2 },
  { key: "conn1", label: "Т-Банк", count: 0 },
  { key: "conn2", label: "Финам", count: 1 },
];

describe("ResetSourceModal", () => {
  it("renders one option per entry with its count in the label", () => {
    render(<ResetSourceModal options={options} onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Ручные позиции (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Т-Банк (0)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Финам (1)" })).toBeInTheDocument();
  });

  it("disables an option whose count is 0", () => {
    render(<ResetSourceModal options={options} onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Т-Банк (0)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ручные позиции (2)" })).not.toBeDisabled();
  });

  it("calls onSelect with the option's key when an enabled option is clicked", () => {
    const onSelect = vi.fn();
    render(<ResetSourceModal options={options} onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Финам (1)" }));
    expect(onSelect).toHaveBeenCalledWith("conn2");
  });

  it("calls onClose when Отмена is clicked", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(<ResetSourceModal options={options} onSelect={onSelect} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/components/ResetSourceModal.test.tsx`
Expected: FAIL — `Failed to resolve import "./ResetSourceModal"`.

- [ ] **Step 3: Write the implementation**

Create `webapp/src/components/ResetSourceModal.tsx`:

```tsx
export function ResetSourceModal({
  options,
  onSelect,
  onClose,
}: {
  options: { key: string; label: string; count: number }[];
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-label="Сбросить позиции">
      <div className="modal">
        <h2>Сбросить позиции</h2>
        {options.map((option) => (
          <div key={option.key}>
            <button type="button" disabled={option.count === 0} onClick={() => onSelect(option.key)}>
              {`${option.label} (${option.count})`}
            </button>
          </div>
        ))}
        <div className="modal__actions">
          <button type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/components/ResetSourceModal.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/components/ResetSourceModal.tsx webapp/src/components/ResetSourceModal.test.tsx
git commit -m "feat: add ResetSourceModal (source picker step for reset flow)"
```

---

### Task 3: Wire the two-step flow into `PortfolioTab.tsx`, remove the old modal

**Files:**
- Modify: `webapp/src/components/PortfolioTab.tsx`
- Modify: `webapp/src/components/PortfolioTab.test.tsx`
- Delete: `webapp/src/components/ResetManualSharesModal.tsx`
- Delete: `webapp/src/components/ResetManualSharesModal.test.tsx`

**Interfaces:**
- Consumes: `ResetPositionsModal` from Task 1 (`{ title, positions, onConfirm, onBack, onClose }`), `ResetSourceModal` from Task 2 (`{ options, onSelect, onClose }`).
- Consumes existing: `filterPositions`, `usePortfolio`, `useCalculatedPositions`, `CalculatedPosition.manualSharesOwned: number`, `CalculatedPosition.brokerHoldings?: { connectionId: string; shares: number; syncedAt: string }[]`, `PortfolioFile.brokerConnections: { id: string; brokerId: string; accountId: string; label: string; encryptedToken: {...} }[]`.

This is the integration task: it deletes the old modal and its test, so the suite is only green again once this task's edits are complete — do the edit and the delete together, then run the full suite before committing.

- [ ] **Step 1: Update `PortfolioTab.test.tsx` for the new flow (failing until Step 3)**

Read the current file first (`webapp/src/components/PortfolioTab.test.tsx`) — it's small (89 lines). Replace its entire contents with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorProvider } from "../errors/ErrorContext";
import { PortfolioProvider } from "../portfolio/PortfolioContext";
import { usePortfolio } from "../portfolio/usePortfolio";
import { useIsMobile } from "../portfolio/useIsMobile";
import { PortfolioTab } from "./PortfolioTab";
import { PortfolioFile } from "../types";

vi.mock("../portfolio/useIsMobile", () => ({ useIsMobile: vi.fn() }));

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

const dummyToken = { ciphertext: "c", iv: "i", salt: "s" };

const brokerFile: PortfolioFile = {
  version: 1,
  positions: [
    {
      ticker: "GAZP",
      coefficient: 1,
      sharesOwned: 0,
      brokerHoldings: [{ connectionId: "conn1", shares: 10, syncedAt: "2026-01-01T00:00:00.000Z" }],
    },
    {
      ticker: "SBER",
      coefficient: 1,
      sharesOwned: 0,
      brokerHoldings: [{ connectionId: "conn2", shares: 7, syncedAt: "2026-01-01T00:00:00.000Z" }],
    },
  ],
  sectors: {},
  history: [],
  pairs: [],
  brokerConnections: [
    { id: "conn1", brokerId: "tbank", accountId: "acc1", label: "Т-Банк", encryptedToken: dummyToken },
    { id: "conn2", brokerId: "finam", accountId: "acc2", label: "Финам", encryptedToken: dummyToken },
  ],
  brokerAccounts: [],
  transactions: [],
};

function Harness({ file }: { file: PortfolioFile }) {
  const { setFile } = usePortfolio();
  useEffect(() => {
    setFile(file);
  }, [setFile, file]);
  return <PortfolioTab autoUpdateSignal={0} />;
}

function renderPortfolioTab(file: PortfolioFile = sampleFile) {
  return render(
    <ErrorProvider>
      <PortfolioProvider>
        <Harness file={file} />
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

describe("PortfolioTab reset positions", () => {
  it("disables the reset button when no visible position is affected by any source", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab();

    const search = screen.getByPlaceholderText("Поиск по тикеру или названию");
    fireEvent.change(search, { target: { value: "NOPE" } });

    expect(screen.getByRole("button", { name: "Сбросить позиции" })).toBeDisabled();
  });

  it("resets manual shares only for currently visible positions, via the manual-source step", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab();

    const search = screen.getByPlaceholderText("Поиск по тикеру или названию");
    fireEvent.change(search, { target: { value: "GAZP" } });

    const resetButton = screen.getByRole("button", { name: "Сбросить позиции" });
    expect(resetButton).not.toBeDisabled();
    fireEvent.click(resetButton);
    fireEvent.click(screen.getByRole("button", { name: "Ручные позиции (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));

    fireEvent.change(search, { target: { value: "" } });

    expect(screen.getByRole("button", { name: "0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3" })).toBeInTheDocument();
  });

  it("shows only Ручные позиции when there are no broker connections", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab();

    fireEvent.click(screen.getByRole("button", { name: "Сбросить позиции" }));
    expect(screen.getByRole("button", { name: "Ручные позиции (2)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Т-Банк/ })).not.toBeInTheDocument();
  });

  it("Назад returns to the source picker without applying the reset", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab();

    fireEvent.click(screen.getByRole("button", { name: "Сбросить позиции" }));
    fireEvent.click(screen.getByRole("button", { name: "Ручные позиции (2)" }));
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect(screen.getByRole("button", { name: "Ручные позиции (2)" })).toBeInTheDocument();
  });

  it("resets only the selected broker connection's holdings, leaving other connections and manual shares untouched", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    renderPortfolioTab(brokerFile);

    fireEvent.click(screen.getByRole("button", { name: "Сбросить позиции" }));
    fireEvent.click(screen.getByRole("button", { name: "Т-Банк (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));

    fireEvent.click(screen.getByRole("button", { name: "Сбросить позиции" }));
    expect(screen.getByRole("button", { name: "Т-Банк (0)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Финам (1)" })).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/components/PortfolioTab.test.tsx`
Expected: FAIL — button "Сбросить позиции" not found (old code still renders "Сбросить вручную введённое").

- [ ] **Step 3: Update `PortfolioTab.tsx`**

Read the current file first (`webapp/src/components/PortfolioTab.tsx`, 229 lines) to confirm line numbers before editing — apply these changes:

3a. Replace the import block (lines 15-19):

```tsx
import { PositionsTable } from "./PositionsTable";
import { PositionsCardList } from "./PositionsCardList";
import { AddTickerModal } from "./AddTickerModal";
import { PairPositionsModal } from "./PairPositionsModal";
import { ResetManualSharesModal } from "./ResetManualSharesModal";
```

with:

```tsx
import { PositionsTable } from "./PositionsTable";
import { PositionsCardList } from "./PositionsCardList";
import { AddTickerModal } from "./AddTickerModal";
import { PairPositionsModal } from "./PairPositionsModal";
import { ResetSourceModal } from "./ResetSourceModal";
import { ResetPositionsModal } from "./ResetPositionsModal";
```

3b. After the imports and `const SOURCE = "update";` line (line 23), add the reset-flow types:

```tsx
type ResetSource = { type: "manual" } | { type: "broker"; connectionId: string };
type ResetFlow = { step: "source" } | { step: "confirm"; source: ResetSource } | null;
```

3c. Replace the `showResetManualShares` state line:

```tsx
  const [showResetManualShares, setShowResetManualShares] = useState(false);
```

with:

```tsx
  const [resetFlow, setResetFlow] = useState<ResetFlow>(null);
```

3d. Replace the `affectedPositions` line and everything up to (not including) `if (!file) return null;`:

```tsx
  const affectedPositions = filteredPositions.filter((p) => p.manualSharesOwned !== 0);
```

with:

```tsx
  const affectedManual = filteredPositions.filter((p) => p.manualSharesOwned !== 0);

  const affectedByConnection = new Map(
    (file?.brokerConnections ?? []).map((c) => [
      c.id,
      filteredPositions.filter((p) =>
        (p.brokerHoldings ?? []).some((h) => h.connectionId === c.id && h.shares !== 0)
      ),
    ])
  );

  const resetSourceOptions = [
    { key: "manual", label: "Ручные позиции", count: affectedManual.length },
    ...(file?.brokerConnections ?? []).map((c) => ({
      key: c.id,
      label: c.label,
      count: affectedByConnection.get(c.id)?.length ?? 0,
    })),
  ];

  const resetHasAnyAffected =
    affectedManual.length > 0 || Array.from(affectedByConnection.values()).some((list) => list.length > 0);

  const confirmSource = resetFlow?.step === "confirm" ? resetFlow.source : null;

  const confirmTitle =
    confirmSource === null
      ? ""
      : confirmSource.type === "manual"
      ? "Обнулить вручную введённое количество"
      : `Обнулить холдинги брокера «${brokerConnectionsById.get(confirmSource.connectionId) ?? ""}»`;

  const confirmPositions =
    confirmSource === null
      ? []
      : confirmSource.type === "manual"
      ? affectedManual.map((p) => ({ ticker: p.ticker, shortName: p.shortName, currentValue: p.manualSharesOwned }))
      : (affectedByConnection.get(confirmSource.connectionId) ?? []).map((p) => ({
          ticker: p.ticker,
          shortName: p.shortName,
          currentValue:
            (p.brokerHoldings ?? []).find((h) => h.connectionId === confirmSource.connectionId)?.shares ?? 0,
        }));
```

Note: this block references `brokerConnectionsById`, which is already defined a few lines above it in the existing code (the `useMemo` mapping connection id → label) — leave that `useMemo` untouched.

3e. Replace the reset button:

```tsx
        <button
          type="button"
          onClick={() => setShowResetManualShares(true)}
          disabled={isUpdating || affectedPositions.length === 0}
        >
          Сбросить вручную введённое
        </button>
```

with:

```tsx
        <button
          type="button"
          onClick={() => setResetFlow({ step: "source" })}
          disabled={isUpdating || !resetHasAnyAffected}
        >
          Сбросить позиции
        </button>
```

3f. Replace the modal-rendering block at the end of the component:

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

with:

```tsx
      {resetFlow?.step === "source" && (
        <ResetSourceModal
          options={resetSourceOptions}
          onSelect={(key) =>
            setResetFlow({
              step: "confirm",
              source: key === "manual" ? { type: "manual" } : { type: "broker", connectionId: key },
            })
          }
          onClose={() => setResetFlow(null)}
        />
      )}
      {resetFlow?.step === "confirm" && (
        <ResetPositionsModal
          title={confirmTitle}
          positions={confirmPositions}
          onConfirm={() => {
            if (!file) return;
            const source = resetFlow.source;
            if (source.type === "manual") {
              const tickers = new Set(affectedManual.map((p) => p.ticker));
              setFile({
                ...file,
                positions: file.positions.map((p) =>
                  tickers.has(p.ticker) ? { ...p, sharesOwned: 0 } : p
                ),
              });
            } else {
              const affected = affectedByConnection.get(source.connectionId) ?? [];
              const tickers = new Set(affected.map((p) => p.ticker));
              setFile({
                ...file,
                positions: file.positions.map((p) =>
                  tickers.has(p.ticker)
                    ? {
                        ...p,
                        brokerHoldings: (p.brokerHoldings ?? []).filter(
                          (h) => h.connectionId !== source.connectionId
                        ),
                      }
                    : p
                ),
              });
            }
            setResetFlow(null);
          }}
          onBack={() => setResetFlow({ step: "source" })}
          onClose={() => setResetFlow(null)}
        />
      )}
```

- [ ] **Step 4: Delete the old modal and its test**

```bash
git rm webapp/src/components/ResetManualSharesModal.tsx webapp/src/components/ResetManualSharesModal.test.tsx
```

- [ ] **Step 5: Run the full test suite**

Run: `cd webapp && npm run test`
Expected: PASS, no failures, no leftover references to `ResetManualSharesModal` or `showResetManualShares`.

- [ ] **Step 6: Typecheck and build**

Run: `cd webapp && npm run build`
Expected: succeeds (typecheck for both tsconfig projects + `vite build`), no TS errors.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/components/PortfolioTab.tsx webapp/src/components/PortfolioTab.test.tsx
git commit -m "feat: two-step reset flow — pick manual or a broker connection before confirming"
```

---

## Self-Review Notes

- **Spec coverage:** button rename (Task 3.3e) · source picker with per-source counts and disabled-when-0 (Task 2, Task 3.3d) · empty-brokerConnections fallback to manual-only list (Task 3 test "shows only Ручные позиции...") · confirm modal reused for both sources with dynamic title (Task 1, Task 3.3d) · Назад returns to source step (Task 1 Назад test, Task 3 test) · broker reset deletes matching `brokerHoldings` entries only, scoped to visible+affected tickers, other connections untouched (Task 3.3f, Task 3 broker test) · manual reset behavior unchanged (Task 3.3f, Task 3 manual test) — all covered.
- **Placeholder scan:** none — every step has complete, runnable code.
- **Type consistency:** `ResetSource`/`ResetFlow` defined once in Task 3.3b and used consistently through 3d–3f; `ResetPositionsModal` props (`title`, `positions[].currentValue`, `onBack`) match between Task 1's definition and Task 3's usage; `ResetSourceModal` props (`options[].key/label/count`, `onSelect(key: string)`) match between Task 2's definition and Task 3's usage.
