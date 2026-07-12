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
