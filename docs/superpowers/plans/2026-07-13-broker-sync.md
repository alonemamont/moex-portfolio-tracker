# Broker Holdings Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pull actual share counts from a connected broker's API (T-Invest/Т-Банк first) into the portfolio, on top of the existing manual `sharesOwned`, with an encrypted-token connection stored in `portfolio.json` and a confirm-before-apply diff preview.

**Architecture:** A new `webapp/src/brokers/` module holds a broker-agnostic `BrokerAdapter` interface, a registry (currently one entry: `tbank`), token encryption (WebCrypto AES-GCM + PBKDF2), a session-scoped decrypted-token cache, and a pure diff/apply pair (`syncDiff.ts`). `Position.sharesOwned` keeps meaning "manual remainder"; `CalculatedPosition.sharesOwned` becomes the computed total (manual + every broker connection's contribution), mirroring how the app already separates file-persisted `Position` fields from computed `CalculatedPosition` fields. Network orchestration for a sync run lives in `webapp/src/portfolio/runBrokerSync.ts`, following the same client → orchestration → component layering already used for market updates (`iss/client.ts` → `portfolio/runMarketUpdate.ts` → `Header.tsx`/`PortfolioTab.tsx`).

**Tech Stack:** React 18 + TypeScript (strict), Vite, Vitest, zod. No new runtime dependencies — token IDs use native `crypto.randomUUID()`, encryption uses native `SubtleCrypto`, no uuid/crypto-js package needed.

## Global Constraints

- No backend — the app stays fully static (GitHub Pages); broker API calls are direct `fetch`s from the browser with the user's own bearer token.
- Only the T-Invest (`tbank`) adapter is implemented now. The registry (`webapp/src/brokers/registry.ts`) must not need changes in unrelated files to add a future broker.
- `Position.sharesOwned` (file schema) keeps its current meaning: the manual/no-broker remainder. It is never overwritten with a merged total.
- The user's passphrase is never persisted anywhere (not in `portfolio.json`, not in `localStorage`). Only the *decrypted token* is cached, in `sessionStorage`, for the tab's lifetime.
- Nothing is written to the in-memory `file` (and therefore nothing reaches disk) until the user confirms the sync diff preview.
- A connection's sync is "all or nothing" for its own contribution: a ticker previously synced from that connection but missing from the new response has that connection's contribution zeroed — other connections and the manual value are untouched.
- Network/CORS failures on one connection must not crash the app or block the rest of the UI.
- All npm commands run with cwd `webapp/`.
- `tsconfig.json` has `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules: true` — keep new code compliant.
- The repo has no `@testing-library/react` dependency yet (confirmed: not in `webapp/package.json`). Per the design spec, new modals get manual QA, not component tests, until that dependency lands (tracked separately in the mobile-usability plan) — do not add it in this plan.
- Match existing formatting by hand — no Prettier/ESLint auto-format in this repo.

---

### Task 1: Spike — verify T-Invest API CORS and confirm the `GetPortfolio` response shape

**Files:** none (investigation only; this task produces a go/no-go decision, not code).

**Interfaces:** none.

The design spec calls this out as an unresolved risk that must be checked *before* writing `brokers/tbank/client.ts`: browsers may not be allowed to call `invest-public-api.tbank.ru` cross-origin at all, and the exact JSON field names for `GetPortfolio` positions aren't confirmed. Task 8 below is written against the T-Invest API's publicly documented REST-over-JSON contract (endpoints under `tinkoff.public.invest.api.contract.v1.*`, `GetPortfolio` positions keyed by `figi`/`instrumentUid` with a `{units, nano}` quantity, no `ticker` field on the position itself — resolved separately via `InstrumentsService.GetInstrumentBy`). This step exists to catch it early if that assumption is wrong, and to catch a hard CORS block before any further code is written.

- [ ] **Step 1: Start the dev server**

Run (from `webapp/`): `npm run dev`

Open the printed `http://127.0.0.1:5173` URL in Chrome and open DevTools → Console.

- [ ] **Step 2: Check CORS from the browser console**

Paste and run in the DevTools console:

```js
fetch("https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
})
  .then((r) => r.text().then((body) => console.log("status:", r.status, "body:", body)))
  .catch((err) => console.error("FETCH BLOCKED:", err));
```

No valid token is needed for this check — the goal is only to see whether the browser lets the request through at all.

- [ ] **Step 3: Interpret the result**

- If the console logs a `status:`/`body:` line (even `status: 401` with an auth-error body) — CORS is open. The request reached the server and got a real HTTP response. **Proceed to Task 2.**
- If the console logs `FETCH BLOCKED: TypeError: Failed to fetch` with no status — this is very likely a CORS block (the browser refused to expose the response). **STOP.** Do not proceed to Task 2 through 16 as written. The T-Invest adapter is not implementable without a proxy server, which breaks the "no backend" architectural constraint — this needs a decision from the user (accept a proxy, drop this broker, or pursue a different verification method e.g. a CORS-anywhere style check from an actual deployed GitHub Pages origin) before any further code is written.

- [ ] **Step 4: If CORS is open, do a one-off authenticated check to confirm the response shape**

If you have (or can get) a real T-Invest API token, repeat Step 2's `fetch` with `Authorization: Bearer <token>` added to `headers`, confirm `GetAccounts` returns `{ accounts: [...] }` with `id`/`name` fields, then run the same pattern against `OperationsService/GetPortfolio` (body `{ "accountId": "<id from GetAccounts>", "currency": "RUB" }`) and inspect whether `positions[]` entries carry a `ticker` field directly or only `figi`/`instrumentUid`.

If no token is available yet, skip this step — Task 8/9 are written defensively (they always resolve the ticker via `InstrumentsService.GetInstrumentBy` rather than assuming a `ticker` field exists), so an unconfirmed schema does not block starting. Note any discrepancy found here as a follow-up to reconcile against Task 8's `client.ts` once a token is available.

---

### Task 2: File schema and types — `brokerConnections` / `brokerHoldings`

**Files:**
- Modify: `webapp/src/types.ts` (full file, 65 lines)
- Modify: `webapp/src/file/schema.ts` (full file, 45 lines)
- Modify: `webapp/src/file/schema.test.ts` (full file, 65 lines)
- Modify: `webapp/src/file/createEmptyPortfolio.ts:5-14`
- Modify: `webapp/src/portfolio/useCalculatedPositions.test.ts:17-19`
- Modify: `webapp/src/portfolio/switchIndex.test.ts:8-14`
- Modify: `webapp/src/portfolio/runMarketUpdate.test.ts:8-14`
- Modify: `webapp/src/file/savePortfolioFile.test.ts:5`

**Interfaces:**
- Produces: `BrokerHolding { connectionId: string; shares: number; syncedAt: string }`, `EncryptedToken { ciphertext: string; iv: string; salt: string }`, `BrokerConnection { id: string; brokerId: string; accountId: string; label: string; encryptedToken: EncryptedToken }`. `Position.brokerHoldings?: BrokerHolding[]` (optional — old/freshly-created positions may not have it; every consumer must treat absence as `[]`). `PortfolioFile.brokerConnections: BrokerConnection[]` (required, defaults to `[]` via schema for old files, matching the existing `pairs` precedent). Consumed by every later task.

`Position.brokerHoldings` is deliberately **optional**, not required-with-default, so every existing `Position`/`CalculatedPosition` object literal across the current test suite (`merge.test.ts`, `buildCalculatedPositions.test.ts` — 16+ literals) keeps compiling unchanged. `PortfolioFile.brokerConnections` is required (like `pairs`) because there are only 6 call sites constructing a full `PortfolioFile` literal, all touched by this task.

- [ ] **Step 1: Write the failing schema tests**

Replace the full contents of `webapp/src/file/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parsePortfolioFile, PortfolioFileValidationError } from "./schema";

const valid = {
  version: 1,
  positions: [
    {
      ticker: "SBER",
      coefficient: 1.15,
      sharesOwned: 100,
      brokerHoldings: [{ connectionId: "conn-1", shares: 5, syncedAt: "2026-07-10T09:00:00Z" }],
    },
  ],
  sectors: { SBER: "Финансы" },
  history: [
    {
      timestamp: "2026-07-10T09:00:00Z",
      portfolioValue: 1000,
      avgCompliance: 0.1,
      snapshot: [{ ticker: "SBER", price: 300, weight: 5, status: "in_index" }],
    },
  ],
  pairs: [{ tickers: ["SBER", "SBERP"], coefficient: 1 }],
  brokerConnections: [
    {
      id: "conn-1",
      brokerId: "tbank",
      accountId: "acc-1",
      label: "Т-Банк — брокерский счёт",
      encryptedToken: { ciphertext: "Y2lwaGVy", iv: "aXY=", salt: "c2FsdA==" },
    },
  ],
};

describe("parsePortfolioFile", () => {
  it("accepts a well-formed file and returns it typed", () => {
    expect(parsePortfolioFile(valid)).toEqual(valid);
  });

  it("accepts an empty positions/sectors/history file", () => {
    const empty = { version: 1, positions: [], sectors: {}, history: [] };
    expect(parsePortfolioFile(empty)).toEqual({ ...empty, pairs: [], brokerConnections: [] });
  });

  it("rejects a file with the wrong version", () => {
    expect(() => parsePortfolioFile({ ...valid, version: 2 })).toThrow(PortfolioFileValidationError);
  });

  it("rejects a file missing the positions field", () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.positions;
    expect(() => parsePortfolioFile(rest)).toThrow(/positions/);
  });

  it("rejects a position with a non-numeric coefficient", () => {
    const bad = {
      ...valid,
      positions: [{ ticker: "SBER", coefficient: "high", sharesOwned: 1, brokerHoldings: [] }],
    };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });

  it("rejects non-object input", () => {
    expect(() => parsePortfolioFile(null)).toThrow(PortfolioFileValidationError);
    expect(() => parsePortfolioFile("not json")).toThrow(PortfolioFileValidationError);
  });

  it("defaults pairs to [] when the field is absent (old files without the pairs field)", () => {
    const withoutPairs: Record<string, unknown> = { ...valid };
    delete withoutPairs.pairs;
    expect(parsePortfolioFile(withoutPairs)).toEqual({ ...withoutPairs, pairs: [] });
  });

  it("rejects a pair with fewer than 2 tickers", () => {
    const bad = { ...valid, pairs: [{ tickers: ["SBER"], coefficient: 1 }] };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });

  it("rejects a pair with a non-numeric coefficient", () => {
    const bad = { ...valid, pairs: [{ tickers: ["SBER", "SBERP"], coefficient: "high" }] };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });

  it("defaults position.brokerHoldings to [] when absent (old files without broker sync)", () => {
    const oldPosition = { ticker: "SBER", coefficient: 1.15, sharesOwned: 100 };
    const oldFile = { ...valid, positions: [oldPosition] };
    const result = parsePortfolioFile(oldFile);
    expect(result.positions[0].brokerHoldings).toEqual([]);
  });

  it("defaults brokerConnections to [] when absent (old files without broker sync)", () => {
    const withoutConnections: Record<string, unknown> = { ...valid };
    delete withoutConnections.brokerConnections;
    expect(parsePortfolioFile(withoutConnections)).toEqual({ ...withoutConnections, brokerConnections: [] });
  });

  it("rejects a brokerConnection missing encryptedToken fields", () => {
    const bad = {
      ...valid,
      brokerConnections: [
        {
          id: "conn-1",
          brokerId: "tbank",
          accountId: "acc-1",
          label: "X",
          encryptedToken: { ciphertext: "c", iv: "i" },
        },
      ],
    };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });

  it("rejects a brokerHolding missing shares", () => {
    const bad = {
      ...valid,
      positions: [
        {
          ticker: "SBER",
          coefficient: 1,
          sharesOwned: 1,
          brokerHoldings: [{ connectionId: "c", syncedAt: "2026-01-01" }],
        },
      ],
    };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/file/schema.test.ts`
Expected: FAIL — `brokerHoldings`/`brokerConnections` are unrecognized/stripped by the current schema, so `toEqual` mismatches and the two new tests referencing `result.positions[0].brokerHoldings` / rejecting bad `brokerConnections` fail.

- [ ] **Step 3: Update the schema**

Replace the full contents of `webapp/src/file/schema.ts`:

```ts
import { z } from "zod";

export class PortfolioFileValidationError extends Error {}

const brokerHoldingSchema = z.object({
  connectionId: z.string().min(1),
  shares: z.number(),
  syncedAt: z.string().min(1),
});

const positionSchema = z.object({
  ticker: z.string().min(1),
  coefficient: z.number(),
  sharesOwned: z.number(),
  brokerHoldings: z.array(brokerHoldingSchema).default([]),
});

const historySnapshotRowSchema = z.object({
  ticker: z.string().min(1),
  price: z.number().nullable(),
  weight: z.number(),
  status: z.enum(["in_index", "out_of_index"]),
});

const historySnapshotSchema = z.object({
  timestamp: z.string().min(1),
  portfolioValue: z.number(),
  avgCompliance: z.number().nullable(),
  snapshot: z.array(historySnapshotRowSchema),
});

const pairSchema = z.object({
  tickers: z.array(z.string()).min(2),
  coefficient: z.number(),
});

const encryptedTokenSchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  salt: z.string().min(1),
});

const brokerConnectionSchema = z.object({
  id: z.string().min(1),
  brokerId: z.string().min(1),
  accountId: z.string().min(1),
  label: z.string().min(1),
  encryptedToken: encryptedTokenSchema,
});

const portfolioFileSchema = z.object({
  version: z.literal(1),
  positions: z.array(positionSchema),
  sectors: z.record(z.string()),
  history: z.array(historySnapshotSchema),
  pairs: z.array(pairSchema).default([]),
  brokerConnections: z.array(brokerConnectionSchema).default([]),
});

export function parsePortfolioFile(raw: unknown): z.infer<typeof portfolioFileSchema> {
  const result = portfolioFileSchema.safeParse(raw);
  if (!result.success) {
    throw new PortfolioFileValidationError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return result.data;
}
```

- [ ] **Step 4: Update `types.ts`**

Replace the full contents of `webapp/src/types.ts`:

```ts
export type IndexStatus = "in_index" | "out_of_index";

export const STATUS_LABELS: Record<IndexStatus, string> = {
  in_index: "в индексе",
  out_of_index: "вне индекса",
};

/** Один источник количества акций от брокерского подключения. */
export interface BrokerHolding {
  connectionId: string;
  shares: number;
  syncedAt: string;
}

/** Ручные поля пользователя — никогда не перезаписываются обновлением рынка. */
export interface Position {
  ticker: string;
  coefficient: number;
  sharesOwned: number;
  brokerHoldings?: BrokerHolding[];
}

/** Live-данные с ISS, пересчитываются заново при каждой загрузке/обновлении. */
export interface LiveData {
  ticker: string;
  shortName: string;
  indexWeight: number;
  price: number | null;
  lotSize: number | null;
  dividendPerShare: number;
  status: IndexStatus;
}

/** Позиция со всеми вычисленными полями — то, что рендерит таблица портфеля. */
export interface CalculatedPosition extends Position, LiveData {
  sector: string;
  targetAllocation: number | null;
  actualShare: number | null;
  compliance: number | null;
  positionValue: number;
  income: number;
  dividendYield: number | null;
  sharesToBuy: number | null;
  buyAmountRub: number | null;
  /** file.sharesOwned до добавления брокерских источников — исходное ручное значение. */
  manualSharesOwned: number;
}

export interface HistorySnapshotRow {
  ticker: string;
  price: number | null;
  weight: number;
  status: IndexStatus;
}

export interface HistorySnapshot {
  timestamp: string;
  portfolioValue: number;
  avgCompliance: number | null;
  snapshot: HistorySnapshotRow[];
}

export interface Pair {
  tickers: string[];
  coefficient: number;
}

export interface EncryptedToken {
  ciphertext: string;
  iv: string;
  salt: string;
}

export interface BrokerConnection {
  id: string;
  brokerId: string;
  accountId: string;
  label: string;
  encryptedToken: EncryptedToken;
}

export interface PortfolioFile {
  version: 1;
  positions: Position[];
  sectors: Record<string, string>;
  history: HistorySnapshot[];
  pairs: Pair[];
  brokerConnections: BrokerConnection[];
}
```

- [ ] **Step 5: Fix the `PortfolioFile` literals broken by the new required `brokerConnections` field**

In `webapp/src/file/createEmptyPortfolio.ts`, change:

```ts
  return {
    version: 1,
    positions: composition.map((c) => ({ ticker: c.ticker, coefficient: 1, sharesOwned: 0 })),
    sectors: {},
    history: [],
    pairs: [],
  };
```

to:

```ts
  return {
    version: 1,
    positions: composition.map((c) => ({ ticker: c.ticker, coefficient: 1, sharesOwned: 0 })),
    sectors: {},
    history: [],
    pairs: [],
    brokerConnections: [],
  };
```

In `webapp/src/portfolio/useCalculatedPositions.test.ts:18`, change:

```ts
  return { version: 1, positions: [], sectors: {}, history: [], pairs: [], ...overrides };
```

to:

```ts
  return { version: 1, positions: [], sectors: {}, history: [], pairs: [], brokerConnections: [], ...overrides };
```

In `webapp/src/portfolio/switchIndex.test.ts:8-14`, change:

```ts
const baseFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 10 }],
  sectors: {},
  history: [{ timestamp: "2026-07-10T00:00:00.000Z", portfolioValue: 100, avgCompliance: 1, snapshot: [] }],
  pairs: [],
};
```

to:

```ts
const baseFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 10 }],
  sectors: {},
  history: [{ timestamp: "2026-07-10T00:00:00.000Z", portfolioValue: 100, avgCompliance: 1, snapshot: [] }],
  pairs: [],
  brokerConnections: [],
};
```

In `webapp/src/portfolio/runMarketUpdate.test.ts:8-14`, change:

```ts
const baseFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 10 }],
  sectors: {},
  history: [],
  pairs: [],
};
```

to:

```ts
const baseFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 10 }],
  sectors: {},
  history: [],
  pairs: [],
  brokerConnections: [],
};
```

In `webapp/src/file/savePortfolioFile.test.ts:5`, change:

```ts
const sample: PortfolioFile = { version: 1, positions: [], sectors: {}, history: [], pairs: [] };
```

to:

```ts
const sample: PortfolioFile = { version: 1, positions: [], sectors: {}, history: [], pairs: [], brokerConnections: [] };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/file/schema.test.ts`
Expected: PASS (13 tests)

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add webapp/src/types.ts webapp/src/file/schema.ts webapp/src/file/schema.test.ts webapp/src/file/createEmptyPortfolio.ts webapp/src/portfolio/useCalculatedPositions.test.ts webapp/src/portfolio/switchIndex.test.ts webapp/src/portfolio/runMarketUpdate.test.ts webapp/src/file/savePortfolioFile.test.ts
git commit -m "feat: add brokerConnections/brokerHoldings to the portfolio file schema"
```

---

### Task 3: `computeTotalSharesOwned` + wire it into `buildCalculatedPositions`

**Files:**
- Modify: `webapp/src/domain/calculations.ts:1` (import line), append new function
- Modify: `webapp/src/domain/calculations.test.ts` (import line + append new `describe` block)
- Modify: `webapp/src/domain/buildCalculatedPositions.ts` (full file, 119 lines)
- Modify: `webapp/src/domain/buildCalculatedPositions.test.ts` (append new `describe` block)

**Interfaces:**
- Consumes: `Position` from Task 2 (`brokerHoldings?: BrokerHolding[]`).
- Produces: `computeTotalSharesOwned(position: Pick<Position, "sharesOwned" | "brokerHoldings">): number`. `CalculatedPosition.sharesOwned` now holds this total; `CalculatedPosition.manualSharesOwned` holds the original `position.sharesOwned`. Consumed by Task 4 (tooltip) and Task 12 (`PositionsTable`).

- [ ] **Step 1: Write the failing test for `computeTotalSharesOwned`**

In `webapp/src/domain/calculations.test.ts`, change the import line:

```ts
import { describe, it, expect } from "vitest";
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computePortfolioValue,
  computeActualShare,
  computeCompliance,
  computeAverageCompliance,
  computeDeviationRub,
  findDeviationExtremes,
  computeDividendYield,
  computeTargetShares,
  computeSharesToBuy,
  computeBuyAmountRub,
  computeCombinedIndexWeight,
  computePairedTargets,
  computePairMemberTargetShares,
} from "./calculations";
```

to:

```ts
import { describe, it, expect } from "vitest";
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computePortfolioValue,
  computeActualShare,
  computeCompliance,
  computeAverageCompliance,
  computeDeviationRub,
  findDeviationExtremes,
  computeDividendYield,
  computeTargetShares,
  computeSharesToBuy,
  computeBuyAmountRub,
  computeCombinedIndexWeight,
  computePairedTargets,
  computePairMemberTargetShares,
  computeTotalSharesOwned,
} from "./calculations";
```

Append at the end of the file:

```ts

describe("computeTotalSharesOwned", () => {
  it("returns the manual sharesOwned when there are no broker holdings", () => {
    expect(computeTotalSharesOwned({ sharesOwned: 10, brokerHoldings: [] })).toBe(10);
  });

  it("returns the manual sharesOwned when brokerHoldings is undefined (old file without broker sync)", () => {
    expect(computeTotalSharesOwned({ sharesOwned: 10, brokerHoldings: undefined })).toBe(10);
  });

  it("sums manual shares with every broker holding's shares", () => {
    const position = {
      sharesOwned: 2,
      brokerHoldings: [
        { connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" },
        { connectionId: "conn-2", shares: 5, syncedAt: "2026-01-01" },
      ],
    };
    expect(computeTotalSharesOwned(position)).toBe(17);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/calculations.test.ts`
Expected: FAIL — `computeTotalSharesOwned` is not exported by `./calculations`

- [ ] **Step 3: Implement `computeTotalSharesOwned`**

In `webapp/src/domain/calculations.ts`, change the import line:

```ts
import { IndexStatus } from "../types";
```

to:

```ts
import { IndexStatus, Position } from "../types";
```

Append at the end of the file:

```ts

export function computeTotalSharesOwned(position: Pick<Position, "sharesOwned" | "brokerHoldings">): number {
  const brokerShares = (position.brokerHoldings ?? []).reduce((sum, h) => sum + h.shares, 0);
  return position.sharesOwned + brokerShares;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/calculations.test.ts`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 5: Write the failing test for `buildCalculatedPositions` using broker holdings**

Append at the end of `webapp/src/domain/buildCalculatedPositions.test.ts` (before the final closing nothing — this file's last line is the closing `});` of the top-level `describe`, so append immediately after that line, as a sibling top-level block):

```ts

describe("buildCalculatedPositions — broker holdings", () => {
  it("adds broker holdings on top of the manual sharesOwned for positionValue/income/sharesToBuy, and exposes manualSharesOwned separately", () => {
    const positions: Position[] = [
      {
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 2,
        brokerHoldings: [{ connectionId: "conn-1", shares: 8, syncedAt: "2026-01-01" }],
      },
    ];
    const liveByTicker = new Map([
      ["GAZP", live({ ticker: "GAZP", indexWeight: 100, price: 100, dividendPerShare: 1 })],
    ]);

    const [result] = buildCalculatedPositions(positions, liveByTicker, () => "Финансы");

    expect(result.manualSharesOwned).toBe(2);
    expect(result.sharesOwned).toBe(10);
    expect(result.positionValue).toBe(1000);
    expect(result.income).toBe(10);
  });

  it("treats a position with no brokerHoldings field the same as an empty array (old files)", () => {
    const positions: Position[] = [{ ticker: "GAZP", coefficient: 1, sharesOwned: 5 }];
    const liveByTicker = new Map([["GAZP", live({ ticker: "GAZP", price: 10 })]]);

    const [result] = buildCalculatedPositions(positions, liveByTicker, () => "Финансы");

    expect(result.sharesOwned).toBe(5);
    expect(result.manualSharesOwned).toBe(5);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/domain/buildCalculatedPositions.test.ts`
Expected: FAIL — `result.manualSharesOwned` is `undefined`, `result.sharesOwned` is `2` not `10` (total not yet wired in)

- [ ] **Step 7: Wire total shares into `buildCalculatedPositions`**

Replace the full contents of `webapp/src/domain/buildCalculatedPositions.ts`:

```ts
import { Position, LiveData, CalculatedPosition, Pair } from "../types";
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computeActualShare,
  computeCompliance,
  computeDividendYield,
  computeTargetShares,
  computeSharesToBuy,
  computeBuyAmountRub,
  computeCombinedIndexWeight,
  computePairedTargets,
  computePairMemberTargetShares,
  computeTotalSharesOwned,
  PairedTargets,
} from "./calculations";

export function buildCalculatedPositions(
  positions: Position[],
  liveByTicker: Map<string, LiveData>,
  resolveSector: (ticker: string) => string,
  pairs: Pair[] = []
): CalculatedPosition[] {
  const withLive = positions.map((position) => {
    const live = liveByTicker.get(position.ticker.toUpperCase());
    const fallbackLive: LiveData = {
      ticker: position.ticker,
      shortName: position.ticker,
      indexWeight: 0,
      price: null,
      lotSize: null,
      dividendPerShare: 0,
      status: "out_of_index",
    };
    const resolvedLive = live ?? fallbackLive;
    const totalShares = computeTotalSharesOwned(position);
    const positionValue = computePositionValue(resolvedLive.price, totalShares);
    return { position, live: resolvedLive, positionValue, totalShares };
  });

  const portfolioValue = withLive.reduce((sum, { positionValue }) => sum + positionValue, 0);

  const pairByTicker = new Map<string, Pair>();
  for (const pair of pairs) {
    for (const ticker of pair.tickers) pairByTicker.set(ticker, pair);
  }

  const memberInputs = withLive.map(({ position, live, totalShares }) => ({
    ticker: position.ticker,
    indexWeight: live.indexWeight,
    status: live.status,
    price: live.price,
    sharesOwned: totalShares,
  }));

  const pairedTargetsByPair = new Map<Pair, PairedTargets>();
  for (const pair of pairs) {
    pairedTargetsByPair.set(pair, computePairedTargets(pair, memberInputs, portfolioValue));
  }

  return withLive.map(({ position, live, positionValue, totalShares }) => {
    const pair = pairByTicker.get(position.ticker);

    let coefficient: number;
    let targetAllocation: number | null;
    let actualShare: number | null;
    let compliance: number | null;
    let sharesToBuy: number | null;
    let buyAmountRub: number | null;

    if (pair) {
      const pairedTargets = pairedTargetsByPair.get(pair)!;
      coefficient = pair.coefficient;
      targetAllocation = pairedTargets.targetAllocation;
      actualShare = pairedTargets.actualShare;
      compliance = pairedTargets.compliance;

      const combinedIndexWeight = computeCombinedIndexWeight(
        memberInputs.filter((m) => pair.tickers.includes(m.ticker))
      );
      const targetShares = computePairMemberTargetShares(
        targetAllocation,
        combinedIndexWeight,
        live.indexWeight,
        portfolioValue,
        live.price
      );
      sharesToBuy = computeSharesToBuy(targetShares, totalShares);
      buyAmountRub = computeBuyAmountRub(sharesToBuy, live.price);
    } else {
      coefficient = position.coefficient;
      targetAllocation = computeTargetAllocation(live.indexWeight, position.coefficient, live.status);
      actualShare = computeActualShare(positionValue, portfolioValue);
      compliance = computeCompliance(actualShare, targetAllocation);
      const targetShares = computeTargetShares(targetAllocation, portfolioValue, live.price);
      sharesToBuy = computeSharesToBuy(targetShares, totalShares);
      buyAmountRub = computeBuyAmountRub(sharesToBuy, live.price);
    }

    const income = computeIncome(live.dividendPerShare, totalShares);
    const dividendYield = computeDividendYield(live.dividendPerShare, live.price);

    return {
      ...position,
      ...live,
      ticker: position.ticker,
      coefficient,
      sharesOwned: totalShares,
      manualSharesOwned: position.sharesOwned,
      sector: resolveSector(position.ticker),
      targetAllocation,
      actualShare,
      compliance,
      positionValue,
      income,
      dividendYield,
      sharesToBuy,
      buyAmountRub,
    };
  });
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/domain/buildCalculatedPositions.test.ts`
Expected: PASS (all tests, including the 2 new ones — this also confirms every pre-existing test in this file, none of which set `brokerHoldings`, still passes unchanged)

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add webapp/src/domain/calculations.ts webapp/src/domain/calculations.test.ts webapp/src/domain/buildCalculatedPositions.ts webapp/src/domain/buildCalculatedPositions.test.ts
git commit -m "feat: sum broker holdings into CalculatedPosition.sharesOwned"
```

---

### Task 4: `buildSharesBreakdownTooltip` (pure tooltip text builder)

**Files:**
- Create: `webapp/src/domain/sharesBreakdown.ts`
- Create: `webapp/src/domain/sharesBreakdown.test.ts`

**Interfaces:**
- Consumes: `CalculatedPosition.manualSharesOwned`/`.sharesOwned`/`.brokerHoldings` from Task 2/3.
- Produces: `buildSharesBreakdownTooltip(position: Pick<CalculatedPosition, "manualSharesOwned" | "brokerHoldings" | "sharesOwned">, labelByConnectionId: Map<string, string>): string`. Consumed by Task 12 (`PositionsTable`).

- [ ] **Step 1: Write the failing test**

Create `webapp/src/domain/sharesBreakdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSharesBreakdownTooltip } from "./sharesBreakdown";

describe("buildSharesBreakdownTooltip", () => {
  it("lists each broker connection's label and shares, then the manual portion, then the total", () => {
    const position = {
      manualSharesOwned: 2,
      sharesOwned: 12,
      brokerHoldings: [{ connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" }],
    };
    const labels = new Map([["conn-1", "Т-Банк"]]);

    expect(buildSharesBreakdownTooltip(position, labels)).toBe("Т-Банк: 10, Вручную: 2 = 12");
  });

  it("falls back to the raw connectionId when no label is found", () => {
    const position = {
      manualSharesOwned: 0,
      sharesOwned: 5,
      brokerHoldings: [{ connectionId: "conn-unknown", shares: 5, syncedAt: "2026-01-01" }],
    };
    expect(buildSharesBreakdownTooltip(position, new Map())).toBe("conn-unknown: 5, Вручную: 0 = 5");
  });

  it("shows only the manual portion when there are no broker holdings", () => {
    const position = { manualSharesOwned: 7, sharesOwned: 7, brokerHoldings: [] };
    expect(buildSharesBreakdownTooltip(position, new Map())).toBe("Вручную: 7 = 7");
  });

  it("combines multiple broker connections in order", () => {
    const position = {
      manualSharesOwned: 1,
      sharesOwned: 16,
      brokerHoldings: [
        { connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" },
        { connectionId: "conn-2", shares: 5, syncedAt: "2026-01-01" },
      ],
    };
    const labels = new Map([
      ["conn-1", "Т-Банк"],
      ["conn-2", "БКС"],
    ]);
    expect(buildSharesBreakdownTooltip(position, labels)).toBe("Т-Банк: 10, БКС: 5, Вручную: 1 = 16");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/domain/sharesBreakdown.test.ts`
Expected: FAIL — `Cannot find module './sharesBreakdown'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/domain/sharesBreakdown.ts`:

```ts
import { CalculatedPosition } from "../types";

export function buildSharesBreakdownTooltip(
  position: Pick<CalculatedPosition, "manualSharesOwned" | "brokerHoldings" | "sharesOwned">,
  labelByConnectionId: Map<string, string>
): string {
  const brokerParts = (position.brokerHoldings ?? []).map(
    (holding) => `${labelByConnectionId.get(holding.connectionId) ?? holding.connectionId}: ${holding.shares}`
  );
  const manualPart = `Вручную: ${position.manualSharesOwned}`;
  return [...brokerParts, manualPart].join(", ") + ` = ${position.sharesOwned}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/domain/sharesBreakdown.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add webapp/src/domain/sharesBreakdown.ts webapp/src/domain/sharesBreakdown.test.ts
git commit -m "feat: add buildSharesBreakdownTooltip for the shares-owned hint"
```

---

### Task 5: `brokers/crypto.ts` — AES-GCM token encryption

**Files:**
- Create: `webapp/src/brokers/crypto.ts`
- Create: `webapp/src/brokers/crypto.test.ts`

**Interfaces:**
- Produces: `EncryptedToken` (re-export of the `types.ts` shape), `TokenDecryptionError extends Error`, `encryptToken(token: string, passphrase: string): Promise<EncryptedToken>`, `decryptToken(encrypted: EncryptedToken, passphrase: string): Promise<string>`. Consumed by Task 14 (`AddBrokerConnectionForm`, `BrokerConnectionsModal`).

Uses `SubtleCrypto` (`crypto.subtle`), available in browsers only in secure contexts — `http://127.0.0.1` and `https://` both qualify, so this works in the dev server and in the deployed GitHub Pages build. The test file forces Node's native `crypto.subtle` (not jsdom's, which doesn't implement it) via a per-file Vitest environment override.

- [ ] **Step 1: Write the failing test**

Create `webapp/src/brokers/crypto.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken, TokenDecryptionError } from "./crypto";

describe("encryptToken / decryptToken", () => {
  it("round-trips a token through the correct passphrase", async () => {
    const encrypted = await encryptToken("secret-token-value", "correct horse battery staple");
    const decrypted = await decryptToken(encrypted, "correct horse battery staple");
    expect(decrypted).toBe("secret-token-value");
  });

  it("produces a different ciphertext/iv/salt on each call (random salt+iv)", async () => {
    const first = await encryptToken("secret-token-value", "passphrase");
    const second = await encryptToken("secret-token-value", "passphrase");
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
  });

  it("throws TokenDecryptionError for the wrong passphrase", async () => {
    const encrypted = await encryptToken("secret-token-value", "correct-passphrase");
    await expect(decryptToken(encrypted, "wrong-passphrase")).rejects.toThrow(TokenDecryptionError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/brokers/crypto.test.ts`
Expected: FAIL — `Cannot find module './crypto'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/brokers/crypto.ts`:

```ts
import { EncryptedToken } from "../types";

export class TokenDecryptionError extends Error {}

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptToken(token: string, passphrase: string): Promise<EncryptedToken> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(token)
  );
  return {
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
    salt: toBase64(salt),
  };
}

export async function decryptToken(encrypted: EncryptedToken, passphrase: string): Promise<string> {
  const salt = fromBase64(encrypted.salt);
  const iv = fromBase64(encrypted.iv);
  const key = await deriveKey(passphrase, salt);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      fromBase64(encrypted.ciphertext) as BufferSource
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new TokenDecryptionError("Неверный пароль");
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/brokers/crypto.test.ts`
Expected: PASS (3 tests). If this fails with `crypto.subtle is undefined` under Node, confirm the Node version running Vitest is 19+ (or 18.x with global `crypto` already enabled) — `package.json` doesn't currently pin an `engines` field, so check `node --version` and note a floor if this surfaces.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add webapp/src/brokers/crypto.ts webapp/src/brokers/crypto.test.ts
git commit -m "feat: add AES-GCM token encryption for broker connections"
```

---

### Task 6: `brokers/tokenSession.ts` — session-scoped decrypted-token cache

**Files:**
- Create: `webapp/src/brokers/tokenSession.ts`
- Create: `webapp/src/brokers/tokenSession.test.ts`

**Interfaces:**
- Produces: `getSessionToken(connectionId: string): string | null`, `setSessionToken(connectionId: string, token: string): void`, `clearSessionToken(connectionId: string): void`. Consumed by Task 14 (`BrokerConnectionsModal`).

Mirrors the existing `try/catch`-quiet-degrade `localStorage` pattern in `webapp/src/portfolio/indexPref.ts`, but backed by `sessionStorage` (cleared on tab close, per the design spec) and keyed per connection.

- [ ] **Step 1: Write the failing test**

Create `webapp/src/brokers/tokenSession.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getSessionToken, setSessionToken, clearSessionToken } from "./tokenSession";

beforeEach(() => {
  sessionStorage.clear();
});

describe("tokenSession", () => {
  it("returns null when no token is cached for a connection", () => {
    expect(getSessionToken("conn-1")).toBeNull();
  });

  it("stores and retrieves a token by connection id", () => {
    setSessionToken("conn-1", "decrypted-token");
    expect(getSessionToken("conn-1")).toBe("decrypted-token");
  });

  it("keeps tokens for different connections separate", () => {
    setSessionToken("conn-1", "token-1");
    setSessionToken("conn-2", "token-2");
    expect(getSessionToken("conn-1")).toBe("token-1");
    expect(getSessionToken("conn-2")).toBe("token-2");
  });

  it("removes a token on clear", () => {
    setSessionToken("conn-1", "token-1");
    clearSessionToken("conn-1");
    expect(getSessionToken("conn-1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/brokers/tokenSession.test.ts`
Expected: FAIL — `Cannot find module './tokenSession'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/brokers/tokenSession.ts`:

```ts
const PREFIX = "moex-portfolio-tracker:brokerToken:";

export function getSessionToken(connectionId: string): string | null {
  try {
    return sessionStorage.getItem(PREFIX + connectionId);
  } catch {
    return null;
  }
}

export function setSessionToken(connectionId: string, token: string): void {
  try {
    sessionStorage.setItem(PREFIX + connectionId, token);
  } catch {
    // Swallow error — persistence is best-effort
  }
}

export function clearSessionToken(connectionId: string): void {
  try {
    sessionStorage.removeItem(PREFIX + connectionId);
  } catch {
    // Swallow error — persistence is best-effort
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/brokers/tokenSession.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add webapp/src/brokers/tokenSession.ts webapp/src/brokers/tokenSession.test.ts
git commit -m "feat: cache decrypted broker tokens in sessionStorage"
```

---

### Task 7: `brokers/types.ts` + `brokers/registry.ts`

**Files:**
- Create: `webapp/src/brokers/types.ts`
- Create: `webapp/src/brokers/registry.ts`
- Create: `webapp/src/brokers/registry.test.ts`

**Interfaces:**
- Produces: `BrokerAccount { id: string; name: string }`, `BrokerHoldingRaw { ticker: string; shares: number }`, `BrokerAdapter { id: string; label: string; listAccounts(token: string): Promise<BrokerAccount[]>; fetchHoldings(token: string, accountId: string): Promise<BrokerHoldingRaw[]> }` (exactly the interface from the design spec). `BROKER_REGISTRY: BrokerAdapter[]`, `getBrokerAdapter(brokerId: string): BrokerAdapter | undefined`. Consumed by Task 9 (`tbankAdapter` registers here), Task 11 (`runBrokerSync.ts`), Task 14 (`AddBrokerConnectionForm`).

This task creates `registry.ts` importing `tbankAdapter` from a module Task 9 creates next — write `registry.ts` first (per the plan order) and Task 9 will make it resolve; until then `npm run typecheck` will fail on this one import, which is expected and resolved by the end of Task 9. To keep this task's own test green in isolation, its test only exercises `registry.ts` after Task 9 lands — so run this task's `Step 4` typecheck only after Task 9, noted inline below.

- [ ] **Step 1: Write `brokers/types.ts`**

Create `webapp/src/brokers/types.ts`:

```ts
export interface BrokerAccount {
  id: string;
  name: string;
}

export interface BrokerHoldingRaw {
  ticker: string;
  shares: number;
}

export interface BrokerAdapter {
  id: string;
  label: string;
  listAccounts(token: string): Promise<BrokerAccount[]>;
  fetchHoldings(token: string, accountId: string): Promise<BrokerHoldingRaw[]>;
}
```

- [ ] **Step 2: Write `brokers/registry.ts`**

Create `webapp/src/brokers/registry.ts`:

```ts
import { BrokerAdapter } from "./types";
import { tbankAdapter } from "./tbank/adapter";

export const BROKER_REGISTRY: BrokerAdapter[] = [tbankAdapter];

export function getBrokerAdapter(brokerId: string): BrokerAdapter | undefined {
  return BROKER_REGISTRY.find((adapter) => adapter.id === brokerId);
}
```

- [ ] **Step 3: Write `brokers/registry.test.ts`**

Create `webapp/src/brokers/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BROKER_REGISTRY, getBrokerAdapter } from "./registry";

describe("getBrokerAdapter", () => {
  it("returns the tbank adapter for id 'tbank'", () => {
    expect(getBrokerAdapter("tbank")).toBe(BROKER_REGISTRY[0]);
    expect(getBrokerAdapter("tbank")?.label).toBe("Т-Банк");
  });

  it("returns undefined for an unknown broker id", () => {
    expect(getBrokerAdapter("unknown")).toBeUndefined();
  });
});
```

- [ ] **Step 4: Note the expected build state**

Run: `npx vitest run src/brokers/registry.test.ts`
Expected at this point: FAIL — `Cannot find module './tbank/adapter'` (Task 9 creates it). This is expected; do not attempt to make it pass yet. Proceed to Task 8, then Task 9 — this test will pass once Task 9's Step 4 runs, and this task's own commit happens now with a known-red test, tracked to green by Task 9.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/brokers/types.ts webapp/src/brokers/registry.ts webapp/src/brokers/registry.test.ts
git commit -m "feat: add broker adapter interface and registry scaffolding"
```

---

### Task 8: `brokers/tbank/client.ts` — raw T-Invest API calls

**Files:**
- Create: `webapp/src/brokers/tbank/client.ts`
- Create: `webapp/src/brokers/tbank/client.test.ts`

**Interfaces:**
- Produces: `TbankAccount { id: string; name: string }`, `TbankQuantity { units: string; nano: number }`, `TbankPortfolioPosition { figi: string; instrumentType: string; instrumentUid: string; quantity: TbankQuantity }`, `fetchTbankAccounts(token: string): Promise<TbankAccount[]>`, `fetchTbankPortfolio(token: string, accountId: string): Promise<TbankPortfolioPosition[]>`, `resolveTbankTicker(token: string, instrumentUid: string): Promise<string | null>`, `quantityToShares(quantity: TbankQuantity): number`. Consumed by Task 9 (`tbank/adapter.ts`).

Per Task 1's finding: this targets the T-Invest REST-over-JSON contract under `tinkoff.public.invest.api.contract.v1.*`. `GetPortfolio` positions are resolved to tickers via a separate `InstrumentsService.GetInstrumentBy` call rather than assuming a `ticker` field is present on the position — this is deliberately defensive against the exact schema risk called out in the design spec.

- [ ] **Step 1: Write the failing tests**

Create `webapp/src/brokers/tbank/client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchTbankAccounts, fetchTbankPortfolio, resolveTbankTicker, quantityToShares } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    })
  );
}

describe("fetchTbankAccounts", () => {
  it("posts to UsersService/GetAccounts with a bearer token and returns the accounts array", async () => {
    mockFetchOnce({ accounts: [{ id: "acc-1", name: "Брокерский счёт" }] });

    const accounts = await fetchTbankAccounts("my-token");

    expect(accounts).toEqual([{ id: "acc-1", name: "Брокерский счёт" }]);
    expect(fetch).toHaveBeenCalledWith(
      "https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer my-token" }),
        body: JSON.stringify({}),
      })
    );
  });

  it("throws when the response is not ok", async () => {
    mockFetchOnce({}, false, 401);
    await expect(fetchTbankAccounts("bad-token")).rejects.toThrow(/401/);
  });
});

describe("fetchTbankPortfolio", () => {
  it("posts accountId and currency, returns the positions array", async () => {
    mockFetchOnce({
      positions: [
        { figi: "BBG1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "10", nano: 0 } },
      ],
    });

    const positions = await fetchTbankPortfolio("my-token", "acc-1");

    expect(positions).toEqual([
      { figi: "BBG1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "10", nano: 0 } },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.OperationsService/GetPortfolio",
      expect.objectContaining({
        body: JSON.stringify({ accountId: "acc-1", currency: "RUB" }),
      })
    );
  });
});

describe("resolveTbankTicker", () => {
  it("resolves an instrumentUid to a ticker", async () => {
    mockFetchOnce({ instrument: { ticker: "GAZP" } });
    const ticker = await resolveTbankTicker("my-token", "uid-1");
    expect(ticker).toBe("GAZP");
  });

  it("returns null instead of throwing when resolution fails", async () => {
    mockFetchOnce({}, false, 404);
    const ticker = await resolveTbankTicker("my-token", "unknown-uid");
    expect(ticker).toBeNull();
  });
});

describe("quantityToShares", () => {
  it("converts units+nano to a plain number", () => {
    expect(quantityToShares({ units: "10", nano: 0 })).toBe(10);
  });

  it("adds the fractional nano part", () => {
    expect(quantityToShares({ units: "1", nano: 500000000 })).toBeCloseTo(1.5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/brokers/tbank/client.test.ts`
Expected: FAIL — `Cannot find module './client'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/brokers/tbank/client.ts`:

```ts
const TBANK_API_BASE = "https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1";

export interface TbankAccount {
  id: string;
  name: string;
}

export interface TbankQuantity {
  units: string;
  nano: number;
}

export interface TbankPortfolioPosition {
  figi: string;
  instrumentType: string;
  instrumentUid: string;
  quantity: TbankQuantity;
}

async function tbankRequest<T>(token: string, service: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(`${TBANK_API_BASE}/${service}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`T-Invest API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchTbankAccounts(token: string): Promise<TbankAccount[]> {
  const result = await tbankRequest<{ accounts: TbankAccount[] }>(token, "UsersService", "GetAccounts", {});
  return result.accounts;
}

export async function fetchTbankPortfolio(token: string, accountId: string): Promise<TbankPortfolioPosition[]> {
  const result = await tbankRequest<{ positions: TbankPortfolioPosition[] }>(
    token,
    "OperationsService",
    "GetPortfolio",
    { accountId, currency: "RUB" }
  );
  return result.positions;
}

export async function resolveTbankTicker(token: string, instrumentUid: string): Promise<string | null> {
  try {
    const result = await tbankRequest<{ instrument: { ticker: string } }>(
      token,
      "InstrumentsService",
      "GetInstrumentBy",
      { idType: "INSTRUMENT_ID_TYPE_UID", id: instrumentUid }
    );
    return result.instrument.ticker;
  } catch {
    return null;
  }
}

export function quantityToShares(quantity: TbankQuantity): number {
  return Number(quantity.units) + quantity.nano / 1e9;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/brokers/tbank/client.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS except `src/brokers/registry.test.ts` (still red, resolved by Task 9)

Run: `npm run typecheck`
Expected: errors only in `webapp/src/brokers/registry.ts` (missing `./tbank/adapter`), resolved by Task 9

- [ ] **Step 6: Commit**

```bash
git add webapp/src/brokers/tbank/client.ts webapp/src/brokers/tbank/client.test.ts
git commit -m "feat: add raw T-Invest API client (accounts, portfolio, instrument resolution)"
```

---

### Task 9: `brokers/tbank/adapter.ts` — `BrokerAdapter` implementation

**Files:**
- Create: `webapp/src/brokers/tbank/adapter.ts`
- Create: `webapp/src/brokers/tbank/adapter.test.ts`

**Interfaces:**
- Consumes: `fetchTbankAccounts`, `fetchTbankPortfolio`, `resolveTbankTicker`, `quantityToShares` from Task 8; `pLimit` from `webapp/src/concurrency/pLimit.ts` (existing, signature `pLimit(concurrency: number) => <T>(fn: () => Promise<T>) => Promise<T>`); `BrokerAdapter`/`BrokerAccount`/`BrokerHoldingRaw` from Task 7.
- Produces: `tbankAdapter: BrokerAdapter` with `id: "tbank"`, `label: "Т-Банк"`. This is what `registry.ts` (Task 7) imports — completing Task 7's registry test.

- [ ] **Step 1: Write the failing tests**

Create `webapp/src/brokers/tbank/adapter.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { tbankAdapter } from "./adapter";
import * as client from "./client";

describe("tbankAdapter.listAccounts", () => {
  it("maps raw T-Invest accounts to BrokerAccount", async () => {
    vi.spyOn(client, "fetchTbankAccounts").mockResolvedValue([{ id: "acc-1", name: "ИИС" }]);
    const accounts = await tbankAdapter.listAccounts("token");
    expect(accounts).toEqual([{ id: "acc-1", name: "ИИС" }]);
  });
});

describe("tbankAdapter.fetchHoldings", () => {
  it("keeps only share positions, resolves each to a ticker, and converts quantity to shares", async () => {
    vi.spyOn(client, "fetchTbankPortfolio").mockResolvedValue([
      { figi: "BBG1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "10", nano: 0 } },
      { figi: "BBG2", instrumentType: "bond", instrumentUid: "uid-2", quantity: { units: "5", nano: 0 } },
    ]);
    vi.spyOn(client, "resolveTbankTicker").mockImplementation(async (_token, uid) =>
      uid === "uid-1" ? "GAZP" : null
    );

    const holdings = await tbankAdapter.fetchHoldings("token", "acc-1");

    expect(holdings).toEqual([{ ticker: "GAZP", shares: 10 }]);
  });

  it("drops a position whose ticker fails to resolve", async () => {
    vi.spyOn(client, "fetchTbankPortfolio").mockResolvedValue([
      { figi: "BBG1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "10", nano: 0 } },
    ]);
    vi.spyOn(client, "resolveTbankTicker").mockResolvedValue(null);

    const holdings = await tbankAdapter.fetchHoldings("token", "acc-1");
    expect(holdings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/brokers/tbank/adapter.test.ts`
Expected: FAIL — `Cannot find module './adapter'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/brokers/tbank/adapter.ts`:

```ts
import { BrokerAdapter, BrokerAccount, BrokerHoldingRaw } from "../types";
import { fetchTbankAccounts, fetchTbankPortfolio, resolveTbankTicker, quantityToShares } from "./client";
import { pLimit } from "../../concurrency/pLimit";

export const tbankAdapter: BrokerAdapter = {
  id: "tbank",
  label: "Т-Банк",

  async listAccounts(token: string): Promise<BrokerAccount[]> {
    const accounts = await fetchTbankAccounts(token);
    return accounts.map((a) => ({ id: a.id, name: a.name }));
  },

  async fetchHoldings(token: string, accountId: string): Promise<BrokerHoldingRaw[]> {
    const positions = await fetchTbankPortfolio(token, accountId);
    const shares = positions.filter((p) => p.instrumentType === "share");
    const limit = pLimit(5);
    const resolved = await Promise.all(
      shares.map((position) =>
        limit(async () => {
          const ticker = await resolveTbankTicker(token, position.instrumentUid);
          return ticker ? { ticker, shares: quantityToShares(position.quantity) } : null;
        })
      )
    );
    return resolved.filter((h): h is BrokerHoldingRaw => h !== null);
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/brokers/tbank/adapter.test.ts`
Expected: PASS (3 tests)

Run: `npx vitest run src/brokers/registry.test.ts`
Expected: now PASS (2 tests) — `./tbank/adapter` resolves

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add webapp/src/brokers/tbank/adapter.ts webapp/src/brokers/tbank/adapter.test.ts
git commit -m "feat: implement the T-Invest BrokerAdapter"
```

---

### Task 10: `brokers/syncDiff.ts` — diff preview + apply

**Files:**
- Create: `webapp/src/brokers/syncDiff.ts`
- Create: `webapp/src/brokers/syncDiff.test.ts`

**Interfaces:**
- Consumes: `Position`, `PortfolioFile`, `BrokerHolding` from Task 2.
- Produces: `BrokerHoldingInput { ticker: string; shares: number }`, `SyncDiffRowStatus = "existing" | "new" | "unresolved"`, `SyncDiffRow { ticker: string; status: SyncDiffRowStatus; previousShares: number; newShares: number }`, `buildSyncDiff(connectionId: string, brokerHoldings: BrokerHoldingInput[], existingPositions: Position[], isTradeable: (ticker: string) => boolean): SyncDiffRow[]`, `applySyncDiff(file: PortfolioFile, connectionId: string, rows: SyncDiffRow[], syncedAt: string): PortfolioFile`. Consumed by Task 11 (`runBrokerSync.ts` calls `buildSyncDiff`), Task 14 (`BrokerConnectionsModal` calls `applySyncDiff` on confirm).

This is the core of the "Поток синхронизации" section of the design spec: matching rules (existing ticker → update; new tradeable ticker → propose as new position; unresolved ticker → skip with a visible row, not silent); zeroing a connection's contribution when a previously-synced ticker disappears from the response; and never touching another connection's or the manual contribution when applying one connection's sync.

- [ ] **Step 1: Write the failing tests**

Create `webapp/src/brokers/syncDiff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSyncDiff, applySyncDiff, SyncDiffRow } from "./syncDiff";
import { Position, PortfolioFile } from "../types";

const alwaysTradeable = () => true;
const neverTradeable = () => false;

describe("buildSyncDiff", () => {
  it("marks a ticker already in the portfolio as 'existing' and carries its previous connection shares", () => {
    const existing: Position[] = [
      {
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 5,
        brokerHoldings: [{ connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" }],
      },
    ];
    const rows = buildSyncDiff("conn-1", [{ ticker: "GAZP", shares: 15 }], existing, alwaysTradeable);
    expect(rows).toEqual([{ ticker: "GAZP", status: "existing", previousShares: 10, newShares: 15 }]);
  });

  it("marks a brand-new ticker that resolves on MOEX as 'new'", () => {
    const rows = buildSyncDiff("conn-1", [{ ticker: "NEWTICK", shares: 3 }], [], alwaysTradeable);
    expect(rows).toEqual([{ ticker: "NEWTICK", status: "new", previousShares: 0, newShares: 3 }]);
  });

  it("marks a brand-new ticker that doesn't resolve on MOEX as 'unresolved' with 0 shares", () => {
    const rows = buildSyncDiff("conn-1", [{ ticker: "DELISTED", shares: 3 }], [], neverTradeable);
    expect(rows).toEqual([{ ticker: "DELISTED", status: "unresolved", previousShares: 0, newShares: 0 }]);
  });

  it("zeroes out a ticker that was previously synced from this connection but is absent from the new response", () => {
    const existing: Position[] = [
      {
        ticker: "OLD",
        coefficient: 1,
        sharesOwned: 0,
        brokerHoldings: [{ connectionId: "conn-1", shares: 7, syncedAt: "2026-01-01" }],
      },
    ];
    const rows = buildSyncDiff("conn-1", [], existing, alwaysTradeable);
    expect(rows).toEqual([{ ticker: "OLD", status: "existing", previousShares: 7, newShares: 0 }]);
  });

  it("ignores another connection's contribution when computing previousShares for this connection", () => {
    const existing: Position[] = [
      {
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 0,
        brokerHoldings: [{ connectionId: "conn-other", shares: 100, syncedAt: "2026-01-01" }],
      },
    ];
    const rows = buildSyncDiff("conn-1", [{ ticker: "GAZP", shares: 4 }], existing, alwaysTradeable);
    expect(rows).toEqual([{ ticker: "GAZP", status: "existing", previousShares: 0, newShares: 4 }]);
  });

  it("matches tickers case-insensitively", () => {
    const existing: Position[] = [
      {
        ticker: "gazp",
        coefficient: 1,
        sharesOwned: 0,
        brokerHoldings: [{ connectionId: "conn-1", shares: 5, syncedAt: "2026-01-01" }],
      },
    ];
    const rows = buildSyncDiff("conn-1", [{ ticker: "GAZP", shares: 8 }], existing, alwaysTradeable);
    expect(rows).toEqual([{ ticker: "GAZP", status: "existing", previousShares: 5, newShares: 8 }]);
  });
});

describe("applySyncDiff", () => {
  function file(positions: Position[]): PortfolioFile {
    return { version: 1, positions, sectors: {}, history: [], pairs: [], brokerConnections: [] };
  }

  it("upserts a brokerHoldings entry for an existing position", () => {
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 0, newShares: 10 }];
    const initial = file([{ ticker: "GAZP", coefficient: 1, sharesOwned: 5, brokerHoldings: [] }]);

    const result = applySyncDiff(initial, "conn-1", rows, "2026-07-13T00:00:00.000Z");

    expect(result.positions).toEqual([
      {
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 5,
        brokerHoldings: [{ connectionId: "conn-1", shares: 10, syncedAt: "2026-07-13T00:00:00.000Z" }],
      },
    ]);
  });

  it("removes the connection's brokerHoldings entry (but keeps the position) when newShares is 0", () => {
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 10, newShares: 0 }];
    const initial = file([
      {
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 5,
        brokerHoldings: [{ connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" }],
      },
    ]);

    const result = applySyncDiff(initial, "conn-1", rows, "2026-07-13T00:00:00.000Z");

    expect(result.positions).toEqual([{ ticker: "GAZP", coefficient: 1, sharesOwned: 5, brokerHoldings: [] }]);
  });

  it("preserves another connection's brokerHoldings entry when applying this connection's sync (merging multiple connections)", () => {
    const rows: SyncDiffRow[] = [{ ticker: "GAZP", status: "existing", previousShares: 0, newShares: 4 }];
    const initial = file([
      {
        ticker: "GAZP",
        coefficient: 1,
        sharesOwned: 0,
        brokerHoldings: [{ connectionId: "conn-other", shares: 100, syncedAt: "2026-01-01" }],
      },
    ]);

    const result = applySyncDiff(initial, "conn-1", rows, "2026-07-13T00:00:00.000Z");

    expect(result.positions[0].brokerHoldings).toEqual(
      expect.arrayContaining([
        { connectionId: "conn-other", shares: 100, syncedAt: "2026-01-01" },
        { connectionId: "conn-1", shares: 4, syncedAt: "2026-07-13T00:00:00.000Z" },
      ])
    );
  });

  it("creates a new position with coefficient 1 for a 'new' status row", () => {
    const rows: SyncDiffRow[] = [{ ticker: "NEWTICK", status: "new", previousShares: 0, newShares: 3 }];
    const result = applySyncDiff(file([]), "conn-1", rows, "2026-07-13T00:00:00.000Z");

    expect(result.positions).toEqual([
      {
        ticker: "NEWTICK",
        coefficient: 1,
        sharesOwned: 0,
        brokerHoldings: [{ connectionId: "conn-1", shares: 3, syncedAt: "2026-07-13T00:00:00.000Z" }],
      },
    ]);
  });

  it("ignores an 'unresolved' row entirely — no position created, nothing persisted", () => {
    const rows: SyncDiffRow[] = [{ ticker: "DELISTED", status: "unresolved", previousShares: 0, newShares: 0 }];
    const result = applySyncDiff(file([]), "conn-1", rows, "2026-07-13T00:00:00.000Z");
    expect(result.positions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/brokers/syncDiff.test.ts`
Expected: FAIL — `Cannot find module './syncDiff'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/brokers/syncDiff.ts`:

```ts
import { Position, PortfolioFile, BrokerHolding } from "../types";

export interface BrokerHoldingInput {
  ticker: string;
  shares: number;
}

export type SyncDiffRowStatus = "existing" | "new" | "unresolved";

export interface SyncDiffRow {
  ticker: string;
  status: SyncDiffRowStatus;
  previousShares: number;
  newShares: number;
}

function findConnectionShares(position: Position, connectionId: string): number {
  const holding = (position.brokerHoldings ?? []).find((h) => h.connectionId === connectionId);
  return holding ? holding.shares : 0;
}

export function buildSyncDiff(
  connectionId: string,
  brokerHoldings: BrokerHoldingInput[],
  existingPositions: Position[],
  isTradeable: (ticker: string) => boolean
): SyncDiffRow[] {
  const holdingsByTicker = new Map(brokerHoldings.map((h) => [h.ticker.toUpperCase(), h.shares]));
  const positionsByTicker = new Map(existingPositions.map((p) => [p.ticker.toUpperCase(), p]));

  const previouslySyncedTickers = existingPositions
    .filter((p) => (p.brokerHoldings ?? []).some((h) => h.connectionId === connectionId))
    .map((p) => p.ticker.toUpperCase());

  const allTickers = new Set<string>([...holdingsByTicker.keys(), ...previouslySyncedTickers]);

  const rows: SyncDiffRow[] = [];
  for (const ticker of allTickers) {
    const existingPosition = positionsByTicker.get(ticker);
    const previousShares = existingPosition ? findConnectionShares(existingPosition, connectionId) : 0;
    const newSharesRaw = holdingsByTicker.get(ticker) ?? 0;

    if (existingPosition) {
      rows.push({ ticker, status: "existing", previousShares, newShares: newSharesRaw });
    } else if (isTradeable(ticker)) {
      rows.push({ ticker, status: "new", previousShares: 0, newShares: newSharesRaw });
    } else {
      rows.push({ ticker, status: "unresolved", previousShares: 0, newShares: 0 });
    }
  }

  return rows;
}

export function applySyncDiff(
  file: PortfolioFile,
  connectionId: string,
  rows: SyncDiffRow[],
  syncedAt: string
): PortfolioFile {
  const rowsByTicker = new Map(rows.map((r) => [r.ticker, r]));

  const updatedPositions: Position[] = file.positions.map((position) => {
    const row = rowsByTicker.get(position.ticker.toUpperCase());
    if (!row || row.status === "unresolved") return position;

    const otherHoldings = (position.brokerHoldings ?? []).filter((h) => h.connectionId !== connectionId);
    const newHoldings: BrokerHolding[] =
      row.newShares > 0
        ? [...otherHoldings, { connectionId, shares: row.newShares, syncedAt }]
        : otherHoldings;

    return { ...position, brokerHoldings: newHoldings };
  });

  const existingTickers = new Set(file.positions.map((p) => p.ticker.toUpperCase()));
  const newPositions: Position[] = rows
    .filter((r) => r.status === "new" && r.newShares > 0 && !existingTickers.has(r.ticker))
    .map((r) => ({
      ticker: r.ticker,
      coefficient: 1,
      sharesOwned: 0,
      brokerHoldings: [{ connectionId, shares: r.newShares, syncedAt }],
    }));

  return {
    ...file,
    positions: [...updatedPositions, ...newPositions],
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/brokers/syncDiff.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add webapp/src/brokers/syncDiff.ts webapp/src/brokers/syncDiff.test.ts
git commit -m "feat: add buildSyncDiff/applySyncDiff for broker holding sync"
```

---

### Task 11: `portfolio/runBrokerSync.ts` — fetch + diff orchestration

**Files:**
- Create: `webapp/src/portfolio/runBrokerSync.ts`
- Create: `webapp/src/portfolio/runBrokerSync.test.ts`

**Interfaces:**
- Consumes: `getBrokerAdapter` (Task 7/9), `buildSyncDiff`/`SyncDiffRow` (Task 10), `fetchSecurities` (existing, `webapp/src/iss/client.ts:33`), `PortfolioFile`/`BrokerConnection` (Task 2).
- Produces: `fetchBrokerSyncPreview(file: PortfolioFile, connection: BrokerConnection, token: string): Promise<SyncDiffRow[]>`. Consumed by Task 14 (`BrokerConnectionsModal`).

Mirrors the existing `iss/marketData.ts` → `portfolio/runMarketUpdate.ts` layering: this is the async network-plus-merge step, kept separate from the pure `syncDiff.ts` logic and from the component.

- [ ] **Step 1: Write the failing tests**

Create `webapp/src/portfolio/runBrokerSync.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { fetchBrokerSyncPreview } from "./runBrokerSync";
import { PortfolioFile, BrokerConnection } from "../types";

vi.mock("../brokers/registry", () => ({
  getBrokerAdapter: vi.fn(),
}));
vi.mock("../iss/client", () => ({
  fetchSecurities: vi.fn(),
}));

import { getBrokerAdapter } from "../brokers/registry";
import { fetchSecurities } from "../iss/client";

const connection: BrokerConnection = {
  id: "conn-1",
  brokerId: "tbank",
  accountId: "acc-1",
  label: "Т-Банк",
  encryptedToken: { ciphertext: "c", iv: "i", salt: "s" },
};

function file(positions: PortfolioFile["positions"] = []): PortfolioFile {
  return { version: 1, positions, sectors: {}, history: [], pairs: [], brokerConnections: [connection] };
}

describe("fetchBrokerSyncPreview", () => {
  it("throws when the connection's broker has no registered adapter", async () => {
    vi.mocked(getBrokerAdapter).mockReturnValue(undefined);
    await expect(fetchBrokerSyncPreview(file(), connection, "token")).rejects.toThrow(/Неизвестный брокер/);
  });

  it("fetches holdings, resolves tradeability only for new tickers, and builds the diff", async () => {
    vi.mocked(getBrokerAdapter).mockReturnValue({
      id: "tbank",
      label: "Т-Банк",
      listAccounts: vi.fn(),
      fetchHoldings: vi.fn().mockResolvedValue([
        { ticker: "GAZP", shares: 10 },
        { ticker: "NEWTICK", shares: 3 },
      ]),
    });
    vi.mocked(fetchSecurities).mockResolvedValue(
      new Map([["NEWTICK", { shortName: "Новая", price: 10, lotSize: 1 }]])
    );

    const existingFile = file([{ ticker: "GAZP", coefficient: 1, sharesOwned: 5, brokerHoldings: [] }]);
    const rows = await fetchBrokerSyncPreview(existingFile, connection, "token");

    expect(fetchSecurities).toHaveBeenCalledWith(["NEWTICK"]);
    expect(rows).toEqual(
      expect.arrayContaining([
        { ticker: "GAZP", status: "existing", previousShares: 0, newShares: 10 },
        { ticker: "NEWTICK", status: "new", previousShares: 0, newShares: 3 },
      ])
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/portfolio/runBrokerSync.test.ts`
Expected: FAIL — `Cannot find module './runBrokerSync'`

- [ ] **Step 3: Write the implementation**

Create `webapp/src/portfolio/runBrokerSync.ts`:

```ts
import { PortfolioFile, BrokerConnection } from "../types";
import { getBrokerAdapter } from "../brokers/registry";
import { buildSyncDiff, SyncDiffRow } from "../brokers/syncDiff";
import { fetchSecurities } from "../iss/client";

export async function fetchBrokerSyncPreview(
  file: PortfolioFile,
  connection: BrokerConnection,
  token: string
): Promise<SyncDiffRow[]> {
  const adapter = getBrokerAdapter(connection.brokerId);
  if (!adapter) {
    throw new Error(`Неизвестный брокер: ${connection.brokerId}`);
  }

  const holdings = await adapter.fetchHoldings(token, connection.accountId);

  const existingTickers = new Set(file.positions.map((p) => p.ticker.toUpperCase()));
  const candidateTickers = holdings
    .map((h) => h.ticker.toUpperCase())
    .filter((ticker) => !existingTickers.has(ticker));
  const securities = await fetchSecurities(candidateTickers);
  const isTradeable = (ticker: string) => securities.has(ticker.toUpperCase());

  return buildSyncDiff(connection.id, holdings, file.positions, isTradeable);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/portfolio/runBrokerSync.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add webapp/src/portfolio/runBrokerSync.ts webapp/src/portfolio/runBrokerSync.test.ts
git commit -m "feat: add fetchBrokerSyncPreview orchestration"
```

---

### Task 12: `PositionsTable` — manual input + broker breakdown hint

**Files:**
- Modify: `webapp/src/components/PositionsTable.tsx` (full file, 99 lines)
- Modify: `webapp/src/components/PortfolioTab.tsx:1-22, 71-74, 138-142`

**Interfaces:**
- Consumes: `buildSharesBreakdownTooltip` (Task 4), `CalculatedPosition.manualSharesOwned`/`.sharesOwned`/`.brokerHoldings` (Task 2/3).
- Produces: `PositionsTable` gains a required prop `brokerConnectionsById: Map<string, string>`. No test file — `PositionsTable`/`PortfolioTab` have no existing component tests (confirmed: no `@testing-library/react` dependency), so this task is verified by typecheck + manual QA in Task 16, consistent with the rest of this component tree.

- [ ] **Step 1: Update `PositionsTable.tsx`**

Replace the full contents of `webapp/src/components/PositionsTable.tsx`:

```tsx
import { CalculatedPosition } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";
import { buildSharesBreakdownTooltip } from "../domain/sharesBreakdown";

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
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

export function PositionsTable({
  positions,
  brokerConnectionsById,
  onChangeCoefficient,
  onChangeSharesOwned,
}: {
  positions: CalculatedPosition[];
  brokerConnectionsById: Map<string, string>;
  onChangeCoefficient: (ticker: string, value: number) => void;
  onChangeSharesOwned: (ticker: string, value: number) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="positions-table">
        <thead>
          <tr>
            <th></th>
            <th>Тикер</th>
            <th>Название</th>
            <th className="num">Вес в индексе, %</th>
            <th className="num">Цена</th>
            <th className="num">Лотность</th>
            <th className="num">Дивиденд</th>
            <th className="num">Див доходность, %</th>
            <th className="num">{headerWithHint("Коэф-т", "Множитель к весу в индексе при расчёте целевой доли")}</th>
            <th className="num">Куплено</th>
            <th className="num">{headerWithHint("Акций купить", "Целое число акций до целевой доли; минус — продать")}</th>
            <th className="num">Купить на сумму</th>
            <th className="num">{headerWithHint("Цель", "Целевая доля = вес в индексе × коэффициент")}</th>
            <th className="num">{headerWithHint("Факт. доля", "Текущая доля позиции в стоимости портфеля, %")}</th>
            <th className="num">{headerWithHint("Соответствие", "Факт. доля ÷ Цель (1.0 = точное совпадение)")}</th>
            <th className="num">Стоимость</th>
            <th className="num">{headerWithHint("Доход", "Дивиденд на акцию × количество акций")}</th>
            <th>Сектор</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.ticker}>
              <td>
                <span className={`status-dot${p.status === "in_index" ? " status-dot--in" : ""}`} />
              </td>
              <td>{p.ticker}</td>
              <td>{p.shortName}</td>
              <td className="num">{formatNumber(p.indexWeight)}</td>
              <td className="num">{formatNumber(p.price)}</td>
              <td className="num">{p.lotSize ?? "—"}</td>
              <td className="num">{formatNumber(p.dividendPerShare)}</td>
              <td className="num">{formatNumber(p.dividendYield)}</td>
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
                  value={p.manualSharesOwned}
                  onChange={(e) => onChangeSharesOwned(p.ticker, Number(e.target.value))}
                />
                {p.brokerHoldings && p.brokerHoldings.length > 0 && (
                  <span
                    className="th-hint"
                    data-tooltip={buildSharesBreakdownTooltip(p, brokerConnectionsById)}
                    tabIndex={0}
                  >
                    Σ{p.sharesOwned}
                  </span>
                )}
              </td>
              <td className="num">{formatNumber(p.sharesToBuy, 0)}</td>
              <td className="num">{formatNumber(p.buyAmountRub)}</td>
              <td className="num">{formatNumber(p.targetAllocation)}</td>
              <td className="num">{formatNumber(p.actualShare)}</td>
              <td className="num">
                <ComplianceGauge value={p.compliance} />
              </td>
              <td className="num">{formatNumber(p.positionValue)}</td>
              <td className="num">{formatNumber(p.income)}</td>
              <td>{p.sector}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Wire `brokerConnectionsById` from `PortfolioTab`**

In `webapp/src/components/PortfolioTab.tsx`, change the import line:

```ts
import { useMemo, useEffect, useRef, useState } from "react";
```

(unchanged — `useMemo` is already imported).

Change the `filteredPositions` block:

```ts
  const filteredPositions = useMemo(
    () => filterPositions(calculated, search, hideEmpty),
    [calculated, search, hideEmpty]
  );
```

to:

```ts
  const filteredPositions = useMemo(
    () => filterPositions(calculated, search, hideEmpty),
    [calculated, search, hideEmpty]
  );

  const brokerConnectionsById = useMemo(
    () => new Map((file?.brokerConnections ?? []).map((c) => [c.id, c.label])),
    [file?.brokerConnections]
  );
```

Change the `<PositionsTable ... />` render:

```tsx
      <PositionsTable
        positions={filteredPositions}
        onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
        onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
      />
```

to:

```tsx
      <PositionsTable
        positions={filteredPositions}
        brokerConnectionsById={brokerConnectionsById}
        onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
        onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
      />
```

- [ ] **Step 3: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev` (from `webapp/`), load or create a portfolio, confirm the "Куплено" column still shows and edits the manual number exactly as before (no broker connections exist yet at this point in the plan, so the Σ hint should never render).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/components/PositionsTable.tsx webapp/src/components/PortfolioTab.tsx
git commit -m "feat: show manual/broker shares breakdown in the positions table"
```

---

### Task 13: `BrokerSyncPreviewModal` — confirm-before-apply diff table

**Files:**
- Create: `webapp/src/components/BrokerSyncPreviewModal.tsx`

**Interfaces:**
- Consumes: `SyncDiffRow`/`SyncDiffRowStatus` from Task 10.
- Produces: `BrokerSyncPreviewModal({ connectionLabel: string; rows: SyncDiffRow[]; onConfirm: () => void; onClose: () => void }): JSX.Element`. Consumed by Task 14 (`BrokerConnectionsModal`).

No test file (modal — manual QA per repo convention, matching `AddTickerModal`/`PairPositionsModal`, neither of which has one).

- [ ] **Step 1: Write the implementation**

Create `webapp/src/components/BrokerSyncPreviewModal.tsx`:

```tsx
import { SyncDiffRow, SyncDiffRowStatus } from "../brokers/syncDiff";

const STATUS_LABELS: Record<SyncDiffRowStatus, string> = {
  existing: "обновление",
  new: "новая позиция",
  unresolved: "тикер не найден — пропущен",
};

export function BrokerSyncPreviewModal({
  connectionLabel,
  rows,
  onConfirm,
  onClose,
}: {
  connectionLabel: string;
  rows: SyncDiffRow[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const hasChanges = rows.some((row) => row.status !== "unresolved" && row.previousShares !== row.newShares);

  return (
    <div className="modal-backdrop" role="dialog" aria-label={`Синхронизация: ${connectionLabel}`}>
      <div className="modal">
        <h2>Синхронизация: {connectionLabel}</h2>
        <table>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ticker}>
                <td>{row.ticker}</td>
                <td>{STATUS_LABELS[row.status]}</td>
                <td>{row.status === "unresolved" ? "—" : `${row.previousShares} → ${row.newShares}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal__actions">
          <button type="button" onClick={onConfirm} disabled={!hasChanges}>
            Подтвердить
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

- [ ] **Step 2: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS (no new tests added by this task)

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/BrokerSyncPreviewModal.tsx
git commit -m "feat: add BrokerSyncPreviewModal for confirming a sync diff"
```

---

### Task 14: `AddBrokerConnectionForm` + `BrokerConnectionsModal`

**Files:**
- Create: `webapp/src/components/AddBrokerConnectionForm.tsx`
- Create: `webapp/src/components/BrokerConnectionsModal.tsx`
- Modify: `webapp/src/styles.css` (append `Broker connections` section)

**Interfaces:**
- Consumes: `BROKER_REGISTRY`/`getBrokerAdapter` (Task 7), `encryptToken`/`decryptToken`/`TokenDecryptionError` (Task 5), `getSessionToken`/`setSessionToken`/`clearSessionToken` (Task 6), `fetchBrokerSyncPreview` (Task 11), `applySyncDiff`/`SyncDiffRow` (Task 10), `BrokerSyncPreviewModal` (Task 13), `BrokerConnection`/`PortfolioFile` (Task 2), `useErrors` (existing).
- Produces: `AddBrokerConnectionForm({ isFirstConnection: boolean; onAdd: (connection: BrokerConnection) => void; onCancel: () => void }): JSX.Element`, `BrokerConnectionsModal({ file: PortfolioFile; onUpdateFile: (file: PortfolioFile) => void; onClose: () => void }): JSX.Element`. Consumed by Task 15 (`Header`).

No test files — both are modals (manual QA), matching `AddTickerModal`/`PairPositionsModal` convention.

- [ ] **Step 1: Write `AddBrokerConnectionForm.tsx`**

Create `webapp/src/components/AddBrokerConnectionForm.tsx`:

```tsx
import { useState } from "react";
import { BrokerConnection } from "../types";
import { BrokerAccount } from "../brokers/types";
import { BROKER_REGISTRY, getBrokerAdapter } from "../brokers/registry";
import { encryptToken } from "../brokers/crypto";

export function AddBrokerConnectionForm({
  isFirstConnection,
  onAdd,
  onCancel,
}: {
  isFirstConnection: boolean;
  onAdd: (connection: BrokerConnection) => void;
  onCancel: () => void;
}) {
  const [brokerId, setBrokerId] = useState(BROKER_REGISTRY[0].id);
  const [tokenInput, setTokenInput] = useState("");
  const [accounts, setAccounts] = useState<BrokerAccount[] | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [passphraseInput, setPassphraseInput] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adapter = getBrokerAdapter(brokerId)!;

  async function handleFetchAccounts() {
    setError(null);
    setLoadingAccounts(true);
    try {
      const fetched = await adapter.listAccounts(tokenInput);
      setAccounts(fetched);
      if (fetched.length > 0) {
        setSelectedAccountId(fetched[0].id);
        setLabelInput(`${adapter.label} — ${fetched[0].name}`);
      }
    } catch (err) {
      setError(`Не удалось подключиться, возможно ограничение брокера: ${(err as Error).message}`);
      setAccounts(null);
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function handleAdd() {
    if (!selectedAccountId || !labelInput.trim() || !passphraseInput) return;
    setError(null);
    try {
      const encryptedToken = await encryptToken(tokenInput, passphraseInput);
      onAdd({
        id: crypto.randomUUID(),
        brokerId,
        accountId: selectedAccountId,
        label: labelInput.trim(),
        encryptedToken,
      });
    } catch (err) {
      setError(`Не удалось зашифровать токен: ${(err as Error).message}`);
    }
  }

  const canAdd = accounts !== null && selectedAccountId !== "" && labelInput.trim() !== "" && passphraseInput !== "";

  return (
    <div className="broker-connections__add-form">
      {isFirstConnection && (
        <p className="broker-connections__warning">
          Токен брокера сохраняется в файле портфеля в зашифрованном виде. Передавая portfolio.json
          дальше, вы передаёте и зашифрованные токены — безопасность зависит от стойкости пароль-фразы.
        </p>
      )}
      <div className="add-ticker__field">
        <select
          value={brokerId}
          onChange={(e) => {
            setBrokerId(e.target.value);
            setAccounts(null);
          }}
        >
          {BROKER_REGISTRY.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <input
          type="password"
          placeholder="Токен"
          value={tokenInput}
          onChange={(e) => {
            setTokenInput(e.target.value);
            setAccounts(null);
          }}
        />
        <button type="button" onClick={handleFetchAccounts} disabled={!tokenInput || loadingAccounts}>
          {loadingAccounts ? "Проверка…" : "Проверить и продолжить"}
        </button>
      </div>
      {error && <span className="add-ticker__status">{error}</span>}
      {accounts && (
        <div className="add-ticker__field">
          <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Название подключения"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
          />
          <input
            type="password"
            placeholder="Пароль-фраза для шифрования токена"
            value={passphraseInput}
            onChange={(e) => setPassphraseInput(e.target.value)}
          />
        </div>
      )}
      <div className="modal__actions">
        <button type="button" onClick={handleAdd} disabled={!canAdd}>
          Добавить
        </button>
        <button type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `BrokerConnectionsModal.tsx`**

Create `webapp/src/components/BrokerConnectionsModal.tsx`:

```tsx
import { useState } from "react";
import { BrokerConnection, PortfolioFile } from "../types";
import { useErrors } from "../errors/useErrors";
import { getBrokerAdapter } from "../brokers/registry";
import { decryptToken } from "../brokers/crypto";
import { getSessionToken, setSessionToken, clearSessionToken } from "../brokers/tokenSession";
import { fetchBrokerSyncPreview } from "../portfolio/runBrokerSync";
import { applySyncDiff, SyncDiffRow } from "../brokers/syncDiff";
import { AddBrokerConnectionForm } from "./AddBrokerConnectionForm";
import { BrokerSyncPreviewModal } from "./BrokerSyncPreviewModal";

const SOURCE = "broker-sync";

export function BrokerConnectionsModal({
  file,
  onUpdateFile,
  onClose,
}: {
  file: PortfolioFile;
  onUpdateFile: (file: PortfolioFile) => void;
  onClose: () => void;
}) {
  const { addError, clearBySource } = useErrors();
  const [showAddForm, setShowAddForm] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [pendingSyncAfterUnlock, setPendingSyncAfterUnlock] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{ connection: BrokerConnection; rows: SyncDiffRow[] } | null>(
    null
  );

  async function runSync(connection: BrokerConnection, token: string) {
    clearBySource(SOURCE);
    setSyncingId(connection.id);
    try {
      const rows = await fetchBrokerSyncPreview(file, connection, token);
      setPreviewState({ connection, rows });
    } catch (error) {
      addError(SOURCE, `Не удалось подключиться, возможно ограничение брокера: ${(error as Error).message}`);
    } finally {
      setSyncingId(null);
    }
  }

  function handleSyncClick(connection: BrokerConnection) {
    const cached = getSessionToken(connection.id);
    if (cached) {
      void runSync(connection, cached);
      return;
    }
    setUnlockingId(connection.id);
    setPendingSyncAfterUnlock(true);
    setPassphraseInput("");
    setUnlockError(null);
  }

  function handleUnlockClick(connection: BrokerConnection) {
    setUnlockingId(connection.id);
    setPendingSyncAfterUnlock(false);
    setPassphraseInput("");
    setUnlockError(null);
  }

  async function handleUnlockSubmit(connection: BrokerConnection) {
    try {
      const token = await decryptToken(connection.encryptedToken, passphraseInput);
      setSessionToken(connection.id, token);
      setUnlockingId(null);
      setPassphraseInput("");
      setUnlockError(null);
      if (pendingSyncAfterUnlock) {
        await runSync(connection, token);
      }
    } catch {
      setUnlockError("Неверный пароль");
    }
  }

  function handleRemoveConnection(connectionId: string) {
    clearSessionToken(connectionId);
    onUpdateFile({
      ...file,
      brokerConnections: file.brokerConnections.filter((c) => c.id !== connectionId),
    });
  }

  function handleAddConnection(connection: BrokerConnection) {
    onUpdateFile({ ...file, brokerConnections: [...file.brokerConnections, connection] });
    setShowAddForm(false);
  }

  function handleConfirmSync() {
    if (!previewState) return;
    const updated = applySyncDiff(
      file,
      previewState.connection.id,
      previewState.rows,
      new Date().toISOString()
    );
    onUpdateFile(updated);
    setPreviewState(null);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Брокеры">
      <div className="modal">
        <h2>Брокеры</h2>
        <div className="broker-connections__list">
          {file.brokerConnections.map((connection) => {
            const adapter = getBrokerAdapter(connection.brokerId);
            const isLocked = getSessionToken(connection.id) === null;
            return (
              <div className="broker-connections__row" key={connection.id}>
                <span>
                  {isLocked ? "🔒 " : ""}
                  {connection.label} ({adapter?.label ?? connection.brokerId})
                </span>
                <div className="modal__actions">
                  {isLocked && (
                    <button type="button" onClick={() => handleUnlockClick(connection)}>
                      Разблокировать
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSyncClick(connection)}
                    disabled={syncingId === connection.id}
                  >
                    {syncingId === connection.id ? "Синхронизация…" : "Синхронизировать"}
                  </button>
                  <button type="button" onClick={() => handleRemoveConnection(connection.id)}>
                    Удалить
                  </button>
                </div>
                {unlockingId === connection.id && (
                  <div className="add-ticker__field">
                    <input
                      type="password"
                      placeholder="Пароль-фраза"
                      value={passphraseInput}
                      onChange={(e) => setPassphraseInput(e.target.value)}
                      autoFocus
                    />
                    <button type="button" onClick={() => void handleUnlockSubmit(connection)}>
                      Ок
                    </button>
                    {unlockError && <span className="add-ticker__status">{unlockError}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {showAddForm ? (
          <AddBrokerConnectionForm
            isFirstConnection={file.brokerConnections.length === 0}
            onAdd={handleAddConnection}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <div className="modal__actions">
            <button type="button" onClick={() => setShowAddForm(true)}>
              Добавить подключение
            </button>
            <button type="button" onClick={onClose}>
              Закрыть
            </button>
          </div>
        )}
      </div>
      {previewState && (
        <BrokerSyncPreviewModal
          connectionLabel={previewState.connection.label}
          rows={previewState.rows}
          onConfirm={handleConfirmSync}
          onClose={() => setPreviewState(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the broker connections CSS**

Append to `webapp/src/styles.css`:

```css
/* Broker connections */

.broker-connections__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}

.broker-connections__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.broker-connections__warning {
  color: var(--warn);
  font-size: 0.82rem;
  margin: 0 0 10px;
}

.broker-connections__add-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
```

- [ ] **Step 4: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS (no new tests added by this task)

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add webapp/src/components/AddBrokerConnectionForm.tsx webapp/src/components/BrokerConnectionsModal.tsx webapp/src/styles.css
git commit -m "feat: add BrokerConnectionsModal for managing broker connections"
```

---

### Task 15: Wire "Брокеры" into `Header`

**Files:**
- Modify: `webapp/src/components/Header.tsx` (full file, 159 lines)

**Interfaces:**
- Consumes: `BrokerConnectionsModal` (Task 14).
- Produces: no new exports — `Header`'s public signature (`{ onFileLoaded: () => void }`) is unchanged.

- [ ] **Step 1: Update `Header.tsx`**

Replace the full contents of `webapp/src/components/Header.tsx`:

```tsx
import { useRef, useState } from "react";
import { usePortfolio } from "../portfolio/usePortfolio";
import { useErrors } from "../errors/useErrors";
import { createEmptyPortfolio } from "../file/createEmptyPortfolio";
import { switchIndex } from "../portfolio/runMarketUpdate";
import { INDEX_OPTIONS } from "../domain/indices";
import {
  isFileSystemAccessSupported,
  loadViaFileSystemAccess,
  loadViaInputFile,
} from "../file/loadPortfolioFile";
import {
  saveViaFileSystemAccess,
  saveViaFileSystemAccessNew,
  downloadPortfolioFile,
} from "../file/savePortfolioFile";
import { BrokerConnectionsModal } from "./BrokerConnectionsModal";

const SOURCE = "file";
const INDEX_SOURCE = "index-switch";

export function Header({ onFileLoaded }: { onFileLoaded: () => void }) {
  const {
    file,
    setFile,
    fileHandle,
    setFileHandle,
    liveByTicker,
    setLiveByTicker,
    selectedIndex,
    setSelectedIndex,
    isUpdating,
    setIsUpdating,
  } = usePortfolio();
  const { addError, clearBySource } = useErrors();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showBrokerConnections, setShowBrokerConnections] = useState(false);

  async function handleLoadClick() {
    clearBySource(SOURCE);
    try {
      if (isFileSystemAccessSupported()) {
        const { file: loaded, handle } = await loadViaFileSystemAccess();
        setFile(loaded);
        setFileHandle(handle);
        onFileLoaded();
      } else {
        inputRef.current?.click();
      }
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
      addError(SOURCE, `Не удалось загрузить файл: ${(error as Error).message}`);
    }
  }

  async function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    try {
      const loaded = await loadViaInputFile(selected);
      setFile(loaded);
      setFileHandle(null);
      onFileLoaded();
    } catch (error) {
      addError(SOURCE, `Не удалось загрузить файл: ${(error as Error).message}`);
    }
  }

  async function handleStartEmpty() {
    clearBySource(SOURCE);
    try {
      const empty = await createEmptyPortfolio();
      setFile(empty);
      setFileHandle(null);
    } catch (error) {
      addError(SOURCE, `Не удалось создать пустой портфель: ${(error as Error).message}`);
    }
  }

  async function handleSaveClick() {
    if (!file) return;
    clearBySource(SOURCE);
    try {
      if (fileHandle) {
        await saveViaFileSystemAccess(file, fileHandle);
      } else if (isFileSystemAccessSupported()) {
        const handle = await saveViaFileSystemAccessNew(file);
        setFileHandle(handle);
      } else {
        downloadPortfolioFile(file);
      }
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
      addError(SOURCE, `Не удалось сохранить файл: ${(error as Error).message}`);
    }
  }

  async function handleIndexChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const newIndexId = event.target.value;
    if (!file || newIndexId === selectedIndex) return;
    setIsUpdating(true);
    clearBySource(INDEX_SOURCE);
    try {
      const { file: updated, liveByTicker: newLiveByTicker } = await switchIndex(
        file,
        liveByTicker,
        newIndexId
      );
      setFile(updated);
      setLiveByTicker(newLiveByTicker);
      setSelectedIndex(newIndexId);
    } catch (error) {
      addError(INDEX_SOURCE, `Не удалось переключить индекс: ${(error as Error).message}`);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <>
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
          Портфель-трекер
        </h1>
        <div className="header__actions">
          <button type="button" onClick={handleLoadClick}>
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
            <button type="button" onClick={handleStartEmpty}>
              Начать с пустого портфеля
            </button>
          )}
          {file && (
            <button type="button" onClick={handleSaveClick}>
              Сохранить
            </button>
          )}
          {file && (
            <button type="button" onClick={() => setShowBrokerConnections(true)}>
              Брокеры
            </button>
          )}
        </div>
      </header>
      {file && showBrokerConnections && (
        <BrokerConnectionsModal
          file={file}
          onUpdateFile={setFile}
          onClose={() => setShowBrokerConnections(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Run the full suite and typecheck**

Run: `npm run test`
Expected: all suites PASS

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev` (from `webapp/`), load or create a portfolio, click "Брокеры" in the header, confirm `BrokerConnectionsModal` opens with an empty list and an "Добавить подключение" button, and closes via "Закрыть".

- [ ] **Step 4: Commit**

```bash
git add webapp/src/components/Header.tsx
git commit -m "feat: add a Брокеры entry to the header"
```

---

### Task 16: Manual QA pass + final gate

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full verification gate**

Run: `npm run build` (from `webapp/`)
Expected: both `tsc` projects and `vite build` succeed with no errors

Run: `npm run lint`
Expected: no errors

Run: `npm run test`
Expected: all suites PASS

- [ ] **Step 2: Manual QA — add a connection and sync (requires a real T-Invest token)**

With `npm run dev` running and a portfolio loaded:
- Header → "Брокеры" → "Добавить подключение".
- Confirm the security warning paragraph is visible (first connection).
- Enter a real T-Invest token, click "Проверить и продолжить", confirm the account dropdown populates from `GetAccounts`.
- Enter a label and a passphrase, click "Добавить" — confirm the connection now appears in the list, unlocked (no 🔒, since the session cache was just populated by the add flow... note: if the add flow does not call `setSessionToken`, the connection will show locked immediately after adding; if so, click "Синхронизировать" and enter the same passphrase to unlock).
- Click "Синхронизировать" — confirm `BrokerSyncPreviewModal` opens showing a ticker/status/before→after table matching the real account's holdings.
- Click "Подтвердить" — confirm the modal closes and `PositionsTable`'s "Куплено" column shows the Σ hint badge with the correct tooltip breakdown for every synced ticker.
- Reload the page, load the same saved file, click "Брокеры" — confirm the connection shows 🔒 (new session), click "Разблокировать", enter the correct passphrase, confirm it unlocks; then try an intentionally wrong passphrase on a fresh unlock attempt and confirm the "Неверный пароль" message appears without crashing the app.

- [ ] **Step 3: Manual QA — old-file backward compatibility**

Take a `portfolio.json` saved before this feature (or hand-edit one to omit `brokerConnections`/`brokerHoldings`), load it, and confirm: the file loads without error, existing `sharesOwned` values are unchanged, "Куплено" shows no Σ hint for any position, and "Брокеры" opens to an empty connection list.

- [ ] **Step 4: Report results**

If any check in Step 2 or 3 fails, file it as a follow-up — this plan's tasks are already committed individually, so a failure here means adjusting a specific earlier task rather than reopening the whole plan. If Task 1 found CORS blocked and this plan was paused there, Steps 2–3 here are not applicable until that architectural question is resolved.
