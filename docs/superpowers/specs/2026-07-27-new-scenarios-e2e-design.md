# E2E: new dividend and rebalance scenarios

## Goal and traceability

Add browser E2E coverage for recently shipped behavior:

- [Dividend calendar design](2026-07-27-dividend-calendar-design.md), especially sections 5--7 and empty states 7.1--7.3.
- [Rebalance modes design](2026-07-27-rebalance-modes-design.md), sections 5.2 and 6.
- `RebalanceTab.tsx` / `parseThresholdInput`: an explicitly entered `0` must reach `buildRebalancePlan`, rather than fall back to `0.01`. Commit `aaa0032` is historical context only.

## In scope

Five isolated Playwright specs under `webapp/e2e`. Each owns its browser page, routes, and portfolio setup; tests may run in any order.

| Spec | Given | When | Then |
| --- | --- | --- | --- |
| `dividends-empty.spec.ts` | Newly created portfolio contains only zero-share index positions. | User opens `Дивиденды`. | `Обновить дивиденды` is disabled and `Нет позиций с акциями` is visible. |
| `dividends-never-fetched.spec.ts` | Portfolio owns 10 `SBER`; dividend history has not been fetched. | User opens `Дивиденды`. | Enabled update button and `Нажмите Обновить` are visible. |
| `dividends-update.spec.ts` | Portfolio owns 10 `SBER`; mock returns one valid future event. | User clicks `Обновить дивиденды`. | Request targets `/securities/SBER/dividends.xml`; table row shows `SBER`, `2099-01-01`, `12.5`, `10`, `125`; footer shows expected-income total `125`. |
| `dividends-no-upcoming.spec.ts` | Portfolio owns 10 `SBER`; mock history is valid but empty. | User clicks `Обновить дивиденды`. | `Ближайших отсечек в ISS нет` replaces pre-fetch copy; no dividend table is rendered. |
| `rebalance-threshold.spec.ts` | Deterministic portfolio and live market state defined below. | User selects `Мин. сделок`, enters budget, observes default, then enters `0`. | Default input is `0.01`; with `0.01`, `Порог прироста соответствия не достигнут` and no plan row; with `0`, input remains `0` and plan contains `TST`. |

Russian text above is exact visible text; numeric checks may normalize locale grouping/decimal formatting while retaining listed values.

## Fixture contract

`e2e/fixtures/iss.ts` must expose explicit options, for example:

```ts
mockIssRoutes(page, {
  composition: [{ ticker: "TST", weight: 100 }],
  securities: {
    TST: { price: 100, lotSize: 1 },
    CSH: { price: 1000, lotSize: 1 },
    SBER: { price: 100, lotSize: 1 },
  },
  dividendsByTicker: {
    SBER: [{ registryCloseDate: "2099-01-01", value: 12.5 }],
  },
});
```

Fixture serializes `dividendsByTicker[ticker]` as ISS XML:

```xml
<document><data id="dividends"><rows>
  <row registryclosedate="2099-01-01" value="12.5" />
</rows></data></document>
```

Route matching distinguishes composition (`/analytics/`), security data (`securities.xml`), and the single dividend endpoint (`/securities/{TICKER}/dividends.xml`). Both latest-dividend and dividend-history clients use that endpoint and consume same mock XML. Update scenario asserts `SBER` request occurs only after clicking `Обновить дивиденды`, not during its preceding market update. Omitted `dividendsByTicker` returns current empty-dividend XML, preserving existing golden-path behavior. Future fixed date `2099-01-01` avoids dependence on browser clock; no clock freeze required.

## Portfolio setup

Dividend tests use normal UI path: start empty with composition `GAZP`, add `SBER` with 10 shares through `+ Тикер`, wait until `SBER` appears in portfolio table with mocked market price, then open `Дивиденды`. Dividend fixture provides security data for both `GAZP` and `SBER`. No file picker, download, or `addInitScript` is needed.

Rebalance test uses normal UI path and one route fixture:

1. Start empty with index composition only `TST`, weight 100%, price 100, lot size 1.
2. Add out-of-index `CSH` with 100 shares; fixture price is 1,000, so automatic market update gives portfolio value 100,000 and `TST` has zero shares.
3. Open `Ребаланс`, select `Мин. сделок`, set budget `100`.

One affordable `TST` lot costs 100 and raises average compliance by approximately `0.001`, below `0.01` but not below `0`. This is contrasting oracle: default threshold produces `threshold_not_met`; zero produces a `TST` plan row. It detects both zero-input parsing and input-to-domain wiring regressions. Budget is mandatory and entered before either assertion.

## Out of scope

- Dividend partial/all-failure error paths and persisted snapshot merge behavior.
- Save/download and reload persistence of dividend events.
- Tauri desktop E2E; these tests target existing browser Playwright project only.
- Other rebalance modes, CSV/TSV export, pairs, index switching, mobile layout.
- CI job changes: existing `npm run test:e2e` job discovers new files automatically; configuration stays unchanged.

## Acceptance and verification

- Exactly five new standalone E2E spec files listed above; existing E2E specs unchanged.
- No request reaches real MOEX ISS.
- Dividend fixture default remains empty, so current golden-path test behavior is unchanged.
- Each test asserts user-visible result, not only input presence or HTTP completion.
- `npm run test:e2e` from `webapp` passes all current and new tests.
