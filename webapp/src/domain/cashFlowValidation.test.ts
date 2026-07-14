import { describe, it, expect } from "vitest";
import {
  isValidTransactionAmount,
  isValidTransactionDate,
  normalizeOptionalComment,
  normalizeAccountName,
} from "./cashFlowValidation";

describe("isValidTransactionAmount", () => {
  it("accepts a positive amount with up to 2 decimal places", () => {
    expect(isValidTransactionAmount(100)).toBe(true);
    expect(isValidTransactionAmount(100.5)).toBe(true);
    expect(isValidTransactionAmount(100.55)).toBe(true);
  });

  it("rejects zero and negative amounts", () => {
    expect(isValidTransactionAmount(0)).toBe(false);
    expect(isValidTransactionAmount(-50)).toBe(false);
  });

  it("rejects amounts with more than 2 decimal places", () => {
    expect(isValidTransactionAmount(100.555)).toBe(false);
  });

  it("rejects non-finite amounts", () => {
    expect(isValidTransactionAmount(NaN)).toBe(false);
    expect(isValidTransactionAmount(Infinity)).toBe(false);
    expect(isValidTransactionAmount(-Infinity)).toBe(false);
  });
});

describe("isValidTransactionDate", () => {
  it("accepts a well-formed calendar date", () => {
    expect(isValidTransactionDate("2026-07-14")).toBe(true);
  });

  it("rejects a malformed string", () => {
    expect(isValidTransactionDate("14-07-2026")).toBe(false);
    expect(isValidTransactionDate("2026/07/14")).toBe(false);
    expect(isValidTransactionDate("not-a-date")).toBe(false);
  });

  it("rejects a calendar date that doesn't exist", () => {
    expect(isValidTransactionDate("2026-02-30")).toBe(false);
    expect(isValidTransactionDate("2026-13-01")).toBe(false);
  });

  it("accepts a leap day only in a leap year", () => {
    expect(isValidTransactionDate("2024-02-29")).toBe(true);
    expect(isValidTransactionDate("2026-02-29")).toBe(false);
  });
});

describe("normalizeOptionalComment", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeOptionalComment("  hello  ")).toBe("hello");
  });

  it("returns undefined for undefined input", () => {
    expect(normalizeOptionalComment(undefined)).toBeUndefined();
  });

  it("returns undefined for a blank or whitespace-only comment", () => {
    expect(normalizeOptionalComment("")).toBeUndefined();
    expect(normalizeOptionalComment("   ")).toBeUndefined();
  });
});

describe("normalizeAccountName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeAccountName("  Брокерский счёт  ")).toBe("Брокерский счёт");
  });

  it("leaves an already-trimmed name unchanged", () => {
    expect(normalizeAccountName("ИИС")).toBe("ИИС");
  });
});
