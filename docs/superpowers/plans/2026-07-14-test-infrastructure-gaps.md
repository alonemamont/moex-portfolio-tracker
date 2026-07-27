# Test Infrastructure Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the test-infrastructure gaps identified in `docs/superpowers/specs/2026-07-14-test-infrastructure-gaps-design.md` — CI gate, coverage, shared fetch-mock helper, mutation testing, a11y checks, E2E (Playwright), broker contract tests, token-security regression test, and a perf benchmark — in 4 phases ordered small→large.

**Architecture:** All work lives under `webapp/` per the project layout. Each task is independently committable. Phase 1 is pure CI/tooling plumbing; phase 2 adds quality signal to existing unit tests; phase 3 adds a new Playwright test type; phase 4 adds opt-in/manual test types that don't run in CI by default.

**Tech Stack:** Vitest 2, Testing Library, `@vitest/coverage-v8`, `@stryker-mutator/core` + `@stryker-mutator/vitest-runner`, `vitest-axe`, `@playwright/test`. No MSW anywhere (see Global Constraints).

## Global Constraints

- All npm commands run with cwd `webapp/` — there is no root `package.json`.
- No MSW, no new fetch-mocking library — manual `fetch` mocking only (decision recorded in `2026-07-14-broker-integration-tests-design.md`, still in force).
- `tsconfig.json` covers only `src` (`"include": ["src"]`) — new top-level dirs (`e2e/`, `playwright.config.ts`, `stryker.conf.json`) are not typechecked by `npm run build`; their own tool (`playwright test`, `stryker run`) handles their TS at run time. ESLint's `files: ['**/*.{ts,tsx}']` glob is not restricted to `src`, so lint still covers them.
- Existing `.gitignore` in `webapp/` already has `*.local`, so `.env.local` for contract-test credentials is safely ignored — no new gitignore entry needed.
- `deploy.yml` already triggers on `branches: [master]` — do not touch it in this plan.
- Match existing code style: no Prettier, no comments except where a non-obvious WHY exists.

---

## Phase 1 — Fast (CI gate, coverage, fetch-mock helper)

### Task 1: CI workflow — lint + typecheck + test gate

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: existing npm scripts `lint`, `typecheck`, `test` from `webapp/package.json`.
- Produces: nothing consumed by later tasks — this task is self-contained.

- [ ] **Step 1: Verify the three gate commands currently pass locally**

Run (cwd `webapp/`):
```
npm run lint
npm run typecheck
npm run test
```
Expected: all three exit 0. If any fails, that's a pre-existing issue outside this plan's scope — stop and report it rather than silently proceeding.

- [ ] **Step 2: Create the workflow file**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [master]
    paths:
      - "webapp/**"
      - ".github/workflows/ci.yml"
  pull_request:
    paths:
      - "webapp/**"
      - ".github/workflows/ci.yml"

jobs:
  test:
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
      - name: Lint
        working-directory: webapp
        run: npm run lint
      - name: Typecheck
        working-directory: webapp
        run: npm run typecheck
      - name: Test
        working-directory: webapp
        run: npm run test
```

- [ ] **Step 3: Validate YAML syntax**

Run from repo root:
```
node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml', 'utf8'))" 2>&1 || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"
```
Expected: no error printed (either the Node `yaml` package or Python's `PyYAML` is commonly available; if neither is installed, visually re-check indentation against the block above instead of skipping validation).

- [ ] **Step 4: Commit**

```
git add .github/workflows/ci.yml
git commit -m "ci: add lint/typecheck/test gate on push and PR"
```

---

### Task 2: Coverage reporting with `@vitest/coverage-v8`

**Files:**
- Modify: `webapp/package.json` (devDependency + script)
- Modify: `webapp/vite.config.ts`
- Modify: `.github/workflows/ci.yml:24-26` (Test step → coverage step)

**Interfaces:**
- Consumes: `vite.config.ts`'s existing `test` block (Task 1 unrelated).
- Produces: `npm run test:coverage` script; `test.coverage` config in `vite.config.ts` that Task 3 test-refactors are unaffected by.

- [ ] **Step 1: Install the coverage package**

Run (cwd `webapp/`):
```
npm install --save-dev @vitest/coverage-v8@2.0.5
```
(Pin to `2.0.5` to match the installed `vitest@^2.0.5` — cross-version mismatches between `vitest` and `@vitest/coverage-v8` fail at startup.)

- [ ] **Step 2: Add coverage config without thresholds, and observe current numbers**

Edit `webapp/vite.config.ts`, add a `coverage` key inside `test`:
```ts
  test: {
    environment: "jsdom",
    globals: true,
    passWithNoTests: true,
    setupFiles: ["./src/setupTests.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.integration.test.ts", "src/setupTests.ts", "src/main.tsx"],
    },
  },
```

Add the script to `webapp/package.json` `scripts`:
```json
    "test:coverage": "vitest run --coverage",
```

Run:
```
npm run test:coverage
```
Expected: test suite passes, and a `% Coverage report` text table prints at the end with `All files` row showing Statements/Branch/Funcs/Lines percentages (an HTML report is also written to `webapp/coverage/`, gitignored via existing `dist`-style patterns — add `coverage` to `webapp/.gitignore` if it isn't already excluded; check first with `git status` after running).

- [ ] **Step 3: Set thresholds from the observed baseline**

Take the `Lines` percentage from the `All files` row in Step 2's output, round **down** to the nearest multiple of 5 (e.g. observed `82.34%` → threshold `80`). Add a `thresholds` block using that same rounded-down number for all four metrics (statements/branches/functions/lines) — using one shared floor is simpler than tuning four independently and still catches regressions:

```ts
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.integration.test.ts", "src/setupTests.ts", "src/main.tsx"],
      thresholds: {
        statements: /* rounded-down number from Step 2 */,
        branches: /* rounded-down number from Step 2 */,
        functions: /* rounded-down number from Step 2 */,
        lines: /* rounded-down number from Step 2 */,
      },
    },
```

- [ ] **Step 4: Re-run to confirm the threshold passes**

Run:
```
npm run test:coverage
```
Expected: exit 0, no "ERROR: Coverage for X does not meet threshold" lines.

- [ ] **Step 5: Wire into CI**

In `.github/workflows/ci.yml`, replace the `Test` step (added in Task 1) with:
```yaml
      - name: Test with coverage
        working-directory: webapp
        run: npm run test:coverage
```

- [ ] **Step 6: Check `webapp/coverage/` is gitignored, then commit**

Run:
```
git status --short
```
If `webapp/coverage/` (or `coverage/`) shows as untracked, add it to `webapp/.gitignore` (append a `coverage` line after the existing `dist` line) before staging.

```
git add webapp/package.json webapp/package-lock.json webapp/vite.config.ts webapp/.gitignore .github/workflows/ci.yml
git commit -m "test: add coverage reporting with v8 provider and CI-enforced threshold"
```

---

### Task 3: Shared fetch-mock test helper

**Files:**
- Create: `webapp/src/testUtils/mockFetch.ts`
- Create: `webapp/src/testUtils/mockFetch.test.ts`
- Modify: `webapp/src/iss/client.test.ts`
- Modify: `webapp/src/brokers/finam/client.test.ts`
- Modify: `webapp/src/brokers/tbank/client.test.ts`

**Interfaces:**
- Produces: `mockFetchByUrl(routes: Array<{ match: string | RegExp; response: () => Response }>): void` and `mockFetchOnce(body: unknown, ok?: boolean, status?: number): void` — both call `vi.stubGlobal("fetch", ...)` internally, same manual-mock style as today, just deduplicated. Later tasks (integration-test refactor is optional follow-up, not required by this plan) can import these from `../../testUtils/mockFetch` (adjust relative depth per file).

- [ ] **Step 1: Write the failing test for the helper itself**

`webapp/src/testUtils/mockFetch.test.ts`:
```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { mockFetchByUrl, mockFetchOnce } from "./mockFetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mockFetchByUrl", () => {
  it("routes to the response whose match is found in the URL", async () => {
    mockFetchByUrl([
      { match: "/securities.xml", response: () => new Response("securities-body", { status: 200 }) },
      { match: "/analytics/", response: () => new Response("analytics-body", { status: 200 }) },
    ]);

    const securitiesRes = await fetch("https://iss.moex.com/iss/.../securities.xml?x=1");
    const analyticsRes = await fetch("https://iss.moex.com/iss/.../analytics/IMOEX.xml");

    expect(await securitiesRes.text()).toBe("securities-body");
    expect(await analyticsRes.text()).toBe("analytics-body");
  });

  it("throws a descriptive error when no route matches", async () => {
    mockFetchByUrl([{ match: "/known", response: () => new Response("", { status: 200 }) }]);
    await expect(fetch("https://example.com/unknown")).rejects.toThrow(/no mockFetchByUrl route matches/);
  });

  it("supports RegExp matchers", async () => {
    mockFetchByUrl([{ match: /\/BROKEN\//, response: () => new Response("", { status: 500 }) }]);
    const res = await fetch("https://example.com/x/BROKEN/y");
    expect(res.status).toBe(500);
  });
});

describe("mockFetchOnce", () => {
  it("resolves fetch with the given JSON body and ok/status", async () => {
    mockFetchOnce({ token: "jwt-abc" });
    const res = await fetch("https://example.com/anything");
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "jwt-abc" });
  });

  it("supports a non-ok status", async () => {
    mockFetchOnce({}, false, 401);
    const res = await fetch("https://example.com/anything");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
npx vitest run src/testUtils/mockFetch.test.ts
```
Expected: FAIL — `Cannot find module './mockFetch'` (file doesn't exist yet).

- [ ] **Step 3: Implement the helper**

`webapp/src/testUtils/mockFetch.ts`:
```ts
import { vi } from "vitest";

export interface FetchRoute {
  match: string | RegExp;
  response: () => Response;
}

export function mockFetchByUrl(routes: FetchRoute[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const route = routes.find(({ match }) =>
        typeof match === "string" ? url.includes(match) : match.test(url)
      );
      if (!route) {
        throw new Error(`no mockFetchByUrl route matches URL: ${url}`);
      }
      return route.response();
    })
  );
}

export function mockFetchOnce(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    })
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
npx vitest run src/testUtils/mockFetch.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit the helper**

```
git add webapp/src/testUtils/mockFetch.ts webapp/src/testUtils/mockFetch.test.ts
git commit -m "test: add shared mockFetchByUrl/mockFetchOnce helper"
```

- [ ] **Step 6: Refactor `iss/client.test.ts` to use the helper**

In `webapp/src/iss/client.test.ts`, replace the import line and the four `vi.stubGlobal("fetch", vi.fn(async (url: string) => {...}))` call sites with `mockFetchByUrl`. Example for the `fetchIndexComposition` describe block (lines 14-23 today):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchIndexComposition, fetchSecurities, fetchLatestDividend, fetchDividendsForTickers } from "./client";
import { mockFetchByUrl } from "../testUtils/mockFetch";

// ...

describe("fetchIndexComposition", () => {
  beforeEach(() => {
    mockFetchByUrl([{ match: "limit=100", response: () => new Response(compositionXml, { status: 200 }) }]);
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
    mockFetchByUrl([{ match: "/analytics/MOEXBC.xml", response: () => new Response(compositionXml, { status: 200 }) }]);
    await fetchIndexComposition("MOEXBC");
  });

  it("throws when the response is not ok", async () => {
    mockFetchByUrl([{ match: "", response: () => new Response("", { status: 500 }) }]);
    await expect(fetchIndexComposition("IMOEX")).rejects.toThrow(/composition request failed/);
  });
});
```

Apply the same substitution pattern to the `fetchSecurities`, `fetchLatestDividend`, and `fetchDividendsForTickers` describe blocks in the same file — each `vi.stubGlobal("fetch", vi.fn(async (url) => {...}))` becomes a `mockFetchByUrl([...])` call with one route per URL-based branch that existed in the old callback. The `it("returns an empty map without a network call...")` test keeps `vi.stubGlobal("fetch", vi.fn())` as-is (it asserts `fetch` is never called, so no route setup is needed there — leave that one line untouched).

- [ ] **Step 7: Run the ISS client tests**

Run:
```
npx vitest run src/iss/client.test.ts
```
Expected: PASS, same test count as before the refactor (8 tests).

- [ ] **Step 8: Refactor `brokers/finam/client.test.ts` and `brokers/tbank/client.test.ts`**

In `webapp/src/brokers/finam/client.test.ts`, delete the local `mockFetchOnce` function (lines 14-23) and import it instead:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  exchangeFinamSecret,
  fetchFinamAccountIds,
  fetchFinamAccountDetails,
  resolveFinamAsset,
  parseFinamQuantity,
} from "./client";
import { mockFetchOnce } from "../../testUtils/mockFetch";

afterEach(() => {
  vi.restoreAllMocks();
});
```
Leave every `mockFetchOnce(...)` call site unchanged — same signature, just imported instead of locally defined.

Apply the identical change to `webapp/src/brokers/tbank/client.test.ts` (check it for the same local `mockFetchOnce` definition and replace with the import; if its local helper has a different name or signature, keep the file's own local helper as-is rather than forcing a mismatched signature — the helper's contract is `mockFetchOnce(body, ok?, status?)`, exactly matching finam's local one).

- [ ] **Step 9: Run both broker client test files**

Run:
```
npx vitest run src/brokers/finam/client.test.ts src/brokers/tbank/client.test.ts
```
Expected: PASS, same test counts as before (finam 8, tbank per its own file).

- [ ] **Step 10: Run the full suite to confirm no regressions**

Run:
```
npm run test
```
Expected: PASS, same total test count as before Task 3 started.

- [ ] **Step 11: Commit**

```
git add webapp/src/iss/client.test.ts webapp/src/brokers/finam/client.test.ts webapp/src/brokers/tbank/client.test.ts
git commit -m "test: dedupe fetch-mocking through shared mockFetch helper"
```

---

## Phase 2 — Medium (mutation testing, a11y)

### Task 4: Mutation testing on `domain/` and `brokers/syncDiff.ts`

**Files:**
- Create: `webapp/stryker.conf.json`
- Modify: `webapp/package.json` (devDependencies + script)

**Interfaces:**
- Consumes: existing Vitest config (`vite.config.ts`) via `@stryker-mutator/vitest-runner`.
- Produces: `npm run test:mutation` script — manual/periodic use, not part of `ci.yml`.

- [ ] **Step 1: Install Stryker packages**

Run (cwd `webapp/`):
```
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner
```

- [ ] **Step 2: Write the config**

`webapp/stryker.conf.json`:
```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "testRunner": "vitest",
  "reporters": ["html", "clear-text", "progress"],
  "mutate": [
    "src/domain/**/*.ts",
    "!src/domain/**/*.test.ts",
    "src/brokers/syncDiff.ts"
  ],
  "coverageAnalysis": "perTest"
}
```

- [ ] **Step 3: Add the npm script**

In `webapp/package.json` `scripts`:
```json
    "test:mutation": "stryker run",
```

- [ ] **Step 4: Run it and record the baseline mutation score**

Run:
```
npm run test:mutation
```
Expected: exits 0 (or non-zero if Stryker's default thresholds — `break: 0` unset means it won't fail the build; leave `thresholds` unset in the config so a first run always succeeds and only reports the score). Note the printed mutation score percentage in the final summary table — this is the baseline; write it into the commit message in Step 6 so it's discoverable in `git log` later (no separate baseline file — that would drift and go stale).

- [ ] **Step 5: Sanity-check the report**

Run:
```
ls webapp/reports/mutation/html
```
Expected: an `index.html` file was generated (open it manually to skim for zero survived mutants in the highest-risk file, `syncDiff.ts`, as a sanity check — no automated assertion needed for this task).

- [ ] **Step 6: Add reports dir to gitignore and commit**

Append `reports` to `webapp/.gitignore` (Stryker's HTML report shouldn't be committed).

```
git add webapp/stryker.conf.json webapp/package.json webapp/package-lock.json webapp/.gitignore
git commit -m "$(cat <<'EOF'
test: add Stryker mutation testing for domain/ and syncDiff.ts

Baseline mutation score: <fill in the percentage from Step 4's output>
EOF
)"
```

---

### Task 5: a11y assertions in existing modal/form component tests

**Files:**
- Modify: `webapp/package.json` (devDependencies)
- Modify: `webapp/src/setupTests.ts`
- Modify: `webapp/src/components/BrokerConnectionsModal.test.tsx`
- Modify: `webapp/src/components/AddBrokerConnectionForm.test.tsx`
- Modify: `webapp/src/components/BrokerSyncPreviewModal.test.tsx`

**Interfaces:**
- Consumes: `render(...)` result (`container`) already returned by existing `renderModal`/`render` calls in each file.
- Produces: nothing new consumed elsewhere — this task only adds assertions to existing tests.

- [ ] **Step 1: Install `vitest-axe`**

Run (cwd `webapp/`):
```
npm install --save-dev vitest-axe
```

- [ ] **Step 2: Wire the matcher globally**

`webapp/src/setupTests.ts`:
```ts
import "@testing-library/jest-dom/vitest";
import "vitest-axe/extend-expect";
```

- [ ] **Step 3: Write the failing a11y test in `BrokerConnectionsModal.test.tsx`**

Add near the top of the file (after existing imports):
```ts
import { axe } from "vitest-axe";
```

Add a new test inside the `describe("BrokerConnectionsModal", ...)` block:
```ts
  it("has no detectable a11y violations when a connection is locked", async () => {
    const connection = await makeConnection();
    const { container } = renderModal(makeFile([connection]));
    expect(await axe(container)).toHaveNoViolations();
  });
```

- [ ] **Step 4: Run it, expect it to fail only if `vitest-axe` isn't wired yet**

Run:
```
npx vitest run src/components/BrokerConnectionsModal.test.tsx
```
Expected: PASS if Steps 1-2 were done correctly (this is effectively a smoke test that the matcher is registered — a genuine a11y violation is not expected in this already-shipped component, so "fails first" TDD doesn't apply cleanly here; if it fails, the failure message tells you which a11y rule the component violates — fix the component's JSX per the message, don't weaken the assertion).

- [ ] **Step 5: Add the same pattern to `AddBrokerConnectionForm.test.tsx`**

Check the file's existing `render(...)` calls — capture `container` from at least one representative render (the default/first-connection render) and add:
```ts
import { axe } from "vitest-axe";
// ...
  it("has no detectable a11y violations", async () => {
    const { container } = render(<AddBrokerConnectionForm isFirstConnection onAdd={vi.fn()} onCancel={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
```
(Match the actual prop names/defaults already used by other tests in this file — read the file's existing renders first and mirror them exactly rather than guessing prop values.)

- [ ] **Step 6: Add the same pattern to `BrokerSyncPreviewModal.test.tsx`**

Same approach: import `axe`, capture `container` from an existing render with a representative non-empty `rows` prop, add one `it("has no detectable a11y violations", ...)` test.

- [ ] **Step 7: Run all three files**

Run:
```
npx vitest run src/components/BrokerConnectionsModal.test.tsx src/components/AddBrokerConnectionForm.test.tsx src/components/BrokerSyncPreviewModal.test.tsx
```
Expected: PASS, 3 new tests (one per file) added to the existing counts.

- [ ] **Step 8: Run the full suite**

Run:
```
npm run test
```
Expected: PASS.

- [ ] **Step 9: Commit**

```
git add webapp/package.json webapp/package-lock.json webapp/src/setupTests.ts webapp/src/components/BrokerConnectionsModal.test.tsx webapp/src/components/AddBrokerConnectionForm.test.tsx webapp/src/components/BrokerSyncPreviewModal.test.tsx
git commit -m "test: add axe a11y checks to broker connection modal/form tests"
```

---

## Phase 3 — Large (Playwright E2E)

### Task 6: Playwright setup + golden-path E2E (empty portfolio → add ticker → market update → save)

**Files:**
- Create: `webapp/playwright.config.ts`
- Create: `webapp/e2e/fixtures/iss.ts`
- Create: `webapp/e2e/golden-path.spec.ts`
- Modify: `webapp/package.json` (devDependency + script)
- Modify: `webapp/eslint.config.js` (browser globals already cover `window`/`document`; Playwright's own `test`/`expect` need no extra config — `@playwright/test` provides its own types, no eslint change required; verify in Step 7)

**Interfaces:**
- Produces: `webapp/e2e/fixtures/iss.ts` exports `mockIssRoutes(page: Page): Promise<void>` — consumed by Task 7 too.

- [ ] **Step 1: Install Playwright**

Run (cwd `webapp/`):
```
npm install --save-dev @playwright/test
npx playwright install --with-deps chromium
```
(Chromium only — YAGNI; add Firefox/WebKit later if a cross-browser bug actually surfaces.)

- [ ] **Step 2: Write the Playwright config**

`webapp/playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173/moex-portfolio-tracker/",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173/moex-portfolio-tracker/",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 3: Write the shared ISS mock fixture**

`webapp/e2e/fixtures/iss.ts`:
```ts
import { Page } from "@playwright/test";

const COMPOSITION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<document><data id="analytics"><rows>
<row indexid="IMOEX" tradedate="2026-07-09" ticker="GAZP" shortnames="ГАЗПРОМ ао" secids="GAZP" weight="9.32" />
</rows></data></document>`;

function securitiesXml(ticker: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<document>
<data id="securities"><rows><row SECID="${ticker}" BOARDID="TQBR" SHORTNAME="${ticker} ао" PREVPRICE="100" LOTSIZE="1" /></rows></data>
<data id="marketdata"><rows><row SECID="${ticker}" BOARDID="TQBR" LAST="101.5" /></rows></data>
</document>`;
}

const EMPTY_DIVIDENDS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<document><data id="dividends"><rows></rows></data></document>`;

export async function mockIssRoutes(page: Page, tickers: string[] = ["GAZP"]): Promise<void> {
  await page.route("**/iss.moex.com/iss/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/analytics/")) {
      await route.fulfill({ status: 200, body: COMPOSITION_XML, contentType: "application/xml" });
    } else if (url.includes("securities.xml")) {
      const requested = tickers.find((t) => url.includes(t)) ?? tickers[0];
      await route.fulfill({ status: 200, body: securitiesXml(requested), contentType: "application/xml" });
    } else {
      await route.fulfill({ status: 200, body: EMPTY_DIVIDENDS_XML, contentType: "application/xml" });
    }
  });
}
```

- [ ] **Step 4: Write the golden-path spec**

`webapp/e2e/golden-path.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { mockIssRoutes } from "./fixtures/iss";

test.beforeEach(async ({ page }) => {
  // Force the input[type=file] + download fallback paths deterministically,
  // instead of the real File System Access picker Playwright can't drive.
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showOpenFilePicker;
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
  });
});

test("start empty, add a ticker, market update runs, and the file downloads", async ({ page }) => {
  await mockIssRoutes(page, ["GAZP"]);
  await page.goto("/");

  await page.getByRole("button", { name: "Начать с пустого портфеля" }).click();
  await expect(page.getByRole("button", { name: "+ Тикер" })).toBeVisible();

  await page.getByRole("button", { name: "+ Тикер" }).click();
  await page.getByPlaceholder("Тикер").fill("GAZP");
  await expect(page.getByText(/найден/)).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder("Количество").fill("10");
  await page.getByRole("button", { name: "Ок" }).click();

  await expect(page.getByText("GAZP")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Сохранить" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("portfolio.json");
});
```

- [ ] **Step 5: Add the npm script**

In `webapp/package.json` `scripts`:
```json
    "test:e2e": "playwright test",
```

- [ ] **Step 6: Run it**

Run:
```
npm run build
npx playwright test golden-path.spec.ts
```
Expected: 1 passed. (`npm run build` first so `npm run preview` in `webServer` has a `dist/` to serve — `playwright test` starts the webServer itself per config, but the dist output must already exist.)

- [ ] **Step 7: Confirm lint doesn't choke on the new directory**

Run:
```
npm run lint
```
Expected: exit 0 (ESLint's `files` glob applies repo-wide from `webapp/`, so `e2e/**/*.ts` and `playwright.config.ts` are linted too — fix any reported issues rather than adding an ignore).

- [ ] **Step 8: Commit**

```
git add webapp/playwright.config.ts webapp/e2e webapp/package.json webapp/package-lock.json
git commit -m "test: add Playwright E2E setup and golden-path spec"
```

---

### Task 7: Broker-sync E2E (connect → preview → apply)

**Files:**
- Create: `webapp/e2e/fixtures/tbank.ts`
- Create: `webapp/e2e/broker-sync.spec.ts`

**Interfaces:**
- Consumes: `mockIssRoutes` from `./fixtures/iss` (Task 6).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the tbank mock fixture**

`webapp/e2e/fixtures/tbank.ts`:
```ts
import { Page } from "@playwright/test";

export async function mockTbankRoutes(page: Page): Promise<void> {
  await page.route("**/invest-public-api.tbank.ru/**", async (route) => {
    const url = route.request().url();
    if (url.includes("UsersService/GetAccounts")) {
      await route.fulfill({ json: { accounts: [{ id: "acc-1", name: "Брокерский счёт" }] } });
    } else if (url.includes("OperationsService/GetPortfolio")) {
      await route.fulfill({
        json: {
          positions: [
            { figi: "FIGI1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "5", nano: 0 } },
          ],
        },
      });
    } else if (url.includes("InstrumentsService/GetInstrumentBy")) {
      await route.fulfill({ json: { instrument: { ticker: "GAZP" } } });
    } else {
      await route.fulfill({ status: 404, body: "unhandled tbank route in test" });
    }
  });
}
```

- [ ] **Step 2: Write the broker-sync spec**

`webapp/e2e/broker-sync.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { mockIssRoutes } from "./fixtures/iss";
import { mockTbankRoutes } from "./fixtures/tbank";

test("connect a tbank account, preview the diff, and apply it", async ({ page }) => {
  await mockIssRoutes(page, ["GAZP"]);
  await mockTbankRoutes(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Начать с пустого портфеля" }).click();
  await page.getByRole("button", { name: "Брокеры" }).click();
  await page.getByRole("button", { name: "Добавить подключение" }).click();

  await page.getByPlaceholder("Токен").fill("fake-tbank-token");
  await page.getByRole("button", { name: "Проверить и продолжить" }).click();
  await expect(page.getByPlaceholder("Название подключения")).toBeVisible();

  await page.getByPlaceholder("Название подключения").fill("Мой Т-Банк");
  await page.getByPlaceholder("Пароль-фраза для шифрования токена").fill("test-passphrase-123");
  await page.getByRole("button", { name: "Добавить" }).click();

  await page.getByRole("button", { name: "Синхронизировать" }).click();
  await page.getByPlaceholder("Пароль-фраза").fill("test-passphrase-123");
  await page.getByRole("button", { name: "Ок" }).click();

  await expect(page.getByText("Синхронизация: Мой Т-Банк")).toBeVisible();
  await expect(page.getByText("GAZP")).toBeVisible();

  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByText("Синхронизация: Мой Т-Банк")).not.toBeVisible();
});
```

- [ ] **Step 3: Run it**

Run:
```
npx playwright test broker-sync.spec.ts
```
Expected: 1 passed. If the "Ок" button text collides with another dialog's "Ок" button on the page at that point in the flow, scope the locator with `page.getByRole("dialog").getByRole("button", { name: "Ок" })` instead — check the actual DOM via `npx playwright test broker-sync.spec.ts --debug` if the plain locator matches more than one element.

- [ ] **Step 4: Run the full E2E suite together**

Run:
```
npx playwright test
```
Expected: 2 passed (golden-path + broker-sync).

- [ ] **Step 5: Add the E2E job to CI (separate from the fast unit-test job, PR-triggered only)**

In `.github/workflows/ci.yml`, add a second job:
```yaml
  e2e:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
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
      - name: Install Playwright browsers
        working-directory: webapp
        run: npx playwright install --with-deps chromium
      - name: Build
        working-directory: webapp
        run: npm run build
      - name: Run E2E tests
        working-directory: webapp
        run: npm run test:e2e
```

- [ ] **Step 6: Commit**

```
git add webapp/e2e .github/workflows/ci.yml
git commit -m "test: add broker-sync E2E spec and PR-only e2e CI job"
```

---

## Phase 4 — Contract tests, security regression, perf benchmark

### Task 8: Live contract tests for Finam/Tbank (env-gated, not run in CI)

**Files:**
- Create: `webapp/src/brokers/finam/client.contract.test.ts`
- Create: `webapp/src/brokers/tbank/client.contract.test.ts`
- Modify: `webapp/package.json` (script)

**Interfaces:**
- Consumes: real `exchangeFinamSecret`, `fetchFinamAccountIds` (finam); real `fetchTbankAccounts` (tbank) — no mocking.

- [ ] **Step 1: Add the npm script**

In `webapp/package.json` `scripts`:
```json
    "test:contract": "vitest run --config vitest.contract.config.ts",
```

Actually — simpler and consistent with the rest of the suite (Vitest already picks up any `*.test.ts` via the default glob, as documented in `2026-07-14-broker-integration-tests-design.md`): skip the separate config and instead gate at the test level with `it.skipIf`. Remove the script above and add this instead:
```json
    "test:contract": "vitest run src/brokers/finam/client.contract.test.ts src/brokers/tbank/client.contract.test.ts",
```

- [ ] **Step 2: Write the Finam contract test**

`webapp/src/brokers/finam/client.contract.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { exchangeFinamSecret, fetchFinamAccountIds } from "./client";

const SECRET = process.env.FINAM_CONTRACT_TEST_SECRET;

describe.skipIf(!SECRET)("Finam API contract (live)", () => {
  it("exchanges a real secret for a JWT with the expected shape", async () => {
    const jwt = await exchangeFinamSecret(SECRET!);
    expect(typeof jwt).toBe("string");
    expect(jwt.length).toBeGreaterThan(0);
  });

  it("returns at least one account id for the configured secret", async () => {
    const jwt = await exchangeFinamSecret(SECRET!);
    const ids = await fetchFinamAccountIds(jwt);
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Write the Tbank contract test**

`webapp/src/brokers/tbank/client.contract.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fetchTbankAccounts } from "./client";

const TOKEN = process.env.TBANK_CONTRACT_TEST_TOKEN;

describe.skipIf(!TOKEN)("Tbank API contract (live)", () => {
  it("returns at least one account for the configured token, with id and name fields", async () => {
    const accounts = await fetchTbankAccounts(TOKEN!);
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts[0]).toHaveProperty("id");
    expect(accounts[0]).toHaveProperty("name");
  });
});
```

- [ ] **Step 4: Confirm the tests are skipped by default**

Run (cwd `webapp/`, with no env vars set):
```
npm run test:contract
```
Expected: both files report as skipped (Vitest prints `↓ skipped` for the `describe.skipIf` blocks), exit code 0.

- [ ] **Step 5: Confirm the full suite still passes with these two new files present**

Run:
```
npm run test
```
Expected: PASS — `describe.skipIf` blocks are skipped, not failed, under the regular `npm run test` run too.

- [ ] **Step 6: Document how to run them locally**

Since there's no `webapp/README.md` today, add a short comment block at the top of each contract test file instead of creating a new doc file (YAGNI — a two-line header comment is enough context for a file only run manually):

Add to the top of `webapp/src/brokers/finam/client.contract.test.ts`, before the imports:
```ts
// Live contract test — only runs when FINAM_CONTRACT_TEST_SECRET is set.
// Run locally: FINAM_CONTRACT_TEST_SECRET=<real-secret> npm run test:contract
```

Add to the top of `webapp/src/brokers/tbank/client.contract.test.ts`, before the imports:
```ts
// Live contract test — only runs when TBANK_CONTRACT_TEST_TOKEN is set.
// Run locally: TBANK_CONTRACT_TEST_TOKEN=<real-token> npm run test:contract
```

- [ ] **Step 7: Commit**

```
git add webapp/src/brokers/finam/client.contract.test.ts webapp/src/brokers/tbank/client.contract.test.ts webapp/package.json
git commit -m "test: add env-gated live contract tests for Finam/Tbank APIs"
```

---

### Task 9: Security regression test — session token cleared on disconnect

**Files:**
- Modify: `webapp/src/components/BrokerConnectionsModal.test.tsx`

**Context (audit finding, already verified against the source in this plan's research phase):** `handleRemoveConnection` in `webapp/src/components/BrokerConnectionsModal.tsx:81-87` calls `clearSessionToken(connectionId)` before filtering the connection out of the file. The existing test `"removes the connection and calls onUpdateFile with it filtered out"` (line 127 of the test file) only asserts the file update — it never asserts the session token is actually gone from `sessionStorage`. That's the regression gap: a future refactor could drop the `clearSessionToken` call, the existing test would still pass, and a decrypted broker token would linger in `sessionStorage` after the user removes the connection.

**Interfaces:**
- Consumes: `getSessionToken` from `../brokers/tokenSession` (already used elsewhere in the codebase, same import path).

- [ ] **Step 1: Write the failing test**

Add to `webapp/src/components/BrokerConnectionsModal.test.tsx`, near the existing `"removes the connection..."` test. First add the import at the top of the file:
```ts
import { getSessionToken, setSessionToken } from "../brokers/tokenSession";
```

Then add the test:
```ts
  it("clears the cached session token when a connection is removed", async () => {
    const connection = await makeConnection();
    setSessionToken(connection.id, TOKEN);
    const file = makeFile([connection]);
    renderModal(file, vi.fn());

    expect(getSessionToken(connection.id)).toBe(TOKEN);

    fireEvent.click(screen.getByText("Удалить"));

    expect(getSessionToken(connection.id)).toBeNull();
  });
```

- [ ] **Step 2: Run it to confirm it currently passes (this is a regression guard, not a bugfix — the behavior already exists)**

Run:
```
npx vitest run src/components/BrokerConnectionsModal.test.tsx -t "clears the cached session token"
```
Expected: PASS. (If it fails, that means `clearSessionToken` is not actually being called on this path — stop and report, don't "fix" the test to match broken behavior.)

- [ ] **Step 3: Run the full component test file**

Run:
```
npx vitest run src/components/BrokerConnectionsModal.test.tsx
```
Expected: PASS, one more test than before this task.

- [ ] **Step 4: Commit**

```
git add webapp/src/components/BrokerConnectionsModal.test.tsx
git commit -m "test: guard that removing a broker connection clears its session token"
```

---

### Task 10: Perf benchmark for `buildCalculatedPositions`

**Files:**
- Create: `webapp/src/domain/calculations.bench.ts`
- Modify: `webapp/package.json` (script)

**Interfaces:**
- Consumes: `buildCalculatedPositions(positions: Position[], liveByTicker: Map<string, LiveData>, resolveSector: (ticker: string) => string, pairs?: Pair[]): CalculatedPosition[]` from `./buildCalculatedPositions` (exact signature per `webapp/src/domain/buildCalculatedPositions.ts:19-24`).

- [ ] **Step 1: Write the benchmark**

`webapp/src/domain/calculations.bench.ts`:
```ts
import { bench, describe } from "vitest";
import { buildCalculatedPositions } from "./buildCalculatedPositions";
import { Position, LiveData } from "../types";

const POSITION_COUNT = 1500;

function makePositions(count: number): Position[] {
  return Array.from({ length: count }, (_, i) => ({
    ticker: `TICK${i}`,
    coefficient: 1,
    sharesOwned: 10 + (i % 50),
  }));
}

function makeLiveByTicker(positions: Position[]): Map<string, LiveData> {
  const map = new Map<string, LiveData>();
  positions.forEach((p, i) => {
    map.set(p.ticker.toUpperCase(), {
      ticker: p.ticker,
      shortName: `${p.ticker} Name`,
      indexWeight: (i % 20) / 100,
      price: 100 + (i % 500),
      lotSize: 1,
      dividendPerShare: i % 10,
      status: i % 7 === 0 ? "out_of_index" : "in_index",
    });
  });
  return map;
}

const positions = makePositions(POSITION_COUNT);
const liveByTicker = makeLiveByTicker(positions);
const resolveSector = (ticker: string) => `Sector-${ticker.length % 5}`;

describe("buildCalculatedPositions perf", () => {
  bench(`computes ${POSITION_COUNT} positions without pairs`, () => {
    buildCalculatedPositions(positions, liveByTicker, resolveSector, []);
  });

  bench(`computes ${POSITION_COUNT} positions with 100 paired tickers`, () => {
    const pairs = Array.from({ length: 50 }, (_, i) => ({
      tickers: [`TICK${i * 2}`, `TICK${i * 2 + 1}`],
      coefficient: 1,
    }));
    buildCalculatedPositions(positions, liveByTicker, resolveSector, pairs);
  });
});
```

- [ ] **Step 2: Add the npm script**

In `webapp/package.json` `scripts`:
```json
    "test:bench": "vitest bench --run",
```

- [ ] **Step 3: Run it and record the baseline**

Run:
```
npm run test:bench
```
Expected: a benchmark table prints with `hz` (ops/sec) and mean time per op for both bench cases — no pass/fail assertion (Vitest bench doesn't gate by default). Record the printed mean times in the commit message so future regressions can be spotted by comparing `git log` history for this file, same rationale as Task 4's mutation-score baseline.

- [ ] **Step 4: Confirm the regular test run is unaffected**

Run:
```
npm run test
```
Expected: PASS — `.bench.ts` files are not picked up by `vitest run`'s default test glob (only `bench(...)`-containing files matched by `vitest bench` are), so this file adds no new tests to the regular suite.

- [ ] **Step 5: Commit**

```
git add webapp/src/domain/calculations.bench.ts webapp/package.json
git commit -m "$(cat <<'EOF'
test: add perf benchmark for buildCalculatedPositions at 1500 positions

Baseline (record from Step 3's output):
- without pairs: <mean time>
- with 100 paired tickers: <mean time>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** all 9 spec items (1.1 CI gate, 1.2 coverage, 1.3 fetch-mock helper, 2.1 mutation testing, 2.2 a11y, 3.1 E2E, 4.1 contract tests, 4.2 security review, 4.3 perf) map 1:1 to Tasks 1-10 (E2E split into Tasks 6-7 because it's the largest single item).
- **No MSW** anywhere in this plan, consistent with the Global Constraints section.
- **Placeholders:** the two spots that say "record from Step X's output" (Tasks 4 and 10 commit messages) are not implementation placeholders — they're baseline numbers that can only exist after running the command in the preceding step, same pattern as `writing-plans`' own "Run test to verify it fails" step. Every other step has concrete, runnable code.
- **Type consistency:** `buildCalculatedPositions`'s signature in Task 10 matches `webapp/src/domain/buildCalculatedPositions.ts:19-24` exactly (verified by reading the file, not assumed). `mockFetchByUrl`/`mockFetchOnce` signatures in Task 3 are used identically in Tasks 3, 6 (indirectly, not reused) — no drift.
