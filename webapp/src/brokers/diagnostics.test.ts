import { describe, expect, it, vi, afterEach } from "vitest";

const tauriState = {
  runtime: false,
  invoke: vi.fn(),
};

vi.mock("../runtime/isTauriRuntime", () => ({
  isTauriRuntime: () => tauriState.runtime,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => tauriState.invoke(...args),
}));

import {
  buildBrokerSyncLogLine,
  describeDiagnosticError,
  logBrokerSyncError,
  logBrokerSyncInfo,
  logBrokerSyncWarn,
} from "./diagnostics";

afterEach(() => {
  vi.restoreAllMocks();
  tauriState.runtime = false;
  tauriState.invoke.mockReset();
});

describe("describeDiagnosticError", () => {
  it("formats Error instances with name and message", () => {
    expect(describeDiagnosticError(new TypeError("bad response"))).toBe("TypeError: bad response");
  });

  it("formats non-Error values with String()", () => {
    expect(describeDiagnosticError(404)).toBe("404");
  });
});

describe("broker sync diagnostic logging", () => {
  it("logs info, warn, and error with consistent prefixes", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logBrokerSyncInfo("stage.info", { value: 1 });
    logBrokerSyncWarn("stage.warn", { value: 2 });
    logBrokerSyncError("stage.error", new Error("boom"), { value: 3 });

    expect(info).toHaveBeenCalledWith("[broker-sync] stage.info", { value: 1 });
    expect(warn).toHaveBeenCalledWith("[broker-sync] stage.warn", { value: 2 });
    expect(error).toHaveBeenCalledWith("[broker-sync] stage.error", {
      value: 3,
      error: "Error: boom",
    });
  });

  it("formats log line with timestamp, level, stage, and details", () => {
    const line = buildBrokerSyncLogLine("error", "sync.preview.failed", {
      connectionId: "tbank-main",
      error: "TypeError: boom",
    });

    expect(line).toMatch(
      /^\{"timestamp":"[^"]+","source":"broker-sync","level":"error","stage":"sync\.preview\.failed","details":\{"connectionId":"tbank-main","error":"TypeError: boom"\}\}$/
    );
  });

  it("mirrors desktop diagnostics into Tauri file logger", async () => {
    tauriState.runtime = true;
    tauriState.invoke.mockResolvedValue(undefined);
    vi.spyOn(console, "info").mockImplementation(() => {});

    logBrokerSyncInfo("ui.sync.start", { connectionId: "abc" });
    await vi.waitFor(() => {
      expect(tauriState.invoke).toHaveBeenCalledTimes(1);
    });

    expect(tauriState.invoke).toHaveBeenCalledWith("append_broker_sync_log", {
      line: expect.stringContaining('"stage":"ui.sync.start"'),
    });
    expect(tauriState.invoke.mock.calls[0]?.[1]?.line).toContain('"connectionId":"abc"');
  });
});
