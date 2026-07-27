import { describe, expect, it } from "vitest";
import { PortfolioFile, Transaction } from "../types";
import {
  createTransaction,
  deleteTransaction,
  selectTransactions,
  summarizeTransactions,
  updateTransaction,
  validateTransactionDraft,
} from "./transactions";

function file(transactions: Transaction[] = []): PortfolioFile {
  return {
    version: 1,
    positions: [],
    sectors: {},
    history: [],
    pairs: [],
    brokerConnections: [],
    brokerAccounts: [{ id: "account-1", name: "Основной" }],
    transactions,
  };
}

const deposit: Transaction = {
  id: "deposit-1",
  type: "deposit",
  amount: 1000,
  currency: "RUB",
  date: "2026-07-13",
  accountId: "account-1",
};

describe("transaction mutations", () => {
  it("prepends a normalized transaction without mutating the source file", () => {
    const source = file([deposit]);
    const result = createTransaction(source, {
      type: "withdrawal",
      amount: 10.5,
      currency: "USD",
      date: "2099-01-01",
      comment: "  комиссия  ",
    }, "withdrawal-1");
    expect(result).not.toBe(source);
    expect(result.transactions[0]).toEqual({
      id: "withdrawal-1",
      type: "withdrawal",
      amount: 10.5,
      currency: "USD",
      date: "2099-01-01",
      comment: "комиссия",
    });
    expect(source.transactions).toEqual([deposit]);
  });

  it("updates in place by id, preserves id, and removes a blank comment", () => {
    const result = updateTransaction(file([deposit]), "deposit-1", {
      type: "withdrawal",
      amount: 25,
      currency: "CNY",
      date: "2026-07-14",
      comment: "   ",
      accountId: "account-1",
    });
    expect(result.transactions).toEqual([{
      id: "deposit-1",
      type: "withdrawal",
      amount: 25,
      currency: "CNY",
      date: "2026-07-14",
      accountId: "account-1",
    }]);
  });

  it("deletes only the selected transaction", () => {
    const result = deleteTransaction(file([deposit, { ...deposit, id: "deposit-2" }]), "deposit-1");
    expect(result.transactions.map((transaction) => transaction.id)).toEqual(["deposit-2"]);
  });

  it("reports field errors for invalid values and a missing account reference", () => {
    expect(validateTransactionDraft({
      type: "deposit",
      amount: 1.001,
      currency: "RUB",
      date: "2026-02-30",
      accountId: "missing",
    }, [])).toEqual({
      amount: "Введите положительную сумму не более чем с двумя знаками после запятой",
      date: "Введите реальную дату в формате ГГГГ-ММ-ДД",
      accountId: "Выберите существующий счёт",
    });
  });
});

describe("transaction selection and totals", () => {
  const transactions: Transaction[] = [
    { ...deposit, id: "new-same-date", amount: 200 },
    { ...deposit, id: "older-same-date", amount: 100 },
    { ...deposit, id: "usd", amount: 5, currency: "USD", date: "2026-07-12" },
    { ...deposit, id: "withdrawal", type: "withdrawal", amount: 30, date: "2026-07-11" },
    { ...deposit, id: "cny", amount: 7, currency: "CNY", date: "2026-07-10" },
  ];

  it("sorts descending and keeps source order for equal dates", () => {
    expect(selectTransactions(transactions, "ALL").map((transaction) => transaction.id)).toEqual([
      "new-same-date", "older-same-date", "usd", "withdrawal", "cny",
    ]);
  });

  it.each([
    ["RUB", ["new-same-date", "older-same-date", "withdrawal"]],
    ["USD", ["usd"]],
    ["CNY", ["cny"]],
  ] as const)("filters %s without mutating the input", (currency, expectedIds) => {
    expect(selectTransactions(transactions, currency).map((transaction) => transaction.id)).toEqual(expectedIds);
    expect(transactions).toHaveLength(5);
  });

  it("computes deposits, withdrawals, and net flow independently by currency", () => {
    expect(summarizeTransactions(transactions)).toEqual([
      { currency: "RUB", deposits: 300, withdrawals: 30, netFlow: 270 },
      { currency: "USD", deposits: 5, withdrawals: 0, netFlow: 5 },
      { currency: "CNY", deposits: 7, withdrawals: 0, netFlow: 7 },
    ]);
  });
});
