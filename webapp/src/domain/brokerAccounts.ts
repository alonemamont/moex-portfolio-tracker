import { BrokerAccount, PortfolioFile } from "../types";
import { normalizeAccountName } from "./cashFlowValidation";

export function validateAccountName(
  rawName: string,
  accounts: BrokerAccount[],
  excludedId?: string
): string | null {
  const name = normalizeAccountName(rawName);
  if (!name) return "Введите название счёта";
  const duplicate = accounts.some(
    (account) => account.id !== excludedId && account.name.toLocaleLowerCase() === name.toLocaleLowerCase()
  );
  return duplicate ? "Счёт с таким названием уже существует" : null;
}

export function createBrokerAccount(file: PortfolioFile, rawName: string, id: string): PortfolioFile {
  const error = validateAccountName(rawName, file.brokerAccounts);
  if (error) throw new Error(error);
  if (!id || file.brokerAccounts.some((account) => account.id === id)) {
    throw new Error("Account id must be unique");
  }
  return {
    ...file,
    brokerAccounts: [...file.brokerAccounts, { id, name: normalizeAccountName(rawName) }],
  };
}

export function renameBrokerAccount(
  file: PortfolioFile,
  id: string,
  rawName: string
): PortfolioFile {
  const error = validateAccountName(rawName, file.brokerAccounts, id);
  if (error) throw new Error(error);
  if (!file.brokerAccounts.some((account) => account.id === id)) {
    throw new Error("Account not found");
  }
  return {
    ...file,
    brokerAccounts: file.brokerAccounts.map((account) =>
      account.id === id ? { ...account, name: normalizeAccountName(rawName) } : account
    ),
  };
}

export function countAccountTransactions(file: PortfolioFile, id: string): number {
  return file.transactions.filter((transaction) => transaction.accountId === id).length;
}

export function deleteBrokerAccount(file: PortfolioFile, id: string): PortfolioFile {
  return {
    ...file,
    brokerAccounts: file.brokerAccounts.filter((account) => account.id !== id),
    transactions: file.transactions.map((transaction) =>
      transaction.accountId === id ? { ...transaction, accountId: undefined } : transaction
    ),
  };
}
