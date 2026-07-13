import { Pair } from "../types";

export function groupPairedPositions<T extends { ticker: string }>(
  positions: T[],
  pairs: Pair[]
): T[] {
  if (pairs.length === 0) return positions;

  const tickerToPair = new Map<string, Pair>();
  for (const pair of pairs) {
    for (const ticker of pair.tickers) {
      tickerToPair.set(ticker, pair);
    }
  }

  const byTicker = new Map(positions.map((p) => [p.ticker, p] as const));
  const emittedPairs = new Set<Pair>();
  const result: T[] = [];

  for (const position of positions) {
    const pair = tickerToPair.get(position.ticker);
    if (!pair) {
      result.push(position);
      continue;
    }
    if (emittedPairs.has(pair)) continue;
    emittedPairs.add(pair);
    for (const ticker of pair.tickers) {
      const member = byTicker.get(ticker);
      if (member) result.push(member);
    }
  }

  return result;
}
