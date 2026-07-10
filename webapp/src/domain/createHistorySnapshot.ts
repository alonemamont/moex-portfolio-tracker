import { CalculatedPosition, HistorySnapshot } from "../types";
import { computeAverageCompliance } from "./calculations";

export function createHistorySnapshot(
  calculatedPositions: CalculatedPosition[],
  portfolioValue: number,
  timestamp: string = new Date().toISOString()
): HistorySnapshot {
  return {
    timestamp,
    portfolioValue,
    avgCompliance: computeAverageCompliance(calculatedPositions.map((p) => p.compliance)),
    snapshot: calculatedPositions.map((p) => ({
      ticker: p.ticker,
      price: p.price,
      weight: p.indexWeight,
      status: p.status,
    })),
  };
}
