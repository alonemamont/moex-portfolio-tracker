import { Position, LiveData, IndexStatus } from "../types";
import { IndexCompositionEntry, SecurityInfo } from "../iss/client";

export interface MergeResult {
  positions: Position[];
  liveByTicker: Map<string, LiveData>;
}

export function mergeMarketData(
  existingPositions: Position[],
  composition: IndexCompositionEntry[],
  securities: Map<string, SecurityInfo>,
  dividends: Map<string, number>,
  previousLiveByTicker: Map<string, LiveData> = new Map()
): MergeResult {
  const compositionByTicker = new Map(composition.map((c) => [c.ticker.toUpperCase(), c]));

  const allTickers = new Set<string>();
  existingPositions.forEach((p) => allTickers.add(p.ticker.toUpperCase()));
  composition.forEach((c) => allTickers.add(c.ticker.toUpperCase()));

  const liveByTicker = new Map<string, LiveData>();
  for (const ticker of allTickers) {
    const comp = compositionByTicker.get(ticker);
    const sec = securities.get(ticker);
    const status: IndexStatus = comp ? "in_index" : "out_of_index";
    liveByTicker.set(ticker, {
      ticker,
      shortName: sec?.shortName ?? comp?.shortName ?? ticker,
      indexWeight: comp ? comp.weight : 0,
      price: sec?.price ?? previousLiveByTicker.get(ticker)?.price ?? null,
      lotSize: sec?.lotSize ?? null,
      dividendPerShare: dividends.get(ticker) ?? 0,
      status,
    });
  }

  const existingTickers = new Set(existingPositions.map((p) => p.ticker.toUpperCase()));
  const newPositions: Position[] = composition
    .filter((c) => !existingTickers.has(c.ticker.toUpperCase()))
    .map((c) => ({ ticker: c.ticker, coefficient: 1, sharesOwned: 0 }));

  return {
    positions: [...existingPositions, ...newPositions],
    liveByTicker,
  };
}
