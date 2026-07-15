import { describe, it, expect, vi } from "vitest";
import { fetchBrokerSyncPreview } from "./runBrokerSync";
import { PortfolioFile, BrokerConnection } from "../types";

vi.mock("../brokers/registry", () => ({
  getBrokerAdapter: vi.fn(),
}));
vi.mock("../iss/client", () => ({
  fetchSecurities: vi.fn(),
}));

import { getBrokerAdapter } from "../brokers/registry";
import { fetchSecurities } from "../iss/client";

const connection: BrokerConnection = {
  id: "conn-1",
  brokerId: "tbank",
  accountId: "acc-1",
  label: "Т-Банк",
  encryptedToken: { ciphertext: "c", iv: "i", salt: "s" },
};

function file(positions: PortfolioFile["positions"] = []): PortfolioFile {
  return {
    version: 1,
    positions,
    sectors: {},
    history: [],
    pairs: [],
    brokerConnections: [connection],
    brokerAccounts: [],
    transactions: [],
  };
}

describe("fetchBrokerSyncPreview", () => {
  it("throws when the connection's broker has no registered adapter", async () => {
    vi.mocked(getBrokerAdapter).mockReturnValue(undefined);
    await expect(fetchBrokerSyncPreview(file(), connection, "token")).rejects.toThrow(/Неизвестный брокер/);
  });

  it("fetches holdings, resolves tradeability only for new tickers, and builds the diff", async () => {
    vi.mocked(getBrokerAdapter).mockReturnValue({
      id: "tbank",
      label: "Т-Банк",
      listAccounts: vi.fn(),
      fetchHoldings: vi.fn().mockResolvedValue([
        { ticker: "GAZP", shares: 10 },
        { ticker: "NEWTICK", shares: 3 },
      ]),
    });
    vi.mocked(fetchSecurities).mockResolvedValue(
      new Map([["NEWTICK", { shortName: "Новая", price: 10, lotSize: 1 }]])
    );

    const existingFile = file([{ ticker: "GAZP", coefficient: 1, sharesOwned: 5, brokerHoldings: [] }]);
    const rows = await fetchBrokerSyncPreview(existingFile, connection, "token");

    expect(fetchSecurities).toHaveBeenCalledWith(["NEWTICK"]);
    expect(rows).toEqual(
      expect.arrayContaining([
        { ticker: "GAZP", status: "existing", previousShares: 0, newShares: 10 },
        { ticker: "NEWTICK", status: "new", previousShares: 0, newShares: 3 },
      ])
    );
  });

  it("wraps ISS failures with a concrete sync-stage error", async () => {
    vi.mocked(getBrokerAdapter).mockReturnValue({
      id: "tbank",
      label: "Рў-Р‘Р°РЅРє",
      listAccounts: vi.fn(),
      fetchHoldings: vi.fn().mockResolvedValue([{ ticker: "NEWTICK", shares: 3 }]),
    });
    vi.mocked(fetchSecurities).mockRejectedValue(new Error("Failed to fetch"));

    await expect(fetchBrokerSyncPreview(file(), connection, "token")).rejects.toThrow(
      "Не удалось проверить тикеры через MOEX ISS: Failed to fetch"
    );
  });
});
