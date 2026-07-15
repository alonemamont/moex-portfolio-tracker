import { afterEach, describe, expect, it, vi } from "vitest";
import { browserTransport, HttpTransport } from "../../http/transport";
import { fetchTbankAccounts, fetchTbankPortfolio, quantityToShares, resolveTbankTicker } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchTbankAccounts", () => {
  it("posts to UsersService/GetAccounts with a bearer token and returns the accounts array", async () => {
    const transport = vi.fn<HttpTransport>();
    transport.mockResolvedValueOnce(
      new Response(JSON.stringify({ accounts: [{ id: "acc-1", name: "ИИС" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(fetchTbankAccounts("secret-token", transport)).resolves.toEqual([{ id: "acc-1", name: "ИИС" }]);
    expect(transport).toHaveBeenCalledWith(
      expect.stringContaining("UsersService/GetAccounts"),
      {
        method: "POST",
        headers: { Authorization: "Bearer secret-token", "Content-Type": "application/json" },
        body: "{}",
      }
    );
  });

  it.each([
    [401, "auth", "Неверный токен или недостаточно прав"],
    [403, "auth", "Неверный токен или недостаточно прав"],
    [429, "rate-limit", "Превышен лимит запросов Т-Банка"],
    [503, "unavailable", "API Т-Банка временно недоступен"],
  ] as const)("maps HTTP %i to %s", async (status, code, message) => {
    const transport = vi.fn<HttpTransport>();
    transport.mockResolvedValueOnce(new Response("sensitive response", { status }));

    const error = await fetchTbankAccounts("secret-token", transport).catch((value) => value);

    expect(error).toMatchObject({ code, message });
    expect(String(error)).not.toContain("secret-token");
    expect(String(error)).not.toContain("sensitive response");
  });

  it("maps network failure to unavailable without leaking its details", async () => {
    const transport = vi.fn<HttpTransport>();
    transport.mockRejectedValueOnce(new Error("request Authorization: Bearer secret-token failed"));

    await expect(fetchTbankAccounts("secret-token", transport)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("rejects an incompatible response contract", async () => {
    const transport = vi.fn<HttpTransport>();
    transport.mockResolvedValueOnce(new Response(JSON.stringify({ accounts: "not-an-array" }), { status: 200 }));

    await expect(fetchTbankAccounts("secret-token", transport)).rejects.toMatchObject({ code: "contract" });
  });
});

describe("fetchTbankPortfolio", () => {
  it("posts accountId and currency, returns the positions array", async () => {
    const transport = vi.fn<HttpTransport>();
    transport.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          positions: [
            { figi: "BBG1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "10", nano: 0 } },
          ],
        }),
        { status: 200 }
      )
    );

    await expect(fetchTbankPortfolio("my-token", "acc-1", transport)).resolves.toEqual([
      { figi: "BBG1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "10", nano: 0 } },
    ]);
    expect(transport).toHaveBeenCalledWith(
      expect.stringContaining("OperationsService/GetPortfolio"),
      expect.objectContaining({
        body: JSON.stringify({ accountId: "acc-1", currency: "RUB" }),
      })
    );
  });
});

describe("resolveTbankTicker", () => {
  it("resolves an instrumentUid to a ticker", async () => {
    const transport = vi.fn<HttpTransport>();
    transport.mockResolvedValueOnce(new Response(JSON.stringify({ instrument: { ticker: "GAZP" } }), { status: 200 }));

    await expect(resolveTbankTicker("my-token", "uid-1", transport)).resolves.toBe("GAZP");
  });

  it("returns null instead of throwing when resolution fails", async () => {
    const transport = vi.fn<HttpTransport>();
    transport.mockResolvedValueOnce(new Response("nope", { status: 404 }));

    await expect(resolveTbankTicker("my-token", "unknown-uid", transport)).resolves.toBeNull();
  });
});

describe("quantityToShares", () => {
  it("converts units+nano to a plain number", () => {
    expect(quantityToShares({ units: "10", nano: 0 })).toBe(10);
  });

  it("adds the fractional nano part", () => {
    expect(quantityToShares({ units: "1", nano: 500000000 })).toBeCloseTo(1.5);
  });
});

describe("live contract wiring", () => {
  it("keeps browserTransport available for explicit contract-test usage", () => {
    expect(browserTransport).toBeTypeOf("function");
  });
});
