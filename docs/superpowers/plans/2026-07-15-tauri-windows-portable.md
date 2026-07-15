# Tauri Windows Portable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an unsigned, portable Windows `.exe` whose T-Bank synchronization uses Tauri's local HTTP plugin while preserving the existing GitHub Pages application and browser behavior for Finam and MOEX.

**Architecture:** Add a minimal Tauri 2 shell under `webapp/src-tauri` and a narrow TypeScript `HttpTransport` boundary. Only the T-Bank client selects the dynamically loaded Tauri transport; UI availability is derived from one `isTauriRuntime()` helper, while persistence and all broker business logic remain in TypeScript.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5, Vitest 2, Tauri 2, Rust, `@tauri-apps/plugin-http` 2, GitHub Actions

## Global Constraints

- The first desktop release supports Windows only.
- The distribution artifact is a portable `.exe`; do not add MSI or NSIS installers.
- Do not add automatic updates or publisher code signing.
- Keep broker adapters, synchronization logic, and token encryption in TypeScript.
- Do not add an external proxy, a user-run local proxy, a Rust broker command, token storage in Rust, or a generic native proxy command.
- Native HTTP access is restricted to `https://invest-public-api.tbank.ru/**`.
- Do not change the Finam or MOEX transports.
- Do not log `Authorization`, tokens, or complete API response bodies, and do not include them in thrown errors.
- The existing GitHub Pages build and deployment remain independent of the Windows build.
- Use the system Microsoft Edge WebView2 runtime; document its requirement, SmartScreen warning, and official installer link in the release notes.

## File Structure

- Create `webapp/src/runtime/isTauriRuntime.ts` and its test: the single source of truth for desktop detection.
- Create `webapp/src/http/transport.ts` and its test: browser/Tauri HTTP implementations and T-Bank transport selection.
- Modify `webapp/src/brokers/tbank/client.ts` and its tests: transport injection, response validation, and safe user-facing errors.
- Modify `webapp/src/components/AddBrokerConnectionForm.tsx`, `BrokerConnectionsModal.tsx`, their tests, and `styles.css`: browser gating and Windows release guidance.
- Extend `webapp/src/file/savePortfolioFile.test.ts`: prove browser save preserves an existing T-Bank connection byte-for-data-equivalent after serialization.
- Create `webapp/src-tauri/{Cargo.toml,build.rs,src/main.rs,tauri.conf.json,capabilities/default.json}`: minimal Tauri shell and scoped HTTP permission.
- Modify `webapp/package.json` and `package-lock.json`: Tauri frontend dependencies and desktop scripts.
- Create `.github/workflows/windows-portable.yml`: Windows smoke/build job and tagged-release upload.
- Create `docs/releases/windows-portable.md` and modify `README.md`: operator and end-user release requirements.

---

### Task 1: Centralize runtime detection and transport selection

**Files:**
- Create: `webapp/src/runtime/isTauriRuntime.ts`
- Create: `webapp/src/runtime/isTauriRuntime.test.ts`
- Create: `webapp/src/http/transport.ts`
- Create: `webapp/src/http/transport.test.ts`

**Interfaces:**
- Consumes: Tauri 2's injected `window.__TAURI_INTERNALS__` marker and `@tauri-apps/plugin-http` dynamic import.
- Produces: `isTauriRuntime(): boolean`, `HttpTransport`, `browserTransport`, `tauriTransport`, and `getTbankTransport(): HttpTransport`.

- [ ] **Step 1: Write the failing runtime tests**

```ts
// webapp/src/runtime/isTauriRuntime.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { isTauriRuntime } from "./isTauriRuntime";

afterEach(() => Reflect.deleteProperty(window, "__TAURI_INTERNALS__"));

describe("isTauriRuntime", () => {
  it("is false in an ordinary browser", () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it("is true when Tauri internals are present", () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    expect(isTauriRuntime()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the runtime test and verify it fails**

Run: `cd webapp && npx vitest run src/runtime/isTauriRuntime.test.ts`

Expected: FAIL because `./isTauriRuntime` does not exist.

- [ ] **Step 3: Implement the runtime helper**

```ts
// webapp/src/runtime/isTauriRuntime.ts
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
}
```

- [ ] **Step 4: Write the failing transport tests**

```ts
// webapp/src/http/transport.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

const tauriFetch = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: tauriFetch }));

import { browserTransport, getTbankTransport, tauriTransport } from "./transport";

afterEach(() => {
  vi.restoreAllMocks();
  tauriFetch.mockReset();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

describe("HTTP transports", () => {
  it("browserTransport delegates to global fetch", async () => {
    const response = new Response("ok");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    await expect(browserTransport("https://example.test")).resolves.toBe(response);
  });

  it("selects browser transport outside Tauri", () => {
    expect(getTbankTransport()).toBe(browserTransport);
  });

  it("selects and dynamically invokes Tauri transport inside Tauri", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    const response = new Response("ok");
    tauriFetch.mockResolvedValue(response);
    expect(getTbankTransport()).toBe(tauriTransport);
    await expect(tauriTransport("https://invest-public-api.tbank.ru/rest/test")).resolves.toBe(response);
    expect(tauriFetch).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Run the transport tests and verify they fail**

Run: `cd webapp && npx vitest run src/http/transport.test.ts`

Expected: FAIL because `./transport` and the Tauri HTTP dependency do not exist.

- [ ] **Step 6: Install Tauri frontend packages and implement the transports**

Run: `cd webapp && npm install @tauri-apps/api@^2 @tauri-apps/plugin-http@^2 && npm install --save-dev @tauri-apps/cli@^2`

Add the resulting exact dependency resolutions to `webapp/package-lock.json`, then create:

```ts
// webapp/src/http/transport.ts
import { isTauriRuntime } from "../runtime/isTauriRuntime";

export type HttpTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const browserTransport: HttpTransport = (input, init) => globalThis.fetch(input, init);

export const tauriTransport: HttpTransport = async (input, init) => {
  const { fetch } = await import("@tauri-apps/plugin-http");
  return fetch(input, init);
};

export function getTbankTransport(): HttpTransport {
  return isTauriRuntime() ? tauriTransport : browserTransport;
}
```

- [ ] **Step 7: Run both focused test files**

Run: `cd webapp && npx vitest run src/runtime/isTauriRuntime.test.ts src/http/transport.test.ts`

Expected: 2 files PASS.

- [ ] **Step 8: Commit**

```bash
git add webapp/package.json webapp/package-lock.json webapp/src/runtime webapp/src/http
git commit -m "feat: add Tauri-aware HTTP transport"
```

### Task 2: Inject transport into the T-Bank client and classify safe errors

**Files:**
- Modify: `webapp/src/brokers/tbank/client.ts`
- Modify: `webapp/src/brokers/tbank/client.test.ts`
- Modify: `webapp/src/brokers/tbank/client.contract.test.ts`

**Interfaces:**
- Consumes: `HttpTransport` and `getTbankTransport()` from Task 1.
- Produces: existing T-Bank functions with optional final `transport: HttpTransport = getTbankTransport()` argument; `TbankClientError` with codes `auth`, `rate-limit`, `unavailable`, and `contract`.

- [ ] **Step 1: Replace fetch-coupled tests with injected-transport and error-category tests**

Keep the quantity tests, replace network setup with a `vi.fn<HttpTransport>()`, and add these assertions:

```ts
const transport = vi.fn<HttpTransport>();

transport.mockResolvedValueOnce(new Response(JSON.stringify({ accounts: [{ id: "acc-1", name: "ИИС" }] }), {
  status: 200,
  headers: { "Content-Type": "application/json" },
}));
await expect(fetchTbankAccounts("secret-token", transport)).resolves.toEqual([{ id: "acc-1", name: "ИИС" }]);

expect(transport).toHaveBeenCalledWith(expect.stringContaining("UsersService/GetAccounts"), {
  method: "POST",
  headers: { Authorization: "Bearer secret-token", "Content-Type": "application/json" },
  body: "{}",
});

it.each([
  [401, "auth", "Неверный токен или недостаточно прав"],
  [403, "auth", "Неверный токен или недостаточно прав"],
  [429, "rate-limit", "Превышен лимит запросов Т-Банка"],
  [503, "unavailable", "API Т-Банка временно недоступен"],
] as const)("maps HTTP %i to %s", async (status, code, message) => {
  transport.mockResolvedValueOnce(new Response("sensitive response", { status }));
  const error = await fetchTbankAccounts("secret-token", transport).catch((value) => value);
  expect(error).toMatchObject({ code, message });
  expect(String(error)).not.toContain("secret-token");
  expect(String(error)).not.toContain("sensitive response");
});

it("maps network failure to unavailable without leaking its details", async () => {
  transport.mockRejectedValueOnce(new Error("request Authorization: Bearer secret-token failed"));
  await expect(fetchTbankAccounts("secret-token", transport)).rejects.toMatchObject({ code: "unavailable" });
});

it("rejects an incompatible response contract", async () => {
  transport.mockResolvedValueOnce(new Response(JSON.stringify({ accounts: "not-an-array" }), { status: 200 }));
  await expect(fetchTbankAccounts("secret-token", transport)).rejects.toMatchObject({ code: "contract" });
});
```

Also pass an injected transport to portfolio/ticker tests and change the live contract call to `fetchTbankAccounts(TOKEN!, browserTransport)` so local Node contract testing never depends on runtime detection.

- [ ] **Step 2: Run the client tests and verify they fail**

Run: `cd webapp && npx vitest run src/brokers/tbank/client.test.ts`

Expected: FAIL because the client does not accept a transport and does not expose categorized errors.

- [ ] **Step 3: Implement safe request handling and structural validation**

Add to `client.ts` and route all three public request functions through it:

```ts
import { z } from "zod";
import { getTbankTransport, HttpTransport } from "../../http/transport";

export type TbankClientErrorCode = "auth" | "rate-limit" | "unavailable" | "contract";

export class TbankClientError extends Error {
  constructor(public readonly code: TbankClientErrorCode, message: string) {
    super(message);
    this.name = "TbankClientError";
  }
}

function httpError(status: number): TbankClientError {
  if (status === 401 || status === 403) return new TbankClientError("auth", "Неверный токен или недостаточно прав");
  if (status === 429) return new TbankClientError("rate-limit", "Превышен лимит запросов Т-Банка");
  return new TbankClientError("unavailable", "API Т-Банка временно недоступен");
}

async function tbankRequest<T>(
  token: string,
  service: string,
  method: string,
  body: unknown,
  schema: z.ZodType<T>,
  transport: HttpTransport
): Promise<T> {
  let response: Response;
  try {
    response = await transport(`${TBANK_API_BASE}.${service}/${method}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TbankClientError("unavailable", "API Т-Банка временно недоступен");
  }
  if (!response.ok) throw httpError(response.status);
  try {
    return schema.parse(await response.json());
  } catch {
    throw new TbankClientError("contract", "Ответ Т-Банка имеет несовместимый формат");
  }
}
```

Add these exact schemas and public signatures below the request helper:

```ts
const accountSchema = z.object({ id: z.string(), name: z.string() });
const quantitySchema = z.object({ units: z.string(), nano: z.number() });
const positionSchema = z.object({
  figi: z.string(),
  instrumentType: z.string(),
  instrumentUid: z.string(),
  quantity: quantitySchema,
});

export async function fetchTbankAccounts(
  token: string,
  transport: HttpTransport = getTbankTransport()
): Promise<TbankAccount[]> {
  const result = await tbankRequest(token, "UsersService", "GetAccounts", {}, z.object({ accounts: z.array(accountSchema) }), transport);
  return result.accounts;
}

export async function fetchTbankPortfolio(
  token: string,
  accountId: string,
  transport: HttpTransport = getTbankTransport()
): Promise<TbankPortfolioPosition[]> {
  const result = await tbankRequest(
    token,
    "OperationsService",
    "GetPortfolio",
    { accountId, currency: "RUB" },
    z.object({ positions: z.array(positionSchema) }),
    transport
  );
  return result.positions;
}

export async function resolveTbankTicker(
  token: string,
  instrumentUid: string,
  transport: HttpTransport = getTbankTransport()
): Promise<string | null> {
  try {
    const result = await tbankRequest(
      token,
      "InstrumentsService",
      "GetInstrumentBy",
      { idType: "INSTRUMENT_ID_TYPE_UID", id: instrumentUid },
      z.object({ instrument: z.object({ ticker: z.string() }) }),
      transport
    );
    return result.instrument.ticker;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run client, adapter, and integration tests**

Run: `cd webapp && npx vitest run src/brokers/tbank/client.test.ts src/brokers/tbank/adapter.test.ts src/brokers/tbank/adapter.integration.test.ts src/portfolio/runBrokerSync.integration.test.ts`

Expected: 4 files PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/brokers/tbank/client.ts webapp/src/brokers/tbank/client.test.ts webapp/src/brokers/tbank/client.contract.test.ts
git commit -m "feat: route T-Bank requests through safe transport"
```

### Task 3: Gate T-Bank actions in the browser without affecting Finam

**Files:**
- Modify: `webapp/src/components/AddBrokerConnectionForm.tsx`
- Modify: `webapp/src/components/AddBrokerConnectionForm.test.tsx`
- Modify: `webapp/src/components/BrokerConnectionsModal.tsx`
- Modify: `webapp/src/components/BrokerConnectionsModal.test.tsx`
- Modify: `webapp/src/styles.css`

**Interfaces:**
- Consumes: `isTauriRuntime()` from Task 1 and broker id `tbank`.
- Produces: `isBrokerSyncAvailable(brokerId: string): boolean` and `WINDOWS_RELEASE_URL` for consistent add/sync gating.

- [ ] **Step 1: Add failing component tests for browser and Tauri behavior**

Mock `../runtime/isTauriRuntime` with a mutable `tauriRuntime` boolean. Use a registry containing both `tbank` and `finam`, then assert:

```ts
expect(screen.getByText("Т-Банк")).toBeInTheDocument();
expect(screen.getByText("Синхронизация с Т-Банком доступна в приложении для Windows")).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Скачать portable-версию" })).toHaveAttribute(
  "href",
  "https://github.com/alonemamont/moex-portfolio-tracker/releases/latest"
);
expect(screen.getByText("Проверить и продолжить")).toBeDisabled();
```

Switch the selected broker to Finam and verify the same button becomes enabled after entering a token. Set `tauriRuntime = true`, rerender, select T-Bank, enter a token, and verify it is enabled. In `BrokerConnectionsModal.test.tsx`, add one existing T-Bank and one Finam connection and verify browser mode disables only T-Bank's synchronization button; Tauri mode enables both.

- [ ] **Step 2: Run focused component tests and verify they fail**

Run: `cd webapp && npx vitest run src/components/AddBrokerConnectionForm.test.tsx src/components/BrokerConnectionsModal.test.tsx`

Expected: FAIL because both brokers are currently actionable in the browser.

- [ ] **Step 3: Add the availability interface and gate add/sync actions**

Create these exports in `AddBrokerConnectionForm.tsx` (or a focused colocated `brokerAvailability.ts` if the component becomes unwieldy):

```ts
export const WINDOWS_RELEASE_URL = "https://github.com/alonemamont/moex-portfolio-tracker/releases/latest";

export function isBrokerSyncAvailable(brokerId: string): boolean {
  return brokerId !== "tbank" || isTauriRuntime();
}
```

When `brokerId === "tbank" && !isBrokerSyncAvailable(brokerId)`, render:

```tsx
<p className="broker-connections__desktop-notice">
  Синхронизация с Т-Банком доступна в приложении для Windows.{" "}
  <a href={WINDOWS_RELEASE_URL} target="_blank" rel="noreferrer">Скачать portable-версию</a>
</p>
```

Disable account fetching under that condition. In the connection modal, compute availability per row, disable only the T-Bank sync button in browser mode, and add the same notice beside that connection. Do not remove, unlock, mutate, or filter existing connections; removal remains an explicit user action.

- [ ] **Step 4: Style the notice without adding remote assets**

```css
.broker-connections__desktop-notice {
  margin: 0;
  color: var(--warn);
  font-size: 0.82rem;
}

.broker-connections__desktop-notice a {
  color: var(--accent);
}
```

- [ ] **Step 5: Run component and accessibility tests**

Run: `cd webapp && npx vitest run src/components/AddBrokerConnectionForm.test.tsx src/components/BrokerConnectionsModal.test.tsx`

Expected: 2 files PASS, including existing axe checks.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/components/AddBrokerConnectionForm.tsx webapp/src/components/AddBrokerConnectionForm.test.tsx webapp/src/components/BrokerConnectionsModal.tsx webapp/src/components/BrokerConnectionsModal.test.tsx webapp/src/styles.css
git commit -m "feat: restrict T-Bank sync to Windows app"
```

### Task 4: Prove browser saves preserve existing T-Bank connections

**Files:**
- Modify: `webapp/src/file/savePortfolioFile.test.ts`

**Interfaces:**
- Consumes: existing `saveViaFileSystemAccess(file, handle)` serialization and `PortfolioFile.brokerConnections`.
- Produces: regression coverage only; production persistence remains unchanged.

- [ ] **Step 1: Add the round-trip preservation regression test**

```ts
it("preserves an existing T-Bank connection when saving in the browser", async () => {
  const connection = {
    id: "tbank-1",
    brokerId: "tbank",
    accountId: "account-1",
    label: "Мой Т-Банк",
    encryptedToken: { salt: "salt", iv: "iv", ciphertext: "ciphertext" },
  };
  const file: PortfolioFile = { ...sample, brokerConnections: [connection] };
  const write = vi.fn();
  const close = vi.fn();
  const handle = { createWritable: vi.fn().mockResolvedValue({ write, close }) } as unknown as FileSystemFileHandle;

  await saveViaFileSystemAccess(file, handle);

  const serialized = write.mock.calls[0][0] as string;
  expect(JSON.parse(serialized).brokerConnections).toEqual([connection]);
});
```

- [ ] **Step 2: Run the preservation test**

Run: `cd webapp && npx vitest run src/file/savePortfolioFile.test.ts -t "preserves an existing T-Bank connection"`

Expected: PASS without production changes. If it fails, make the smallest correction in `savePortfolioFile.ts` so it serializes the complete `PortfolioFile` unchanged, then rerun.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/file/savePortfolioFile.test.ts webapp/src/file/savePortfolioFile.ts
git commit -m "test: preserve T-Bank connection in browser saves"
```

### Task 5: Add the minimal scoped Tauri 2 shell

**Files:**
- Create: `webapp/src-tauri/Cargo.toml`
- Create: `webapp/src-tauri/build.rs`
- Create: `webapp/src-tauri/src/main.rs`
- Create: `webapp/src-tauri/tauri.conf.json`
- Create: `webapp/src-tauri/capabilities/default.json`
- Modify: `webapp/package.json`
- Modify: `webapp/vite.config.ts`

**Interfaces:**
- Consumes: Vite dev server at `http://127.0.0.1:1420`, frontend build at `webapp/dist`, official Tauri HTTP plugin.
- Produces: `npm run tauri:dev`, `npm run tauri:build`, and a release executable at `webapp/src-tauri/target/release/moex-portfolio-tracker.exe`.

- [ ] **Step 1: Add desktop scripts and a Tauri-aware Vite base**

Add to `package.json`:

```json
"tauri:dev": "tauri dev",
"tauri:build": "tauri build --no-bundle"
```

Change `vite.config.ts` to:

```ts
export default defineConfig({
  base: process.env.TAURI_ENV_PLATFORM ? "/" : "/moex-portfolio-tracker/",
  clearScreen: false,
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  // retain the existing plugins and test block unchanged
});
```

- [ ] **Step 2: Create the Rust crate**

```toml
# webapp/src-tauri/Cargo.toml
[package]
name = "moex-portfolio-tracker"
version = "0.1.0"
description = "MOEX Portfolio Tracker Windows portable application"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-http = "2"
```

```rs
// webapp/src-tauri/build.rs
fn main() {
    tauri_build::build()
}
```

```rs
// webapp/src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running MOEX Portfolio Tracker");
}
```

- [ ] **Step 3: Add desktop configuration with no installer bundles or updater**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "MOEX Portfolio Tracker",
  "version": "0.1.0",
  "identifier": "ru.alonemamont.moex-portfolio-tracker",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://127.0.0.1:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{ "title": "MOEX Portfolio Tracker", "width": 1280, "height": 800 }],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' https://invest-public-api.tbank.ru; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'"
    }
  },
  "bundle": { "active": false }
}
```

- [ ] **Step 4: Add the least-privilege HTTP capability**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Main-window access to the T-Bank Invest API only",
  "windows": ["main"],
  "permissions": [
    "core:default",
    {
      "identifier": "http:default",
      "allow": [{ "url": "https://invest-public-api.tbank.ru/**" }]
    }
  ]
}
```

- [ ] **Step 5: Validate configuration and compile the shell**

Run: `cd webapp && npm run build && npm run tauri:build`

Expected: Vite build succeeds; Cargo compiles; `src-tauri/target/release/moex-portfolio-tracker.exe` exists; no MSI or NSIS output is created.

- [ ] **Step 6: Manually smoke-test on Windows**

Run: `cd webapp && npm run tauri:dev`

Expected: the desktop window opens, a T-Bank token can reach account selection, Finam remains usable, and DevTools/terminal output contains neither the token nor `Authorization`. Close the window after the check.

- [ ] **Step 7: Commit**

```bash
git add webapp/package.json webapp/package-lock.json webapp/vite.config.ts webapp/src-tauri
git commit -m "feat: add portable Tauri Windows shell"
```

### Task 6: Build and attach the portable executable on tagged releases

**Files:**
- Create: `.github/workflows/windows-portable.yml`
- Create: `docs/releases/windows-portable.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: tag `v*`, Node 20, stable Rust, and `npm run tauri:build` from Task 5.
- Produces: GitHub Release asset `moex-portfolio-tracker-windows-portable.exe` and documented release notes.

- [ ] **Step 1: Create the Windows workflow**

```yaml
name: Windows portable

on:
  pull_request:
    paths:
      - "webapp/**"
      - ".github/workflows/windows-portable.yml"
  push:
    tags: ["v*"]

permissions:
  contents: write

jobs:
  portable:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: webapp/package-lock.json
      - uses: dtolnay/rust-toolchain@stable
      - name: Install dependencies
        working-directory: webapp
        run: npm ci
      - name: Test and build web application
        working-directory: webapp
        run: |
          npm run test
          npm run typecheck
          npm run lint
          npm run build
      - name: Build portable executable
        working-directory: webapp
        run: npm run tauri:build
      - name: Smoke-check executable
        shell: pwsh
        run: |
          $exe = "webapp/src-tauri/target/release/moex-portfolio-tracker.exe"
          if (-not (Test-Path $exe)) { throw "Portable executable was not produced" }
          if ((Get-Item $exe).Length -le 0) { throw "Portable executable is empty" }
      - name: Stage portable asset
        if: startsWith(github.ref, 'refs/tags/')
        shell: pwsh
        run: Copy-Item "webapp/src-tauri/target/release/moex-portfolio-tracker.exe" "moex-portfolio-tracker-windows-portable.exe"
      - uses: softprops/action-gh-release@v2
        if: startsWith(github.ref, 'refs/tags/')
        with:
          files: moex-portfolio-tracker-windows-portable.exe
          body_path: docs/releases/windows-portable.md
```

- [ ] **Step 2: Write exact release guidance**

```md
# MOEX Portfolio Tracker for Windows

Download `moex-portfolio-tracker-windows-portable.exe` and run it directly; no installation is required.

This first Windows build is not code-signed, so Microsoft SmartScreen may show a warning. Verify that the file came from this repository's GitHub Releases page before choosing to run it.

The application uses the system Microsoft Edge WebView2 runtime. It is included in current Windows releases; if startup reports that it is missing, install the official Evergreen Standalone Installer from https://developer.microsoft.com/microsoft-edge/webview2/.

T-Bank requests are made locally by the application. Tokens remain encrypted in `portfolio.json`, are decrypted only in frontend memory for synchronization, and are not sent to a third-party proxy.
```

Add a concise `README.md` section linking to `https://github.com/alonemamont/moex-portfolio-tracker/releases/latest`, stating that T-Bank synchronization requires the Windows portable application while Finam remains available in the browser.

- [ ] **Step 3: Check workflow syntax and release copy**

Run: `git diff --check && rg -n "SmartScreen|WebView2|windows-portable|releases/latest" .github/workflows/windows-portable.yml docs/releases/windows-portable.md README.md`

Expected: `git diff --check` exits 0; every required release topic has a match.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/windows-portable.yml docs/releases/windows-portable.md README.md
git commit -m "ci: publish Windows portable release"
```

### Task 7: Full regression and release verification

**Files:**
- Modify only files required to correct failures found by the commands below.

**Interfaces:**
- Consumes: all deliverables from Tasks 1–6.
- Produces: evidence that web, desktop, broker, persistence, and release paths are ready together.

- [ ] **Step 1: Run the complete frontend quality suite**

Run: `cd webapp && npm run test && npm run typecheck && npm run lint && npm run build`

Expected: all four commands exit 0.

- [ ] **Step 2: Run browser E2E regression**

Run: `cd webapp && npm run test:e2e`

Expected: all Playwright tests PASS; existing GitHub Pages workflows remain unaffected.

- [ ] **Step 3: Run the live T-Bank contract test only when explicitly supplied a token**

PowerShell run after the operator has set `TBANK_CONTRACT_TEST_TOKEN` in the current process: `cd webapp; if (-not $env:TBANK_CONTRACT_TEST_TOKEN) { throw 'TBANK_CONTRACT_TEST_TOKEN is not set' }; npm run test:contract`

Expected: T-Bank and Finam contract tests PASS. Do not paste the token into source, command logs, issues, or commits. Without a supplied token, confirm the T-Bank suite is skipped.

- [ ] **Step 4: Rebuild and manually launch the release executable on Windows**

Run: `cd webapp && npm run tauri:build`

Expected: `webapp/src-tauri/target/release/moex-portfolio-tracker.exe` exists and launches using installed WebView2. Confirm T-Bank add/sync is enabled, preview precedes apply, Finam still works, and browser-mode T-Bank connections remain visible but cannot synchronize.

- [ ] **Step 5: Audit security boundaries**

Run: `rg -n "Authorization|console\.|println!|http:|connect-src|invest-public-api" webapp/src webapp/src-tauri`

Expected: `Authorization` appears only where the request header is constructed or asserted in tests; there are no token-bearing logs; the capability permits only the T-Bank host; CSP has no arbitrary remote script source; Rust contains no broker commands or token persistence.

- [ ] **Step 6: Record verification evidence in the implementation handoff**

Report the exit status of each command above, the executable path and size, whether the live contract test ran or skipped, and the four manual checks (T-Bank desktop availability, browser blocking, Finam regression, and absence of secret-bearing logs). If a check fails, return to the task that owns that behavior, apply and commit the correction there, and repeat all Task 7 checks.
