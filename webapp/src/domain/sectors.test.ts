import { describe, it, expect } from "vitest";
import { createSectorResolver, OTHER_SECTOR } from "./sectors";

describe("createSectorResolver", () => {
  it("resolves from the default map when there is no override", () => {
    const resolve = createSectorResolver({ SBER: "Финансы" }, {});
    expect(resolve("SBER")).toBe("Финансы");
  });

  it("prefers a user override over the default", () => {
    const resolve = createSectorResolver({ SBER: "Финансы" }, { SBER: "Прочее" });
    expect(resolve("SBER")).toBe("Прочее");
  });

  it("falls back to \"Другое\" for a ticker in neither map", () => {
    const resolve = createSectorResolver({ SBER: "Финансы" }, {});
    expect(resolve("UNKNOWNTICKER")).toBe(OTHER_SECTOR);
  });

  it("matches tickers case-insensitively", () => {
    const resolve = createSectorResolver({ SBER: "Финансы" }, {});
    expect(resolve("sber")).toBe("Финансы");
  });
});
