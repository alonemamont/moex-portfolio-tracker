# Broker Sync Integration Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add integration tests that exercise the real adapter→client→HTTP chain and the real registry→adapter→syncDiff chain for broker sync, mocking only `fetch` (the network boundary), to catch cross-layer bugs that fully-mocked unit tests can't.

**Architecture:** Three new `*.integration.test.ts` files sit next to the existing unit tests. Each stubs `global.fetch` with a router function that dispatches on URL/method and returns a real `Response` object (`new Response(JSON.stringify(body), { status })` for the broker JSON APIs, raw XML text for the ISS API — mirroring the pattern already used in `src/iss/client.test.ts`). No other module is mocked in these files.

**Tech Stack:** Vitest (`vi.stubGlobal`, `vi.fn`, `afterEach` + `vi.unstubAllGlobals`), no new dependencies.

## Global Constraints

- No new npm dependencies (spec decision: manual fetch stub, not MSW).
- Test files run from `webapp/` via `npx vitest run <path>` — cwd matters, all commands below assume `webapp/` as cwd.
- These tests exercise **already-correct, already-shipped implementation code** — there is no red step in the usual TDD sense. Each task's "run to verify" step expects **PASS** on the first correct attempt, not FAIL. If a test fails, the bug is almost always in the test's fixture/URL/body expectations, not in `adapter.ts`/`client.ts`/`syncDiff.ts` — fix the fixture, don't touch production code.
- Existing unit test files (`client.test.ts`, `adapter.test.ts`, `runBrokerSync.test.ts`, `registry.test.ts`, `syncDiff.test.ts`) are untouched by this plan.
- TS strict mode is on (`noUnusedLocals`, `noUnusedParameters`) — no unused imports/vars in new test files.
- Match existing code style: no Prettier/ESLint auto-format beyond what's already there; 2-space indent as seen in sibling files.

---

### Task 1: Finam adapter integration test

**Files:**
- Create: `webapp/src/brokers/finam/adapter.integration.test.ts`

**Interfaces:**
- Consumes: `finamAdapter` from `./adapter` (exports `listAccounts(secret: string): Promise<BrokerAccount[]>`, `fetchHoldings(secret: string, accountId: string): Promise<BrokerHoldingRaw[]>` — both already implemented, no changes).
- Produces: nothing consumed by later tasks (Task 1–3 are independent of each other).

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { finamAdapter } from "./adapter";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("finamAdapter integration (real client, mocked fetch only)", () => {
  it("listAccounts: exchanges secret for jwt, then lists account ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "https://api.finam.ru/v1/sessions") {
          expect(init?.method).toBe("POST");
          expect(init?.body).toBe(JSON.stringify({ secret: "my-secret" }));
          return jsonResponse({ token: "jwt-abc" });
        }
        if (url === "https://api.finam.ru/v1/sessions/details") {
          expect(init?.body).toBe(JSON.stringify({ token: "jwt-abc" }));
          return jsonResponse({ account_ids: ["acc-1", "acc-2"] });
        }
        throw new Error(`unexpected URL: ${url}`);
      })
    );

    const accounts = await finamAdapter.listAccounts("my-secret");

    expect(accounts).toEqual([
      { id: "acc-1", name: "acc-1" },
      { id: "acc-2", name: "acc-2" },
    ]);
  });

  it("fetchHoldings: full chain, keeps only EQUITIES, drops a position whose asset resolve fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "https://api.finam.ru/v1/sessions") {
          return jsonResponse({ token: "jwt-abc" });
        }
        if (url === "https://api.finam.ru/v1/accounts/acc-1") {
          expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer jwt-abc");
          return jsonResponse({
            account_id: "acc-1",
            positions: [
              { symbol: "SBER@MISX", quantity: { value: "10.0" } },
              { symbol: "RU000A106R95@MISX", quantity: { value: "5.0" } },
              { symbol: "UNKNOWN@MISX", quantity: { value: "1.0" } },
            ],
          });
        }
        if (url === "https://api.finam.ru/v1/assets/SBER%40MISX?account_id=acc-1") {
          return jsonResponse({ ticker: "SBER", type: "EQUITIES" });
        }
        if (url === "https://api.finam.ru/v1/assets/RU000A106R95%40MISX?account_id=acc-1") {
          return jsonResponse({ ticker: "RU000A106R95", type: "BONDS" });
        }
        if (url === "https://api.finam.ru/v1/assets/UNKNOWN%40MISX?account_id=acc-1") {
          return jsonResponse({}, 404);
        }
        throw new Error(`unexpected URL: ${url}`);
      })
    );

    const holdings = await finamAdapter.fetchHoldings("my-secret", "acc-1");

    expect(holdings).toEqual([{ ticker: "SBER", shares: 10 }]);
  });
});
```

- [ ] **Step 2: Run the test**

Run (from `webapp/`): `npx vitest run src/brokers/finam/adapter.integration.test.ts`
Expected: PASS, 2 tests passed.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/brokers/finam/adapter.integration.test.ts
git commit -m "test: add finam adapter integration test (real client, mocked fetch only)"
```

---

### Task 2: Tbank adapter integration test

**Files:**
- Create: `webapp/src/brokers/tbank/adapter.integration.test.ts`

**Interfaces:**
- Consumes: `tbankAdapter` from `./adapter` (`listAccounts(token: string): Promise<BrokerAccount[]>`, `fetchHoldings(token: string, accountId: string): Promise<BrokerHoldingRaw[]>` — already implemented, no changes).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { tbankAdapter } from "./adapter";

const BASE = "https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("tbankAdapter integration (real client, mocked fetch only)", () => {
  it("listAccounts: full chain to GetAccounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === `${BASE}.UsersService/GetAccounts`) {
          expect(init?.method).toBe("POST");
          expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer my-token");
          return jsonResponse({ accounts: [{ id: "acc-1", name: "Брокерский" }] });
        }
        throw new Error(`unexpected URL: ${url}`);
      })
    );

    const accounts = await tbankAdapter.listAccounts("my-token");

    expect(accounts).toEqual([{ id: "acc-1", name: "Брокерский" }]);
  });

  it("fetchHoldings: filters to shares, resolves ticker, converts units+nano, drops failed resolve", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === `${BASE}.OperationsService/GetPortfolio`) {
          expect(JSON.parse(init?.body as string)).toEqual({ accountId: "acc-1", currency: "RUB" });
          return jsonResponse({
            positions: [
              {
                figi: "F1",
                instrumentType: "share",
                instrumentUid: "uid-1",
                quantity: { units: "10", nano: 500000000 },
              },
              {
                figi: "F2",
                instrumentType: "bond",
                instrumentUid: "uid-2",
                quantity: { units: "5", nano: 0 },
              },
              {
                figi: "F3",
                instrumentType: "share",
                instrumentUid: "uid-3",
                quantity: { units: "1", nano: 0 },
              },
            ],
          });
        }
        if (url === `${BASE}.InstrumentsService/GetInstrumentBy`) {
          const body = JSON.parse(init?.body as string);
          if (body.id === "uid-1") return jsonResponse({ instrument: { ticker: "GAZP" } });
          if (body.id === "uid-3") return jsonResponse({}, 500);
          throw new Error(`unexpected instrumentUid: ${body.id}`);
        }
        throw new Error(`unexpected URL: ${url}`);
      })
    );

    const holdings = await tbankAdapter.fetchHoldings("my-token", "acc-1");

    expect(holdings).toEqual([{ ticker: "GAZP", shares: 10.5 }]);
  });
});
```

- [ ] **Step 2: Run the test**

Run (from `webapp/`): `npx vitest run src/brokers/tbank/adapter.integration.test.ts`
Expected: PASS, 2 tests passed.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/brokers/tbank/adapter.integration.test.ts
git commit -m "test: add tbank adapter integration test (real client, mocked fetch only)"
```

---

### Task 3: runBrokerSync full-stack integration test

**Files:**
- Create: `webapp/src/portfolio/runBrokerSync.integration.test.ts`

**Interfaces:**
- Consumes: `fetchBrokerSyncPreview(file: PortfolioFile, connection: BrokerConnection, token: string): Promise<SyncDiffRow[]>` from `./runBrokerSync` (no changes). Real `getBrokerAdapter` from `../brokers/registry`, real `tbankAdapter`, real `buildSyncDiff` from `../brokers/syncDiff`, real `fetchSecurities` from `../iss/client` — none of these are mocked in this file.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchBrokerSyncPreview } from "./runBrokerSync";
import { PortfolioFile, BrokerConnection } from "../types";

const TBANK_BASE = "https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const connection: BrokerConnection = {
  id: "conn-1",
  brokerId: "tbank",
  accountId: "acc-1",
  label: "Т-Банк",
  encryptedToken: { ciphertext: "c", iv: "i", salt: "s" },
};

function file(): PortfolioFile {
  return {
    version: 1,
    positions: [{ ticker: "GAZP", coefficient: 1, sharesOwned: 5, brokerHoldings: [] }],
    sectors: {},
    history: [],
    pairs: [],
    brokerConnections: [connection],
    brokerAccounts: [],
    transactions: [],
  };
}

const securitiesXml = `<?xml version="1.0" encoding="UTF-8"?>
<document>
<data id="securities">
<rows>
<row SECID="NEWTICK" BOARDID="TQBR" SHORTNAME="Новая" PREVPRICE="10" LOTSIZE="1" />
</rows>
</data>
<data id="marketdata">
<rows>
<row SECID="NEWTICK" BOARDID="TQBR" LAST="10.5" />
</rows>
</data>
</document>`;

describe("fetchBrokerSyncPreview integration (real registry, real tbankAdapter, real syncDiff)", () => {
  it("resolves an existing ticker, a new tradeable ticker, and a new untradeable ticker end to end", async () => {
    const tickerByUid: Record<string, string> = {
      "uid-gazp": "GAZP",
      "uid-newtick": "NEWTICK",
      "uid-unknowntick": "UNKNOWNTICK",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === `${TBANK_BASE}.OperationsService/GetPortfolio`) {
          return jsonResponse({
            positions: [
              { figi: "F1", instrumentType: "share", instrumentUid: "uid-gazp", quantity: { units: "10", nano: 500000000 } },
              { figi: "F2", instrumentType: "share", instrumentUid: "uid-newtick", quantity: { units: "3", nano: 0 } },
              { figi: "F3", instrumentType: "share", instrumentUid: "uid-unknowntick", quantity: { units: "7", nano: 0 } },
            ],
          });
        }
        if (url === `${TBANK_BASE}.InstrumentsService/GetInstrumentBy`) {
          const body = JSON.parse(init?.body as string);
          const ticker = tickerByUid[body.id];
          if (!ticker) throw new Error(`unexpected instrumentUid: ${body.id}`);
          return jsonResponse({ instrument: { ticker } });
        }
        if (url.startsWith("https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.xml")) {
          expect(url).toContain("securities=NEWTICK,UNKNOWNTICK");
          return new Response(securitiesXml, { status: 200 });
        }
        throw new Error(`unexpected URL: ${url}`);
      })
    );

    const rows = await fetchBrokerSyncPreview(file(), connection, "my-token");

    expect(rows).toEqual(
      expect.arrayContaining([
        { ticker: "GAZP", status: "existing", previousShares: 0, newShares: 10.5 },
        { ticker: "NEWTICK", status: "new", previousShares: 0, newShares: 3 },
        { ticker: "UNKNOWNTICK", status: "unresolved", previousShares: 0, newShares: 0 },
      ])
    );
    expect(rows).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test**

Run (from `webapp/`): `npx vitest run src/portfolio/runBrokerSync.integration.test.ts`
Expected: PASS, 1 test passed.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/portfolio/runBrokerSync.integration.test.ts
git commit -m "test: add full-stack broker sync integration test (real registry, adapter, syncDiff)"
```

---

### Task 4: Full suite verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Run the full test suite**

Run (from `webapp/`): `npm run test`
Expected: all tests pass, including the 3 new integration test files (5 new test cases total) alongside all pre-existing tests. No regressions.

- [ ] **Step 2: Run typecheck**

Run (from `webapp/`): `npm run typecheck`
Expected: no errors (new test files must satisfy `strict`, `noUnusedLocals`, `noUnusedParameters`).

- [ ] **Step 3: Run lint**

Run (from `webapp/`): `npm run lint`
Expected: no errors.
