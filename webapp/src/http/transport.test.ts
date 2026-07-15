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
