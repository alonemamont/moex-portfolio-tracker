import {
  fetchIndexComposition,
  fetchSecurities,
  fetchDividendsForTickers,
  IndexCompositionEntry,
  SecurityInfo,
} from "./client";

export interface MarketDataResult {
  composition: IndexCompositionEntry[];
  securities: Map<string, SecurityInfo>;
  dividends: Map<string, number>;
}

export async function fetchMarketData(
  existingTickers: string[],
  indexId: string
): Promise<MarketDataResult> {
  const composition = await fetchIndexComposition(indexId);

  const allTickers = Array.from(
    new Set([...existingTickers, ...composition.map((c) => c.ticker)])
  );

  const [securities, dividends] = await Promise.all([
    fetchSecurities(allTickers),
    fetchDividendsForTickers(allTickers),
  ]);

  return { composition, securities, dividends };
}
