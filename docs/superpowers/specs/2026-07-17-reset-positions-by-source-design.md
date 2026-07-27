# Reset Positions by Source — Design

**Goal:** Replace the single-purpose "Сбросить вручную введённое" button/modal with a "Сбросить позиции" button that lets the user pick *which source* to reset — manually-entered share quantities, or a specific broker connection's synced holdings — before showing the same kind of confirmation modal as today.

**Scope:** Positions table/cards action-row only. Two sources of share-quantity data are resettable: `Position.sharesOwned` (manual) and `Position.brokerHoldings[]` (per broker connection). Coefficients (`Коэф-т`) are untouched. Resetting a broker connection's holdings deletes those `brokerHoldings` entries locally; a subsequent auto-sync with that broker may reintroduce them if the broker still reports the position — this is expected and out of scope to prevent.

**Tech Stack:** React 18 + TypeScript (strict), Vitest + @testing-library/react, no new dependencies.

## Background (current state)

- `Position.sharesOwned` is the manual quantity; `Position.brokerHoldings[]` (`{ connectionId, shares, syncedAt }`) holds broker-synced quantities per `BrokerConnection` (`file.brokerConnections[]`, each with `id`, `brokerId`, `accountId`, `label`).
- `CalculatedPosition.manualSharesOwned` = `position.sharesOwned`; `CalculatedPosition.brokerHoldings` carries the raw per-connection entries through unchanged (see `buildCalculatedPositions.ts`).
- `PortfolioTab.tsx` currently computes `affectedPositions = filteredPositions.filter(p => p.manualSharesOwned !== 0)`, renders a "Сбросить вручную введённое" button (disabled when empty), and on confirm zeroes `sharesOwned` for the affected, currently-visible tickers via `ResetManualSharesModal`.
- `applySyncDiff` (`brokers/syncDiff.ts`) already establishes the convention that "no holding" is represented by *absence* of a `brokerHoldings` entry for that `connectionId`, not a zero-shares entry — the reset-by-broker path follows the same convention (filters the entry out entirely).
- Existing modals (`AddTickerModal`, `PairPositionsModal`, `ResetManualSharesModal`) share `.modal-backdrop`/`.modal`/`.modal__actions` CSS, no Escape/backdrop-click dismissal.
- `filterPositions` produces the currently-visible `CalculatedPosition[]` used by both `PositionsTable` and `PositionsCardList`; "visible" scope for reset matches today's behavior (search/hide-empty/only-in-index).

## Flow

1. User clicks "Сбросить позиции" in `.action-row` (renamed from "Сбросить вручную введённое").
2. `ResetSourceModal` opens: lists "Ручные позиции (N)" plus one row per `file.brokerConnections` entry ("{connection.label} (N)"), where N is the count of currently-visible positions affected by that source. A row is disabled when N = 0. Clicking an enabled row advances directly to the confirmation step (no separate "next" click). If `file.brokerConnections` is empty, only "Ручные позиции" is shown (functionally identical to today for users with no broker connections).
3. `ResetPositionsModal` (generalized from `ResetManualSharesModal`) opens for the chosen source: title reflects the source, summary count, "Детали" toggle reveals a table of `тикер | короткое имя | текущее значение → 0`, actions are "Обнулить" (confirm), "Назад" (return to step 2), "Отмена" (close the whole flow).
4. Confirming applies the reset for that source only, across the same currently-visible affected tickers computed in step 2, and closes the flow.

## State (`PortfolioTab.tsx`)

```ts
type ResetSource = { type: "manual" } | { type: "broker"; connectionId: string };
type ResetFlow = { step: "source" } | { step: "confirm"; source: ResetSource } | null;
const [resetFlow, setResetFlow] = useState<ResetFlow>(null);
```

- Button: `onClick={() => setResetFlow({ step: "source" })}`, `disabled={isUpdating || (affectedManual.length === 0 && every connection count === 0)}`.
- `ResetSourceModal.onSelect(key)` resolves `key` ("manual" or a `connectionId`) to a `ResetSource` and sets `{ step: "confirm", source }`.
- `ResetPositionsModal.onBack` sets `{ step: "source" }`. `onClose` and successful `onConfirm` both set `resetFlow = null`.

## Data computation

```ts
const affectedManual = filteredPositions.filter(p => p.manualSharesOwned !== 0);

const affectedByConnection = new Map(
  file.brokerConnections.map(c => [
    c.id,
    filteredPositions.filter(p =>
      (p.brokerHoldings ?? []).some(h => h.connectionId === c.id && h.shares !== 0)
    ),
  ])
);
```

Source options passed to `ResetSourceModal`:

```ts
[
  { key: "manual", label: "Ручные позиции", count: affectedManual.length },
  ...file.brokerConnections.map(c => ({
    key: c.id,
    label: c.label,
    count: affectedByConnection.get(c.id)?.length ?? 0,
  })),
]
```

## Components

### `ResetSourceModal.tsx` (new)

```ts
{
  options: { key: string; label: string; count: number }[];
  onSelect: (key: string) => void;
  onClose: () => void;
}
```

Renders `.modal-backdrop > .modal`: `<h2>Сбросить позиции</h2>`, one button per option (`disabled={count === 0}`, text `` `${label} (${count})` ``, `onClick={() => onSelect(option.key)}`), `.modal__actions` with a single "Отмена" button calling `onClose`.

### `ResetPositionsModal.tsx` (renamed/generalized from `ResetManualSharesModal.tsx`)

```ts
{
  title: string;
  positions: { ticker: string; shortName: string; currentValue: number }[];
  onConfirm: () => void;
  onBack: () => void;
  onClose: () => void;
}
```

Same internals as today's `ResetManualSharesModal` (summary line `Будет обнулено позиций: {positions.length}`, "Детали" toggle, table rendering `${currentValue} → 0`), with the heading driven by `title` and a third `.modal__actions` button "Назад" (`onClick={onBack}`) placed between "Обнулить" and "Отмена".

## Wiring in `PortfolioTab.tsx`

```tsx
{resetFlow?.step === "source" && (
  <ResetSourceModal
    options={resetSourceOptions}
    onSelect={(key) => setResetFlow({ step: "confirm", source: resolveSource(key) })}
    onClose={() => setResetFlow(null)}
  />
)}
{resetFlow?.step === "confirm" && (
  <ResetPositionsModal
    title={confirmTitle}
    positions={confirmPositions}
    onConfirm={() => { applyReset(resetFlow.source); setResetFlow(null); }}
    onBack={() => setResetFlow({ step: "source" })}
    onClose={() => setResetFlow(null)}
  />
)}
```

`applyReset`:

```ts
function applyReset(source: ResetSource) {
  if (source.type === "manual") {
    const tickers = new Set(affectedManual.map(p => p.ticker));
    setFile({
      ...file,
      positions: file.positions.map(p => tickers.has(p.ticker) ? { ...p, sharesOwned: 0 } : p),
    });
  } else {
    const affected = affectedByConnection.get(source.connectionId) ?? [];
    const tickers = new Set(affected.map(p => p.ticker));
    setFile({
      ...file,
      positions: file.positions.map(p =>
        tickers.has(p.ticker)
          ? { ...p, brokerHoldings: (p.brokerHoldings ?? []).filter(h => h.connectionId !== source.connectionId) }
          : p
      ),
    });
  }
}
```

`confirmTitle`/`confirmPositions` derive from `resetFlow.source`:
- manual: `title = "Обнулить вручную введённое количество"`; `positions` from `affectedManual`, `currentValue = p.manualSharesOwned`.
- broker: `title = \`Обнулить холдинги брокера «${connection.label}»\``; `positions` from `affectedByConnection.get(connectionId)`, `currentValue` = the matching `brokerHoldings` entry's `shares` for that connection.

This only ever touches `file.positions[].sharesOwned` or `file.positions[].brokerHoldings[]` for tickers that are both currently visible and affected by the chosen source — hidden positions, other connections, and coefficients are never touched.

## Testing

- `ResetSourceModal.test.tsx`: renders options with counts; disabled option when count is 0; clicking an enabled option calls `onSelect(key)`; "Отмена" calls `onClose`.
- `ResetPositionsModal.test.tsx` (renamed from `ResetManualSharesModal.test.tsx`): existing cases (summary count, Детали toggle, Обнулить calls onConfirm, Отмена calls onClose not onConfirm) plus: renders the given `title`; "Назад" calls `onBack` without calling `onConfirm` or `onClose`.
- `PortfolioTab.test.tsx`: rename "Сбросить вручную введённое" assertions to "Сбросить позиции"; existing manual-reset test extended to click through "Ручные позиции" in the source modal before confirming; new test with a `brokerConnection` + a position carrying a matching `brokerHoldings` entry, verifying: broker option shows correct count, confirming removes only that connection's `brokerHoldings` entry (leaves `sharesOwned` and any other connection's holdings on the same or other positions untouched), and only for currently-visible positions.

## Out of scope

- Preventing broker auto-sync from reintroducing holdings after a broker-source reset.
- `SharesBreakdownPopover` internals.
- Coefficients (`Коэф-т`).
- Undo for either reset action.
