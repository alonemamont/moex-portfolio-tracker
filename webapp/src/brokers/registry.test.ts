import { describe, it, expect } from "vitest";
import { BROKER_REGISTRY, getBrokerAdapter } from "./registry";

describe("getBrokerAdapter", () => {
  it("returns the tbank adapter for id 'tbank'", () => {
    expect(getBrokerAdapter("tbank")).toBe(BROKER_REGISTRY[0]);
    expect(getBrokerAdapter("tbank")?.label).toBe("Т-Банк");
  });

  it("returns undefined for an unknown broker id", () => {
    expect(getBrokerAdapter("unknown")).toBeUndefined();
  });
});
