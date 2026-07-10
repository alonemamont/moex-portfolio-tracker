import { describe, it, expect } from "vitest";
import { computeTargetAllocation, computePositionValue, computeIncome } from "./calculations";

describe("computeTargetAllocation", () => {
  it("multiplies index weight by coefficient for an in_index position", () => {
    expect(computeTargetAllocation(9.32, 1.5, "in_index")).toBeCloseTo(13.98);
  });

  it("returns null for an out_of_index position regardless of weight", () => {
    expect(computeTargetAllocation(0, 1.5, "out_of_index")).toBeNull();
  });
});

describe("computePositionValue", () => {
  it("multiplies price by shares owned", () => {
    expect(computePositionValue(92.79, 100)).toBeCloseTo(9279);
  });

  it("treats a null price as 0 instead of throwing", () => {
    expect(computePositionValue(null, 100)).toBe(0);
  });
});

describe("computeIncome", () => {
  it("multiplies dividend per share by shares owned", () => {
    expect(computeIncome(34.84, 10)).toBeCloseTo(348.4);
  });

  it("is 0 when no shares are owned", () => {
    expect(computeIncome(34.84, 0)).toBe(0);
  });
});
