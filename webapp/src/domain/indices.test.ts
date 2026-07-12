import { describe, it, expect } from "vitest";
import { INDEX_OPTIONS, DEFAULT_INDEX_ID } from "./indices";

describe("INDEX_OPTIONS", () => {
  it("lists IMOEX, MOEXBC, MOEX10 in that order", () => {
    expect(INDEX_OPTIONS.map((option) => option.id)).toEqual(["IMOEX", "MOEXBC", "MOEX10"]);
  });

  it("gives every option a non-empty label", () => {
    for (const option of INDEX_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});

describe("DEFAULT_INDEX_ID", () => {
  it("defaults to IMOEX", () => {
    expect(DEFAULT_INDEX_ID).toBe("IMOEX");
  });

  it("is one of the listed options", () => {
    expect(INDEX_OPTIONS.map((option) => option.id)).toContain(DEFAULT_INDEX_ID);
  });
});
