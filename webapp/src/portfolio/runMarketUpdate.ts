import { PortfolioFile, LiveData } from "../types";
import { fetchMarketData } from "../iss/marketData";
import { mergeMarketData } from "../domain/merge";
import { buildCalculatedPositions } from "../domain/buildCalculatedPositions";
import { createSectorResolver } from "../domain/sectors";
import { SECTORS_DEFAULT } from "../data/sectorsDefault";
import { createHistorySnapshot } from "../domain/createHistorySnapshot";

export async function runMarketUpdate(
  currentFile: PortfolioFile,
  previousLiveByTicker: Map<string, LiveData> = new Map()
): Promise<{ file: PortfolioFile; liveByTicker: Map<string, LiveData> }> {
  const existingTickers = currentFile.positions.map((p) => p.ticker);
  const marketData = await fetchMarketData(existingTickers);

  const { positions, liveByTicker } = mergeMarketData(
    currentFile.positions,
    marketData.composition,
    marketData.securities,
    marketData.dividends,
    previousLiveByTicker
  );

  const resolveSector = createSectorResolver(SECTORS_DEFAULT, currentFile.sectors);
  const calculated = buildCalculatedPositions(positions, liveByTicker, resolveSector);
  const portfolioValue = calculated.reduce((sum, p) => sum + p.positionValue, 0);
  const snapshot = createHistorySnapshot(calculated, portfolioValue);

  return {
    file: {
      ...currentFile,
      positions,
      history: [...currentFile.history, snapshot],
    },
    liveByTicker,
  };
}
