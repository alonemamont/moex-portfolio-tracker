# Manual Shares Reset & Inline-Edit Design

**Goal:** Two related changes to how manually-entered share quantities are handled in the positions table/cards:

1. A button that zeroes out the manually-entered share quantity (`Position.sharesOwned`, exposed as `CalculatedPosition.manualSharesOwned`) for currently *visible* positions, with a confirmation modal that can expand to show exactly what will be reset.
2. The "Куплено → Штук" cell changes from an always-visible input bound to the manual value, to a click-to-edit cell: by default it displays the **total** (manual + broker-synced), and switches to an editable input showing the **manual** value only while focused.

**Scope:** Manual share quantity only. Coefficients (`Коэф-т`) are untouched by both changes. Broker-synced holdings (`brokerHoldings`) are never modified by either change — they remain additive inputs to the total, per `computeTotalSharesOwned`.

**Tech Stack:** React 18 + TypeScript (strict), Vitest + @testing-library/react (see `src/setupTests.ts`), no new dependencies.

## Background (current state)

- `Position.sharesOwned` (file schema, `webapp/src/file/schema.ts`) is the manual quantity. `Position.brokerHoldings[]` holds broker-synced quantities per connection.
- `computeTotalSharesOwned` (`webapp/src/domain/calculations.ts:150-153`) sums manual + all broker holdings.
- `buildCalculatedPositions` (`webapp/src/domain/buildCalculatedPositions.ts:104-121`) produces `CalculatedPosition` where `sharesOwned` is the **total** and `manualSharesOwned` is the **manual-only** value (`position.sharesOwned` from the file). This naming inversion between `Position` and `CalculatedPosition` already exists and is not changed by this spec.
- `PortfolioTab.tsx:93-111` `updateField(ticker, "sharesOwned", value)` is the only existing mutation path, writing straight into `file.positions[].sharesOwned`.
- `PositionsTable.tsx` (desktop) and `PositionCard.tsx` (mobile) both currently render an always-visible `<input type="number" value={p.manualSharesOwned} onChange={...}>` plus, when broker holdings exist, a `SharesBreakdownPopover` showing `Σ{total}` and a per-source breakdown.
- Existing modals (`AddTickerModal.tsx`, `PairPositionsModal.tsx`) share `.modal-backdrop`/`.modal`/`.modal__actions`/`.modal__divider` CSS and close only via an explicit Cancel button (no Escape/backdrop-click handling) — new modal follows the same convention.
- `filterPositions` (`webapp/src/portfolio/filterPositions.ts`) produces the currently-visible `CalculatedPosition[]` used by both `PositionsTable` and `PositionsCardList`, based on search text, "hide empty", and "only in index" toggles.

## Part 1: Reset manual shares button

### Component: `ResetManualSharesModal.tsx`

New file: `webapp/src/components/ResetManualSharesModal.tsx`.

- Props: `{ positions: { ticker: string; shortName: string; manualSharesOwned: number }[]; onConfirm: () => void; onClose: () => void }`. `positions` is pre-filtered by the caller to only the affected set (see below) — the modal does no filtering itself.
- Renders `.modal-backdrop` > `.modal` with:
  - `<h2>Обнулить вручную введённое количество</h2>`
  - A summary line: `Будет обнулено позиций: {positions.length}`.
  - A "Детали" toggle button (local `useState<boolean>`, default collapsed) that reveals a `.modal table` listing each affected position: тикер, короткое имя, текущее ручное количество → 0.
  - `.modal__actions`: "Обнулить" button (calls `onConfirm`, styled as a destructive-ish primary action — reuse existing button styling, no new CSS class needed) and "Отмена" button (calls `onClose`).
- No Escape/backdrop-click dismissal, matching `AddTickerModal`/`PairPositionsModal`.

### Wiring: `PortfolioTab.tsx`

- Compute `affectedPositions = filteredPositions.filter(p => p.manualSharesOwned !== 0)` alongside the existing `filteredPositions` memo (reuses the same list already computed for the table/cards — visibility = whatever search/hide-empty/only-in-index currently show).
- New button in `.action-row`, after "Парные позиции": `Сбросить вручную введённое`, `disabled={affectedPositions.length === 0}`.
- New state `showResetManualShares` (boolean), toggled by the button; renders `<ResetManualSharesModal>` when true, passing `affectedPositions` (mapped to the modal's minimal prop shape) and an `onConfirm` that:
  1. Builds a `Set<string>` of affected tickers.
  2. `setFile({ ...file, positions: file.positions.map(p => tickerSet.has(p.ticker) ? { ...p, sharesOwned: 0 } : p) })`.
  3. Closes the modal.
- `onClose` just closes the modal without touching `file`.

This only ever touches `file.positions[].sharesOwned` for tickers that are both currently visible and currently non-zero — hidden positions and broker holdings are never touched.

## Part 2: Click-to-edit shares cell

### Component: `SharesOwnedCell.tsx`

New file: `webapp/src/components/SharesOwnedCell.tsx`. Single responsibility: toggle between a display view (total) and an edit view (manual value), independently of the breakdown popover.

```tsx
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

Behavior notes:
- Entering edit mode does not reset any value — it just changes which number is shown and how (input vs button) and seeds the input from the live `manualSharesOwned` prop.
- Every keystroke commits immediately via `onChange` → `onChangeSharesOwned(ticker, value)`, identical to today's per-keystroke save semantics for this field and for `Коэф-т`. No new draft/cancel state.
- Blur, Enter, or Escape all just exit edit mode (`inputRef.current?.blur()` triggers the `onBlur` handler for Enter/Escape, keeping a single exit path). Whatever was last typed stays saved — there is no "cancel and revert" behavior, consistent with the rest of the app.
- `total` is recalculated by the parent (`p.sharesOwned` on `CalculatedPosition`) after each `onChange`, so the display automatically reflects the new total once the cell exits edit mode.

### Wiring: `PositionsTable.tsx` and `PositionCard.tsx`

In both files, replace the `<input type="number" value={p.manualSharesOwned} onChange={...} />` block with:

```tsx
<SharesOwnedCell
  manualSharesOwned={p.manualSharesOwned}
  total={p.sharesOwned}
  onChange={(value) => onChangeSharesOwned(p.ticker, value)}
/>
```

The adjacent `SharesBreakdownPopover` (rendered only when `p.brokerHoldings.length > 0`) is unchanged and stays a sibling of `SharesOwnedCell` in the same cell/row.

### CSS

Add `.shares-owned-cell__display` near the existing `.positions-table input[type="number"]` rules (`webapp/src/styles.css:416-428`): same width/alignment/font as the number input it replaces (`width: 72px; text-align: right; font-family: var(--font-mono); background: transparent; border: none; border-bottom: 1px solid transparent; cursor: pointer;`), so clicking into edit mode doesn't shift layout. On hover/focus, `border-bottom-color: var(--accent)` to hint it's interactive, mirroring `.positions-table input[type="number"]:focus`.

For `PositionCard.tsx`, the same class is reused; `.position-card__row` already lays out label/value pairs with `input[type="number"]` sized via `.position-card__row input[type="number"]` (`styles.css:823`) — add the same selector for `.shares-owned-cell__display` so mobile sizing matches.

## Testing

- `SharesOwnedCell.test.tsx`: renders display mode showing `total`; click switches to input showing `manualSharesOwned`; typing calls `onChange` per keystroke; blur exits back to display mode; Enter/Escape while focused also exit edit mode.
- `ResetManualSharesModal.test.tsx`: renders summary count; "Детали" toggle reveals/hides the table of affected positions; "Обнулить" calls `onConfirm`; "Отмена" calls `onClose` without calling `onConfirm`.
- `PortfolioTab.test.tsx` (extend existing, if present, or add coverage at the level it's currently tested): reset button disabled when no visible position has a non-zero manual value; confirming the modal zeroes `sharesOwned` only for visible+non-zero tickers, leaves others untouched.
- Update any existing `PositionsTable.test.tsx` / `PositionCard.test.tsx` / `PositionsCardList.test.tsx` assertions that currently query the old `<input>` bound to `manualSharesOwned` directly, since the default rendered element changes from an input to a button showing the total.

## Out of scope

- Coefficients (`Коэф-т`) — not affected by the reset button.
- Broker holdings (`brokerHoldings[]`) — never reset or edited by either feature.
- `SharesBreakdownPopover` internals — unchanged.
- Undo for the reset action — the confirmation modal with a details view is the agreed-upon safety mechanism; no separate undo/history was requested.
