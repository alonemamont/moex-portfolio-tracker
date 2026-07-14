import { describe, it, expect, vi, afterEach } from "vitest";
import { finamAdapter } from "./adapter";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("finamAdapter integration (real client, mocked fetch only)", () => {
  it("listAccounts: exchanges secret for jwt, then lists account ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "https://api.finam.ru/v1/sessions") {
          expect(init?.method).toBe("POST");
          expect(init?.body).toBe(JSON.stringify({ secret: "my-secret" }));
          return jsonResponse({ token: "jwt-abc" });
        }
        if (url === "https://api.finam.ru/v1/sessions/details") {
          expect(init?.body).toBe(JSON.stringify({ token: "jwt-abc" }));
          return jsonResponse({ account_ids: ["acc-1", "acc-2"] });
        }
        throw new Error(`unexpected URL: ${url}`);
      })
    );

    const accounts = await finamAdapter.listAccounts("my-secret");

    expect(accounts).toEqual([
      { id: "acc-1", name: "acc-1" },
      { id: "acc-2", name: "acc-2" },
    ]);
  });

  it("fetchHoldings: full chain, keeps only EQUITIES, drops a position whose asset resolve fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "https://api.finam.ru/v1/sessions") {
          return jsonResponse({ token: "jwt-abc" });
        }
        if (url === "https://api.finam.ru/v1/accounts/acc-1") {
          expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer jwt-abc");
          return jsonResponse({
            account_id: "acc-1",
            positions: [
              { symbol: "SBER@MISX", quantity: { value: "10.0" } },
              { symbol: "RU000A106R95@MISX", quantity: { value: "5.0" } },
              { symbol: "UNKNOWN@MISX", quantity: { value: "1.0" } },
            ],
          });
        }
        if (url === "https://api.finam.ru/v1/assets/SBER%40MISX?account_id=acc-1") {
          return jsonResponse({ ticker: "SBER", type: "EQUITIES" });
        }
        if (url === "https://api.finam.ru/v1/assets/RU000A106R95%40MISX?account_id=acc-1") {
          return jsonResponse({ ticker: "RU000A106R95", type: "BONDS" });
        }
        if (url === "https://api.finam.ru/v1/assets/UNKNOWN%40MISX?account_id=acc-1") {
          return jsonResponse({}, 404);
        }
        throw new Error(`unexpected URL: ${url}`);
      })
    );

    const holdings = await finamAdapter.fetchHoldings("my-secret", "acc-1");

    expect(holdings).toEqual([{ ticker: "SBER", shares: 10 }]);
  });
});
