import { CalculatedPosition } from "../types";

export function filterPositions(
  positions: CalculatedPosition[],
  search: string,
  hideEmpty: boolean
): CalculatedPosition[] {
  const query = search.trim().toLowerCase();
  return positions.filter((p) => {
    if (hideEmpty && p.sharesOwned === 0) return false;
    if (query === "") return true;
    return (
      p.ticker.toLowerCase().includes(query) ||
      p.shortName.toLowerCase().includes(query)
    );
  });
}
