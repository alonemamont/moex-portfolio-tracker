// Live contract test — only runs when TBANK_CONTRACT_TEST_TOKEN is set.
// Run locally: TBANK_CONTRACT_TEST_TOKEN=<real-token> npm run test:contract
import { describe, it, expect } from "vitest";
import { fetchTbankAccounts } from "./client";

const TOKEN = process.env.TBANK_CONTRACT_TEST_TOKEN;

describe.skipIf(!TOKEN)("Tbank API contract (live)", () => {
  it("returns at least one account for the configured token, with id and name fields", async () => {
    const accounts = await fetchTbankAccounts(TOKEN!);
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts[0]).toHaveProperty("id");
    expect(accounts[0]).toHaveProperty("name");
  });
});
