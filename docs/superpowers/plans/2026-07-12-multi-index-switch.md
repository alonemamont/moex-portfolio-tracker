# Multi-Index Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user check portfolio compliance against IMOEX, MOEXBC, or MOEX10, and switch between them on an already-loaded portfolio without reloading the file.

**Architecture:** Parameterize the existing ISS composition fetch (`fetchIndexComposition`) with an `indexId`, thread it through `fetchMarketData` and a new shared `computeMarketSnapshot` helper inside `runMarketUpdate.ts`. Split that helper into two entry points: `runMarketUpdate` (existing behavior, appends a history snapshot) and a new `switchIndex` (same fetch+merge, no history write). `selectedIndex` and a shared `isUpdating` busy-flag move into `PortfolioContext`, persisted to `localStorage` (not the portfolio file). `Header.tsx`'s static "IMOEX" brand becomes a `<select>` wired to `switchIndex`.

**Tech Stack:** React 18 + TypeScript (strict), Vitest, MOEX ISS REST/XML API (`https://iss.moex.com/iss`).

## Global Constraints

- Real ISS secids only: `IMOEX`, `MOEXBC`, `MOEX10`. (`IRTS`/`IMOEX10` from the original request are not real secids — verified against the live API.) `RTSI` (USD-denominated RTS index) is explicitly out of scope.
- `portfolio.json` schema (`file/schema.ts`) does **not** change — `selectedIndex` lives only in `localStorage`.
- `file.history` is never modified by an index switch — only `runMarketUpdate` (the "Обновить" button / auto-update) appends history snapshots.
- Existing 2-arg call sites of `runMarketUpdate(file, previousLiveByTicker)` must keep working (default `indexId` param).
- All commands run with cwd `webapp/`.
- No new test infrastructure (no React Testing Library) — this repo has zero `.test.tsx` files today; UI-level changes (`Header.tsx`, `PortfolioTab.tsx`, `PortfolioContext.tsx`) are verified via `npm run typecheck` + manual check in the browser, consistent with existing project conventions.

---

### Task 1: `domain/indices.ts` — index list

**Files:**
- Create: `webapp/src/domain/indices.ts`
- Test: `webapp/src/domain/indices.test.ts`

**Interfaces:**
- Produces: `IndexOption { id: string; label: string }`, `INDEX_OPTIONS: IndexOption[]`, `DEFAULT_INDEX_ID: string` — consumed by Tasks 4, 6, 8.

- [ ] **Step 1: Write the failing test**

```ts
// webapp/src/domain/indices.test.ts
import { describe, it, expect } from "vitest";
import { INDEX_OPTIONS, DEFAULT_INDEX_ID } from "./indices";

describe("INDEX_OPTIONS", () => {
  it("lists IMOEX, MOEXBC, MOEX10 in that order", () => {
    expect(INDEX_OPTIONS.map((option) => option.id)).toEqual(["IMOEX", "MOEXBC", "MOEX10"]);
  });

  it("gives every option a non-empty label", () => {
    for (const option of INDEX_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});

describe("DEFAULT_INDEX_ID", () => {
  it("defaults to IMOEX", () => {
    expect(DEFAULT_INDEX_ID).toBe("IMOEX");
  });

  it("is one of the listed options", () => {
    expect(INDEX_OPTIONS.map((option) => option.id)).toContain(DEFAULT_INDEX_ID);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/indices.test.ts`
Expected: FAIL — `Failed to resolve import "./indices"`

- [ ] **Step 3: Write the implementation**

```ts
// webapp/src/domain/indices.ts
export interface IndexOption {
  id: string;
  label: string;
}

export const INDEX_OPTIONS: IndexOption[] = [
  { id: "IMOEX", label: "IMOEX" },
  { id: "MOEXBC", label: "MOEXBC" },
  { id: "MOEX10", label: "MOEX10" },
];

export const DEFAULT_INDEX_ID = "IMOEX";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/indices.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/domain/indices.ts webapp/src/domain/indices.test.ts
git commit -m "feat: add index list for IMOEX/MOEXBC/MOEX10"
```

---

### Task 2: `iss/client.ts` — parameterize `fetchIndexComposition`

**Files:**
- Modify: `webapp/src/iss/client.ts:12-25`
- Modify: `webapp/src/iss/client.test.ts:14-44`

**Interfaces:**
- Consumes: nothing new.
- Produces: `fetchIndexComposition(indexId: string): Promise<IndexCompositionEntry[]>` — consumed by Task 3.

- [ ] **Step 1: Update the existing test to pass `indexId` explicitly and add a new-index-id test**

Replace the `fetchIndexComposition` describe block (lines 14-44) with:

```ts
describe("fetchIndexComposition", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("limit=100");
        return new Response(compositionXml, { status: 200 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses ticker/shortName/weight from the analytics data block", async () => {
    const result = await fetchIndexComposition("IMOEX");
    expect(result).toEqual([
      { ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 },
      { ticker: "SBER", shortName: "Сбербанк", weight: 5.1 },
    ]);
  });

  it("requests the given indexId's analytics endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("/analytics/MOEXBC.xml");
        return new Response(compositionXml, { status: 200 });
      })
    );
    await fetchIndexComposition("MOEXBC");
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 }))
    );
    await expect(fetchIndexComposition("IMOEX")).rejects.toThrow(/composition request failed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/iss/client.test.ts -t "fetchIndexComposition"`
Expected: FAIL — TS error / assertion failure, since `fetchIndexComposition` still ignores its argument and hits the hardcoded `IMOEX` URL for the `MOEXBC` case.

- [ ] **Step 3: Parameterize the implementation**

In `webapp/src/iss/client.ts`, replace lines 12-13:

```ts
export async function fetchIndexComposition(): Promise<IndexCompositionEntry[]> {
  const url = `${ISS_BASE}/statistics/engines/stock/markets/index/analytics/IMOEX.xml?limit=100`;
```

with:

```ts
export async function fetchIndexComposition(indexId: string): Promise<IndexCompositionEntry[]> {
  const url = `${ISS_BASE}/statistics/engines/stock/markets/index/analytics/${indexId}.xml?limit=100`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/iss/client.test.ts -t "fetchIndexComposition"`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/iss/client.ts webapp/src/iss/client.test.ts
git commit -m "feat: parameterize fetchIndexComposition by indexId"
```

---

### Task 3: `iss/marketData.ts` — thread `indexId` through `fetchMarketData`

**Files:**
- Modify: `webapp/src/iss/marketData.ts:15-28`
- Modify: `webapp/src/iss/marketData.test.ts`

**Interfaces:**
- Consumes: `fetchIndexComposition(indexId: string)` from Task 2.
- Produces: `fetchMarketData(existingTickers: string[], indexId: string): Promise<MarketDataResult>` — consumed by Task 4.

- [ ] **Step 1: Update tests to pass `indexId` and assert it's forwarded**

Replace `webapp/src/iss/marketData.test.ts` in full with:

```ts
// webapp/src/iss/marketData.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchMarketData } from "./marketData";
import * as client from "./client";

afterEach(() => vi.restoreAllMocks());

describe("fetchMarketData", () => {
  it("unions existing portfolio tickers with the fresh index composition before fetching securities/dividends", async () => {
    const compositionSpy = vi.spyOn(client, "fetchIndexComposition").mockResolvedValue([
      { ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 },
    ]);
    const securitiesSpy = vi
      .spyOn(client, "fetchSecurities")
      .mockResolvedValue(new Map([["GAZP", { shortName: "ГАЗПРОМ ао", price: 92.79, lotSize: 10 }]]));
    const dividendsSpy = vi
      .spyOn(client, "fetchDividendsForTickers")
      .mockResolvedValue(new Map([["GAZP", 0]]));

    const result = await fetchMarketData(["DELISTED"], "IMOEX");

    expect(compositionSpy).toHaveBeenCalledWith("IMOEX");
    expect(securitiesSpy).toHaveBeenCalledWith(expect.arrayContaining(["GAZP", "DELISTED"]));
    expect(dividendsSpy).toHaveBeenCalledWith(expect.arrayContaining(["GAZP", "DELISTED"]));
    expect(result.composition).toHaveLength(1);
  });

  it("forwards the given indexId to fetchIndexComposition", async () => {
    const compositionSpy = vi.spyOn(client, "fetchIndexComposition").mockResolvedValue([]);
    vi.spyOn(client, "fetchSecurities").mockResolvedValue(new Map());
    vi.spyOn(client, "fetchDividendsForTickers").mockResolvedValue(new Map());

    await fetchMarketData([], "MOEXBC");

    expect(compositionSpy).toHaveBeenCalledWith("MOEXBC");
  });

  it("propagates a composition failure without calling securities/dividends", async () => {
    vi.spyOn(client, "fetchIndexComposition").mockRejectedValue(new Error("network down"));
    const securitiesSpy = vi.spyOn(client, "fetchSecurities");

    await expect(fetchMarketData([], "IMOEX")).rejects.toThrow("network down");
    expect(securitiesSpy).not.toHaveBeenCalled();
  });

  it("propagates a securities failure (all-or-nothing)", async () => {
    vi.spyOn(client, "fetchIndexComposition").mockResolvedValue([]);
    vi.spyOn(client, "fetchSecurities").mockRejectedValue(new Error("securities down"));
    vi.spyOn(client, "fetchDividendsForTickers").mockResolvedValue(new Map());

    await expect(fetchMarketData([], "IMOEX")).rejects.toThrow("securities down");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/iss/marketData.test.ts`
Expected: FAIL — TS error, `fetchMarketData` doesn't accept a second argument yet, and `fetchIndexComposition` is still called with zero args.

- [ ] **Step 3: Update the implementation**

Replace `webapp/src/iss/marketData.ts` in full with:

```ts
import {
  fetchIndexComposition,
  fetchSecurities,
  fetchDividendsForTickers,
  IndexCompositionEntry,
  SecurityInfo,
} from "./client";

export interface MarketDataResult {
  composition: IndexCompositionEntry[];
  securities: Map<string, SecurityInfo>;
  dividends: Map<string, number>;
}

export async function fetchMarketData(
  existingTickers: string[],
  indexId: string
): Promise<MarketDataResult> {
  const composition = await fetchIndexComposition(indexId);

  const allTickers = Array.from(
    new Set([...existingTickers, ...composition.map((c) => c.ticker)])
  );

  const [securities, dividends] = await Promise.all([
    fetchSecurities(allTickers),
    fetchDividendsForTickers(allTickers),
  ]);

  return { composition, securities, dividends };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/iss/marketData.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/iss/marketData.ts webapp/src/iss/marketData.test.ts
git commit -m "feat: thread indexId through fetchMarketData"
```

---

### Task 4: `portfolio/runMarketUpdate.ts` — shared snapshot helper + `switchIndex`

**Files:**
- Modify: `webapp/src/portfolio/runMarketUpdate.ts`
- Modify: `webapp/src/portfolio/runMarketUpdate.test.ts`
- Create: `webapp/src/portfolio/switchIndex.test.ts`

**Interfaces:**
- Consumes: `fetchMarketData(existingTickers, indexId)` (Task 3), `DEFAULT_INDEX_ID` (Task 1), `mergeMarketData`, `buildCalculatedPositions`, `createSectorResolver`, `SECTORS_DEFAULT`, `createHistorySnapshot` (all pre-existing, unchanged signatures).
- Produces:
  - `runMarketUpdate(currentFile: PortfolioFile, previousLiveByTicker?: Map<string, LiveData>, indexId?: string): Promise<{ file: PortfolioFile; liveByTicker: Map<string, LiveData> }>` (default `previousLiveByTicker = new Map()`, default `indexId = DEFAULT_INDEX_ID`) — consumed by Task 7.
  - `switchIndex(currentFile: PortfolioFile, previousLiveByTicker: Map<string, LiveData>, indexId: string): Promise<{ file: PortfolioFile; liveByTicker: Map<string, LiveData> }>` — consumed by Task 8.

- [ ] **Step 1: Add a failing test asserting `runMarketUpdate` forwards `indexId`**

Append to `webapp/src/portfolio/runMarketUpdate.test.ts` (inside the existing `describe("runMarketUpdate", ...)` block, after the last `it`):

```ts
  it("forwards the given indexId to fetchMarketData, defaulting to IMOEX", async () => {
    const fetchSpy = vi.spyOn(marketDataModule, "fetchMarketData").mockResolvedValue({
      composition: [],
      securities: new Map(),
      dividends: new Map(),
    });

    await runMarketUpdate(baseFile);
    expect(fetchSpy).toHaveBeenLastCalledWith(["GAZP"], "IMOEX");

    await runMarketUpdate(baseFile, new Map(), "MOEXBC");
    expect(fetchSpy).toHaveBeenLastCalledWith(["GAZP"], "MOEXBC");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/portfolio/runMarketUpdate.test.ts`
Expected: FAIL — `fetchMarketData` still called with a single argument (`existingTickers` only).

- [ ] **Step 3: Write the failing test for `switchIndex`**

```ts
// webapp/src/portfolio/switchIndex.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { switchIndex } from "./runMarketUpdate";
import * as marketDataModule from "../iss/marketData";
import { PortfolioFile } from "../types";

afterEach(() => vi.restoreAllMocks());

const baseFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 10 }],
  sectors: {},
  history: [{ timestamp: "2026-07-10T00:00:00.000Z", portfolioValue: 100, avgCompliance: 1, snapshot: [] }],
};

describe("switchIndex", () => {
  it("merges the new index's composition into positions without appending a history snapshot", async () => {
    const fetchSpy = vi.spyOn(marketDataModule, "fetchMarketData").mockResolvedValue({
      composition: [
        { ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 12.44 },
        { ticker: "LKOH", shortName: "ЛУКОЙЛ", weight: 16.12 },
      ],
      securities: new Map([
        ["GAZP", { shortName: "ГАЗПРОМ ао", price: 92.79, lotSize: 10 }],
        ["LKOH", { shortName: "ЛУКОЙЛ", price: 7000, lotSize: 1 }],
      ]),
      dividends: new Map([["GAZP", 0], ["LKOH", 0]]),
    });

    const { file: updated, liveByTicker } = await switchIndex(baseFile, new Map(), "MOEXBC");

    expect(fetchSpy).toHaveBeenCalledWith(["GAZP"], "MOEXBC");
    expect(updated.history).toBe(baseFile.history);
    expect(updated.history).toHaveLength(1);
    expect(updated.positions.map((p) => p.ticker)).toEqual(["GAZP", "LKOH"]);
    expect(updated.positions.find((p) => p.ticker === "LKOH")?.sharesOwned).toBe(0);
    expect(updated.positions.find((p) => p.ticker === "GAZP")?.sharesOwned).toBe(10);
    expect(liveByTicker.get("LKOH")?.indexWeight).toBe(16.12);
  });

  it("propagates the underlying fetch error without mutating the file", async () => {
    vi.spyOn(marketDataModule, "fetchMarketData").mockRejectedValue(new Error("ISS down"));
    await expect(switchIndex(baseFile, new Map(), "MOEXBC")).rejects.toThrow("ISS down");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/portfolio/switchIndex.test.ts`
Expected: FAIL — `switchIndex` is not exported from `./runMarketUpdate`.

- [ ] **Step 5: Refactor the implementation**

Replace `webapp/src/portfolio/runMarketUpdate.ts` in full with:

```ts
import { PortfolioFile, LiveData, Position, CalculatedPosition } from "../types";
import { fetchMarketData } from "../iss/marketData";
import { mergeMarketData } from "../domain/merge";
import { buildCalculatedPositions } from "../domain/buildCalculatedPositions";
import { createSectorResolver } from "../domain/sectors";
import { SECTORS_DEFAULT } from "../data/sectorsDefault";
import { createHistorySnapshot } from "../domain/createHistorySnapshot";
import { DEFAULT_INDEX_ID } from "../domain/indices";

interface MarketSnapshot {
  positions: Position[];
  liveByTicker: Map<string, LiveData>;
  calculated: CalculatedPosition[];
  portfolioValue: number;
}

async function computeMarketSnapshot(
  currentFile: PortfolioFile,
  previousLiveByTicker: Map<string, LiveData>,
  indexId: string
): Promise<MarketSnapshot> {
  const existingTickers = currentFile.positions.map((p) => p.ticker);
  const marketData = await fetchMarketData(existingTickers, indexId);

  const { positions, liveByTicker } = mergeMarketData(
    currentFile.positions,
    marketData.composition,
    marketData.securities,
    marketData.dividends,
    previousLiveByTicker
  );

  const resolveSector = createSectorResolver(SECTORS_DEFAULT, currentFile.sectors);
  const calculated = buildCalculatedPositions(positions, liveByTicker, resolveSector);
  const portfolioValue = calculated.reduce((sum, p) => sum + p.positionValue, 0);

  return { positions, liveByTicker, calculated, portfolioValue };
}

export async function runMarketUpdate(
  currentFile: PortfolioFile,
  previousLiveByTicker: Map<string, LiveData> = new Map(),
  indexId: string = DEFAULT_INDEX_ID
): Promise<{ file: PortfolioFile; liveByTicker: Map<string, LiveData> }> {
  const { positions, liveByTicker, calculated, portfolioValue } = await computeMarketSnapshot(
    currentFile,
    previousLiveByTicker,
    indexId
  );
  const snapshot = createHistorySnapshot(calculated, portfolioValue);

  return {
    file: {
      ...currentFile,
      positions,
      history: [...currentFile.history, snapshot],
    },
    liveByTicker,
  };
}

export async function switchIndex(
  currentFile: PortfolioFile,
  previousLiveByTicker: Map<string, LiveData>,
  indexId: string
): Promise<{ file: PortfolioFile; liveByTicker: Map<string, LiveData> }> {
  const { positions, liveByTicker } = await computeMarketSnapshot(
    currentFile,
    previousLiveByTicker,
    indexId
  );

  return {
    file: { ...currentFile, positions },
    liveByTicker,
  };
}
```

- [ ] **Step 6: Run both test files to verify everything passes**

Run: `npx vitest run src/portfolio/runMarketUpdate.test.ts src/portfolio/switchIndex.test.ts`
Expected: PASS (4 tests in `runMarketUpdate.test.ts`, 2 tests in `switchIndex.test.ts`)

- [ ] **Step 7: Commit**

```bash
git add webapp/src/portfolio/runMarketUpdate.ts webapp/src/portfolio/runMarketUpdate.test.ts webapp/src/portfolio/switchIndex.test.ts
git commit -m "feat: extract computeMarketSnapshot, add switchIndex (no history append)"
```

---

### Task 5: `portfolio/indexPref.ts` — localStorage persistence for selected index

**Files:**
- Create: `webapp/src/portfolio/indexPref.ts`
- Test: `webapp/src/portfolio/indexPref.test.ts`

**Interfaces:**
- Produces: `loadSelectedIndexPref(defaultIndexId: string): string`, `saveSelectedIndexPref(value: string): void` — consumed by Task 6.

- [ ] **Step 1: Write the failing test**

```ts
// webapp/src/portfolio/indexPref.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadSelectedIndexPref, saveSelectedIndexPref } from "./indexPref";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("selectedIndex pref", () => {
  it("returns the given default when nothing stored", () => {
    expect(loadSelectedIndexPref("IMOEX")).toBe("IMOEX");
  });

  it("round-trips a saved value", () => {
    saveSelectedIndexPref("MOEXBC");
    expect(loadSelectedIndexPref("IMOEX")).toBe("MOEXBC");
  });

  it("returns the default when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadSelectedIndexPref("IMOEX")).toBe("IMOEX");
  });

  it("does not throw when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveSelectedIndexPref("MOEX10")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/portfolio/indexPref.test.ts`
Expected: FAIL — `Failed to resolve import "./indexPref"`

- [ ] **Step 3: Write the implementation**

```ts
// webapp/src/portfolio/indexPref.ts
const SELECTED_INDEX_KEY = "moex-portfolio-tracker:selectedIndex";

export function loadSelectedIndexPref(defaultIndexId: string): string {
  try {
    return localStorage.getItem(SELECTED_INDEX_KEY) ?? defaultIndexId;
  } catch {
    return defaultIndexId;
  }
}

export function saveSelectedIndexPref(value: string): void {
  try {
    localStorage.setItem(SELECTED_INDEX_KEY, value);
  } catch {
    // Swallow error — persistence is best-effort
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/portfolio/indexPref.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/portfolio/indexPref.ts webapp/src/portfolio/indexPref.test.ts
git commit -m "feat: persist selected index in localStorage"
```

---

### Task 6: `PortfolioContext` — `selectedIndex` + shared `isUpdating`

**Files:**
- Modify: `webapp/src/portfolio/usePortfolio.ts:4-11`
- Modify: `webapp/src/portfolio/PortfolioContext.tsx`

**Interfaces:**
- Consumes: `DEFAULT_INDEX_ID` (Task 1), `loadSelectedIndexPref`/`saveSelectedIndexPref` (Task 5).
- Produces: `PortfolioContextValue` gains `selectedIndex: string`, `setSelectedIndex: (indexId: string) => void`, `isUpdating: boolean`, `setIsUpdating: (isUpdating: boolean) => void` — consumed by Tasks 7 and 8.

- [ ] **Step 1: Extend the context type**

In `webapp/src/portfolio/usePortfolio.ts`, replace the `PortfolioContextValue` interface (lines 4-11):

```ts
export interface PortfolioContextValue {
  file: PortfolioFile | null;
  setFile: (file: PortfolioFile) => void;
  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;
  liveByTicker: Map<string, LiveData>;
  setLiveByTicker: (liveByTicker: Map<string, LiveData>) => void;
  selectedIndex: string;
  setSelectedIndex: (indexId: string) => void;
  isUpdating: boolean;
  setIsUpdating: (isUpdating: boolean) => void;
}
```

- [ ] **Step 2: Wire the provider**

Replace `webapp/src/portfolio/PortfolioContext.tsx` in full with:

```tsx
import React, { useState, useEffect } from "react";
import { PortfolioFile, LiveData } from "../types";
import { PortfolioContext } from "./usePortfolio";
import { DEFAULT_INDEX_ID } from "../domain/indices";
import { loadSelectedIndexPref, saveSelectedIndexPref } from "./indexPref";

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<PortfolioFile | null>(null);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [liveByTicker, setLiveByTicker] = useState<Map<string, LiveData>>(new Map());
  const [selectedIndex, setSelectedIndex] = useState(() => loadSelectedIndexPref(DEFAULT_INDEX_ID));
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    saveSelectedIndexPref(selectedIndex);
  }, [selectedIndex]);

  return (
    <PortfolioContext.Provider
      value={{
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
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}
```

- [ ] **Step 3: Typecheck (no dedicated test file — repo has no component-test infra; type errors here would also break Tasks 7/8 which consume the new fields)**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors related to `PortfolioContext.tsx` or `usePortfolio.ts`. (Task 7/8 aren't done yet, so `Header.tsx`/`PortfolioTab.tsx` won't reference the new fields yet — this just confirms the context/provider compile cleanly on their own.)

- [ ] **Step 4: Commit**

```bash
git add webapp/src/portfolio/usePortfolio.ts webapp/src/portfolio/PortfolioContext.tsx
git commit -m "feat: add selectedIndex and shared isUpdating to PortfolioContext"
```

---

### Task 7: `PortfolioTab.tsx` — consume `selectedIndex` / shared `isUpdating`

**Files:**
- Modify: `webapp/src/components/PortfolioTab.tsx`

**Interfaces:**
- Consumes: `selectedIndex`, `isUpdating`, `setIsUpdating` from `usePortfolio()` (Task 6); `runMarketUpdate(file, previousLiveByTicker, indexId)` (Task 4).
- Produces: no new exports — `PortfolioTab` behavior only.

- [ ] **Step 1: Update the component**

In `webapp/src/components/PortfolioTab.tsx`, replace line 20 and the `isUpdating` state declaration (line 22):

```ts
  const { file, setFile, liveByTicker, setLiveByTicker } = usePortfolio();
  const { addError, clearBySource } = useErrors();
  const [isUpdating, setIsUpdating] = useState(false);
```

with:

```ts
  const { file, setFile, liveByTicker, setLiveByTicker, selectedIndex, isUpdating, setIsUpdating } =
    usePortfolio();
  const { addError, clearBySource } = useErrors();
```

Remove the now-unused `useState` import if nothing else in the file still uses it — check first: `search`/`hideEmpty` still use `useState`, so keep the import, just drop the `isUpdating` line above.

Then update `handleUpdate` (lines 36-52) to pass `selectedIndex` through:

```ts
  async function handleUpdate() {
    if (!file) return;
    setIsUpdating(true);
    clearBySource(SOURCE);
    try {
      const { file: updated, liveByTicker: newLiveByTicker } = await runMarketUpdate(
        file,
        liveByTicker,
        selectedIndex
      );
      setFile(updated);
      setLiveByTicker(newLiveByTicker);
    } catch (error) {
      addError(SOURCE, `Не удалось обновить рыночные данные: ${(error as Error).message}`);
    } finally {
      setIsUpdating(false);
    }
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full test suite (regression check — PortfolioTab has no dedicated test file, but this confirms nothing else broke)**

Run: `npx vitest run`
Expected: all existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add webapp/src/components/PortfolioTab.tsx
git commit -m "feat: PortfolioTab reads selectedIndex/isUpdating from PortfolioContext"
```

---

### Task 8: `Header.tsx` — index `<select>` wired to `switchIndex`

**Files:**
- Modify: `webapp/src/components/Header.tsx`

**Interfaces:**
- Consumes: `selectedIndex`, `setSelectedIndex`, `isUpdating`, `setIsUpdating` from `usePortfolio()` (Task 6); `switchIndex(file, previousLiveByTicker, indexId)` (Task 4); `INDEX_OPTIONS` (Task 1).
- Produces: no new exports — `Header` behavior only.

- [ ] **Step 1: Update imports and context destructuring**

In `webapp/src/components/Header.tsx`, replace the import block (lines 1-16) with:

```tsx
import { useRef } from "react";
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

const SOURCE = "file";
const INDEX_SOURCE = "index-switch";
```

Replace line 19 (`const { file, setFile, fileHandle, setFileHandle } = usePortfolio();`) with:

```tsx
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
```

- [ ] **Step 2: Add the index-switch handler**

Add after `handleSaveClick` (after line 81, before the `return`):

```tsx
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
```

- [ ] **Step 3: Replace the static brand with the select**

Replace lines 85-88:

```tsx
      <h1 className="header__title">
        <span className="header__brand">IMOEX</span>
        Портфель-трекер
      </h1>
```

with:

```tsx
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
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all existing tests PASS.

- [ ] **Step 6: Manual verification in the browser**

Run: `npm run dev`, open the app, load (or create an empty) portfolio, click "Обновить" once so live data exists.
Check:
- Header shows a dropdown with IMOEX/MOEXBC/MOEX10 instead of static text.
- Switching to MOEXBC: table re-renders with MOEXBC weights/statuses within a couple seconds, new blue-chip tickers not already in the portfolio appear with 0 shares, `Обновить` button's history count does NOT grow.
- Switching back to IMOEX restores IMOEX weights.
- Reload the page: the last-selected index is still shown (localStorage persistence).
- Turn off network (devtools offline) and switch index: an error appears via the existing error panel, selection reverts to the previous index, no crash.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/components/Header.tsx
git commit -m "feat: index switcher in Header wired to switchIndex"
```

---

## Self-Review Notes

- **Spec coverage:** index list (Task 1) · parameterized composition fetch (Task 2) · `fetchMarketData` threading (Task 3) · `runMarketUpdate`/`switchIndex` split, no history on switch (Task 4) · localStorage persistence, not in `portfolio.json` (Task 5) · `selectedIndex`/`isUpdating` in context (Task 6) · `PortfolioTab` uses shared state (Task 7) · Header `<select>`, auto-fetch on change, error handling that reverts selection (Task 8). RTSI exclusion and schema-unchanged constraints are called out in Global Constraints. All spec sections have a matching task.
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact command with expected output.
- **Type consistency:** `runMarketUpdate`/`switchIndex` signatures match between Task 4 (producer) and Tasks 7/8 (consumers); `PortfolioContextValue` fields added in Task 6 match the destructuring used in Tasks 7/8; `IndexOption`/`INDEX_OPTIONS`/`DEFAULT_INDEX_ID` names match between Task 1 (producer) and Tasks 4/6/8 (consumers).
