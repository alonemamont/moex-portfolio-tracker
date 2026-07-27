// Live contract test — only runs when FINAM_CONTRACT_TEST_SECRET is set.
// Run locally: FINAM_CONTRACT_TEST_SECRET=<real-secret> npm run test:contract
import { describe, it, expect } from "vitest";
import { exchangeFinamSecret, fetchFinamAccountIds } from "./client";

const SECRET = process.env.FINAM_CONTRACT_TEST_SECRET;

describe.skipIf(!SECRET)("Finam API contract (live)", () => {
  it("exchanges a real secret for a JWT with the expected shape", async () => {
    const jwt = await exchangeFinamSecret(SECRET!);
    expect(typeof jwt).toBe("string");
    expect(jwt.length).toBeGreaterThan(0);
  });

  it("returns at least one account id for the configured secret", async () => {
    const jwt = await exchangeFinamSecret(SECRET!);
    const ids = await fetchFinamAccountIds(jwt);
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
  });
});
