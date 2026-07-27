import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadSearchPref,
  saveSearchPref,
  loadHideEmptyPref,
  saveHideEmptyPref,
  loadOnlyInIndexPref,
  saveOnlyInIndexPref,
} from "./tablePrefs";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("search pref", () => {
  it("defaults to empty string when nothing stored", () => {
    expect(loadSearchPref()).toBe("");
  });

  it("round-trips a saved value", () => {
    saveSearchPref("sber");
    expect(loadSearchPref()).toBe("sber");
  });

  it("returns default when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadSearchPref()).toBe("");
  });

  it("does not throw when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveSearchPref("test")).not.toThrow();
  });
});

describe("hideEmpty pref", () => {
  it("defaults to false when nothing stored", () => {
    expect(loadHideEmptyPref()).toBe(false);
  });

  it("round-trips true", () => {
    saveHideEmptyPref(true);
    expect(loadHideEmptyPref()).toBe(true);
  });

  it("round-trips false after being true", () => {
    saveHideEmptyPref(true);
    saveHideEmptyPref(false);
    expect(loadHideEmptyPref()).toBe(false);
  });

  it("returns default when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadHideEmptyPref()).toBe(false);
  });

  it("does not throw when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveHideEmptyPref(true)).not.toThrow();
  });
});

describe("onlyInIndex pref", () => {
  it("defaults to false when nothing stored", () => {
    expect(loadOnlyInIndexPref()).toBe(false);
  });

  it("round-trips true", () => {
    saveOnlyInIndexPref(true);
    expect(loadOnlyInIndexPref()).toBe(true);
  });

  it("round-trips false after being true", () => {
    saveOnlyInIndexPref(true);
    saveOnlyInIndexPref(false);
    expect(loadOnlyInIndexPref()).toBe(false);
  });

  it("returns default when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadOnlyInIndexPref()).toBe(false);
  });

  it("does not throw when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveOnlyInIndexPref(true)).not.toThrow();
  });
});
