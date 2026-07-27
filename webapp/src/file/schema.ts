import { z } from "zod";
import {
  isValidTransactionAmount,
  isValidTransactionDate,
  normalizeAccountName,
  normalizeOptionalComment,
} from "../domain/cashFlowValidation";

export class PortfolioFileValidationError extends Error {}

const brokerHoldingSchema = z.object({
  connectionId: z.string().min(1),
  shares: z.number(),
  syncedAt: z.string().min(1),
});

const positionSchema = z.object({
  ticker: z.string().min(1),
  coefficient: z.number(),
  sharesOwned: z.number(),
  brokerHoldings: z.array(brokerHoldingSchema).default([]),
});

const historySnapshotRowSchema = z.object({
  ticker: z.string().min(1),
  price: z.number().nullable(),
  weight: z.number(),
  status: z.enum(["in_index", "out_of_index"]),
});

const historySnapshotSchema = z.object({
  timestamp: z.string().min(1),
  portfolioValue: z.number(),
  avgCompliance: z.number().nullable(),
  snapshot: z.array(historySnapshotRowSchema),
});

const pairSchema = z.preprocess((raw) => {
  if (raw !== null && typeof raw === "object" && "coefficient" in raw && !("coefficients" in raw)) {
    const { coefficient, tickers, ...rest } = raw as { coefficient: unknown; tickers: unknown };
    const tickerList = Array.isArray(tickers) ? tickers : [];
    const coefficients = Object.fromEntries(tickerList.map((ticker) => [ticker, coefficient]));
    return { ...rest, tickers, coefficients };
  }
  return raw;
}, z.object({
  tickers: z.array(z.string()).min(2),
  coefficients: z.record(z.string(), z.number()),
}));

const encryptedTokenSchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  salt: z.string().min(1),
});

const brokerConnectionSchema = z.object({
  id: z.string().min(1),
  brokerId: z.string().min(1),
  accountId: z.string().min(1),
  label: z.string().min(1),
  encryptedToken: encryptedTokenSchema,
});

const brokerAccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().transform(normalizeAccountName).pipe(z.string().min(1)),
});

const transactionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["deposit", "withdrawal"]),
  amount: z.number().refine(isValidTransactionAmount, "must be positive, finite, and have at most two decimals"),
  currency: z.enum(["RUB", "USD", "CNY"]),
  date: z.string().refine(isValidTransactionDate, "must be a real YYYY-MM-DD date"),
  comment: z.string().optional().transform(normalizeOptionalComment),
  accountId: z.string().min(1).optional(),
});

const portfolioFileSchema = z.object({
  version: z.literal(1),
  positions: z.array(positionSchema),
  sectors: z.record(z.string()),
  history: z.array(historySnapshotSchema),
  pairs: z.array(pairSchema).default([]),
  brokerConnections: z.array(brokerConnectionSchema).default([]),
  brokerAccounts: z.array(brokerAccountSchema).default([]),
  transactions: z.array(transactionSchema).default([]),
}).superRefine((file, ctx) => {
  const accountIds = new Set<string>();
  const accountNames = new Set<string>();
  file.brokerAccounts.forEach((account, index) => {
    if (accountIds.has(account.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["brokerAccounts", index, "id"], message: "duplicate account id" });
    }
    accountIds.add(account.id);
    const comparableName = account.name.toLocaleLowerCase();
    if (accountNames.has(comparableName)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["brokerAccounts", index, "name"], message: "duplicate account name" });
    }
    accountNames.add(comparableName);
  });

  const transactionIds = new Set<string>();
  file.transactions.forEach((transaction, index) => {
    if (transactionIds.has(transaction.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["transactions", index, "id"], message: "duplicate transaction id" });
    }
    transactionIds.add(transaction.id);
    if (transaction.accountId !== undefined && !accountIds.has(transaction.accountId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["transactions", index, "accountId"], message: "unknown broker account" });
    }
  });
});

export function parsePortfolioFile(raw: unknown): z.infer<typeof portfolioFileSchema> {
  const result = portfolioFileSchema.safeParse(raw);
  if (!result.success) {
    throw new PortfolioFileValidationError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return result.data;
}
