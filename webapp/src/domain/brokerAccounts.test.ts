import { describe, expect, it } from "vitest";
import { PortfolioFile } from "../types";
import {
  countAccountTransactions,
  createBrokerAccount,
  deleteBrokerAccount,
  renameBrokerAccount,
  validateAccountName,
} from "./brokerAccounts";

function file(): PortfolioFile {
  return {
    version: 1,
    positions: [],
    sectors: {},
    history: [],
    pairs: [],
    brokerConnections: [],
    brokerAccounts: [{ id: "account-1", name: "Основной" }],
    transactions: [{
      id: "transaction-1",
      type: "deposit",
      amount: 100,
      currency: "RUB",
      date: "2026-07-13",
      accountId: "account-1",
    }],
  };
}

describe("broker account management", () => {
  it("trims a new account name and does not mutate the file", () => {
    const source = file();
    const result = createBrokerAccount(source, "  ИИС  ", "account-2");
    expect(result.brokerAccounts[1]).toEqual({ id: "account-2", name: "ИИС" });
    expect(source.brokerAccounts).toHaveLength(1);
  });

  it("rejects blank and case-insensitive duplicate names after trimming", () => {
    expect(validateAccountName("  ", file().brokerAccounts)).toBe("Введите название счёта");
    expect(validateAccountName(" основной ", file().brokerAccounts)).toBe("Счёт с таким названием уже существует");
  });

  it("renames the referenced account without copying the name into transactions", () => {
    const result = renameBrokerAccount(file(), "account-1", "  Брокерский  ");
    expect(result.brokerAccounts[0].name).toBe("Брокерский");
    expect(result.transactions[0]).toEqual(file().transactions[0]);
  });

  it("counts linked transactions and atomically moves them to the general portfolio on delete", () => {
    const source = file();
    expect(countAccountTransactions(source, "account-1")).toBe(1);
    const result = deleteBrokerAccount(source, "account-1");
    expect(result.brokerAccounts).toEqual([]);
    expect(result.transactions).toEqual([{ ...source.transactions[0], accountId: undefined }]);
    expect(source.transactions[0].accountId).toBe("account-1");
  });
});
