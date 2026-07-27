import { CalculatedPosition, Pair } from "../types";

export function filterPositions(
  positions: CalculatedPosition[],
  pairs: Pair[],
  search: string,
  hideEmpty: boolean,
  onlyInIndex: boolean
): CalculatedPosition[] {
  const query = search.trim().toLowerCase();

  function passesOwnFilters(p: CalculatedPosition): boolean {
    if (hideEmpty && p.sharesOwned === 0) return false;
    if (onlyInIndex && p.status !== "in_index") return false;
    if (query === "") return true;
    return (
      p.ticker.toLowerCase().includes(query) ||
      p.shortName.toLowerCase().includes(query)
    );
  }

  const passingTickers = new Set(
    positions.filter(passesOwnFilters).map((p) => p.ticker)
  );

  for (const pair of pairs) {
    if (pair.tickers.some((ticker) => passingTickers.has(ticker))) {
      for (const ticker of pair.tickers) passingTickers.add(ticker);
    }
  }

  return positions.filter((p) => passingTickers.has(p.ticker));
}
