# Portfolio UX improvements — design

Date: 2026-07-12
Status: approved

## Scope

Three independent UX fixes to the portfolio tracker, requested together:

1. Move "Общая стоимость" / "Среднее соответствие" from a footer at the bottom of the Portfolio tab into an always-visible dashboard at the top of the app.
2. Fix auto-update-after-file-load, which is wired but silently fails to fire on the first load of a session.
3. Add a UI to add a ticker that isn't in the current position list yet, with live existence validation against the MOEX ISS API.

Each is small enough to implement independently; they're bundled into one spec because they touch overlapping files (`PortfolioTab.tsx`, `PortfolioContext`).

## 1. Always-visible dashboard

**Problem:** total portfolio value and average compliance currently render at the bottom of `PortfolioTab` (`.portfolio-summary`), only visible on the Portfolio tab, after scrolling past the table.

**Change:** extract the derived-values calculation (`buildCalculatedPositions` + totals) that currently lives inline in `PortfolioTab` into a shared hook:

```ts
// webapp/src/portfolio/useCalculatedPositions.ts
export function useCalculatedPositions(): {
  calculated: CalculatedPosition[];
  portfolioValue: number;
  avgCompliance: number | null;
}
```

It reads `file`/`liveByTicker` from `usePortfolio()` internally, resolves sectors via `createSectorResolver(SECTORS_DEFAULT, file.sectors)`, and memoizes on `[file, liveByTicker]` — same logic `PortfolioTab` has today, just lifted out.

Add `components/Dashboard.tsx`, a small stat-tile bar (reusing `.portfolio-summary` styling, renamed `.dashboard`) that calls the hook and renders the two numbers. Render it in `AppShell` (`App.tsx`) between `<Header>` and the tab `<nav>`, gated on `file` truthy — so it's visible across Portfolio/Charts/Sectors tabs, not just Portfolio.

`PortfolioTab` switches its inline `useMemo` block to `useCalculatedPositions()` and drops the `.portfolio-summary` block at the bottom entirely.

`SectorsTab` has its own separate `buildCalculatedPositions` call today (pre-existing duplication) — left as-is, out of scope for this change.

## 2. Auto-update-after-load bugfix

**Root cause (confirmed via reproduction):** `main.tsx` wraps the app in `React.StrictMode`, which double-invokes effects on a component's first mount (setup → cleanup → setup, synchronously, in dev). `PortfolioTab` is only mounted once `file` is truthy — i.e. exactly at the moment a file is first loaded into an empty session, `file` and `autoUpdateSignal` change together and `PortfolioTab` mounts fresh for the first time.

Current effect (`PortfolioTab.tsx:56-67`):
```ts
useEffect(() => {
  if (autoUpdateSignal !== lastAutoSignal.current) {
    lastAutoSignal.current = autoUpdateSignal;
    if (autoUpdateSignal > 0) {
      const timer = setTimeout(() => void handleUpdate(), 0);
      return () => clearTimeout(timer);
    }
  }
}, [autoUpdateSignal]);
```

Under StrictMode's double-invoke: first setup marks `lastAutoSignal.current = 1` and schedules a timer; its cleanup immediately cancels that timer; the second setup sees `1 !== 1` is false and schedules nothing. Net result: zero `handleUpdate()` calls on first mount. Verified empirically with a Playwright-driven load of a sample `portfolio.json` against the dev server — no MOEX network request fired on first load; loading a second file (component already mounted, not a fresh-mount case) correctly triggered a request. Manual "Обновить" click always works (confirms the API path itself is fine).

**Fix:** remove the `setTimeout`/cleanup indirection — it was solving a non-problem (calling `setState` from inside `useEffect` doesn't need deferring) while introducing the StrictMode incompatibility:

```ts
useEffect(() => {
  if (autoUpdateSignal !== lastAutoSignal.current) {
    lastAutoSignal.current = autoUpdateSignal;
    if (autoUpdateSignal > 0) {
      void handleUpdate();
    }
  }
}, [autoUpdateSignal]);
```

Under StrictMode this now runs exactly once (second setup is a no-op via the ref guard, first setup's `handleUpdate()` call isn't cancellable and isn't cancelled).

## 3. Add-ticker modal

**Context that shapes this feature:** `mergeMarketData` (`domain/merge.ts`) already auto-adds every constituent of the currently selected index to `positions` (coefficient 1, sharesOwned 0) on every market update. So tickers that are *in* the selected index never need manual adding — they show up automatically, just with quantity 0. The real gap this feature fills is: entering a ticker that's **outside** the selected index (e.g. a personal holding not part of IMOEX/MOEXBC/MOEX10), which the update loop will never add on its own.

Given that, the ticker source is manual entry + live validation only (no "pick from list" — MOEX ISS has no single-call full-securities listing, and an index-composition list would just duplicate what auto-merge already adds).

**UI:** `+ Тикер` button in `PortfolioTab`'s controls row, next to `Обновить`. Opens `AddTickerModal` (same `.modal-backdrop`/`.modal` styling as the existing `SectorOverrideModal`):

- Ticker text input, uppercased on change.
- Debounced (~400ms) live check: calls `fetchSecurities([ticker])` from `iss/client.ts`; shows one of `checking… / found "<shortName>" / тикер не найден`.
- Also checks the ticker isn't already in `file.positions` (case-insensitive) — shows `тикер уже в портфеле` if so, since editing an existing row's quantity is done directly in the table, not through this modal.
- Quantity (`sharesOwned`) number input, required, ≥ 0.
- Ok disabled until: ticker found via live check AND not a duplicate AND quantity entered. Cancel closes without changes.

**On confirm:** `PortfolioTab` appends `{ ticker, coefficient: 1, sharesOwned }` to `file.positions` (coefficient defaults to 1, matching the convention already used in `createEmptyPortfolio.ts`/`merge.ts`), and immediately runs a market update against that new file state — reusing `handleUpdate`, refactored to accept an optional file argument:

```ts
async function handleUpdate(fileOverride?: PortfolioFile) {
  const target = fileOverride ?? file;
  if (!target) return;
  // ...existing body, using `target` instead of `file`
}
```

This avoids a stale-closure bug (calling `handleUpdate()` right after `setFile()` would otherwise read the pre-add `file` from the render closure) and means the newly added row gets live price/sector/status data immediately instead of sitting with dashes until the next update.

## Testing plan

- `useCalculatedPositions`: unit test mirroring the existing calc coverage already exercised via `PortfolioTab`'s current inline logic (no new domain logic, just relocated).
- `PortfolioTab` effect fix: no existing component-level tests exist for `PortfolioTab`/`App`/`Header` (checked — only domain/file/portfolio-logic unit tests exist today). Fixing this bug doesn't need a new component test harness; the fix is covered by manual verification (repeat the Playwright repro from this design session against the fixed code, confirm a MOEX request fires on first load).
- `AddTickerModal`: unit test the validation state machine (found / not-found / duplicate / debounce) with a stubbed `fetchSecurities`, same stubbing pattern as `iss/client.test.ts`.
- Manual verification in-browser for all three: dashboard visible across tabs, first-load auto-update fires, add-ticker flow end to end against the real MOEX API.

## Out of scope

- Refactoring `SectorsTab`'s separate calculated-positions duplication.
- A "pick from list" ticker source.
- Editing/removing positions from the add-ticker modal (existing table inputs already cover editing; removing a position isn't part of this request).
