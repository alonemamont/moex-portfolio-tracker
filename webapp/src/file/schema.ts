import { z } from "zod";

export class PortfolioFileValidationError extends Error {}

const positionSchema = z.object({
  ticker: z.string().min(1),
  coefficient: z.number(),
  sharesOwned: z.number(),
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

const pairSchema = z.object({
  tickers: z.array(z.string()).min(2),
  coefficient: z.number(),
});

const portfolioFileSchema = z.object({
  version: z.literal(1),
  positions: z.array(positionSchema),
  sectors: z.record(z.string()),
  history: z.array(historySnapshotSchema),
  pairs: z.array(pairSchema).default([]),
});

export function parsePortfolioFile(raw: unknown): z.infer<typeof portfolioFileSchema> {
  const result = portfolioFileSchema.safeParse(raw);
  if (!result.success) {
    throw new PortfolioFileValidationError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return result.data;
}
