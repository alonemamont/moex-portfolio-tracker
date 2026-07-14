import { describe, it, expect, vi, afterEach } from "vitest";
import {
  exchangeFinamSecret,
  fetchFinamAccountIds,
  fetchFinamAccountDetails,
  resolveFinamAsset,
  parseFinamQuantity,
} from "./client";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    })
  );
}

describe("exchangeFinamSecret", () => {
  it("posts the secret to /v1/sessions and returns the JWT", async () => {
    mockFetchOnce({ token: "jwt-abc" });

    const jwt = await exchangeFinamSecret("my-secret");

    expect(jwt).toBe("jwt-abc");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.finam.ru/v1/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ secret: "my-secret" }),
      })
    );
  });

  it("throws when the response is not ok", async () => {
    mockFetchOnce({}, false, 401);
    await expect(exchangeFinamSecret("bad-secret")).rejects.toThrow(/401/);
  });
});

describe("fetchFinamAccountIds", () => {
  it("posts the JWT to /v1/sessions/details and returns account_ids", async () => {
    mockFetchOnce({ account_ids: ["acc-1", "acc-2"] });

    const ids = await fetchFinamAccountIds("jwt-abc");

    expect(ids).toEqual(["acc-1", "acc-2"]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.finam.ru/v1/sessions/details",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "jwt-abc" }),
      })
    );
  });
});

describe("fetchFinamAccountDetails", () => {
  it("gets /v1/accounts/{id} with a bearer JWT and returns the body", async () => {
    mockFetchOnce({
      account_id: "acc-1",
      positions: [{ symbol: "SBER@MISX", quantity: { value: "10.0" } }],
    });

    const details = await fetchFinamAccountDetails("jwt-abc", "acc-1");

    expect(details).toEqual({
      account_id: "acc-1",
      positions: [{ symbol: "SBER@MISX", quantity: { value: "10.0" } }],
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.finam.ru/v1/accounts/acc-1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer jwt-abc" }),
      })
    );
  });
});

describe("resolveFinamAsset", () => {
  it("resolves a symbol to its ticker and instrument type, passing account_id as a query param", async () => {
    mockFetchOnce({ ticker: "GAZP", type: "EQUITIES" });

    const asset = await resolveFinamAsset("jwt-abc", "GAZP@MISX", "acc-1");

    expect(asset).toEqual({ ticker: "GAZP", type: "EQUITIES" });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.finam.ru/v1/assets/GAZP%40MISX?account_id=acc-1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer jwt-abc" }),
      })
    );
  });

  it("returns null instead of throwing when resolution fails", async () => {
    mockFetchOnce({}, false, 404);
    const asset = await resolveFinamAsset("jwt-abc", "UNKNOWN@MISX", "acc-1");
    expect(asset).toBeNull();
  });
});

describe("parseFinamQuantity", () => {
  it("converts a nested quantity value to a number", () => {
    expect(parseFinamQuantity({ value: "10.0" })).toBe(10);
  });

  it("handles fractional quantities", () => {
    expect(parseFinamQuantity({ value: "1.5" })).toBeCloseTo(1.5);
  });
});
