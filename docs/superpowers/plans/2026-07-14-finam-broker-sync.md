# Finam Broker Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second broker adapter — Finam (`https://api.finam.ru`) — to the existing broker-sync feature, with the same scope as the T-Invest/Т-Банк adapter: read-only share-position sync into `sharesOwned`, no trading, no other instrument types.

**Architecture:** `webapp/src/brokers/finam/` mirrors `webapp/src/brokers/tbank/` (`client.ts` for raw REST calls, `adapter.ts` implementing the existing `BrokerAdapter` interface), plus one new entry in `webapp/src/brokers/registry.ts`. Everything else — `syncDiff.ts`, `crypto.ts`, `tokenSession.ts`, `runBrokerSync.ts`, `BrokerConnectionsModal`, `AddBrokerConnectionForm`, `BrokerSyncPreviewModal`, the file schema — is already broker-agnostic and needs zero changes. The one architectural wrinkle: Finam's auth is a two-step exchange (long-lived `secret` → short-lived JWT via `POST /v1/sessions`), unlike T-Invest's single static bearer token; `finam/client.ts` does that exchange internally on every call, so the rest of the app keeps treating the stored `encryptedToken` as an opaque credential string.

**Tech Stack:** React 18 + TypeScript (strict), Vite, Vitest. No new runtime dependencies.

## Global Constraints

- No backend — Finam API calls are direct `fetch`s from the browser, same as T-Invest.
- Scope is shares only, read-only. No orders, no bonds/futures/options, matching `docs/superpowers/specs/2026-07-14-finam-broker-design.md`.
- `encryptedToken` on a Finam `BrokerConnection` stores the Finam **secret** (long-lived API key), not the JWT. No file-schema changes — `brokerId: "finam"` is just a new value for the existing free-form string field.
- The JWT is exchanged fresh on every `listAccounts`/`fetchHoldings` call inside `finam/client.ts` — no JWT caching in `tokenSession.ts` or anywhere else (explicit decision in the design spec: avoids adding state for a feature that's already manual/infrequent).
- `webapp/src/brokers/registry.ts` gets exactly one new array entry (`finamAdapter`, appended after `tbankAdapter`) — no other file needs to change for the app to pick it up (`AddBrokerConnectionForm`'s broker `<select>` iterates the registry already).
- Field names for `GET /v1/accounts/{account_id}` and `GET /v1/assets/{symbol}` are confirmed live against the real API (Task 1, 2026-07-14) — see Task 1's findings for the two corrections versus the original doc-based guess (`quantity` is `{value: string}`, not a plain string; `/v1/assets/{symbol}` requires `account_id` as a query param and returns a ready-made `ticker` field).
- All npm commands run with cwd `webapp/`.
- `tsconfig.json` has `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules: true` — keep new code compliant.
- No component tests for modals (repo has no `@testing-library/react` yet) — this plan touches no modal code, so this only matters for Task 5's manual QA.
- Match existing formatting by hand — no Prettier/ESLint auto-format in this repo.

---

### Task 1: Spike — verify Finam API CORS and confirm response shapes — ✅ DONE (2026-07-14)

**Files:** none (investigation only).

**Interfaces:** none.

Completed against the real Finam API using a user-supplied read-only secret (revoked immediately after this spike — see progress ledger). Findings, superseding the pre-spike guesses:

- **CORS: open.** `OPTIONS /v1/sessions` preflight and a real `POST` both echoed `access-control-allow-origin: <request Origin>`. Direct browser `fetch` from the app's own origin works, no proxy needed.
- `POST /v1/sessions {secret}` → `{"token": "<jwt>"}` — guess confirmed exactly.
- `POST /v1/sessions/details {token}` → includes `"account_ids": ["1524640"]` (plus unrelated `md_permissions`/`readonly`/timestamp fields, ignored) — guess confirmed exactly. Session `expires_at` was 15 minutes after `created_at` — consistent with "short-lived JWT," reinforces the plan's no-caching decision.
- `GET /v1/accounts/{account_id}` → **`positions[].quantity` is `{"value": "10.0"}`, a nested object — NOT a plain string as originally guessed.** `positions[].symbol` confirmed as `"TICKER@MIC"` (e.g. `"GAZP@MISX"`, `"RU000A106R95@MISX"` for a bond, `"XOM@XNYS"` for a foreign share) or bare (e.g. `"FXGD"` for some ETFs). No instrument-type field on the position itself — confirmed a separate resolve call is required, as assumed.
- `GET /v1/assets/{symbol}?account_id={account_id}` — **requires `account_id` as a query param** (undocumented; a call without it fails with `"Invalid arguments:account_id"`), not something the original plan anticipated. Confirmed response: `{"ticker": "GAZP", "type": "EQUITIES", ...}` for a share, `{"type": "BONDS", ...}` for a bond. **The endpoint returns a clean `ticker` field directly** — better than the originally planned manual `normalizeFinamTicker` (`symbol.split("@")[0]`) string-surgery, so Task 2/3 below use `asset.ticker` instead and drop `normalizeFinamTicker` entirely. `type === "EQUITIES"` guess confirmed exactly (also confirmed for a foreign share, `XOM@XNYS` → `EQUITIES`, so the filter is not MOEX-only at the Finam API level — matches the T-Invest adapter's behavior of not filtering by exchange either; MOEX-tradeability is decided later by the existing generic `runBrokerSync.ts` ISS cross-check, unchanged).

Task 2/3 below are written directly against these confirmed shapes — no more guessing.

---

### Task 2: `finam/client.ts` — raw REST calls

**Files:**
- Create: `webapp/src/brokers/finam/client.ts`
- Test: `webapp/src/brokers/finam/client.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (raw `fetch`, no other project imports).
- Produces: `exchangeFinamSecret(secret: string): Promise<string>`, `fetchFinamAccountIds(jwt: string): Promise<string[]>`, `fetchFinamAccountDetails(jwt: string, accountId: string): Promise<FinamAccountDetails>` where `FinamAccountDetails { account_id: string; positions: FinamPosition[] }`, `FinamPosition { symbol: string; quantity: FinamQuantity }`, `FinamQuantity { value: string }`; `resolveFinamAsset(jwt: string, symbol: string, accountId: string): Promise<FinamAssetInfo | null>` where `FinamAssetInfo { ticker: string; type: string }`; `parseFinamQuantity(quantity: FinamQuantity): number`. Consumed by Task 3. Shapes confirmed live against the real API in Task 1 — not guesses.

- [ ] **Step 1: Write the failing tests**

Create `webapp/src/brokers/finam/client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  exchangeFinamSecret,
  fetchFinamAccountIds,
  fetchFinamAccountDetails,
  resolveFinamAsset,
  parseFinamQuantity,
} from "./client";

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

describe("exchangeFinamSecret", () => {
  it("posts the secret to /v1/sessions and returns the JWT", async () => {
    mockFetchOnce({ token: "jwt-abc" });

    const jwt = await exchangeFinamSecret("my-secret");

    expect(jwt).toBe("jwt-abc");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.finam.ru/v1/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ secret: "my-secret" }),
      })
    );
  });

  it("throws when the response is not ok", async () => {
    mockFetchOnce({}, false, 401);
    await expect(exchangeFinamSecret("bad-secret")).rejects.toThrow(/401/);
  });
});

describe("fetchFinamAccountIds", () => {
  it("posts the JWT to /v1/sessions/details and returns account_ids", async () => {
    mockFetchOnce({ account_ids: ["acc-1", "acc-2"] });

    const ids = await fetchFinamAccountIds("jwt-abc");

    expect(ids).toEqual(["acc-1", "acc-2"]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.finam.ru/v1/sessions/details",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "jwt-abc" }),
      })
    );
  });
});

describe("fetchFinamAccountDetails", () => {
  it("gets /v1/accounts/{id} with a bearer JWT and returns the body", async () => {
    mockFetchOnce({
      account_id: "acc-1",
      positions: [{ symbol: "SBER@MISX", quantity: { value: "10.0" } }],
    });

    const details = await fetchFinamAccountDetails("jwt-abc", "acc-1");

    expect(details).toEqual({
      account_id: "acc-1",
      positions: [{ symbol: "SBER@MISX", quantity: { value: "10.0" } }],
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.finam.ru/v1/accounts/acc-1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer jwt-abc" }),
      })
    );
  });
});

describe("resolveFinamAsset", () => {
  it("resolves a symbol to its ticker and instrument type, passing account_id as a query param", async () => {
    mockFetchOnce({ ticker: "GAZP", type: "EQUITIES" });

    const asset = await resolveFinamAsset("jwt-abc", "GAZP@MISX", "acc-1");

    expect(asset).toEqual({ ticker: "GAZP", type: "EQUITIES" });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.finam.ru/v1/assets/GAZP%40MISX?account_id=acc-1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer jwt-abc" }),
      })
    );
  });

  it("returns null instead of throwing when resolution fails", async () => {
    mockFetchOnce({}, false, 404);
    const asset = await resolveFinamAsset("jwt-abc", "UNKNOWN@MISX", "acc-1");
    expect(asset).toBeNull();
  });
});

describe("parseFinamQuantity", () => {
  it("converts a nested quantity value to a number", () => {
    expect(parseFinamQuantity({ value: "10.0" })).toBe(10);
  });

  it("handles fractional quantities", () => {
    expect(parseFinamQuantity({ value: "1.5" })).toBeCloseTo(1.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/brokers/finam/client.test.ts`
Expected: FAIL with "Cannot find module './client'" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `webapp/src/brokers/finam/client.ts`:

```ts
const FINAM_API_BASE = "https://api.finam.ru";

export interface FinamQuantity {
  value: string;
}

export interface FinamPosition {
  symbol: string;
  quantity: FinamQuantity;
}

export interface FinamAccountDetails {
  account_id: string;
  positions: FinamPosition[];
}

export interface FinamAssetInfo {
  ticker: string;
  type: string;
}

async function finamRequest<T>(
  path: string,
  options: { method?: string; jwt?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(`${FINAM_API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.jwt ? { Authorization: `Bearer ${options.jwt}` } : {}),
      "Content-Type": "application/json",
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Finam API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function exchangeFinamSecret(secret: string): Promise<string> {
  const result = await finamRequest<{ token: string }>("/v1/sessions", {
    method: "POST",
    body: { secret },
  });
  return result.token;
}

export async function fetchFinamAccountIds(jwt: string): Promise<string[]> {
  const result = await finamRequest<{ account_ids: string[] }>("/v1/sessions/details", {
    method: "POST",
    body: { token: jwt },
  });
  return result.account_ids;
}

export async function fetchFinamAccountDetails(jwt: string, accountId: string): Promise<FinamAccountDetails> {
  return finamRequest<FinamAccountDetails>(`/v1/accounts/${accountId}`, { jwt });
}

export async function resolveFinamAsset(jwt: string, symbol: string, accountId: string): Promise<FinamAssetInfo | null> {
  try {
    return await finamRequest<FinamAssetInfo>(
      `/v1/assets/${encodeURIComponent(symbol)}?account_id=${accountId}`,
      { jwt }
    );
  } catch {
    return null;
  }
}

export function parseFinamQuantity(quantity: FinamQuantity): number {
  return Number(quantity.value);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/brokers/finam/client.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/brokers/finam/client.ts webapp/src/brokers/finam/client.test.ts
git commit -m "feat: add Finam API raw client (session exchange, accounts, positions)"
```

---

### Task 3: `finam/adapter.ts` — implement `BrokerAdapter`

**Files:**
- Create: `webapp/src/brokers/finam/adapter.ts`
- Test: `webapp/src/brokers/finam/adapter.test.ts`

**Interfaces:**
- Consumes: `exchangeFinamSecret`, `fetchFinamAccountIds`, `fetchFinamAccountDetails`, `resolveFinamAsset`, `parseFinamQuantity` (Task 2); `BrokerAdapter`, `BrokerAccount`, `BrokerHoldingRaw` (`webapp/src/brokers/types.ts`); `pLimit` (`webapp/src/concurrency/pLimit.ts`).
- Produces: `finamAdapter: BrokerAdapter` with `id: "finam"`, `label: "Финам"`. Consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Create `webapp/src/brokers/finam/adapter.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { finamAdapter } from "./adapter";
import * as client from "./client";

describe("finamAdapter.listAccounts", () => {
  it("exchanges the secret for a JWT, lists account ids, and maps them to BrokerAccount", async () => {
    vi.spyOn(client, "exchangeFinamSecret").mockResolvedValue("jwt-abc");
    vi.spyOn(client, "fetchFinamAccountIds").mockResolvedValue(["acc-1", "acc-2"]);

    const accounts = await finamAdapter.listAccounts("my-secret");

    expect(accounts).toEqual([
      { id: "acc-1", name: "acc-1" },
      { id: "acc-2", name: "acc-2" },
    ]);
    expect(client.exchangeFinamSecret).toHaveBeenCalledWith("my-secret");
    expect(client.fetchFinamAccountIds).toHaveBeenCalledWith("jwt-abc");
  });
});

describe("finamAdapter.fetchHoldings", () => {
  it("keeps only EQUITIES positions, uses the resolved ticker, and parses the quantity", async () => {
    vi.spyOn(client, "exchangeFinamSecret").mockResolvedValue("jwt-abc");
    vi.spyOn(client, "fetchFinamAccountDetails").mockResolvedValue({
      account_id: "acc-1",
      positions: [
        { symbol: "SBER@MISX", quantity: { value: "10.0" } },
        { symbol: "RU000A106R95@MISX", quantity: { value: "5.0" } },
      ],
    });
    vi.spyOn(client, "resolveFinamAsset").mockImplementation(async (_jwt, symbol, accId) => {
      expect(accId).toBe("acc-1");
      return symbol === "SBER@MISX"
        ? { ticker: "SBER", type: "EQUITIES" }
        : { ticker: "RU000A106R95", type: "BONDS" };
    });

    const holdings = await finamAdapter.fetchHoldings("my-secret", "acc-1");

    expect(holdings).toEqual([{ ticker: "SBER", shares: 10 }]);
  });

  it("drops a position whose asset fails to resolve", async () => {
    vi.spyOn(client, "exchangeFinamSecret").mockResolvedValue("jwt-abc");
    vi.spyOn(client, "fetchFinamAccountDetails").mockResolvedValue({
      account_id: "acc-1",
      positions: [{ symbol: "SBER@MISX", quantity: { value: "10.0" } }],
    });
    vi.spyOn(client, "resolveFinamAsset").mockResolvedValue(null);

    const holdings = await finamAdapter.fetchHoldings("my-secret", "acc-1");
    expect(holdings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/brokers/finam/adapter.test.ts`
Expected: FAIL with "Cannot find module './adapter'".

- [ ] **Step 3: Write the implementation**

Create `webapp/src/brokers/finam/adapter.ts`:

```ts
import { BrokerAdapter, BrokerAccount, BrokerHoldingRaw } from "../types";
import {
  exchangeFinamSecret,
  fetchFinamAccountIds,
  fetchFinamAccountDetails,
  resolveFinamAsset,
  parseFinamQuantity,
} from "./client";
import { pLimit } from "../../concurrency/pLimit";

export const finamAdapter: BrokerAdapter = {
  id: "finam",
  label: "Финам",

  async listAccounts(secret: string): Promise<BrokerAccount[]> {
    const jwt = await exchangeFinamSecret(secret);
    const accountIds = await fetchFinamAccountIds(jwt);
    return accountIds.map((id) => ({ id, name: id }));
  },

  async fetchHoldings(secret: string, accountId: string): Promise<BrokerHoldingRaw[]> {
    const jwt = await exchangeFinamSecret(secret);
    const details = await fetchFinamAccountDetails(jwt, accountId);
    const limit = pLimit(5);
    const resolved = await Promise.all(
      details.positions.map((position) =>
        limit(async () => {
          const asset = await resolveFinamAsset(jwt, position.symbol, accountId);
          if (!asset || asset.type !== "EQUITIES") return null;
          return { ticker: asset.ticker, shares: parseFinamQuantity(position.quantity) };
        })
      )
    );
    return resolved.filter((h): h is BrokerHoldingRaw => h !== null);
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/brokers/finam/adapter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/brokers/finam/adapter.ts webapp/src/brokers/finam/adapter.test.ts
git commit -m "feat: add Finam BrokerAdapter (filters to equities, normalizes ticker)"
```

---

### Task 4: Register Finam in `BROKER_REGISTRY`

**Files:**
- Modify: `webapp/src/brokers/registry.ts` (full file, 8 lines)
- Modify: `webapp/src/brokers/registry.test.ts` (full file, 13 lines)

**Interfaces:**
- Consumes: `finamAdapter` (Task 3).
- Produces: `BROKER_REGISTRY` now contains `[tbankAdapter, finamAdapter]`; `getBrokerAdapter("finam")` resolves. This is what makes Finam appear in `AddBrokerConnectionForm`'s broker `<select>` (`webapp/src/components/AddBrokerConnectionForm.tsx:80-84`, unmodified — it already iterates `BROKER_REGISTRY`).

- [ ] **Step 1: Write the failing test**

Modify `webapp/src/brokers/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BROKER_REGISTRY, getBrokerAdapter } from "./registry";

describe("getBrokerAdapter", () => {
  it("returns the tbank adapter for id 'tbank'", () => {
    expect(getBrokerAdapter("tbank")).toBe(BROKER_REGISTRY[0]);
    expect(getBrokerAdapter("tbank")?.label).toBe("Т-Банк");
  });

  it("returns the finam adapter for id 'finam'", () => {
    expect(getBrokerAdapter("finam")).toBe(BROKER_REGISTRY[1]);
    expect(getBrokerAdapter("finam")?.label).toBe("Финам");
  });

  it("returns undefined for an unknown broker id", () => {
    expect(getBrokerAdapter("unknown")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/brokers/registry.test.ts`
Expected: FAIL — `getBrokerAdapter("finam")` is `undefined`, not the finam adapter.

- [ ] **Step 3: Update the registry**

Modify `webapp/src/brokers/registry.ts`:

```ts
import { BrokerAdapter } from "./types";
import { tbankAdapter } from "./tbank/adapter";
import { finamAdapter } from "./finam/adapter";

export const BROKER_REGISTRY: BrokerAdapter[] = [tbankAdapter, finamAdapter];

export function getBrokerAdapter(brokerId: string): BrokerAdapter | undefined {
  return BROKER_REGISTRY.find((adapter) => adapter.id === brokerId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/brokers/registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npm run test`
Expected: all tests pass (no other file references `BROKER_REGISTRY`'s length or contents by index besides `registry.test.ts` — confirmed via repo-wide search before writing this plan).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/brokers/registry.ts webapp/src/brokers/registry.test.ts
git commit -m "feat: register Finam adapter in BROKER_REGISTRY"
```

---

### Task 5: Manual end-to-end QA

**Files:** none (manual verification only, per the repo's existing convention of no component tests for modals).

**Interfaces:** none.

- [ ] **Step 1: Build and run the app**

Run (from `webapp/`): `npm run build` (typecheck + build), then `npm run dev`.

- [ ] **Step 2: Add a Finam connection through the UI**

Open the app, load or create a `portfolio.json`, open "Брокеры" → "Добавить подключение". Confirm "Финам" appears as a second option in the broker `<select>` alongside "Т-Банк". If a real Finam secret is available: select Финам, paste the secret, click "Проверить и продолжить", confirm the account list loads (or, if Task 1 found CORS blocked, confirm the error message from `AddBrokerConnectionForm.tsx:38` displays cleanly instead of crashing the app).

- [ ] **Step 3: Run a sync and confirm the diff preview**

Pick an account, set a label and passphrase, add the connection, then click "Синхронизировать". Confirm `BrokerSyncPreviewModal` shows the expected share positions (only equities, correct tickers, correct share counts) and that confirming writes them into the position table with the "Финам: N" breakdown tooltip (`sharesBreakdown.ts`), same pattern as an existing Т-Банк connection.

- [ ] **Step 4: Confirm no regression to the existing Т-Банк flow**

If a Т-Банк connection is also configured, confirm it still syncs correctly — the two adapters must not interfere with each other (separate `connectionId`s, separate `encryptedToken`s).

This task has no commit — it's verification of Tasks 1-4's combined result.
