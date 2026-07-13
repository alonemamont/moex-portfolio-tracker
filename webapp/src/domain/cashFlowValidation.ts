import { TransactionCurrency } from "../types";

export const TRANSACTION_CURRENCIES: readonly TransactionCurrency[] = ["RUB", "USD", "CNY"];

export function isValidTransactionAmount(amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  return amount === Math.round(amount * 100) / 100;
}

export function isValidTransactionDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeOptionalComment(comment: string | undefined): string | undefined {
  const normalized = comment?.trim();
  return normalized ? normalized : undefined;
}

export function normalizeAccountName(name: string): string {
  return name.trim();
}
