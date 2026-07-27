import {
  BrokerAccount,
  PortfolioFile,
  Transaction,
  TransactionCurrency,
  TransactionType,
} from "../types";
import {
  TRANSACTION_CURRENCIES,
  isValidTransactionAmount,
  isValidTransactionDate,
  normalizeOptionalComment,
} from "./cashFlowValidation";

export interface TransactionDraft {
  type: TransactionType;
  amount: number;
  currency: TransactionCurrency;
  date: string;
  comment?: string;
  accountId?: string;
}

export interface TransactionFieldErrors {
  amount?: string;
  date?: string;
  accountId?: string;
}

export type CurrencyFilter = "ALL" | TransactionCurrency;

export interface TransactionSummary {
  currency: TransactionCurrency;
  deposits: number;
  withdrawals: number;
  netFlow: number;
}

export function validateTransactionDraft(
  draft: TransactionDraft,
  accounts: BrokerAccount[]
): TransactionFieldErrors {
  const errors: TransactionFieldErrors = {};
  if (!isValidTransactionAmount(draft.amount)) {
    errors.amount = "Введите положительную сумму не более чем с двумя знаками после запятой";
  }
  if (!isValidTransactionDate(draft.date)) {
    errors.date = "Введите реальную дату в формате ГГГГ-ММ-ДД";
  }
  if (draft.accountId !== undefined && !accounts.some((account) => account.id === draft.accountId)) {
    errors.accountId = "Выберите существующий счёт";
  }
  return errors;
}

function normalizeDraft(draft: TransactionDraft): TransactionDraft {
  const comment = normalizeOptionalComment(draft.comment);
  return {
    type: draft.type,
    amount: draft.amount,
    currency: draft.currency,
    date: draft.date,
    ...(comment === undefined ? {} : { comment }),
    ...(draft.accountId === undefined ? {} : { accountId: draft.accountId }),
  };
}

function assertValidDraft(draft: TransactionDraft, accounts: BrokerAccount[]): void {
  if (Object.keys(validateTransactionDraft(draft, accounts)).length > 0) {
    throw new Error("Invalid transaction draft");
  }
}

export function createTransaction(
  file: PortfolioFile,
  draft: TransactionDraft,
  id: string
): PortfolioFile {
  assertValidDraft(draft, file.brokerAccounts);
  if (!id || file.transactions.some((transaction) => transaction.id === id)) {
    throw new Error("Transaction id must be unique");
  }
  const transaction: Transaction = { id, ...normalizeDraft(draft) };
  return { ...file, transactions: [transaction, ...file.transactions] };
}

export function updateTransaction(
  file: PortfolioFile,
  id: string,
  draft: TransactionDraft
): PortfolioFile {
  assertValidDraft(draft, file.brokerAccounts);
  if (!file.transactions.some((transaction) => transaction.id === id)) {
    throw new Error("Transaction not found");
  }
  const updated: Transaction = { id, ...normalizeDraft(draft) };
  return {
    ...file,
    transactions: file.transactions.map((transaction) => transaction.id === id ? updated : transaction),
  };
}

export function deleteTransaction(file: PortfolioFile, id: string): PortfolioFile {
  return { ...file, transactions: file.transactions.filter((transaction) => transaction.id !== id) };
}

export function selectTransactions(
  transactions: Transaction[],
  currency: CurrencyFilter
): Transaction[] {
  return transactions
    .filter((transaction) => currency === "ALL" || transaction.currency === currency)
    .sort((left, right) => right.date.localeCompare(left.date));
}

export function summarizeTransactions(transactions: Transaction[]): TransactionSummary[] {
  return TRANSACTION_CURRENCIES.flatMap((currency) => {
    const matching = transactions.filter((transaction) => transaction.currency === currency);
    if (matching.length === 0) return [];
    const deposits = matching
      .filter((transaction) => transaction.type === "deposit")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const withdrawals = matching
      .filter((transaction) => transaction.type === "withdrawal")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return [{ currency, deposits, withdrawals, netFlow: deposits - withdrawals }];
  });
}
