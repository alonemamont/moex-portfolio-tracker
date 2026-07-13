import { fetchIndexComposition } from "../iss/client";
import { DEFAULT_INDEX_ID } from "../domain/indices";
import { PortfolioFile } from "../types";

export async function createEmptyPortfolio(): Promise<PortfolioFile> {
  const composition = await fetchIndexComposition(DEFAULT_INDEX_ID);
  return {
    version: 1,
    positions: composition.map((c) => ({ ticker: c.ticker, coefficient: 1, sharesOwned: 0 })),
    sectors: {},
    history: [],
    pairs: [],
    brokerAccounts: [],
    transactions: [],
  };
}
