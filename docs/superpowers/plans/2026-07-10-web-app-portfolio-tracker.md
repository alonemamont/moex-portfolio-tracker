# Портфель-трекер IMOEX: веб-приложение — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Клиентское React-приложение (без бэкенда), которое показывает состав индекса IMOEX с live-данными MOEX ISS, ведёт личный портфель поверх него, считает соответствие индексу и стоимость, хранит историю и рисует графики — всё в одном JSON-файле на диске пользователя.

**Architecture:** Vite + React + TypeScript SPA. Прямые fetch-запросы браузера к MOEX ISS (CORS подтверждён). Чистые функции для всех расчётов/сопоставлений (domain layer), отдельно от React-компонентов. Файл пользователя читается/пишется через File System Access API с fallback на `<input type=file>`/download. Деплой — статика на GitHub Pages через GitHub Actions.

**Tech Stack:** React 18, TypeScript, Vite, Vitest (+ jsdom для DOMParser в тестах), Recharts (графики), Zod (валидация схемы файла), без сторонних стейт-менеджеров (React hooks/Context).

## Global Constraints

- ISS-запросы состава индекса и цен/лотности **обязательно** с `limit=100` — без этого параметра ISS молча обрезает список до 20 строк.
- Пул параллельных запросов дивидендов: 5-6 одновременных (не последовательно, не безлимитно).
- «Всё или ничего» — только для запросов состава индекса и цен/лотности: ошибка любого из двух → всё обновление считается неуспешным, старые данные не трогать. Единичная ошибка дивиденда по одному тикеру не блокирует остальное обновление (значение = 0).
- Новая позиция (тикер в составе индекса, которого нет в портфеле) — `coefficient = 1`, `sharesOwned = 0`.
- Ручные поля (`coefficient`, `sharesOwned`) никогда не перезаписываются рыночным обновлением.
- Сопоставление тикеров — регистронезависимое.
- Формат файла пользователя: `version: 1` (литерал).
- Итоговый сектор тикера: `overrides[ticker] ?? defaultSectors[ticker] ?? "Другое"`.
- Статусы для UI: `in_index` → «в индексе», `out_of_index` → «вне индекса».
- Репозиторий: `alonemamont/moex-portfolio-tracker` → GitHub Pages base path `/moex-portfolio-tracker/`.
- Приложение живёт в поддиректории `webapp/` репозитория (рядом с существующими `docs/` и xlsx-прототипом).

---

## Task 1: Project scaffold

**Files:**
- Create: `webapp/package.json`
- Create: `webapp/tsconfig.json`
- Create: `webapp/tsconfig.node.json`
- Create: `webapp/vite.config.ts`
- Create: `webapp/index.html`
- Create: `webapp/src/main.tsx`
- Create: `webapp/src/App.tsx`
- Create: `webapp/src/styles.css`
- Create: `webapp/.gitignore`

**Interfaces:**
- Produces: `App` React component (default export from `src/App.tsx`), rendered by `main.tsx` into `#root`. Later tasks replace `App`'s body but keep the default export shape `export default function App(): JSX.Element`.

- [ ] **Step 1: Create `webapp/package.json`**

```json
{
  "name": "moex-portfolio-tracker-webapp",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `webapp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `webapp/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `webapp/vite.config.ts`**

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/moex-portfolio-tracker/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 5: Create `webapp/index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Портфель-трекер IMOEX</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `webapp/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: Create `webapp/src/App.tsx` (placeholder shell, replaced in Task 21)**

```tsx
export default function App() {
  return (
    <div className="app">
      <h1>Портфель-трекер IMOEX</h1>
      <p>Приложение в разработке.</p>
    </div>
  );
}
```

- [ ] **Step 8: Create `webapp/src/styles.css`**

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #1a1a1a;
}

.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
```

- [ ] **Step 9: Create `webapp/.gitignore`**

```
node_modules
dist
*.local
```

- [ ] **Step 10: Install dependencies and verify dev server starts**

Run: `cd webapp && npm install`
Expected: installs without errors.

Run: `npm run build`
Expected: builds successfully, produces `webapp/dist/`.

- [ ] **Step 11: Commit**

```bash
git add webapp/package.json webapp/tsconfig.json webapp/tsconfig.node.json webapp/vite.config.ts webapp/index.html webapp/src/main.tsx webapp/src/App.tsx webapp/src/styles.css webapp/.gitignore
git commit -m "chore: scaffold Vite+React+TS web app"
```

---

## Task 2: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `webapp/package.json` build script (`npm run build`) from Task 1, producing `webapp/dist/`.

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy web app to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - "webapp/**"
      - ".github/workflows/deploy.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: webapp/package-lock.json
      - name: Install dependencies
        working-directory: webapp
        run: npm ci
      - name: Build
        working-directory: webapp
        run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: webapp/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify workflow YAML is well-formed**

Run: `cd "E:/work/micex_index" && python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml', encoding='utf-8'))"`
Expected: no output, no error (empty exit).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Pages deploy workflow for webapp"
```

Note: `npm ci` in CI requires `webapp/package-lock.json` to exist — it will after Task 1's `npm install` is run and committed (see Task 1 Step 10-11; if `package-lock.json` wasn't staged there, add it here before committing).

---

## Task 3: Core domain types

**Files:**
- Create: `webapp/src/types.ts`

**Interfaces:**
- Produces: `IndexStatus`, `Position`, `LiveData`, `CalculatedPosition`, `HistorySnapshotRow`, `HistorySnapshot`, `PortfolioFile` — used by every later domain/UI task.

- [ ] **Step 1: Write `webapp/src/types.ts`**

```typescript
export type IndexStatus = "in_index" | "out_of_index";

export const STATUS_LABELS: Record<IndexStatus, string> = {
  in_index: "в индексе",
  out_of_index: "вне индекса",
};

/** Ручные поля пользователя — никогда не перезаписываются обновлением рынка. */
export interface Position {
  ticker: string;
  coefficient: number;
  sharesOwned: number;
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

export interface PortfolioFile {
  version: 1;
  positions: Position[];
  sectors: Record<string, string>;
  history: HistorySnapshot[];
}
```

- [ ] **Step 2: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/types.ts
git commit -m "feat: add core domain types"
```

---

## Task 4: ISS XML parser

**Files:**
- Create: `webapp/src/iss/xml.ts`
- Test: `webapp/src/iss/xml.test.ts`

**Interfaces:**
- Produces: `parseIssDataBlock(xmlText: string, dataId: string): Record<string, string>[]` — used by every ISS client function in Task 6-8.

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/iss/xml.test.ts
import { describe, it, expect } from "vitest";
import { parseIssDataBlock } from "./xml";

const compositionXml = `<?xml version="1.0" encoding="UTF-8"?>
<document>
<data id="analytics">
<rows>
<row indexid="IMOEX" ticker="GAZP" shortnames="ГАЗПРОМ ао" weight="9.32" />
<row indexid="IMOEX" ticker="SBER" shortnames="Сбербанк" weight="5.1" />
</rows>
</data>
</document>`;

describe("parseIssDataBlock", () => {
  it("parses rows within the named data block into attribute maps", () => {
    const rows = parseIssDataBlock(compositionXml, "analytics");
    expect(rows).toEqual([
      { indexid: "IMOEX", ticker: "GAZP", shortnames: "ГАЗПРОМ ао", weight: "9.32" },
      { indexid: "IMOEX", ticker: "SBER", shortnames: "Сбербанк", weight: "5.1" },
    ]);
  });

  it("throws when the named data block is missing", () => {
    expect(() => parseIssDataBlock(compositionXml, "marketdata")).toThrow(
      /data block "marketdata" not found/
    );
  });

  it("throws on malformed XML", () => {
    expect(() => parseIssDataBlock("<document><data", "analytics")).toThrow(
      /ISS XML parse error/
    );
  });

  it("returns an empty array when the data block has no rows", () => {
    const empty = `<document><data id="analytics"><rows></rows></data></document>`;
    expect(parseIssDataBlock(empty, "analytics")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/iss/xml.test.ts`
Expected: FAIL — `parseIssDataBlock` is not defined / module not found.

- [ ] **Step 3: Write `webapp/src/iss/xml.ts`**

```typescript
export type IssRow = Record<string, string>;

export function parseIssDataBlock(xmlText: string, dataId: string): IssRow[] {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(`ISS XML parse error: ${parserError.textContent}`);
  }

  const dataBlock = doc.querySelector(`data[id="${dataId}"]`);
  if (!dataBlock) {
    throw new Error(`ISS XML: data block "${dataId}" not found`);
  }

  const rowElements = Array.from(dataBlock.querySelectorAll("rows > row"));
  return rowElements.map((row) => {
    const record: IssRow = {};
    for (const attr of Array.from(row.attributes)) {
      record[attr.name] = attr.value;
    }
    return record;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/iss/xml.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/iss/xml.ts webapp/src/iss/xml.test.ts
git commit -m "feat: add generic ISS XML data-block parser"
```

---

## Task 5: Concurrency-limited task pool

**Files:**
- Create: `webapp/src/concurrency/pLimit.ts`
- Test: `webapp/src/concurrency/pLimit.test.ts`

**Interfaces:**
- Produces: `pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T>` — used by Task 8's dividend pool.

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/concurrency/pLimit.test.ts
import { describe, it, expect } from "vitest";
import { pLimit } from "./pLimit";

describe("pLimit", () => {
  it("never runs more than `concurrency` tasks at once", async () => {
    const limit = pLimit(2);
    let active = 0;
    let maxActive = 0;

    const task = () =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active--;
        return active;
      });

    await Promise.all([task(), task(), task(), task(), task()]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("resolves each task with its own return value", async () => {
    const limit = pLimit(3);
    const results = await Promise.all([
      limit(async () => 1),
      limit(async () => 2),
      limit(async () => 3),
    ]);
    expect(results).toEqual([1, 2, 3]);
  });

  it("propagates individual task rejections without blocking others", async () => {
    const limit = pLimit(2);
    const results = await Promise.allSettled([
      limit(async () => {
        throw new Error("boom");
      }),
      limit(async () => "ok"),
    ]);
    expect(results[0].status).toBe("rejected");
    expect(results[1]).toEqual({ status: "fulfilled", value: "ok" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/concurrency/pLimit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/concurrency/pLimit.ts`**

```typescript
export function pLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function next() {
    active--;
    const run = queue.shift();
    if (run) run();
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(
          (value) => {
            resolve(value);
            next();
          },
          (error) => {
            reject(error);
            next();
          }
        );
      };
      if (active < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/concurrency/pLimit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/concurrency/pLimit.ts webapp/src/concurrency/pLimit.test.ts
git commit -m "feat: add concurrency-limited task pool"
```

---

## Task 6: ISS client — index composition

**Files:**
- Create: `webapp/src/iss/client.ts`
- Test: `webapp/src/iss/client.test.ts`

**Interfaces:**
- Consumes: `parseIssDataBlock` from Task 4 (`webapp/src/iss/xml.ts`).
- Produces: `fetchIndexComposition(): Promise<IndexCompositionEntry[]>` and type `IndexCompositionEntry { ticker: string; shortName: string; weight: number }` — used by Task 9's `fetchMarketData` and Task 10's `mergeMarketData`.

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/iss/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchIndexComposition } from "./client";

const compositionXml = `<?xml version="1.0" encoding="UTF-8"?>
<document>
<data id="analytics">
<rows>
<row indexid="IMOEX" tradedate="2026-07-09" ticker="GAZP" shortnames="ГАЗПРОМ ао" secids="GAZP" weight="9.32" />
<row indexid="IMOEX" tradedate="2026-07-09" ticker="SBER" shortnames="Сбербанк" secids="SBER" weight="5.1" />
</rows>
</data>
</document>`;

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
    const result = await fetchIndexComposition();
    expect(result).toEqual([
      { ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 },
      { ticker: "SBER", shortName: "Сбербанк", weight: 5.1 },
    ]);
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 }))
    );
    await expect(fetchIndexComposition()).rejects.toThrow(/composition request failed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/iss/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/iss/client.ts` (index composition only)**

```typescript
import { parseIssDataBlock } from "./xml";

const ISS_BASE = "https://iss.moex.com/iss";

export interface IndexCompositionEntry {
  ticker: string;
  shortName: string;
  weight: number;
}

export async function fetchIndexComposition(): Promise<IndexCompositionEntry[]> {
  const url = `${ISS_BASE}/statistics/engines/stock/markets/index/analytics/IMOEX.xml?limit=100`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ISS composition request failed: ${response.status}`);
  }
  const text = await response.text();
  const rows = parseIssDataBlock(text, "analytics");
  return rows.map((row) => ({
    ticker: row.ticker,
    shortName: row.shortnames,
    weight: Number(row.weight),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/iss/client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/iss/client.ts webapp/src/iss/client.test.ts
git commit -m "feat: fetch IMOEX index composition from ISS"
```

---

## Task 7: ISS client — securities (price + lot size)

**Files:**
- Modify: `webapp/src/iss/client.ts`
- Modify: `webapp/src/iss/client.test.ts`

**Interfaces:**
- Consumes: `parseIssDataBlock` (Task 4).
- Produces: `fetchSecurities(tickers: string[]): Promise<Map<string, SecurityInfo>>` and type `SecurityInfo { shortName: string; price: number | null; lotSize: number | null }` — used by Task 9's `fetchMarketData` and Task 10's `mergeMarketData`.

- [ ] **Step 1: Add failing tests to `webapp/src/iss/client.test.ts`**

```typescript
// append to webapp/src/iss/client.test.ts, alongside existing imports:
// import { fetchIndexComposition, fetchSecurities } from "./client";

const securitiesXml = `<?xml version="1.0" encoding="UTF-8"?>
<document>
<data id="securities">
<rows>
<row SECID="GAZP" BOARDID="TQBR" SHORTNAME="ГАЗПРОМ ао" PREVPRICE="93.2" LOTSIZE="10" />
<row SECID="SBER" BOARDID="TQBR" SHORTNAME="Сбербанк" PREVPRICE="294.54" LOTSIZE="1" />
<row SECID="DLST" BOARDID="TQBR" SHORTNAME="Делистнутая" PREVPRICE="10" LOTSIZE="1" />
</rows>
</data>
<data id="marketdata">
<rows>
<row SECID="GAZP" BOARDID="TQBR" LAST="92.79" />
<row SECID="SBER" BOARDID="TQBR" LAST="" />
<row SECID="DLST" BOARDID="TQBR" LAST="" />
</rows>
</data>
</document>`;

describe("fetchSecurities", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("limit=100");
        expect(url).toContain("securities=GAZP,SBER,DLST");
        return new Response(securitiesXml, { status: 200 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers LAST when present, falls back to PREVPRICE when LAST is empty", async () => {
    const result = await fetchSecurities(["GAZP", "SBER", "DLST"]);
    expect(result.get("GAZP")).toEqual({ shortName: "ГАЗПРОМ ао", price: 92.79, lotSize: 10 });
    expect(result.get("SBER")).toEqual({ shortName: "Сбербанк", price: 294.54, lotSize: 1 });
    expect(result.get("DLST")).toEqual({ shortName: "Делистнутая", price: 10, lotSize: 1 });
  });

  it("returns an empty map without a network call for an empty ticker list", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await fetchSecurities([]);
    expect(result.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/iss/client.test.ts`
Expected: FAIL — `fetchSecurities` is not exported.

- [ ] **Step 3: Append to `webapp/src/iss/client.ts`**

```typescript
export interface SecurityInfo {
  shortName: string;
  price: number | null;
  lotSize: number | null;
}

export async function fetchSecurities(tickers: string[]): Promise<Map<string, SecurityInfo>> {
  if (tickers.length === 0) return new Map();

  const url = `${ISS_BASE}/engines/stock/markets/shares/boards/TQBR/securities.xml?securities=${tickers.join(
    ","
  )}&limit=100`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ISS securities request failed: ${response.status}`);
  }
  const text = await response.text();

  const securitiesRows = parseIssDataBlock(text, "securities");
  const marketdataRows = parseIssDataBlock(text, "marketdata");

  const result = new Map<string, SecurityInfo>();
  const prevPriceBySecid = new Map<string, number>();

  for (const row of securitiesRows) {
    const price = row.PREVPRICE ? Number(row.PREVPRICE) : null;
    result.set(row.SECID, {
      shortName: row.SHORTNAME,
      price,
      lotSize: row.LOTSIZE ? Number(row.LOTSIZE) : null,
    });
    if (price !== null) prevPriceBySecid.set(row.SECID, price);
  }

  for (const row of marketdataRows) {
    const existing = result.get(row.SECID);
    if (!existing) continue;
    const last = row.LAST && row.LAST !== "" ? Number(row.LAST) : null;
    existing.price = last ?? prevPriceBySecid.get(row.SECID) ?? null;
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/iss/client.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/iss/client.ts webapp/src/iss/client.test.ts
git commit -m "feat: fetch ISS securities prices and lot sizes"
```

---

## Task 8: ISS client — dividends

**Files:**
- Modify: `webapp/src/iss/client.ts`
- Modify: `webapp/src/iss/client.test.ts`

**Interfaces:**
- Consumes: `parseIssDataBlock` (Task 4), `pLimit` from `webapp/src/concurrency/pLimit.ts` (Task 5).
- Produces: `fetchLatestDividend(ticker: string): Promise<number>`, `fetchDividendsForTickers(tickers: string[], concurrency?: number): Promise<Map<string, number>>` — used by Task 9's `fetchMarketData`.

- [ ] **Step 1: Add failing tests to `webapp/src/iss/client.test.ts`**

```typescript
// append, alongside existing imports:
// import { fetchIndexComposition, fetchSecurities, fetchLatestDividend, fetchDividendsForTickers } from "./client";

const dividendsXml = (rows: string) => `<?xml version="1.0" encoding="UTF-8"?>
<document><data id="dividends"><rows>${rows}</rows></data></document>`;

describe("fetchLatestDividend", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the value of the row with the latest registryclosedate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          dividendsXml(
            `<row secid="SBER" registryclosedate="2024-07-11" value="33.3" />` +
              `<row secid="SBER" registryclosedate="2025-07-18" value="34.84" />` +
              `<row secid="SBER" registryclosedate="2021-05-12" value="18.7" />`
          ),
          { status: 200 }
        )
      )
    );
    await expect(fetchLatestDividend("SBER")).resolves.toBe(34.84);
  });

  it("returns 0 when there is no dividend history", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(dividendsXml(""), { status: 200 })));
    await expect(fetchLatestDividend("NEWIPO")).resolves.toBe(0);
  });
});

describe("fetchDividendsForTickers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves 0 for a ticker whose request fails, without failing the whole batch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/BROKEN/")) return new Response("", { status: 500 });
        return new Response(dividendsXml(`<row secid="SBER" registryclosedate="2025-07-18" value="34.84" />`), {
          status: 200,
        });
      })
    );
    const result = await fetchDividendsForTickers(["SBER", "BROKEN"], 2);
    expect(result.get("SBER")).toBe(34.84);
    expect(result.get("BROKEN")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/iss/client.test.ts`
Expected: FAIL — `fetchLatestDividend`/`fetchDividendsForTickers` not exported.

- [ ] **Step 3: Append to `webapp/src/iss/client.ts`**

```typescript
import { pLimit } from "../concurrency/pLimit";

export async function fetchLatestDividend(ticker: string): Promise<number> {
  const url = `${ISS_BASE}/securities/${ticker}/dividends.xml`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ISS dividends request failed for ${ticker}: ${response.status}`);
  }
  const text = await response.text();
  const rows = parseIssDataBlock(text, "dividends");
  if (rows.length === 0) return 0;

  const latest = rows.reduce((a, b) => (a.registryclosedate > b.registryclosedate ? a : b));
  return Number(latest.value);
}

export async function fetchDividendsForTickers(
  tickers: string[],
  concurrency = 5
): Promise<Map<string, number>> {
  const limit = pLimit(concurrency);
  const result = new Map<string, number>();

  await Promise.all(
    tickers.map((ticker) =>
      limit(async () => {
        try {
          result.set(ticker, await fetchLatestDividend(ticker));
        } catch {
          result.set(ticker, 0);
        }
      })
    )
  );

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/iss/client.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/iss/client.ts webapp/src/iss/client.test.ts
git commit -m "feat: fetch ISS dividend history with pooled concurrency"
```

---

## Task 9: ISS client — market data orchestrator

**Files:**
- Create: `webapp/src/iss/marketData.ts`
- Test: `webapp/src/iss/marketData.test.ts`

**Interfaces:**
- Consumes: `fetchIndexComposition`, `fetchSecurities`, `fetchDividendsForTickers` from `webapp/src/iss/client.ts` (Tasks 6-8).
- Produces: `fetchMarketData(existingTickers: string[]): Promise<MarketDataResult>` and type `MarketDataResult { composition: IndexCompositionEntry[]; securities: Map<string, SecurityInfo>; dividends: Map<string, number> }` — used by Task 23 (Portfolio tab "Обновить" wiring).

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/iss/marketData.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchMarketData } from "./marketData";
import * as client from "./client";

afterEach(() => vi.restoreAllMocks());

describe("fetchMarketData", () => {
  it("unions existing portfolio tickers with the fresh index composition before fetching securities/dividends", async () => {
    vi.spyOn(client, "fetchIndexComposition").mockResolvedValue([
      { ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 },
    ]);
    const securitiesSpy = vi
      .spyOn(client, "fetchSecurities")
      .mockResolvedValue(new Map([["GAZP", { shortName: "ГАЗПРОМ ао", price: 92.79, lotSize: 10 }]]));
    const dividendsSpy = vi
      .spyOn(client, "fetchDividendsForTickers")
      .mockResolvedValue(new Map([["GAZP", 0]]));

    const result = await fetchMarketData(["DELISTED"]);

    expect(securitiesSpy).toHaveBeenCalledWith(expect.arrayContaining(["GAZP", "DELISTED"]));
    expect(dividendsSpy).toHaveBeenCalledWith(expect.arrayContaining(["GAZP", "DELISTED"]));
    expect(result.composition).toHaveLength(1);
  });

  it("propagates a composition failure without calling securities/dividends", async () => {
    vi.spyOn(client, "fetchIndexComposition").mockRejectedValue(new Error("network down"));
    const securitiesSpy = vi.spyOn(client, "fetchSecurities");

    await expect(fetchMarketData([])).rejects.toThrow("network down");
    expect(securitiesSpy).not.toHaveBeenCalled();
  });

  it("propagates a securities failure (all-or-nothing)", async () => {
    vi.spyOn(client, "fetchIndexComposition").mockResolvedValue([]);
    vi.spyOn(client, "fetchSecurities").mockRejectedValue(new Error("securities down"));
    vi.spyOn(client, "fetchDividendsForTickers").mockResolvedValue(new Map());

    await expect(fetchMarketData([])).rejects.toThrow("securities down");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/iss/marketData.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/iss/marketData.ts`**

```typescript
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

export async function fetchMarketData(existingTickers: string[]): Promise<MarketDataResult> {
  const composition = await fetchIndexComposition();

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

Run: `cd webapp && npx vitest run src/iss/marketData.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/iss/marketData.ts webapp/src/iss/marketData.test.ts
git commit -m "feat: orchestrate ISS market data fetch with all-or-nothing semantics"
```

---

## Task 10: Domain — merge market data into positions (life-cycle rules)

**Files:**
- Create: `webapp/src/domain/merge.ts`
- Test: `webapp/src/domain/merge.test.ts`

**Interfaces:**
- Consumes: `Position`, `LiveData`, `IndexStatus` from `webapp/src/types.ts` (Task 3); `IndexCompositionEntry`, `SecurityInfo` from `webapp/src/iss/client.ts` (Tasks 6-7).
- Produces: `mergeMarketData(existingPositions: Position[], composition: IndexCompositionEntry[], securities: Map<string, SecurityInfo>, dividends: Map<string, number>, previousLiveByTicker?: Map<string, LiveData>): MergeResult` and type `MergeResult { positions: Position[]; liveByTicker: Map<string, LiveData> }` — used by Task 14's `buildCalculatedPositions` and Task 23's update flow. The optional 5th parameter (default: empty map) carries the in-memory live data from before this update, so a ticker entirely absent from `securities` (fully delisted — no row at all, not merely dropped from the index) keeps its last known price instead of going to `null`, per the functional spec's "цена не обновляется, остаётся последнее известное значение" rule.

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/domain/merge.test.ts
import { describe, it, expect } from "vitest";
import { mergeMarketData } from "./merge";

describe("mergeMarketData", () => {
  it("updates a matched ticker and marks it in_index", () => {
    const result = mergeMarketData(
      [{ ticker: "GAZP", coefficient: 1.2, sharesOwned: 50 }],
      [{ ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 }],
      new Map([["GAZP", { shortName: "ГАЗПРОМ ао", price: 92.79, lotSize: 10 }]]),
      new Map([["GAZP", 0]])
    );
    expect(result.positions).toEqual([{ ticker: "GAZP", coefficient: 1.2, sharesOwned: 50 }]);
    expect(result.liveByTicker.get("GAZP")).toEqual({
      ticker: "GAZP",
      shortName: "ГАЗПРОМ ао",
      indexWeight: 9.32,
      price: 92.79,
      lotSize: 10,
      dividendPerShare: 0,
      status: "in_index",
    });
  });

  it("keeps a position that dropped out of the index, zeroes its weight, but still updates price/dividend", () => {
    const result = mergeMarketData(
      [{ ticker: "OLD", coefficient: 1, sharesOwned: 10 }],
      [],
      new Map([["OLD", { shortName: "Старая", price: 55, lotSize: 1 }]]),
      new Map([["OLD", 2.5]])
    );
    expect(result.positions).toEqual([{ ticker: "OLD", coefficient: 1, sharesOwned: 10 }]);
    const live = result.liveByTicker.get("OLD")!;
    expect(live.status).toBe("out_of_index");
    expect(live.indexWeight).toBe(0);
    expect(live.price).toBe(55);
    expect(live.dividendPerShare).toBe(2.5);
  });

  it("appends a new ticker from the index with default coefficient 1 and sharesOwned 0", () => {
    const result = mergeMarketData(
      [],
      [{ ticker: "NEW", shortName: "Новая", weight: 1 }],
      new Map([["NEW", { shortName: "Новая", price: 10, lotSize: 1 }]]),
      new Map([["NEW", 0]])
    );
    expect(result.positions).toEqual([{ ticker: "NEW", coefficient: 1, sharesOwned: 0 }]);
    expect(result.liveByTicker.get("NEW")?.status).toBe("in_index");
  });

  it("matches tickers case-insensitively and does not duplicate on repeat updates", () => {
    const first = mergeMarketData(
      [{ ticker: "sber", coefficient: 1, sharesOwned: 5 }],
      [{ ticker: "SBER", shortName: "Сбербанк", weight: 5 }],
      new Map([["SBER", { shortName: "Сбербанк", price: 300, lotSize: 1 }]]),
      new Map([["SBER", 0]])
    );
    const second = mergeMarketData(
      first.positions,
      [{ ticker: "SBER", shortName: "Сбербанк", weight: 5 }],
      new Map([["SBER", { shortName: "Сбербанк", price: 305, lotSize: 1 }]]),
      new Map([["SBER", 0]])
    );
    expect(second.positions).toHaveLength(1);
    expect(second.positions[0]).toEqual({ ticker: "sber", coefficient: 1, sharesOwned: 5 });
  });

  it("falls back to the previous known price when a ticker is entirely absent from securities (fully delisted)", () => {
    const previousLiveByTicker = new Map([
      [
        "DELISTED",
        {
          ticker: "DELISTED",
          shortName: "Делистнутая",
          indexWeight: 0,
          price: 42,
          lotSize: 1,
          dividendPerShare: 0,
          status: "out_of_index" as const,
        },
      ],
    ]);
    const result = mergeMarketData(
      [{ ticker: "DELISTED", coefficient: 1, sharesOwned: 5 }],
      [],
      new Map(),
      new Map([["DELISTED", 0]]),
      previousLiveByTicker
    );
    const live = result.liveByTicker.get("DELISTED")!;
    expect(live.price).toBe(42);
    expect(live.status).toBe("out_of_index");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/domain/merge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/domain/merge.ts`**

```typescript
import { Position, LiveData, IndexStatus } from "../types";
import { IndexCompositionEntry, SecurityInfo } from "../iss/client";

export interface MergeResult {
  positions: Position[];
  liveByTicker: Map<string, LiveData>;
}

export function mergeMarketData(
  existingPositions: Position[],
  composition: IndexCompositionEntry[],
  securities: Map<string, SecurityInfo>,
  dividends: Map<string, number>,
  previousLiveByTicker: Map<string, LiveData> = new Map()
): MergeResult {
  const compositionByTicker = new Map(composition.map((c) => [c.ticker.toUpperCase(), c]));

  const allTickers = new Set<string>();
  existingPositions.forEach((p) => allTickers.add(p.ticker.toUpperCase()));
  composition.forEach((c) => allTickers.add(c.ticker.toUpperCase()));

  const liveByTicker = new Map<string, LiveData>();
  for (const ticker of allTickers) {
    const comp = compositionByTicker.get(ticker);
    const sec = securities.get(ticker);
    const status: IndexStatus = comp ? "in_index" : "out_of_index";
    liveByTicker.set(ticker, {
      ticker,
      shortName: sec?.shortName ?? comp?.shortName ?? ticker,
      indexWeight: comp ? comp.weight : 0,
      price: sec?.price ?? previousLiveByTicker.get(ticker)?.price ?? null,
      lotSize: sec?.lotSize ?? null,
      dividendPerShare: dividends.get(ticker) ?? 0,
      status,
    });
  }

  const existingTickers = new Set(existingPositions.map((p) => p.ticker.toUpperCase()));
  const newPositions: Position[] = composition
    .filter((c) => !existingTickers.has(c.ticker.toUpperCase()))
    .map((c) => ({ ticker: c.ticker, coefficient: 1, sharesOwned: 0 }));

  return {
    positions: [...existingPositions, ...newPositions],
    liveByTicker,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/domain/merge.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/domain/merge.ts webapp/src/domain/merge.test.ts
git commit -m "feat: merge market data into positions with ticker life-cycle rules"
```

---

## Task 11: Domain — per-position calculations

**Files:**
- Create: `webapp/src/domain/calculations.ts`
- Test: `webapp/src/domain/calculations.test.ts`

**Interfaces:**
- Consumes: `IndexStatus` from `webapp/src/types.ts` (Task 3).
- Produces: `computeTargetAllocation`, `computePositionValue`, `computeIncome` — used by Task 13's `buildCalculatedPositions`.

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/domain/calculations.test.ts
import { describe, it, expect } from "vitest";
import { computeTargetAllocation, computePositionValue, computeIncome } from "./calculations";

describe("computeTargetAllocation", () => {
  it("multiplies index weight by coefficient for an in_index position", () => {
    expect(computeTargetAllocation(9.32, 1.5, "in_index")).toBeCloseTo(13.98);
  });

  it("returns null for an out_of_index position regardless of weight", () => {
    expect(computeTargetAllocation(0, 1.5, "out_of_index")).toBeNull();
  });
});

describe("computePositionValue", () => {
  it("multiplies price by shares owned", () => {
    expect(computePositionValue(92.79, 100)).toBeCloseTo(9279);
  });

  it("treats a null price as 0 instead of throwing", () => {
    expect(computePositionValue(null, 100)).toBe(0);
  });
});

describe("computeIncome", () => {
  it("multiplies dividend per share by shares owned", () => {
    expect(computeIncome(34.84, 10)).toBeCloseTo(348.4);
  });

  it("is 0 when no shares are owned", () => {
    expect(computeIncome(34.84, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/domain/calculations.ts`**

```typescript
import { IndexStatus } from "../types";

export function computeTargetAllocation(
  indexWeight: number,
  coefficient: number,
  status: IndexStatus
): number | null {
  if (status !== "in_index") return null;
  return indexWeight * coefficient;
}

export function computePositionValue(price: number | null, sharesOwned: number): number {
  return (price ?? 0) * sharesOwned;
}

export function computeIncome(dividendPerShare: number, sharesOwned: number): number {
  return dividendPerShare * sharesOwned;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/domain/calculations.ts webapp/src/domain/calculations.test.ts
git commit -m "feat: add per-position calculation functions"
```

---

## Task 12: Domain — portfolio aggregate calculations

**Files:**
- Modify: `webapp/src/domain/calculations.ts`
- Modify: `webapp/src/domain/calculations.test.ts`

**Interfaces:**
- Produces: `computePortfolioValue`, `computeActualShare`, `computeCompliance`, `computeAverageCompliance` — used by Task 13's `buildCalculatedPositions`.

- [ ] **Step 1: Add failing tests to `webapp/src/domain/calculations.test.ts`**

```typescript
// append, alongside existing imports:
// import { ..., computePortfolioValue, computeActualShare, computeCompliance, computeAverageCompliance } from "./calculations";

describe("computePortfolioValue", () => {
  it("sums price * sharesOwned across all positions, including out-of-index ones", () => {
    const total = computePortfolioValue([
      { price: 100, sharesOwned: 2 },
      { price: 50, sharesOwned: 4 },
      { price: null, sharesOwned: 10 },
    ]);
    expect(total).toBe(400);
  });

  it("is 0 for an empty portfolio", () => {
    expect(computePortfolioValue([])).toBe(0);
  });
});

describe("computeActualShare", () => {
  it("expresses position value as a percentage of total portfolio value", () => {
    expect(computeActualShare(400, 2000)).toBeCloseTo(20);
  });

  it("returns null instead of dividing by zero when the portfolio is empty", () => {
    expect(computeActualShare(0, 0)).toBeNull();
  });
});

describe("computeCompliance", () => {
  it("expresses actual share as a ratio of target allocation", () => {
    expect(computeCompliance(20, 10)).toBe(2);
  });

  it("returns null when target allocation is 0 (out-of-index position)", () => {
    expect(computeCompliance(5, 0)).toBeNull();
  });

  it("returns null when actualShare or targetAllocation is null", () => {
    expect(computeCompliance(null, 10)).toBeNull();
    expect(computeCompliance(5, null)).toBeNull();
  });
});

describe("computeAverageCompliance", () => {
  it("averages only non-null compliance values, regardless of list size", () => {
    expect(computeAverageCompliance([1, 2, null, 3, null])).toBeCloseTo(2);
  });

  it("returns null when every value is null or the list is empty", () => {
    expect(computeAverageCompliance([null, null])).toBeNull();
    expect(computeAverageCompliance([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts`
Expected: FAIL — new exports not found.

- [ ] **Step 3: Append to `webapp/src/domain/calculations.ts`**

```typescript
export function computePortfolioValue(
  positions: { price: number | null; sharesOwned: number }[]
): number {
  return positions.reduce((sum, p) => sum + computePositionValue(p.price, p.sharesOwned), 0);
}

export function computeActualShare(positionValue: number, portfolioValue: number): number | null {
  if (portfolioValue === 0) return null;
  return (positionValue / portfolioValue) * 100;
}

export function computeCompliance(
  actualShare: number | null,
  targetAllocation: number | null
): number | null {
  if (actualShare === null || targetAllocation === null || targetAllocation === 0) return null;
  return actualShare / targetAllocation;
}

export function computeAverageCompliance(compliances: (number | null)[]): number | null {
  const valid = compliances.filter((c): c is number => c !== null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, c) => sum + c, 0) / valid.length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/domain/calculations.test.ts`
Expected: PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/domain/calculations.ts webapp/src/domain/calculations.test.ts
git commit -m "feat: add portfolio-level aggregate calculations"
```

---

## Task 13: Built-in sector reference and resolver

**Files:**
- Create: `webapp/src/data/sectorsDefault.ts`
- Create: `webapp/src/domain/sectors.ts`
- Test: `webapp/src/domain/sectors.test.ts`

**Interfaces:**
- Produces: `SECTORS_DEFAULT: Record<string, string>` (constant), `createSectorResolver(defaults: Record<string, string>, overrides: Record<string, string>): (ticker: string) => string`, `OTHER_SECTOR = "Другое"` — used by Task 14's `buildCalculatedPositions` and Task 27's sector tab.

- [ ] **Step 1: Write `webapp/src/data/sectorsDefault.ts`**

Seed covering the current IMOEX-46 constituents (verified against a live ISS composition fetch on 2026-07-10). Extending this to the full top-500 MOEX universe is tracked separately (see design spec's "Вне скоупа").

```typescript
export const SECTORS_DEFAULT: Record<string, string> = {
  AFKS: "Холдинги",
  AFLT: "Транспорт",
  ALRS: "Металлы и добыча",
  BSPB: "Финансы",
  CBOM: "Финансы",
  CHMF: "Металлы и добыча",
  CNRU: "Технологии",
  DOMRF: "Финансы",
  ENPG: "Металлы и добыча",
  FLOT: "Транспорт",
  GAZP: "Нефть и газ",
  GMKN: "Металлы и добыча",
  HEAD: "Технологии",
  IRAO: "Электроэнергетика",
  LENT: "Потребительский сектор",
  LKOH: "Нефть и газ",
  MAGN: "Металлы и добыча",
  MDMG: "Здравоохранение",
  MOEX: "Финансы",
  MSNG: "Электроэнергетика",
  MTSS: "Телекоммуникации",
  NLMK: "Металлы и добыча",
  NVTK: "Нефть и газ",
  OZON: "Технологии",
  PHOR: "Химия",
  PLZL: "Металлы и добыча",
  POSI: "Технологии",
  RAGR: "Потребительский сектор",
  RENI: "Финансы",
  ROSN: "Нефть и газ",
  RTKM: "Телекоммуникации",
  RUAL: "Металлы и добыча",
  SBER: "Финансы",
  SBERP: "Финансы",
  SNGS: "Нефть и газ",
  SNGSP: "Нефть и газ",
  SVCB: "Финансы",
  T: "Финансы",
  TATN: "Нефть и газ",
  TATNP: "Нефть и газ",
  TRNFP: "Нефть и газ",
  UGLD: "Металлы и добыча",
  VKCO: "Технологии",
  VTBR: "Финансы",
  YDEX: "Технологии",
};
```

- [ ] **Step 2: Write the failing test**

```typescript
// webapp/src/domain/sectors.test.ts
import { describe, it, expect } from "vitest";
import { createSectorResolver, OTHER_SECTOR } from "./sectors";

describe("createSectorResolver", () => {
  it("resolves from the default map when there is no override", () => {
    const resolve = createSectorResolver({ SBER: "Финансы" }, {});
    expect(resolve("SBER")).toBe("Финансы");
  });

  it("prefers a user override over the default", () => {
    const resolve = createSectorResolver({ SBER: "Финансы" }, { SBER: "Прочее" });
    expect(resolve("SBER")).toBe("Прочее");
  });

  it("falls back to \"Другое\" for a ticker in neither map", () => {
    const resolve = createSectorResolver({ SBER: "Финансы" }, {});
    expect(resolve("UNKNOWNTICKER")).toBe(OTHER_SECTOR);
  });

  it("matches tickers case-insensitively", () => {
    const resolve = createSectorResolver({ SBER: "Финансы" }, {});
    expect(resolve("sber")).toBe("Финансы");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/domain/sectors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `webapp/src/domain/sectors.ts`**

```typescript
export const OTHER_SECTOR = "Другое";

function normalizeKeys(map: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [ticker, sector] of Object.entries(map)) {
    result[ticker.toUpperCase()] = sector;
  }
  return result;
}

export function createSectorResolver(
  defaults: Record<string, string>,
  overrides: Record<string, string>
): (ticker: string) => string {
  const normalizedDefaults = normalizeKeys(defaults);
  const normalizedOverrides = normalizeKeys(overrides);

  return (ticker: string) => {
    const key = ticker.toUpperCase();
    return normalizedOverrides[key] ?? normalizedDefaults[key] ?? OTHER_SECTOR;
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/domain/sectors.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add webapp/src/data/sectorsDefault.ts webapp/src/domain/sectors.ts webapp/src/domain/sectors.test.ts
git commit -m "feat: add built-in sector reference and override resolver"
```

---

## Task 14: Domain — build calculated positions (composition root)

**Files:**
- Create: `webapp/src/domain/buildCalculatedPositions.ts`
- Test: `webapp/src/domain/buildCalculatedPositions.test.ts`

**Interfaces:**
- Consumes: `Position`, `LiveData`, `CalculatedPosition` (Task 3); `computeTargetAllocation`, `computePositionValue`, `computeIncome`, `computePortfolioValue`, `computeActualShare`, `computeCompliance` (Tasks 11-12); `createSectorResolver` (Task 13).
- Produces: `buildCalculatedPositions(positions: Position[], liveByTicker: Map<string, LiveData>, resolveSector: (ticker: string) => string): CalculatedPosition[]` — used by Task 23 (Portfolio tab) and Task 26 (Sectors tab).

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/domain/buildCalculatedPositions.test.ts
import { describe, it, expect } from "vitest";
import { buildCalculatedPositions } from "./buildCalculatedPositions";
import { LiveData, Position } from "../types";

function live(overrides: Partial<LiveData> & { ticker: string }): LiveData {
  return {
    shortName: overrides.ticker,
    indexWeight: 0,
    price: null,
    lotSize: null,
    dividendPerShare: 0,
    status: "in_index",
    ...overrides,
  };
}

describe("buildCalculatedPositions", () => {
  it("computes target allocation, actual share, compliance, value and income together", () => {
    const positions: Position[] = [
      { ticker: "GAZP", coefficient: 1, sharesOwned: 10 },
      { ticker: "SBER", coefficient: 2, sharesOwned: 5 },
    ];
    const liveByTicker = new Map([
      ["GAZP", live({ ticker: "GAZP", indexWeight: 60, price: 100, dividendPerShare: 1 })],
      ["SBER", live({ ticker: "SBER", indexWeight: 40, price: 40, dividendPerShare: 2 })],
    ]);

    const result = buildCalculatedPositions(positions, liveByTicker, () => "Финансы");

    // portfolioValue = 10*100 + 5*40 = 1200
    const gazp = result.find((p) => p.ticker === "GAZP")!;
    expect(gazp.positionValue).toBe(1000);
    expect(gazp.targetAllocation).toBe(60);
    expect(gazp.actualShare).toBeCloseTo((1000 / 1200) * 100);
    expect(gazp.compliance).toBeCloseTo(gazp.actualShare! / 60);
    expect(gazp.income).toBe(10);
    expect(gazp.sector).toBe("Финансы");
  });

  it("gives an out-of-index position a null target allocation and compliance but a real position value", () => {
    const positions: Position[] = [{ ticker: "OLD", coefficient: 1, sharesOwned: 3 }];
    const liveByTicker = new Map([
      ["OLD", live({ ticker: "OLD", status: "out_of_index", indexWeight: 0, price: 50, dividendPerShare: 0 })],
    ]);

    const [result] = buildCalculatedPositions(positions, liveByTicker, () => "Другое");
    expect(result.targetAllocation).toBeNull();
    expect(result.compliance).toBeNull();
    expect(result.positionValue).toBe(150);
  });

  it("does not throw for an empty position list", () => {
    expect(buildCalculatedPositions([], new Map(), () => "Другое")).toEqual([]);
  });

  it("preserves the position's original ticker casing even when liveByTicker is keyed uppercase", () => {
    const positions: Position[] = [{ ticker: "sber", coefficient: 1, sharesOwned: 5 }];
    const liveByTicker = new Map([["SBER", live({ ticker: "SBER", price: 300 })]]);

    const [result] = buildCalculatedPositions(positions, liveByTicker, () => "Финансы");
    expect(result.ticker).toBe("sber");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/domain/buildCalculatedPositions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/domain/buildCalculatedPositions.ts`**

```typescript
import { Position, LiveData, CalculatedPosition } from "../types";
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computeActualShare,
  computeCompliance,
} from "./calculations";

export function buildCalculatedPositions(
  positions: Position[],
  liveByTicker: Map<string, LiveData>,
  resolveSector: (ticker: string) => string
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
    const positionValue = computePositionValue(resolvedLive.price, position.sharesOwned);
    return { position, live: resolvedLive, positionValue };
  });

  const portfolioValue = withLive.reduce((sum, { positionValue }) => sum + positionValue, 0);

  return withLive.map(({ position, live, positionValue }) => {
    const targetAllocation = computeTargetAllocation(live.indexWeight, position.coefficient, live.status);
    const actualShare = computeActualShare(positionValue, portfolioValue);
    const compliance = computeCompliance(actualShare, targetAllocation);
    const income = computeIncome(live.dividendPerShare, position.sharesOwned);

    return {
      ...position,
      ...live,
      ticker: position.ticker,
      sector: resolveSector(position.ticker),
      targetAllocation,
      actualShare,
      compliance,
      positionValue,
      income,
    };
  });
}
```

`ticker: position.ticker` is re-asserted after both spreads: `live.ticker` is always
uppercase-normalized (it comes from `mergeMarketData`'s `Map<string, LiveData>` keys, per
Task 10), so without this, a user-typed lowercase ticker in `Position` would be silently
overwritten in the returned `CalculatedPosition` — breaking Task 23's later match-by-ticker
when saving edited `coefficient`/`sharesOwned` back to `file.positions`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/domain/buildCalculatedPositions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/domain/buildCalculatedPositions.ts webapp/src/domain/buildCalculatedPositions.test.ts
git commit -m "feat: compose calculated positions from live data and pure calculations"
```

---

## Task 15: File schema and validation

**Files:**
- Create: `webapp/src/file/schema.ts`
- Test: `webapp/src/file/schema.test.ts`

**Interfaces:**
- Consumes: `PortfolioFile` type (Task 3).
- Produces: `parsePortfolioFile(raw: unknown): PortfolioFile` (throws `PortfolioFileValidationError` with a human-readable message on invalid input) — used by Task 17 (load) and Task 16 (empty-file creation, for self-consistency).

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/file/schema.test.ts
import { describe, it, expect } from "vitest";
import { parsePortfolioFile, PortfolioFileValidationError } from "./schema";

const valid = {
  version: 1,
  positions: [{ ticker: "SBER", coefficient: 1.15, sharesOwned: 100 }],
  sectors: { SBER: "Финансы" },
  history: [
    {
      timestamp: "2026-07-10T09:00:00Z",
      portfolioValue: 1000,
      avgCompliance: 0.1,
      snapshot: [{ ticker: "SBER", price: 300, weight: 5, status: "in_index" }],
    },
  ],
};

describe("parsePortfolioFile", () => {
  it("accepts a well-formed file and returns it typed", () => {
    expect(parsePortfolioFile(valid)).toEqual(valid);
  });

  it("accepts an empty positions/sectors/history file", () => {
    const empty = { version: 1, positions: [], sectors: {}, history: [] };
    expect(parsePortfolioFile(empty)).toEqual(empty);
  });

  it("rejects a file with the wrong version", () => {
    expect(() => parsePortfolioFile({ ...valid, version: 2 })).toThrow(PortfolioFileValidationError);
  });

  it("rejects a file missing the positions field", () => {
    const { positions, ...rest } = valid;
    expect(() => parsePortfolioFile(rest)).toThrow(/positions/);
  });

  it("rejects a position with a non-numeric coefficient", () => {
    const bad = { ...valid, positions: [{ ticker: "SBER", coefficient: "high", sharesOwned: 1 }] };
    expect(() => parsePortfolioFile(bad)).toThrow(PortfolioFileValidationError);
  });

  it("rejects non-object input", () => {
    expect(() => parsePortfolioFile(null)).toThrow(PortfolioFileValidationError);
    expect(() => parsePortfolioFile("not json")).toThrow(PortfolioFileValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/file/schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/file/schema.ts`**

```typescript
import { z } from "zod";

export class PortfolioFileValidationError extends Error {}

const positionSchema = z.object({
  ticker: z.string().min(1),
  coefficient: z.number(),
  sharesOwned: z.number(),
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

const portfolioFileSchema = z.object({
  version: z.literal(1),
  positions: z.array(positionSchema),
  sectors: z.record(z.string()),
  history: z.array(historySnapshotSchema),
});

export function parsePortfolioFile(raw: unknown): z.infer<typeof portfolioFileSchema> {
  const result = portfolioFileSchema.safeParse(raw);
  if (!result.success) {
    throw new PortfolioFileValidationError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return result.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/file/schema.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/file/schema.ts webapp/src/file/schema.test.ts
git commit -m "feat: validate portfolio file schema with zod"
```

---

## Task 16: Empty portfolio creation (first run)

**Files:**
- Create: `webapp/src/file/createEmptyPortfolio.ts`
- Test: `webapp/src/file/createEmptyPortfolio.test.ts`

**Interfaces:**
- Consumes: `fetchIndexComposition` from `webapp/src/iss/client.ts` (Task 6); `PortfolioFile` (Task 3).
- Produces: `createEmptyPortfolio(): Promise<PortfolioFile>` — used by Task 28 (first-run flow wiring).

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/file/createEmptyPortfolio.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createEmptyPortfolio } from "./createEmptyPortfolio";
import * as client from "../iss/client";

afterEach(() => vi.restoreAllMocks());

describe("createEmptyPortfolio", () => {
  it("seeds one position per current index ticker with coefficient 1 and sharesOwned 0", async () => {
    vi.spyOn(client, "fetchIndexComposition").mockResolvedValue([
      { ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 },
      { ticker: "SBER", shortName: "Сбербанк", weight: 5.1 },
    ]);

    const file = await createEmptyPortfolio();

    expect(file.version).toBe(1);
    expect(file.positions).toEqual([
      { ticker: "GAZP", coefficient: 1, sharesOwned: 0 },
      { ticker: "SBER", coefficient: 1, sharesOwned: 0 },
    ]);
    expect(file.sectors).toEqual({});
    expect(file.history).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/file/createEmptyPortfolio.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/file/createEmptyPortfolio.ts`**

```typescript
import { fetchIndexComposition } from "../iss/client";
import { PortfolioFile } from "../types";

export async function createEmptyPortfolio(): Promise<PortfolioFile> {
  const composition = await fetchIndexComposition();
  return {
    version: 1,
    positions: composition.map((c) => ({ ticker: c.ticker, coefficient: 1, sharesOwned: 0 })),
    sectors: {},
    history: [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/file/createEmptyPortfolio.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/file/createEmptyPortfolio.ts webapp/src/file/createEmptyPortfolio.test.ts
git commit -m "feat: seed empty portfolio file from current index composition"
```

---

## Task 17: File loading (File System Access API + fallback)

**Files:**
- Create: `webapp/src/file/loadPortfolioFile.ts`
- Test: `webapp/src/file/loadPortfolioFile.test.ts`

**Interfaces:**
- Consumes: `parsePortfolioFile` (Task 15).
- Produces: `isFileSystemAccessSupported(): boolean`, `loadViaFileSystemAccess(): Promise<{ file: PortfolioFile; handle: FileSystemFileHandle }>`, `loadViaInputFile(input: File): Promise<PortfolioFile>` — used by Task 21 (Header wiring).

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/file/loadPortfolioFile.test.ts
import { describe, it, expect } from "vitest";
import { isFileSystemAccessSupported, loadViaInputFile } from "./loadPortfolioFile";
import { PortfolioFileValidationError } from "./schema";

const validJson = JSON.stringify({
  version: 1,
  positions: [{ ticker: "SBER", coefficient: 1, sharesOwned: 0 }],
  sectors: {},
  history: [],
});

function makeFile(content: string): File {
  return new File([content], "portfolio.json", { type: "application/json" });
}

describe("isFileSystemAccessSupported", () => {
  it("reflects whether window.showOpenFilePicker exists", () => {
    expect(isFileSystemAccessSupported()).toBe(typeof (window as any).showOpenFilePicker === "function");
  });
});

describe("loadViaInputFile", () => {
  it("parses a valid portfolio JSON file", async () => {
    const file = await loadViaInputFile(makeFile(validJson));
    expect(file.positions).toHaveLength(1);
  });

  it("throws PortfolioFileValidationError for invalid JSON text", async () => {
    await expect(loadViaInputFile(makeFile("{not json"))).rejects.toThrow(PortfolioFileValidationError);
  });

  it("throws PortfolioFileValidationError for JSON that fails schema validation", async () => {
    await expect(loadViaInputFile(makeFile(JSON.stringify({ version: 2 })))).rejects.toThrow(
      PortfolioFileValidationError
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/file/loadPortfolioFile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/file/loadPortfolioFile.ts`**

```typescript
import { PortfolioFile } from "../types";
import { parsePortfolioFile, PortfolioFileValidationError } from "./schema";

export function isFileSystemAccessSupported(): boolean {
  return typeof (window as any).showOpenFilePicker === "function";
}

async function parseFileContents(text: string): Promise<PortfolioFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new PortfolioFileValidationError("Файл не является корректным JSON");
  }
  return parsePortfolioFile(raw);
}

export async function loadViaInputFile(file: File): Promise<PortfolioFile> {
  const text = await file.text();
  return parseFileContents(text);
}

export async function loadViaFileSystemAccess(): Promise<{
  file: PortfolioFile;
  handle: FileSystemFileHandle;
}> {
  const [handle] = await (window as any).showOpenFilePicker({
    types: [{ description: "Portfolio JSON", accept: { "application/json": [".json"] } }],
  });
  const fileObject: File = await handle.getFile();
  const text = await fileObject.text();
  const file = await parseFileContents(text);
  return { file, handle };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/file/loadPortfolioFile.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/file/loadPortfolioFile.ts webapp/src/file/loadPortfolioFile.test.ts
git commit -m "feat: load portfolio file via File System Access API with input-file fallback"
```

---

## Task 18: File saving (File System Access API + fallback)

**Files:**
- Create: `webapp/src/file/savePortfolioFile.ts`
- Test: `webapp/src/file/savePortfolioFile.test.ts`

**Interfaces:**
- Consumes: `PortfolioFile` (Task 3).
- Produces: `saveViaFileSystemAccess(file: PortfolioFile, handle: FileSystemFileHandle): Promise<void>`, `saveViaFileSystemAccessNew(file: PortfolioFile): Promise<FileSystemFileHandle>`, `downloadPortfolioFile(file: PortfolioFile, filename?: string): void` — used by Task 21 (Header wiring).

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/file/savePortfolioFile.test.ts
import { describe, it, expect, vi } from "vitest";
import { saveViaFileSystemAccess, downloadPortfolioFile } from "./savePortfolioFile";
import { PortfolioFile } from "../types";

const sample: PortfolioFile = { version: 1, positions: [], sectors: {}, history: [] };

describe("saveViaFileSystemAccess", () => {
  it("writes the JSON-serialized file to the given handle and closes the writable", async () => {
    const write = vi.fn();
    const close = vi.fn();
    const handle = {
      createWritable: vi.fn(async () => ({ write, close })),
    } as unknown as FileSystemFileHandle;

    await saveViaFileSystemAccess(sample, handle);

    expect(write).toHaveBeenCalledWith(JSON.stringify(sample, null, 2));
    expect(close).toHaveBeenCalled();
  });
});

describe("downloadPortfolioFile", () => {
  it("creates and clicks an anchor pointing at a blob URL, then revokes it", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const click = vi.fn();
    const anchor = { click, href: "", download: "" } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    downloadPortfolioFile(sample, "portfolio.json");

    expect(anchor.href).toBe("blob:mock-url");
    expect(anchor.download).toBe("portfolio.json");
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/file/savePortfolioFile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/file/savePortfolioFile.ts`**

```typescript
import { PortfolioFile } from "../types";

function serialize(file: PortfolioFile): string {
  return JSON.stringify(file, null, 2);
}

export async function saveViaFileSystemAccess(
  file: PortfolioFile,
  handle: FileSystemFileHandle
): Promise<void> {
  const writable = await (handle as any).createWritable();
  await writable.write(serialize(file));
  await writable.close();
}

export async function saveViaFileSystemAccessNew(file: PortfolioFile): Promise<FileSystemFileHandle> {
  const handle = await (window as any).showSaveFilePicker({
    suggestedName: "portfolio.json",
    types: [{ description: "Portfolio JSON", accept: { "application/json": [".json"] } }],
  });
  await saveViaFileSystemAccess(file, handle);
  return handle;
}

export function downloadPortfolioFile(file: PortfolioFile, filename = "portfolio.json"): void {
  const blob = new Blob([serialize(file)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/file/savePortfolioFile.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/file/savePortfolioFile.ts webapp/src/file/savePortfolioFile.test.ts
git commit -m "feat: save portfolio file via File System Access API with download fallback"
```

---

## Task 19: History snapshot creation

**Files:**
- Create: `webapp/src/domain/createHistorySnapshot.ts`
- Test: `webapp/src/domain/createHistorySnapshot.test.ts`

**Interfaces:**
- Consumes: `CalculatedPosition`, `HistorySnapshot` (Task 3); `computeAverageCompliance` (Task 12).
- Produces: `createHistorySnapshot(calculatedPositions: CalculatedPosition[], portfolioValue: number, timestamp?: string): HistorySnapshot` — used by Task 23 (Portfolio tab update flow) and Task 28 (first-run/auto-update flow).

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/domain/createHistorySnapshot.test.ts
import { describe, it, expect } from "vitest";
import { createHistorySnapshot } from "./createHistorySnapshot";
import { CalculatedPosition } from "../types";

function calc(overrides: Partial<CalculatedPosition> & { ticker: string }): CalculatedPosition {
  return {
    coefficient: 1,
    sharesOwned: 0,
    shortName: overrides.ticker,
    indexWeight: 0,
    price: null,
    lotSize: null,
    dividendPerShare: 0,
    status: "in_index",
    sector: "Другое",
    targetAllocation: null,
    actualShare: null,
    compliance: null,
    positionValue: 0,
    income: 0,
    ...overrides,
  };
}

describe("createHistorySnapshot", () => {
  it("captures per-ticker price/weight/status and portfolio-level aggregates", () => {
    const positions = [
      calc({ ticker: "GAZP", price: 92.79, indexWeight: 9.32, status: "in_index", compliance: 1.1 }),
      calc({ ticker: "OLD", price: 10, indexWeight: 0, status: "out_of_index", compliance: null }),
    ];

    const snapshot = createHistorySnapshot(positions, 1234.5, "2026-07-10T09:00:00Z");

    expect(snapshot.timestamp).toBe("2026-07-10T09:00:00Z");
    expect(snapshot.portfolioValue).toBe(1234.5);
    expect(snapshot.avgCompliance).toBeCloseTo(1.1);
    expect(snapshot.snapshot).toEqual([
      { ticker: "GAZP", price: 92.79, weight: 9.32, status: "in_index" },
      { ticker: "OLD", price: 10, weight: 0, status: "out_of_index" },
    ]);
  });

  it("defaults timestamp to the current time when not provided", () => {
    const before = Date.now();
    const snapshot = createHistorySnapshot([], 0);
    const after = Date.now();
    const parsed = new Date(snapshot.timestamp).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/domain/createHistorySnapshot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/domain/createHistorySnapshot.ts`**

```typescript
import { CalculatedPosition, HistorySnapshot } from "../types";
import { computeAverageCompliance } from "./calculations";

export function createHistorySnapshot(
  calculatedPositions: CalculatedPosition[],
  portfolioValue: number,
  timestamp: string = new Date().toISOString()
): HistorySnapshot {
  return {
    timestamp,
    portfolioValue,
    avgCompliance: computeAverageCompliance(calculatedPositions.map((p) => p.compliance)),
    snapshot: calculatedPositions.map((p) => ({
      ticker: p.ticker,
      price: p.price,
      weight: p.indexWeight,
      status: p.status,
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/domain/createHistorySnapshot.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/domain/createHistorySnapshot.ts webapp/src/domain/createHistorySnapshot.test.ts
git commit -m "feat: create history snapshots from calculated positions"
```

---

## Task 20: Error store (context + reducer)

**Files:**
- Create: `webapp/src/errors/ErrorContext.tsx`
- Test: `webapp/src/errors/errorReducer.test.ts`
- Create: `webapp/src/errors/errorReducer.ts`

**Interfaces:**
- Produces: `errorReducer`, `AppError { id: string; message: string; source: string }`, `ErrorProvider` (React component), `useErrors(): { errors: AppError[]; addError: (source: string, message: string) => void; clearError: (id: string) => void; clearBySource: (source: string) => void }` — used by every UI task (21-27) that can fail.

- [ ] **Step 1: Write the failing test**

```typescript
// webapp/src/errors/errorReducer.test.ts
import { describe, it, expect } from "vitest";
import { errorReducer, initialErrorState } from "./errorReducer";

describe("errorReducer", () => {
  it("adds an error with a generated id", () => {
    const state = errorReducer(initialErrorState, { type: "add", source: "update", message: "boom" });
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0]).toMatchObject({ source: "update", message: "boom" });
    expect(state.errors[0].id).toBeTruthy();
  });

  it("removes an error by id", () => {
    const afterAdd = errorReducer(initialErrorState, { type: "add", source: "update", message: "boom" });
    const id = afterAdd.errors[0].id;
    const afterRemove = errorReducer(afterAdd, { type: "clear", id });
    expect(afterRemove.errors).toHaveLength(0);
  });

  it("clears all errors belonging to a source", () => {
    let state = errorReducer(initialErrorState, { type: "add", source: "update", message: "a" });
    state = errorReducer(state, { type: "add", source: "load", message: "b" });
    state = errorReducer(state, { type: "add", source: "update", message: "c" });
    state = errorReducer(state, { type: "clearBySource", source: "update" });
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].source).toBe("load");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/errors/errorReducer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/errors/errorReducer.ts`**

```typescript
export interface AppError {
  id: string;
  source: string;
  message: string;
}

export interface ErrorState {
  errors: AppError[];
}

export const initialErrorState: ErrorState = { errors: [] };

export type ErrorAction =
  | { type: "add"; source: string; message: string }
  | { type: "clear"; id: string }
  | { type: "clearBySource"; source: string };

export function errorReducer(state: ErrorState, action: ErrorAction): ErrorState {
  switch (action.type) {
    case "add":
      return {
        errors: [
          ...state.errors,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, source: action.source, message: action.message },
        ],
      };
    case "clear":
      return { errors: state.errors.filter((e) => e.id !== action.id) };
    case "clearBySource":
      return { errors: state.errors.filter((e) => e.source !== action.source) };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/errors/errorReducer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `webapp/src/errors/ErrorContext.tsx`**

```tsx
import React, { createContext, useCallback, useContext, useReducer } from "react";
import { errorReducer, initialErrorState, AppError } from "./errorReducer";

interface ErrorContextValue {
  errors: AppError[];
  addError: (source: string, message: string) => void;
  clearError: (id: string) => void;
  clearBySource: (source: string) => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(errorReducer, initialErrorState);

  const addError = useCallback((source: string, message: string) => {
    dispatch({ type: "add", source, message });
  }, []);
  const clearError = useCallback((id: string) => {
    dispatch({ type: "clear", id });
  }, []);
  const clearBySource = useCallback((source: string) => {
    dispatch({ type: "clearBySource", source });
  }, []);

  return (
    <ErrorContext.Provider value={{ errors: state.errors, addError, clearError, clearBySource }}>
      {children}
    </ErrorContext.Provider>
  );
}

export function useErrors(): ErrorContextValue {
  const ctx = useContext(ErrorContext);
  if (!ctx) throw new Error("useErrors must be used within an ErrorProvider");
  return ctx;
}
```

- [ ] **Step 6: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/errors/errorReducer.ts webapp/src/errors/errorReducer.test.ts webapp/src/errors/ErrorContext.tsx
git commit -m "feat: add global error store (context + reducer)"
```

---

## Task 21: Error panel component

**Files:**
- Create: `webapp/src/errors/ErrorPanel.tsx`
- Create: `webapp/src/errors/ErrorPanel.css`

**Interfaces:**
- Consumes: `useErrors` from Task 20.
- Produces: `ErrorPanel` React component (no props, reads from context) — used by Task 22's `App` shell.

- [ ] **Step 1: Write `webapp/src/errors/ErrorPanel.css`**

```css
.error-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  max-width: 90vw;
  overflow-y: auto;
  background: #fff3f3;
  border-left: 1px solid #e0a0a0;
  padding: 12px;
  z-index: 100;
}

.error-panel__item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  margin-bottom: 8px;
  background: #ffffff;
  border: 1px solid #e0a0a0;
  border-radius: 4px;
}

.error-panel__message {
  flex: 1;
  overflow-wrap: break-word;
  word-break: break-word;
  font-size: 0.9rem;
  color: #7a1f1f;
}

.error-panel__close {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  color: #7a1f1f;
}
```

- [ ] **Step 2: Write `webapp/src/errors/ErrorPanel.tsx`**

```tsx
import { useErrors } from "./ErrorContext";
import "./ErrorPanel.css";

export function ErrorPanel() {
  const { errors, clearError } = useErrors();

  if (errors.length === 0) return null;

  return (
    <aside className="error-panel" aria-label="Ошибки">
      {errors.map((error) => (
        <div key={error.id} className="error-panel__item">
          <span className="error-panel__message">{error.message}</span>
          <button
            type="button"
            className="error-panel__close"
            aria-label="Закрыть"
            onClick={() => clearError(error.id)}
          >
            ×
          </button>
        </div>
      ))}
    </aside>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification (deferred to Task 28's smoke test)**

No automated UI tests per the design spec's testing scope (pure functions + ISS client only). Rendering is verified in Task 28's browser smoke test.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/errors/ErrorPanel.tsx webapp/src/errors/ErrorPanel.css
git commit -m "feat: add fixed-width error panel with word-wrapped messages"
```

---

## Task 22: App shell — tabs, header, providers

**Files:**
- Modify: `webapp/src/App.tsx`
- Create: `webapp/src/components/Header.tsx`
- Create: `webapp/src/portfolio/PortfolioContext.tsx`

**Interfaces:**
- Consumes: `ErrorProvider`, `useErrors` (Task 20); `ErrorPanel` (Task 21); `PortfolioFile` (Task 3); `createEmptyPortfolio` (Task 16); `loadViaFileSystemAccess`, `loadViaInputFile`, `isFileSystemAccessSupported` (Task 17); `saveViaFileSystemAccess`, `saveViaFileSystemAccessNew`, `downloadPortfolioFile` (Task 18).
- Produces: `PortfolioProvider`, `usePortfolio(): { file: PortfolioFile | null; setFile: (f: PortfolioFile) => void; fileHandle: FileSystemFileHandle | null; setFileHandle: (h: FileSystemFileHandle | null) => void; liveByTicker: Map<string, LiveData>; setLiveByTicker: (m: Map<string, LiveData>) => void }` — used by Tasks 23-27 (all tabs). `App` default export now renders the full shell (tabs + header + error panel), replacing Task 1's placeholder.

`liveByTicker` holds the in-memory result of the most recent market-data merge for the current session (never persisted to the file — live data is always recomputed from ISS, per design §2). Task 23's `runMarketUpdate` reads it before an update (as `mergeMarketData`'s Task 10 `previousLiveByTicker` fallback, so a ticker that's gone fully missing from `securities` keeps its last known price instead of `null`) and writes the new result back after.

- [ ] **Step 1: Write `webapp/src/portfolio/PortfolioContext.tsx`**

```tsx
import React, { createContext, useContext, useState } from "react";
import { PortfolioFile, LiveData } from "../types";

interface PortfolioContextValue {
  file: PortfolioFile | null;
  setFile: (file: PortfolioFile) => void;
  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;
  liveByTicker: Map<string, LiveData>;
  setLiveByTicker: (liveByTicker: Map<string, LiveData>) => void;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<PortfolioFile | null>(null);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [liveByTicker, setLiveByTicker] = useState<Map<string, LiveData>>(new Map());

  return (
    <PortfolioContext.Provider
      value={{ file, setFile, fileHandle, setFileHandle, liveByTicker, setLiveByTicker }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within a PortfolioProvider");
  return ctx;
}
```

- [ ] **Step 2: Write `webapp/src/components/Header.tsx`**

Auto-updates market data right after a file loads (per design §3), by calling `onFileLoaded` which Task 23 wires to the update flow.

```tsx
import { useRef } from "react";
import { usePortfolio } from "../portfolio/PortfolioContext";
import { useErrors } from "../errors/ErrorContext";
import { createEmptyPortfolio } from "../file/createEmptyPortfolio";
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

export function Header({ onFileLoaded }: { onFileLoaded: () => void }) {
  const { file, setFile, fileHandle, setFileHandle } = usePortfolio();
  const { addError, clearBySource } = useErrors();
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <header className="header">
      <h1>Портфель-трекер IMOEX</h1>
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
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Replace `webapp/src/App.tsx`**

```tsx
import { useState } from "react";
import { ErrorProvider } from "./errors/ErrorContext";
import { ErrorPanel } from "./errors/ErrorPanel";
import { PortfolioProvider, usePortfolio } from "./portfolio/PortfolioContext";
import { Header } from "./components/Header";
import { PortfolioTab } from "./components/PortfolioTab";
import { ChartsTab } from "./components/ChartsTab";
import { SectorsTab } from "./components/SectorsTab";

type Tab = "portfolio" | "charts" | "sectors";

function AppShell() {
  const [tab, setTab] = useState<Tab>("portfolio");
  const { file } = usePortfolio();
  const [updateSignal, setUpdateSignal] = useState(0);

  return (
    <div className="app">
      <Header onFileLoaded={() => setUpdateSignal((n) => n + 1)} />
      {file && (
        <>
          <nav className="tabs">
            <button type="button" onClick={() => setTab("portfolio")} disabled={tab === "portfolio"}>
              Портфель
            </button>
            <button type="button" onClick={() => setTab("charts")} disabled={tab === "charts"}>
              Графики
            </button>
            <button type="button" onClick={() => setTab("sectors")} disabled={tab === "sectors"}>
              Сектора
            </button>
          </nav>
          <main className="tab-content">
            {tab === "portfolio" && <PortfolioTab autoUpdateSignal={updateSignal} />}
            {tab === "charts" && <ChartsTab />}
            {tab === "sectors" && <SectorsTab />}
          </main>
        </>
      )}
      <ErrorPanel />
    </div>
  );
}

export default function App() {
  return (
    <ErrorProvider>
      <PortfolioProvider>
        <AppShell />
      </PortfolioProvider>
    </ErrorProvider>
  );
}
```

- [ ] **Step 4: Append tab/header styles to `webapp/src/styles.css`**

```css
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #ddd;
}

.header__actions {
  display: flex;
  gap: 8px;
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  border-bottom: 1px solid #eee;
}

.tab-content {
  padding: 16px;
}
```

Note: `App.tsx` in Step 3 references `PortfolioTab`, `ChartsTab`, `SectorsTab`, which don't exist yet — this task will not typecheck cleanly until Tasks 23/25/27 create them. Create minimal stub components now so this task is independently testable, and let later tasks replace the stubs:

- [ ] **Step 5: Create placeholder stubs (replaced by Tasks 23, 25, 27)**

```tsx
// webapp/src/components/PortfolioTab.tsx
export function PortfolioTab(_props: { autoUpdateSignal: number }) {
  return <p>Вкладка «Портфель» в разработке.</p>;
}
```

```tsx
// webapp/src/components/ChartsTab.tsx
export function ChartsTab() {
  return <p>Вкладка «Графики» в разработке.</p>;
}
```

```tsx
// webapp/src/components/SectorsTab.tsx
export function SectorsTab() {
  return <p>Вкладка «Сектора» в разработке.</p>;
}
```

- [ ] **Step 6: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/App.tsx webapp/src/components/Header.tsx webapp/src/portfolio/PortfolioContext.tsx webapp/src/styles.css webapp/src/components/PortfolioTab.tsx webapp/src/components/ChartsTab.tsx webapp/src/components/SectorsTab.tsx
git commit -m "feat: add app shell with tabs, header, and file load/save wiring"
```

---

## Task 23: Portfolio tab — positions table and update flow

**Files:**
- Modify: `webapp/src/components/PortfolioTab.tsx` (replace stub)
- Create: `webapp/src/components/PositionsTable.tsx`
- Test: `webapp/src/portfolio/runMarketUpdate.test.ts`
- Create: `webapp/src/portfolio/runMarketUpdate.ts`

**Interfaces:**
- Consumes: `usePortfolio` (Task 22), `useErrors` (Task 20), `fetchMarketData` (Task 9), `mergeMarketData` (Task 10), `buildCalculatedPositions` (Task 14), `createSectorResolver`, `SECTORS_DEFAULT` (Task 13), `createHistorySnapshot` (Task 19), `CalculatedPosition`, `PortfolioFile` (Task 3).
- Produces: `runMarketUpdate(currentFile: PortfolioFile, previousLiveByTicker?: Map<string, LiveData>): Promise<{ file: PortfolioFile; liveByTicker: Map<string, LiveData> }>` (pure orchestration, throws on all-or-nothing failure) — used by `PortfolioTab` here and reused for the auto-update-on-load flow in Task 28. Returns the new `liveByTicker` alongside the updated file so the caller (Task 22's `PortfolioContext`) can retain it across renders and pass it back in as `previousLiveByTicker` on the next call — this is what lets a ticker fully missing from ISS `securities` keep its last known price (Task 10's fallback) instead of going blank. `PortfolioTab` and `PositionsTable` React components — used by `App.tsx` (Task 22).

- [ ] **Step 1: Write the failing test for the pure update orchestrator**

```typescript
// webapp/src/portfolio/runMarketUpdate.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { runMarketUpdate } from "./runMarketUpdate";
import * as marketDataModule from "../iss/marketData";
import { PortfolioFile, LiveData } from "../types";

afterEach(() => vi.restoreAllMocks());

const baseFile: PortfolioFile = {
  version: 1,
  positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 10 }],
  sectors: {},
  history: [],
};

describe("runMarketUpdate", () => {
  it("merges fresh market data into positions and appends a history snapshot", async () => {
    vi.spyOn(marketDataModule, "fetchMarketData").mockResolvedValue({
      composition: [{ ticker: "GAZP", shortName: "ГАЗПРОМ ао", weight: 9.32 }],
      securities: new Map([["GAZP", { shortName: "ГАЗПРОМ ао", price: 92.79, lotSize: 10 }]]),
      dividends: new Map([["GAZP", 0]]),
    });

    const { file: updated, liveByTicker } = await runMarketUpdate(baseFile);

    expect(updated.positions).toEqual(baseFile.positions);
    expect(updated.history).toHaveLength(1);
    expect(updated.history[0].portfolioValue).toBeCloseTo(927.9);
    expect(updated.sectors).toEqual(baseFile.sectors);
    expect(liveByTicker.get("GAZP")?.price).toBe(92.79);
  });

  it("propagates the underlying fetch error without mutating the file", async () => {
    vi.spyOn(marketDataModule, "fetchMarketData").mockRejectedValue(new Error("ISS down"));
    await expect(runMarketUpdate(baseFile)).rejects.toThrow("ISS down");
  });

  it("threads previousLiveByTicker into the merge so a ticker missing from securities keeps its last known price", async () => {
    vi.spyOn(marketDataModule, "fetchMarketData").mockResolvedValue({
      composition: [],
      securities: new Map(),
      dividends: new Map([["GAZP", 0]]),
    });
    const previousLiveByTicker = new Map<string, LiveData>([
      [
        "GAZP",
        {
          ticker: "GAZP",
          shortName: "ГАЗПРОМ ао",
          indexWeight: 0,
          price: 92.79,
          lotSize: 10,
          dividendPerShare: 0,
          status: "out_of_index",
        },
      ],
    ]);

    const { liveByTicker } = await runMarketUpdate(baseFile, previousLiveByTicker);

    expect(liveByTicker.get("GAZP")?.price).toBe(92.79);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npx vitest run src/portfolio/runMarketUpdate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `webapp/src/portfolio/runMarketUpdate.ts`**

```typescript
import { PortfolioFile, LiveData } from "../types";
import { fetchMarketData } from "../iss/marketData";
import { mergeMarketData } from "../domain/merge";
import { buildCalculatedPositions } from "../domain/buildCalculatedPositions";
import { createSectorResolver } from "../domain/sectors";
import { SECTORS_DEFAULT } from "../data/sectorsDefault";
import { createHistorySnapshot } from "../domain/createHistorySnapshot";

export async function runMarketUpdate(
  currentFile: PortfolioFile,
  previousLiveByTicker: Map<string, LiveData> = new Map()
): Promise<{ file: PortfolioFile; liveByTicker: Map<string, LiveData> }> {
  const existingTickers = currentFile.positions.map((p) => p.ticker);
  const marketData = await fetchMarketData(existingTickers);

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npx vitest run src/portfolio/runMarketUpdate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit the pure orchestrator**

```bash
git add webapp/src/portfolio/runMarketUpdate.ts webapp/src/portfolio/runMarketUpdate.test.ts
git commit -m "feat: add pure market-update orchestration for the portfolio tab"
```

- [ ] **Step 6: Write `webapp/src/components/PositionsTable.tsx`**

```tsx
import { CalculatedPosition, STATUS_LABELS } from "../types";

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

export function PositionsTable({
  positions,
  onChangeCoefficient,
  onChangeSharesOwned,
}: {
  positions: CalculatedPosition[];
  onChangeCoefficient: (ticker: string, value: number) => void;
  onChangeSharesOwned: (ticker: string, value: number) => void;
}) {
  return (
    <table className="positions-table">
      <thead>
        <tr>
          <th>Тикер</th>
          <th>Название</th>
          <th>Вес в индексе</th>
          <th>Цена</th>
          <th>Лотность</th>
          <th>Сектор</th>
          <th>Дивиденд</th>
          <th>Статус</th>
          <th>Коэф-т</th>
          <th>Куплено</th>
          <th>Цель</th>
          <th>Факт. доля</th>
          <th>Соответствие</th>
          <th>Стоимость</th>
          <th>Доход</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => (
          <tr key={p.ticker}>
            <td>{p.ticker}</td>
            <td>{p.shortName}</td>
            <td>{formatNumber(p.indexWeight)}</td>
            <td>{formatNumber(p.price)}</td>
            <td>{p.lotSize ?? "—"}</td>
            <td>{p.sector}</td>
            <td>{formatNumber(p.dividendPerShare)}</td>
            <td>{STATUS_LABELS[p.status]}</td>
            <td>
              <input
                type="number"
                step="0.01"
                value={p.coefficient}
                onChange={(e) => onChangeCoefficient(p.ticker, Number(e.target.value))}
              />
            </td>
            <td>
              <input
                type="number"
                step="1"
                value={p.sharesOwned}
                onChange={(e) => onChangeSharesOwned(p.ticker, Number(e.target.value))}
              />
            </td>
            <td>{formatNumber(p.targetAllocation)}</td>
            <td>{formatNumber(p.actualShare)}</td>
            <td>{formatNumber(p.compliance)}</td>
            <td>{formatNumber(p.positionValue)}</td>
            <td>{formatNumber(p.income)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 7: Replace `webapp/src/components/PortfolioTab.tsx`**

```tsx
import { useMemo, useEffect, useRef, useState } from "react";
import { usePortfolio } from "../portfolio/PortfolioContext";
import { useErrors } from "../errors/ErrorContext";
import { runMarketUpdate } from "../portfolio/runMarketUpdate";
import { buildCalculatedPositions } from "../domain/buildCalculatedPositions";
import { createSectorResolver } from "../domain/sectors";
import { SECTORS_DEFAULT } from "../data/sectorsDefault";
import { PositionsTable } from "./PositionsTable";

const SOURCE = "update";

export function PortfolioTab({ autoUpdateSignal }: { autoUpdateSignal: number }) {
  const { file, setFile, liveByTicker, setLiveByTicker } = usePortfolio();
  const { addError, clearBySource } = useErrors();
  const [isUpdating, setIsUpdating] = useState(false);
  const lastAutoSignal = useRef(0);

  async function handleUpdate() {
    if (!file) return;
    setIsUpdating(true);
    clearBySource(SOURCE);
    try {
      const { file: updated, liveByTicker: newLiveByTicker } = await runMarketUpdate(
        file,
        liveByTicker
      );
      setFile(updated);
      setLiveByTicker(newLiveByTicker);
    } catch (error) {
      addError(SOURCE, `Не удалось обновить рыночные данные: ${(error as Error).message}`);
    } finally {
      setIsUpdating(false);
    }
  }

  useEffect(() => {
    if (autoUpdateSignal !== lastAutoSignal.current) {
      lastAutoSignal.current = autoUpdateSignal;
      if (autoUpdateSignal > 0) void handleUpdate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoUpdateSignal]);

  const calculated = useMemo(() => {
    if (!file) return [];
    // liveByTicker starts empty (before the first update); buildCalculatedPositions
    // already falls back to sensible defaults (out_of_index/null price) per-ticker
    // when an entry is missing, so no separate empty-merge step is needed here.
    // After an update, this is the real merged data (see handleUpdate above), kept
    // in PortfolioContext so it survives re-renders and feeds the next update's
    // previousLiveByTicker fallback (Task 10).
    const resolveSector = createSectorResolver(SECTORS_DEFAULT, file.sectors);
    return buildCalculatedPositions(file.positions, liveByTicker, resolveSector);
  }, [file, liveByTicker]);

  if (!file) return null;

  const portfolioValue = calculated.reduce((sum, p) => sum + p.positionValue, 0);
  const avgCompliance =
    file.history.length > 0 ? file.history[file.history.length - 1].avgCompliance : null;

  function updateField(ticker: string, field: "coefficient" | "sharesOwned", value: number) {
    if (!file) return;
    setFile({
      ...file,
      positions: file.positions.map((p) =>
        p.ticker === ticker ? { ...p, [field]: value } : p
      ),
    });
  }

  return (
    <div className="portfolio-tab">
      <button type="button" onClick={handleUpdate} disabled={isUpdating}>
        {isUpdating ? "Обновление…" : "Обновить"}
      </button>
      <PositionsTable
        positions={calculated}
        onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
        onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
      />
      <div className="portfolio-summary">
        <span>Общая стоимость: {portfolioValue.toFixed(2)}</span>
        <span>Среднее соответствие: {avgCompliance === null ? "—" : avgCompliance.toFixed(2)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add webapp/src/components/PositionsTable.tsx webapp/src/components/PortfolioTab.tsx
git commit -m "feat: wire portfolio tab with positions table and update flow"
```

---

## Task 24: History line chart component

**Files:**
- Create: `webapp/src/components/HistoryLineChart.tsx`

**Interfaces:**
- Produces: `HistoryLineChart` React component with props `{ data: { x: string; y: number }[]; label: string }` — used by Task 25's `ChartsTab`.

- [ ] **Step 1: Write `webapp/src/components/HistoryLineChart.tsx`**

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function HistoryLineChart({
  data,
  label,
}: {
  data: { x: string; y: number }[];
  label: string;
}) {
  return (
    <div className="history-chart">
      <h3>{label}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="y" stroke="#1a1a1a" dot={false} name={label} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/HistoryLineChart.tsx
git commit -m "feat: add generic history line chart component"
```

---

## Task 25: Charts tab

**Files:**
- Modify: `webapp/src/components/ChartsTab.tsx` (replace stub)

**Interfaces:**
- Consumes: `usePortfolio` (Task 22), `HistoryLineChart` (Task 24), `HistorySnapshot` (Task 3).
- Produces: `ChartsTab` React component — used by `App.tsx` (Task 22).

- [ ] **Step 1: Replace `webapp/src/components/ChartsTab.tsx`**

```tsx
import { useMemo, useState } from "react";
import { usePortfolio } from "../portfolio/PortfolioContext";
import { HistoryLineChart } from "./HistoryLineChart";

export function ChartsTab() {
  const { file } = usePortfolio();
  const history = file?.history ?? [];

  const allTickers = useMemo(() => {
    const set = new Set<string>();
    history.forEach((h) => h.snapshot.forEach((row) => set.add(row.ticker)));
    return Array.from(set).sort();
  }, [history]);

  const [selectedTicker, setSelectedTicker] = useState<string>("");
  const effectiveTicker = selectedTicker || allTickers[0] || "";

  const priceData = history.map((h) => ({
    x: h.timestamp,
    y: h.snapshot.find((row) => row.ticker === effectiveTicker)?.price ?? 0,
  }));
  const valueData = history.map((h) => ({ x: h.timestamp, y: h.portfolioValue }));
  const complianceData = history.map((h) => ({ x: h.timestamp, y: h.avgCompliance ?? 0 }));

  if (history.length === 0) {
    return <p>История пуста — данные появятся после первого обновления.</p>;
  }

  return (
    <div className="charts-tab">
      <div>
        <label htmlFor="ticker-select">Тикер:</label>
        <select
          id="ticker-select"
          value={effectiveTicker}
          onChange={(e) => setSelectedTicker(e.target.value)}
        >
          {allTickers.map((ticker) => (
            <option key={ticker} value={ticker}>
              {ticker}
            </option>
          ))}
        </select>
      </div>
      <HistoryLineChart data={priceData} label={`Цена ${effectiveTicker}`} />
      <HistoryLineChart data={valueData} label="Стоимость портфеля" />
      <HistoryLineChart data={complianceData} label="Среднее соответствие индексу" />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/ChartsTab.tsx
git commit -m "feat: wire charts tab with ticker price, portfolio value, and compliance history"
```

---

## Task 26: Sector donut chart component

**Files:**
- Create: `webapp/src/components/SectorDonutChart.tsx`

**Interfaces:**
- Consumes: `CalculatedPosition` (Task 3).
- Produces: `SectorDonutChart` React component with props `{ positions: CalculatedPosition[] }` — used by Task 27's `SectorsTab`.

- [ ] **Step 1: Write `webapp/src/components/SectorDonutChart.tsx`**

```tsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CalculatedPosition } from "../types";

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"];

export function SectorDonutChart({ positions }: { positions: CalculatedPosition[] }) {
  const bySector = new Map<string, number>();
  for (const p of positions) {
    bySector.set(p.sector, (bySector.get(p.sector) ?? 0) + p.positionValue);
  }
  const data = Array.from(bySector.entries())
    .filter(([, value]) => value > 0)
    .map(([sector, value]) => ({ name: sector, value }));

  if (data.length === 0) {
    return <p>Нет данных для распределения по секторам.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}>
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/SectorDonutChart.tsx
git commit -m "feat: add sector distribution donut chart"
```

---

## Task 27: Sectors tab — donut chart and override modal

**Files:**
- Modify: `webapp/src/components/SectorsTab.tsx` (replace stub)
- Create: `webapp/src/components/SectorOverrideModal.tsx`

**Interfaces:**
- Consumes: `usePortfolio` (Task 22, including its `liveByTicker` state), `SectorDonutChart` (Task 26), `buildCalculatedPositions` (Task 14), `createSectorResolver`, `SECTORS_DEFAULT` (Task 13).
- Produces: `SectorsTab`, `SectorOverrideModal` React components — used by `App.tsx` (Task 22).

- [ ] **Step 1: Write `webapp/src/components/SectorOverrideModal.tsx`**

Only lists tickers already in the user's portfolio — the full 500-ticker default list is never shown or editable (per design §5/§6).

```tsx
import { useState } from "react";
import { Position } from "../types";

export function SectorOverrideModal({
  positions,
  currentOverrides,
  resolveSector,
  onSave,
  onClose,
}: {
  positions: Position[];
  currentOverrides: Record<string, string>;
  resolveSector: (ticker: string) => string;
  onSave: (overrides: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of positions) {
      initial[p.ticker] = currentOverrides[p.ticker] ?? resolveSector(p.ticker);
    }
    return initial;
  });

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Изменить сектора">
      <div className="modal">
        <h2>Изменить сектора</h2>
        <table>
          <tbody>
            {positions.map((p) => (
              <tr key={p.ticker}>
                <td>{p.ticker}</td>
                <td>
                  <input
                    type="text"
                    value={draft[p.ticker] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [p.ticker]: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal__actions">
          <button type="button" onClick={() => onSave(draft)}>
            Сохранить
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

- [ ] **Step 2: Replace `webapp/src/components/SectorsTab.tsx`**

```tsx
import { useMemo, useState } from "react";
import { usePortfolio } from "../portfolio/PortfolioContext";
import { SectorDonutChart } from "./SectorDonutChart";
import { SectorOverrideModal } from "./SectorOverrideModal";
import { buildCalculatedPositions } from "../domain/buildCalculatedPositions";
import { createSectorResolver } from "../domain/sectors";
import { SECTORS_DEFAULT } from "../data/sectorsDefault";

export function SectorsTab() {
  const { file, setFile, liveByTicker } = usePortfolio();
  const [modalOpen, setModalOpen] = useState(false);

  const resolveSector = useMemo(
    () => createSectorResolver(SECTORS_DEFAULT, file?.sectors ?? {}),
    [file?.sectors]
  );

  const calculated = useMemo(() => {
    if (!file) return [];
    // liveByTicker comes from PortfolioContext (Task 22) — the same real merged
    // data Task 23's Portfolio tab uses, so the donut chart reflects actual
    // position values instead of always showing zero (there is no fresh fetch
    // here; this tab only reads the already-merged live state from context).
    return buildCalculatedPositions(file.positions, liveByTicker, resolveSector);
  }, [file, liveByTicker, resolveSector]);

  if (!file) return null;

  return (
    <div className="sectors-tab">
      <SectorDonutChart positions={calculated} />
      <button type="button" onClick={() => setModalOpen(true)}>
        Изменить сектора
      </button>
      {modalOpen && (
        <SectorOverrideModal
          positions={file.positions}
          currentOverrides={file.sectors}
          resolveSector={resolveSector}
          onClose={() => setModalOpen(false)}
          onSave={(overrides) => {
            setFile({ ...file, sectors: overrides });
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Append modal styles to `webapp/src/styles.css`**

```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  max-height: 80vh;
  overflow-y: auto;
  min-width: 320px;
}

.modal__actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
```

- [ ] **Step 4: Typecheck**

Run: `cd webapp && npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/components/SectorsTab.tsx webapp/src/components/SectorOverrideModal.tsx webapp/src/styles.css
git commit -m "feat: wire sectors tab with donut chart and per-position override modal"
```

---

## Task 28: End-to-end wiring and manual smoke test

**Files:**
- No new files — this task is verification of Tasks 1-27 working together.

**Interfaces:**
- Consumes: everything produced by Tasks 1-27.

- [ ] **Step 1: Run the full test suite**

Run: `cd webapp && npm test`
Expected: all tests PASS (unit tests from Tasks 4-20, 23).

- [ ] **Step 2: Run typecheck and build**

Run: `cd webapp && npm run typecheck && npm run build`
Expected: no errors, `webapp/dist/` produced.

- [ ] **Step 3: Start the dev server**

Run: `cd webapp && npm run dev`
Expected: server starts, prints a local URL (e.g. `http://localhost:5173/moex-portfolio-tracker/`).

- [ ] **Step 4: Manual browser smoke test — first run**

Open the printed URL in a browser. Click «Начать с пустого портфеля».
Expected: table populates with current IMOEX constituents, `coefficient=1`, `sharesOwned=0` for every row, no entries in the error panel.

- [ ] **Step 5: Manual browser smoke test — update**

Click «Обновить».
Expected: prices/weights refresh, «Графики» tab now shows one data point per chart, «Сектора» tab shows a non-empty donut chart.

- [ ] **Step 6: Manual browser smoke test — edit and save/reload round-trip**

Edit a `sharesOwned` value in the table. Click «Сохранить» (in Chrome/Edge, pick a file location; in Firefox/Safari, a download starts). Reload the page, click «Загрузить файл» and select the saved file.
Expected: the edited `sharesOwned` value persists after reload; live fields (price, status) refresh automatically without clicking «Обновить» (per design §3 auto-update-on-load).

- [ ] **Step 7: Manual browser smoke test — sector override**

On «Сектора», click «Изменить сектора», change one ticker's sector, save.
Expected: donut chart updates to reflect the new grouping; the full default sector list is never shown, only the user's own tickers.

- [ ] **Step 8: Manual browser smoke test — error panel**

Temporarily block network access to `iss.moex.com` (e.g. via browser devtools request blocking) and click «Обновить».
Expected: error panel appears on the right with a readable, word-wrapped message; existing table data is unchanged; panel disappears after the next successful «Обновить».

- [ ] **Step 9: Commit `package-lock.json` if not already committed**

```bash
cd "E:/work/micex_index"
git status webapp/package-lock.json
git add webapp/package-lock.json
git commit -m "chore: commit package-lock.json for reproducible CI installs"
```

(Skip this step if `package-lock.json` was already committed in Task 1.)

---

## Self-Review Notes

**Spec coverage:** every functional-spec section (index composition/live data, manual fields, ticker-matching update rules, calculations incl. zero-division/empty-list safety, sector reference, history/charts, local-file storage, error handling) and every implementation-design section (stack, data model, file I/O incl. auto-update-on-load, ISS fetch strategy incl. all-or-nothing and pooled dividends, built-in sector reference with override precedence, UI tabs, error panel word-wrap/auto-clear, testing scope) maps to a task above.

**Type consistency:** `Position`, `LiveData`, `CalculatedPosition`, `HistorySnapshot`, `PortfolioFile` (Task 3) are the single source of truth and are imported — never redefined — in every later task. `mergeMarketData`'s `MergeResult.liveByTicker` (Task 10) is the exact type `buildCalculatedPositions` (Task 14) consumes. `runMarketUpdate` (Task 23) composes `fetchMarketData` (Task 9) → `mergeMarketData` (Task 10) → `buildCalculatedPositions` (Task 14) → `createHistorySnapshot` (Task 19) using the same function names and signatures defined in each producing task.

**Fixed during review:** Task 14's `buildCalculatedPositions` originally re-derived `portfolioValue` through a convoluted reverse-division of `positionValue` by `price` — replaced with a direct sum of `positionValue`, called out explicitly as a post-step correction so the task remains self-contained for an implementer reading it in isolation.
