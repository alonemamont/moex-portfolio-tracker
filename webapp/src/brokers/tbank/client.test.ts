import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpTransport } from "../../http/transport";

const transport = vi.fn<HttpTransport>();
const diagnoseTbankPortfolioRequest = vi.fn();

vi.mock("../../runtime/tbankDesktopDiagnostics", () => ({
  diagnoseTbankPortfolioRequest: (...args: unknown[]) => diagnoseTbankPortfolioRequest(...args),
}));

import { fetchTbankAccounts, fetchTbankPortfolio, resolveTbankTicker, quantityToShares } from "./client";

beforeEach(() => {
  transport.mockReset();
  diagnoseTbankPortfolioRequest.mockReset();
  diagnoseTbankPortfolioRequest.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchTbankAccounts", () => {
  it("posts to UsersService/GetAccounts with a bearer token and returns the accounts array", async () => {
    transport.mockResolvedValueOnce(
      new Response(JSON.stringify({ accounts: [{ id: "acc-1", name: "ИИС" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const accounts = await fetchTbankAccounts("secret-token", transport);

    expect(accounts).toEqual([{ id: "acc-1", name: "ИИС" }]);
    expect(transport).toHaveBeenCalledWith(expect.stringContaining("UsersService/GetAccounts"), {
      method: "POST",
      headers: { Authorization: "Bearer secret-token", "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it.each([
    [401, "auth", "Неверный токен или недостаточно прав (UsersService/GetAccounts): HTTP 401"],
    [403, "auth", "Неверный токен или недостаточно прав (UsersService/GetAccounts): HTTP 403"],
    [429, "rate-limit", "Превышен лимит запросов Т-Банка (UsersService/GetAccounts): HTTP 429"],
    [503, "unavailable", "API Т-Банка временно недоступен (UsersService/GetAccounts): HTTP 503"],
  ] as const)("maps HTTP %i to %s", async (status, code, message) => {
    transport.mockResolvedValueOnce(new Response("sensitive response", { status }));
    const error = await fetchTbankAccounts("secret-token", transport).catch((value) => value);
    expect(error).toMatchObject({ code, message });
    expect(String(error)).not.toContain("secret-token");
    expect(String(error)).not.toContain("sensitive response");
  });

  it("maps network failure to unavailable without leaking token", async () => {
    transport.mockRejectedValueOnce(new Error("network down"));
    await expect(fetchTbankAccounts("secret-token", transport)).rejects.toMatchObject({
      code: "unavailable",
      message: "API Т-Банка временно недоступен (UsersService/GetAccounts): network down",
    });
  });

  it("rejects an incompatible response contract", async () => {
    transport.mockResolvedValueOnce(new Response(JSON.stringify({ accounts: "not-an-array" }), { status: 200 }));
    await expect(fetchTbankAccounts("secret-token", transport)).rejects.toMatchObject({
      code: "contract",
      message: "Ответ Т-Банка имеет несовместимый формат (UsersService/GetAccounts)",
    });
  });
});

describe("fetchTbankPortfolio", () => {
  it("posts accountId and currency, returns the positions array", async () => {
    transport.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          positions: [
            { figi: "BBG1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "10", nano: 0 } },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const positions = await fetchTbankPortfolio("my-token", "acc-1", transport);

    expect(positions).toEqual([
      { figi: "BBG1", instrumentType: "share", instrumentUid: "uid-1", quantity: { units: "10", nano: 0 } },
    ]);
    expect(transport).toHaveBeenCalledWith(
      expect.stringContaining("OperationsService/GetPortfolio"),
      expect.objectContaining({
        body: JSON.stringify({ accountId: "acc-1", currency: "RUB" }),
      })
    );
  });

  it("surfaces a concrete untrusted-root error when desktop TLS trust fails", async () => {
    transport.mockRejectedValueOnce(new Error("error sending request for url"));
    diagnoseTbankPortfolioRequest.mockResolvedValueOnce(
      "direct reqwest error: error sending request for url; client error (Connect); Цепочка сертификатов обработана, но обработка прервана на корневом сертификате, у которого отсутствует отношение доверия с поставщиком доверия. (os error -2146762487)"
    );

    const error = await fetchTbankPortfolio("my-token", "acc-1", transport).catch((value) => value);

    expect(error).toMatchObject({ code: "unavailable" });
    expect(error.message).toContain("Desktop-приложение не доверяет корневому TLS-сертификату");
    expect(error.message).toContain("OperationsService/GetPortfolio");
    expect(error.message).toContain("Диагностика desktop transport:");
    expect(error.message).toContain("os error -2146762487");
    expect(diagnoseTbankPortfolioRequest).toHaveBeenCalledWith("my-token", "acc-1");
  });
});

describe("resolveTbankTicker", () => {
  it("resolves an instrumentUid to a ticker", async () => {
    transport.mockResolvedValueOnce(new Response(JSON.stringify({ instrument: { ticker: "GAZP" } }), { status: 200 }));
    const ticker = await resolveTbankTicker("my-token", "uid-1", transport);
    expect(ticker).toBe("GAZP");
  });

  it("returns null instead of throwing when resolution fails and logs diagnostic warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    transport.mockResolvedValueOnce(new Response(null, { status: 404 }));

    const ticker = await resolveTbankTicker("my-token", "unknown-uid", transport);

    expect(ticker).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "[broker-sync] tbank.resolveTicker.failed",
      expect.objectContaining({
        instrumentUid: "unknown-uid",
        error: "TbankClientError: API Т-Банка временно недоступен (InstrumentsService/GetInstrumentBy): HTTP 404",
      })
    );
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
