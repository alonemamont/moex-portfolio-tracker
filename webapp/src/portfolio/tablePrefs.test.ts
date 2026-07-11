import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSearchPref,
  saveSearchPref,
  loadHideEmptyPref,
  saveHideEmptyPref,
} from "./tablePrefs";

beforeEach(() => {
  localStorage.clear();
});

describe("search pref", () => {
  it("defaults to empty string when nothing stored", () => {
    expect(loadSearchPref()).toBe("");
  });

  it("round-trips a saved value", () => {
    saveSearchPref("sber");
    expect(loadSearchPref()).toBe("sber");
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
});
