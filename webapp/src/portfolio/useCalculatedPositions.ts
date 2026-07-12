import { useMemo } from "react";
import { usePortfolio } from "./usePortfolio";
import { buildCalculatedPositions } from "../domain/buildCalculatedPositions";
import { createSectorResolver } from "../domain/sectors";
import { computeAverageCompliance, computeDeviationRub, findDeviationExtremes, DeviationEntry } from "../domain/calculations";
import { SECTORS_DEFAULT } from "../data/sectorsDefault";
import { CalculatedPosition, LiveData, PortfolioFile } from "../types";

export interface CalculatedPositionsResult {
  calculated: CalculatedPosition[];
  portfolioValue: number;
  avgCompliance: number | null;
  largestSurplus: DeviationEntry | null;
  largestShortfall: DeviationEntry | null;
}

export function computeCalculatedPositionsResult(
  file: PortfolioFile | null,
  liveByTicker: Map<string, LiveData>
): CalculatedPositionsResult {
  if (!file) {
    return {
      calculated: [],
      portfolioValue: 0,
      avgCompliance: null,
      largestSurplus: null,
      largestShortfall: null,
    };
  }

  const resolveSector = createSectorResolver(SECTORS_DEFAULT, file.sectors);
  const calculated = buildCalculatedPositions(file.positions, liveByTicker, resolveSector);
  const portfolioValue = calculated.reduce((sum, p) => sum + p.positionValue, 0);
  const avgCompliance = computeAverageCompliance(calculated.map((p) => p.compliance));

  const deviations: DeviationEntry[] = calculated
    .filter((p) => p.targetAllocation !== null && p.actualShare !== null)
    .map((p) => ({
      ticker: p.ticker,
      deviationRub: computeDeviationRub(p.actualShare, p.targetAllocation, portfolioValue) as number,
    }));
  const { largestSurplus, largestShortfall } = findDeviationExtremes(deviations);

  return { calculated, portfolioValue, avgCompliance, largestSurplus, largestShortfall };
}

export function useCalculatedPositions(): CalculatedPositionsResult {
  const { file, liveByTicker } = usePortfolio();
  return useMemo(() => computeCalculatedPositionsResult(file, liveByTicker), [file, liveByTicker]);
}
