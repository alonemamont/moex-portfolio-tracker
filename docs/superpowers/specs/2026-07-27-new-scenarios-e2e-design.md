# E2E coverage for new user scenarios

## Goal

Cover recently added dividend-calendar flow and zero rebalance-threshold behavior in browser E2E tests.

## Scope

Add four independent Playwright specs under `webapp/e2e`:

1. `dividends-empty.spec.ts` starts empty portfolio, opens `Дивиденды`, and asserts update control is disabled with no-stock empty state.
2. `dividends-update.spec.ts` creates portfolio holding, mocks ISS dividend history, updates dividend data, and asserts rendered event plus expected-income total.
3. `rebalance-default-threshold.spec.ts` creates deterministic calculated portfolio, opens `Ребаланс` in `Мин. сделок` mode, and asserts default threshold is `0.01`.
4. `rebalance-zero-threshold.spec.ts` uses same deterministic portfolio, sets threshold to `0`, and asserts input remains `0` and plan is calculated rather than using default threshold.

## Test design

Each test owns setup and mocks. No test depends on execution order or state from another test. New ISS fixture helpers may be added only if current `e2e/fixtures/iss.ts` cannot express dividend history responses.

Tests use role, label, and visible-text locators. They mock all network data required for deterministic portfolio prices, index composition, and dividend events. Existing golden-path and broker-sync tests remain unchanged.

## Verification

Run `npm run test:e2e` from `webapp`. All four new specs and existing E2E specs must pass.
