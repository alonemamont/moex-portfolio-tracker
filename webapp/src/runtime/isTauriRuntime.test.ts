import { afterEach, describe, expect, it } from "vitest";
import { isTauriRuntime } from "./isTauriRuntime";

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

describe("isTauriRuntime", () => {
  it("is false in an ordinary browser", () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it("is true when Tauri internals are present", () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    expect(isTauriRuntime()).toBe(true);
  });
});
