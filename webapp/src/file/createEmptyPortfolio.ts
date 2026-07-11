import { fetchIndexComposition } from "../iss/client";
import { PortfolioFile } from "../types";

export async function createEmptyPortfolio(): Promise<PortfolioFile> {
  const composition = await fetchIndexComposition();
  return {
    version: 1,
    positions: composition.map((c) => ({ ticker: c.ticker, coefficient: 1, sharesOwned: 0 })),
    sectors: {},
    history: [],
  };
}
